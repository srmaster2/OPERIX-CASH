
// دالة جلب وعرض الأعضاء
// تعريف الدالة كـ Global لضمان وصول الـ HTML لها
window.loadUsersTable = async function() {
    const listDiv = document.getElementById('usersList');
    if (!listDiv) return;

    listDiv.innerHTML = '<div class="text-center p-3 small text-muted">جاري الاتصال بقاعدة البيانات...</div>';

    try {
        // جلب البيانات من جدول users
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // فحص لو البيانات وصلت فعلاً
        if (!users) {
            listDiv.innerHTML = '<div class="text-center p-4">لم يتم استلام أي بيانات من السيرفر</div>';
            return;
        }

        if (users.length === 0) {
            listDiv.innerHTML = '<div class="text-center p-4 text-muted small">لا يوجد أعضاء مسجلين حالياً</div>';
            return;
        }

        // بناء القائمة (عرض + تعديل صلاحية + حذف)
        listDiv.innerHTML = users.map(user => `
            <div class="member-card d-flex align-items-center p-2 mb-2 bg-white border rounded-3 shadow-sm" style="direction: rtl;">
                <div style="width: 50%;" class="text-start ps-2">
                    <div class="fw-bold text-dark" style="font-size: 13px;">${user.name || 'مستخدم جديد'}</div>
                    <div class="text-muted small" style="font-size: 10px;">${user.email}</div>
                </div>
                
                <div style="width: 25%;" class="text-center">
                    <span class="badge ${user.role === 'ADMIN' ? 'bg-primary' : 'bg-light text-primary border'}" style="font-size: 9px;">
                        ${user.role === 'ADMIN' ? 'مدير' : 'موظف'}
                    </span>
                </div>

                <div style="width: 25%;" class="text-end d-flex justify-content-end gap-1">
                    <button class="btn btn-sm btn-light border p-1" onclick="openEditRoleModal('${user.id}', '${user.role}')">
                        <i class="fa fa-shield-alt text-primary"></i>
                    </button>
                    <button class="btn btn-sm btn-light border p-1" onclick="confirmDeleteUser('${user.id}', '${user.name}')">
                        <i class="fa fa-trash-alt text-danger"></i>
                    </button>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error("Fetch error:", err);
        listDiv.innerHTML = '<div class="alert alert-danger p-2 small text-center">خطأ في الربط: ' + err.message + '</div>';
    }
};
// دالة تعديل الصلاحية
async function openEditRoleModal(userId, currentRole) {
    // بناء محتوى التبويتة يدويًا للتحكم الكامل في الـ Max-Width
    const modalHtml = `
        <div class="edit-role-container" style="direction: rtl; padding: 10px;">
            <p style="color: #666; font-size: 14px; margin-bottom: 20px;">اختر الصلاحية الجديدة للعضو:</p>
            
            <select id="swal-custom-select" class="form-select" 
                style="max-width: 180px !important; 
                       margin: 0 auto !important; 
                       display: block; 
                       padding: 8px; 
                       border-radius: 8px; 
                       border: 1px solid #ddd; 
                       text-align: center;">
                <option value="USER" ${currentRole === 'USER' ? 'selected' : ''}>موظف</option>
                <option value="ADMIN" ${currentRole === 'ADMIN' ? 'selected' : ''}>مدير نظام</option>
            </select>
        </div>
    `;

    const { isConfirmed } = await Swal.fire({
        title: '<span style="font-size: 18px;">تعديل الصلاحية</span>',
        html: modalHtml,
        showCancelButton: true,
        confirmButtonText: 'حفظ التعديل',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#0d6efd',
        cancelButtonColor: '#6c757d',
        width: '350px',
        focusConfirm: false,
        preConfirm: () => {
            // سحب القيمة من السيلكت اليدوي اللي عملناه
            return document.getElementById('swal-custom-select').value;
        }
    });

    // لو المستخدم داس حفظ
    if (isConfirmed) {
        const newRole = Swal.getHtmlContainer().querySelector('#swal-custom-select').value;
        
        if (newRole !== currentRole) {
            try {
                const { error } = await supabase
                    .from('users')
                    .update({ role: newRole })
                    .eq('id', userId);
                    
                if (error) throw error;

                Swal.fire({
                    icon: 'success',
                    title: 'تم التحديث',
                    timer: 1000,
                    showConfirmButton: false,
                    width: '300px'
                });

                loadUsersTable(); // تحديث الجدول
            } catch (err) {
                console.error("Update Error:", err.message);
                Swal.fire('خطأ', 'فشل في تحديث البيانات', 'error');
            }
        }
    }
}
// دالة حذف العضو
async function confirmDeleteUser(userId, userName) {
    const res = await Swal.fire({
        title: 'هل أنت متأكد؟',
        text: `سيتم حذف العضو "${userName}" نهائياً`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#d33'
    });

    if (res.isConfirmed) {
        try {
            const { error } = await supabase.from('users').delete().eq('id', userId);
            if (error) throw error;
            Swal.fire('تم!', 'تم حذف العضو بنجاح', 'success');
            loadUsersTable();
        } catch (err) {
            Swal.fire('خطأ', err.message, 'error');
        }
    }
}// دالة تعديل الصلاحية

// دالة الحذف
async function loadAdminLogs() {
    const logsDiv = document.getElementById('adminLogsDiv');
    if (!logsDiv) return;

    try {
        const { data: logs, error } = await supabase
            .from('logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error || !logs) {
            logsDiv.innerHTML = '<div class="text-center p-4 small text-muted">السجل فارغ حالياً.</div>';
            return;
        }

        let html = '<table class="table table-sm small text-end" style="direction:rtl;">';
        logs.forEach(log => {
            html += `<tr>
                <td class="text-muted english-num" style="font-size:10px;">${new Date(log.created_at).toLocaleTimeString('ar-EG')}</td>
                <td class="fw-bold">${log.user_name}</td>
                <td>${log.action_details}</td>
            </tr>`;
        });
        logsDiv.innerHTML = html + '</table>';
    } catch (e) {
        logsDiv.innerHTML = '<div class="text-center p-3">فشل تحميل السجل</div>';
    }
}