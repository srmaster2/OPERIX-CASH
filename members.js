// دالة جلب وعرض الأعضاء
window.loadUsersTable = async function() {
    const listDiv = document.getElementById('usersList');
    if (!listDiv) return;

    listDiv.innerHTML = '<div class="text-center p-3 small text-muted">جاري الاتصال بقاعدة البيانات...</div>';

    try {
        const cu       = window.currentUserData;
        const isMaster = cu?.isMaster === true;
        const isAdmin  = cu?.isAdmin === true;

        // ✅ فلتر الفرع اليدوي المضمون
        let q = supabase.from('users').select('*').order('created_at', { ascending: false });

        if (!isMaster && cu?.branch_id) {
            q = q.eq('branch_id', cu.branch_id);
        } else if (!isMaster && !cu?.branch_id) {
            q = q.eq('branch_id', '00000000-0000-0000-0000-000000000000');
        }

        const { data: users, error } = await q;
        if (error) throw error;

        if (!users || users.length === 0) {
            listDiv.innerHTML = '<div class="text-center p-4 text-muted small">لا يوجد أعضاء مسجلين حالياً</div>';
            return;
        }

        listDiv.innerHTML = users.map(user => {
            const isM = user.is_master;
            const lbl = isM ? '👑 مدير عام' : user.role === 'ADMIN' ? '🔑 مدير فرع' : '👤 موظف';
            const bdg = isM ? 'bg-warning text-dark' : user.role === 'ADMIN' ? 'bg-primary' : 'bg-light text-primary border';

            // ✅ المدير العام: تعديل صلاحية + حذف
            // ✅ مدير الفرع: إزالة من الفرع فقط
            let btns = '';
            if (isMaster) {
                btns = `
                <button class="btn btn-sm btn-light border p-1" title="تعديل الصلاحية" onclick="openEditRoleModal('${user.id}','${user.role}')">
                    <i class="fa fa-shield-alt text-primary"></i>
                </button>
                <button class="btn btn-sm btn-light border p-1" title="حذف العضو" onclick="confirmDeleteUser('${user.id}','${user.name}')">
                    <i class="fa fa-trash-alt text-danger"></i>
                </button>`;
            } else if (isAdmin && !isM) {
                btns = `
                <button class="btn btn-sm btn-light border p-1" title="إزالة من الفرع" onclick="removeUserFromBranch('${user.id}','${user.name}')">
                    <i class="fa fa-user-minus text-warning"></i>
                </button>`;
            }

            return `
            <div class="member-card d-flex align-items-center p-2 mb-2 bg-white border rounded-3 shadow-sm" style="direction:rtl;">
                <div style="width:50%;" class="text-start ps-2">
                    <div class="fw-bold text-dark" style="font-size:13px;">${user.name || 'مستخدم جديد'}</div>
                    <div class="text-muted small" style="font-size:10px;">${user.email}</div>
                </div>
                <div style="width:25%;" class="text-center">
                    <span class="badge ${bdg}" style="font-size:9px;">${lbl}</span>
                </div>
                <div style="width:25%;" class="text-end d-flex justify-content-end gap-1">${btns}</div>
            </div>`;
        }).join('');

    } catch (err) {
        console.error("Fetch error:", err);
        listDiv.innerHTML = '<div class="alert alert-danger p-2 small text-center">خطأ في الربط: ' + err.message + '</div>';
    }
};

// ✅ إزالة موظف من الفرع (لمدير الفرع)
async function removeUserFromBranch(userId, userName) {
    const res = await Swal.fire({
        title: 'إزالة من الفرع؟',
        text: `سيتم إزالة "${userName}" من الفرع الحالي`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، أزل',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#f59e0b'
    });

    if (res.isConfirmed) {
        try {
            const { error } = await supabase.from('users').update({ branch_id: null }).eq('id', userId);
            if (error) throw error;
            Swal.fire({ icon: 'success', title: 'تم', timer: 1000, showConfirmButton: false, width: '300px' });
            window.loadUsersTable();
        } catch (err) {
            Swal.fire('خطأ', err.message, 'error');
        }
    }
}

// تعديل الصلاحية (للمدير العام فقط)
async function openEditRoleModal(userId, currentRole) {
    const modalHtml = `
        <div class="edit-role-container" style="direction: rtl; padding: 10px;">
            <p style="color: #666; font-size: 14px; margin-bottom: 20px;">اختر الصلاحية الجديدة للعضو:</p>
            <select id="swal-custom-select" class="form-select"
                style="max-width: 180px !important; margin: 0 auto !important; display: block;
                       padding: 8px; border-radius: 8px; border: 1px solid #ddd; text-align: center;">
                <option value="USER"  ${currentRole === 'USER'  ? 'selected' : ''}>موظف</option>
                <option value="ADMIN" ${currentRole === 'ADMIN' ? 'selected' : ''}>مدير فرع</option>
            </select>
        </div>`;

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
        preConfirm: () => document.getElementById('swal-custom-select').value
    });

    if (isConfirmed) {
        const newRole = Swal.getHtmlContainer().querySelector('#swal-custom-select').value;
        if (newRole !== currentRole) {
            try {
                const { error } = await supabase.from('users').update({ role: newRole }).eq('id', userId);
                if (error) throw error;
                Swal.fire({ icon: 'success', title: 'تم التحديث', timer: 1000, showConfirmButton: false, width: '300px' });
                window.loadUsersTable();
            } catch (err) {
                Swal.fire('خطأ', 'فشل في تحديث البيانات', 'error');
            }
        }
    }
}

// حذف العضو (للمدير العام فقط)
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
            window.loadUsersTable();
        } catch (err) {
            Swal.fire('خطأ', err.message, 'error');
        }
    }
}

// سجل العمليات الإدارية
async function loadAdminLogs() {
    const logsDiv = document.getElementById('adminLogsDiv');
    if (!logsDiv) return;

    try {
        const cu       = window.currentUserData;
        const isMaster = cu?.isMaster === true;

        let logsQuery = supabase
            .from('admin_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        if (!isMaster && cu?.branch_id) {
            logsQuery = logsQuery.eq('branch_id', cu.branch_id);
        } else if (!isMaster && !cu?.branch_id) {
            logsQuery = logsQuery.eq('branch_id', '00000000-0000-0000-0000-000000000000');
        }

        const { data: logs, error } = await logsQuery;
        if (error) throw error;

        if (!logs || logs.length === 0) {
            logsDiv.innerHTML = '<div class="text-center p-4 small text-muted">لا توجد سجلات حالياً.</div>';
            return;
        }

        let html = `
        <div class="table-responsive">
            <table class="table table-borderless align-middle mb-0" style="direction: rtl; min-width: 450px;">
                <thead>
                    <tr class="text-muted border-bottom" style="font-size: 11px; background-color: #f8f9fa;">
                        <th style="width: 15%;" class="py-2 text-start">الوقت</th>
                        <th style="width: 20%;" class="py-2 text-center">الإجراء</th>
                        <th style="width: 45%;" class="py-2 text-center">التفاصيل</th>
                        <th style="width: 20%;" class="py-2 text-center">المسؤول</th>
                    </tr>
                </thead>
                <tbody style="font-size: 12.5px;">`;

        logs.forEach(log => {
            const logTime = new Date(log.created_at).toLocaleTimeString('en-EG', {
                hour: '2-digit', minute: '2-digit', hour12: true
            });
            html += `
                <tr class="border-bottom hover-row">
                    <td class="text-start text-muted english-num" style="font-size: 11px;">${logTime}</td>
                    <td class="text-center"><span class="badge bg-light text-primary border-0">${log.action}</span></td>
                    <td class="text-center text-secondary" style="line-height: 1.4;">${log.details || '---'}</td>
                    <td class="text-center fw-bold text-dark">${log.created_by || 'النظام'}</td>
                </tr>`;
        });

        html += `</tbody></table></div>`;
        logsDiv.innerHTML = html;

    } catch (e) {
        console.error("Error:", e);
        logsDiv.innerHTML = '<div class="text-center p-3 text-danger small">تعذر تحديث السجل</div>';
    }
}