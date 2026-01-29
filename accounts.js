// إدارة المحافظ والحسابات

// جلب جميع الحسابات
async function loadAccounts() {
  const { data, error } = await supabase.from('accounts').select('*');
  if (error) return [];
  return data.filter(acc => !acc.deleted);
}

async function addAccount(name, type, tag = '', balance = 0) {
  if (!name) return false;
  const { error } = await supabase.from('accounts').insert([{ name, type, tag, balance: Number(balance) }]);
  return !error;
}

// تحديث حساب
async function updateAccount(id, updates) {
  const result = await updateSupabase(TABLES.accounts, updates, id);
  if (result.success) {
    showToast('تم التحديث');
    return true;
  } else {
    showToast('خطأ في التحديث', false);
    return false;
  }
}

// حذف حساب
async function deleteAccount(id) {
  const result = await updateSupabase(TABLES.accounts, { deleted: true }, id);
  if (result.success) {
    showToast('تم الحذف');
    loadAccountsList();
    return true;
  } else {
    showToast('خطأ في الحذف', false);
    return false;
  }
}

async function loadAccountsTable() {
    const listDiv = document.getElementById('accList');
    if (!listDiv) return;

    listDiv.innerHTML = '<div class="text-center p-3"><i class="fa fa-spinner fa-spin"></i> جاري التحميل من Supabase...</div>';

    try {
        const { data: accounts, error } = await supabase
            .from('accounts')
            .select('*')
            .order('pin', { ascending: false }) // المثبت أولاً
            .order('name', { ascending: true });

        if (error) throw error;

        let h = '<table class="table table-bordered table-sm table-custom mb-0 text-center auto-card"><thead><tr><th>الاسم</th><th>الرصيد</th><th>⚙️ العمليات</th></tr></thead><tbody>';

        accounts.forEach(a => {
            const isPinned = a.pin === "true" || a.pin === true;
            const pinClass = isPinned ? 'text-warning' : 'text-muted';
            const pinIcon = isPinned ? 'fa-star' : 'fa-star-half-stroke';
            const circleColor = a.color || "#dee2e6";

            h += `<tr>
                <td data-label="الاسم" class="small fw-bold text-start ps-3">
                    <i class="fa-solid fa-circle me-2" style="color: ${circleColor}; font-size: 10px;"></i>
                    ${a.name}
                    ${a.tag ? `<br><span class="badge" style="background-color:${circleColor}; color:white; font-size:9px; margin-right:15px;">${a.tag}</span>` : ''}
                </td>
                <td data-label="الرصيد" class="small english-num">${Number(a.balance || 0).toLocaleString()}</td>
                <td data-label="⚙️">
                    <div class="d-flex justify-content-center gap-1">
                        <button class="btn btn-sm btn-light border ${pinClass}" onclick="togglePin(${a.id}, ${isPinned})"><i class="fa ${pinIcon}"></i></button>
                        <button class="btn btn-sm btn-light border text-warning" onclick="openTagModal(${a.id}, '${a.tag || ""}', '${a.color || ""}')"><i class="fa-solid fa-paintbrush"></i></button>
                        <button class="btn btn-sm btn-light border text-primary" onclick="openEdit(${a.id}, '${a.name}', '${a.daily_out_limit}', '${a.daily_in_limit}', '${a.monthly_limit}')"><i class="fa fa-edit"></i></button> 
                        <button class="btn btn-sm btn-light border text-danger" onclick="delAcc(${a.id})"><i class="fa fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
        });
        listDiv.innerHTML = h + '</tbody></table>';
    } catch (err) {
        console.error("Error:", err);
        listDiv.innerHTML = '<div class="text-center text-danger p-3">خطأ في الاتصال بقاعدة البيانات</div>';
    }
}

// تثبيت أو إلغاء تثبيت المحفظة


async function togglePin(id, currentState) {
    showToast("جاري التحديث...", true);
    try {
        const { error } = await supabase
            .from('accounts')
            .update({ pin: !currentState })
            .eq('id', id);

        if (error) throw error;
        
        showToast("تم تحديث حالة التثبيت");
        
        // 2. تحديث الواجهة
        if (typeof loadAccountsTable === 'function') await loadAccountsTable();
        if (typeof renderPinnedWallets === 'function') renderPinnedWallets();

    } catch (err) {
        // لو الخطأ سببه كلمة google فإحنا هنعرفه هنا
        if (err.message.includes('google')) {
            console.warn("تنبيه: يوجد سطر قديم لجوجل تم تجاهله");
        } else {
            showToast("❌ فشل التحديث: " + err.message, false);
        }
    }
}

// حذف المحفظة
async function delAcc(id) {
    if(!confirm("هل أنت متأكد من حذف هذا الحساب نهائياً؟")) return;
    try {
        const { error } = await supabase.from('accounts').delete().eq('id', id);
        if (error) throw error;
        showToast("تم الحذف بنجاح");
        loadAccountsTable();
    } catch (err) {
        showToast("فشل الحذف", false);
    }
}

function openEdit(id, n, lo, li, lm) { 
    document.getElementById('editRow').value = id; // هنا الـ id هو المرجع
    document.getElementById('editName').value = n; 
    document.getElementById('editLo').value = lo; 
    document.getElementById('editLi').value = li; 
    document.getElementById('editLm').value = lm; 
    document.getElementById('editModal').style.display = 'flex'; 
}

async function saveEdit() {
    const id = document.getElementById('editRow').value;
    const walletName = document.getElementById('editName').value;
    const adjProfitRaw = document.getElementById('editProfitAdj').value.replace(/,/g, ''); 
    const adjProfit = Number(adjProfitRaw);

    setLoading('btnSaveEdit', true);

    try {
        // 1. تحديث البيانات الأساسية (الحدود والاسم)
        const { error: updateError } = await supabase
            .from('accounts')
            .update({
                name: walletName,
                daily_out_limit: document.getElementById('editLo').value,
                daily_in_limit: document.getElementById('editLi').value,
                monthly_limit: document.getElementById('editLm').value
            })
            .eq('id', id);

        if (updateError) throw updateError;

        // 2. إذا وجد مبلغ لتسوية الأرباح
        if (adjProfit !== 0 && !isNaN(adjProfit)) {
            // جلب الربح الحالي أولاً ثم إضافة التسوية
            const { data } = await supabase.from('accounts').select('profit').eq('id', id).single();
            const newProfit = (Number(data.profit) || 0) + adjProfit;
            
            await supabase.from('accounts').update({ profit: newProfit }).eq('id', id);
        }

        // إنهاء العملية
        setLoading('btnSaveEdit', false);
        document.getElementById('editModal').style.display = 'none';
        showToast("✅ تم تحديث بيانات الحساب بنجاح", true);
        loadAccountsTable();
        document.getElementById('editProfitAdj').value = ''; 

    } catch (err) {
        console.error(err);
        showToast("خطأ أثناء الحفظ", false);
        setLoading('btnSaveEdit', false);
    }
}
async function addWallet() {
    const n = document.getElementById('newAccName').value.trim();
    const t = document.getElementById('newAccType').value;

    if (!n) return;

    setLoading('btnAddWallet', true);

    // منطق الليميت التلقائي
    let dailyLim = (t === 'Wallet') ? "60000" : "900000000";
    let monthlyLim = (t === 'Wallet') ? "200000" : "900000000";

    try {
        const { error } = await supabase.from('accounts').insert([{
            name: n,
            tag: (t === 'Wallet' ? 'محفظة' : 'شركة'),
            color: (t === 'Wallet' ? '#007bff' : '#ffc107'),
            balance: "0",
            daily_out_limit: dailyLim,
            daily_in_limit: dailyLim,
            monthly_limit: monthlyLim,
            pin: false
        }]);

        if (error) throw error;

        showToast("✅ تمت الإضافة بنجاح", true);
        document.getElementById('newAccName').value = '';
        
        // تحديث محلي فقط بدون نداء جوجل
        if (typeof loadAccountsTable === 'function') await loadAccountsTable();

    } catch (err) {
        // هنا الكونسول كان بيطلع الخطأ لو فيه كلمة google
        console.error("Supabase Insert Error:", err.message);
        showToast("❌ فشل الإضافة: " + err.message, false);
    } finally {
        setLoading('btnAddWallet', false);
    }
}
async function checkUserRole() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = "login.html"; // لو مش مسجل دخول يخرجه
        return;
    }

    // جلب بيانات المستخدم من جدول الـ users اللي عملناه في Supabase
    const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('email', user.email)
        .single();

    if (userData) {
        window.currentUserRole = userData.role;
        // إخفاء أو إظهار أزرار الإدارة بناءً على الصلاحية
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = userData.role === 'ADMIN' ? 'block' : 'none';
        });
    }
}

async function saveTagSettings() {
    const id = document.getElementById('tagRow').value; 
    const tag = document.getElementById('tagInput').value.trim();
    const color = document.getElementById('tagColorInput').value;
    
    if (!id) return;

    setLoading('btnSaveTag', true);

    try {
        const { error } = await supabase
            .from('accounts')
            .update({ tag: tag, color: color })
            .eq('id', id);

        if (error) throw error;

        // ✅ لو وصلنا هنا يبقى التعديل نجح في Supabase
        showToast("✅ تم حفظ مظهر المحفظة بنجاح", true);
        document.getElementById('tagModal').style.display = 'none';
        
        // تحديث الواجهة محلياً (بدون الحاجة لجوجل)
        if (typeof renderWalletsCards === 'function') renderWalletsCards();
        if (typeof loadAccountsTable === 'function') loadAccountsTable();
        if (typeof renderPinnedWallets === 'function') renderPinnedWallets();

    } catch (err) {
        // ❌ الرسالة بتظهر هنا لو فيه أي كلمة google تانية تايهة في الـ try block
        console.error("Update Error:", err.message);
        showToast("❌ فشل التحديث: " + err.message, false);
    } finally {
        setLoading('btnSaveTag', false);
    }
}

async function resetTagSettings() {
    if(!confirm("⚠️ هل تريد مسح التخصيص (اللون والوسم) لهذه المحفظة؟")) return;
    
    const id = document.getElementById('tagRow').value;
    if (!id) return;

    setLoading('btnSaveTag', true);

    try {
        // إرسال قيم فارغة ولون افتراضي لـ Supabase
        const { error } = await supabase
            .from('accounts')
            .update({ 
                tag: "", 
                color: "#6c757d" 
            })
            .eq('id', id);

        if (error) throw error;

        document.getElementById('tagModal').style.display = 'none';
        showToast("✅ تم إعادة ضبط مظهر المحفظة", true);
        
        // تحديث الواجهة
        refreshAllWalletViews();

    } catch (err) {
        console.error("Reset Error:", err.message);
        showToast("❌ فشل إعادة الضبط", false);
    } finally {
        setLoading('btnSaveTag', false);
    }
}
function refreshAllWalletViews() {
    if (typeof renderWalletsCards === 'function') renderWalletsCards();
    if (typeof loadAccountsTable === 'function') loadAccountsTable();
    if (typeof renderPinnedWallets === 'function') renderPinnedWallets();
}

async function addUser() {
    const email = document.getElementById('uEmail').value.trim().toLowerCase();
    const name = document.getElementById('uName').value.trim();
    const role = document.getElementById('uRole').value; // ADMIN أو USER

    if (!email || !name) {
        showToast("يرجى ملء الاسم والإيميل", false);
        return;
    }

    setLoading('btnAddUser', true);

    try {
        const { error } = await supabase.from('users').insert([{
            email: email,
            name: name,
            role: role,         // سيكتب 'USER' أو 'ADMIN'
            is_master: false    // دائماً false عند الإضافة اليدوية
        }]);

        if (error) {
            if (error.code === '23505') throw new Error("هذا الإيميل مسجل مسبقاً");
            throw error;
        }

        showToast("✅ تم إضافة العضو بنجاح");
        document.getElementById('uEmail').value = '';
        document.getElementById('uName').value = '';
        
        loadUsersTable(); 

    } catch (err) {
        showToast("❌ خطأ: " + err.message, false);
    } finally {
        setLoading('btnAddUser', false);
    }
}

async function loadUsersTable() {
    const listDiv = document.getElementById('usersList');
    if (!listDiv) return; // تأكد من وجود العنصر في الصفحة

    listDiv.innerHTML = '<div class="text-center p-2"><i class="fa fa-spinner fa-spin"></i> جاري التحميل...</div>';

    try {
        // جلب كل الصفوف من جدول users
        const { data: users, error } = await supabase
            .from('users')
            .select('*') 
            .order('created_at', { ascending: false });

        if (error) throw error;

        // التحقق من وجود بيانات
        if (!users || users.length === 0) {
            listDiv.innerHTML = '<div class="text-center p-3">لا يوجد موظفين مسجلين حالياً</div>';
            return;
        }

        let h = `
        <table class="table table-sm table-bordered mt-3 text-center small">
            <thead class="table-light">
                <tr>
                    <th>الاسم</th>
                    <th>الصلاحية</th>
                    <th>⚙️</th>
                </tr>
            </thead>
            <tbody>`;

        // تكرار (Loop) على كل المستخدمين
        users.forEach(u => {
            const roleBadge = u.role === 'ADMIN' ? 'bg-danger' : 'bg-primary';
            h += `
            <tr>
                <td class="text-start ps-2">${u.name}<br><small class="text-muted">${u.email}</small></td>
                <td><span class="badge ${roleBadge}">${u.role}</span></td>
                <td>
                    <button class="btn btn-sm text-danger" onclick="deleteUser('${u.email}')">
                        <i class="fa fa-trash"></i>
                    </button>
                </td>
            </tr>`;
        });

        listDiv.innerHTML = h + '</tbody></table>';

    } catch (err) {
        console.error("Load Users Error:", err);
        listDiv.innerHTML = '<div class="text-danger small">فشل تحميل قائمة الموظفين</div>';
    }
}
async function deleteUser(email) {
    if (!confirm("هل أنت متأكد من حذف هذا الموظف؟ لن يتمكن من دخول النظام.")) return;

    try {
        const { error } = await supabase.from('users').delete().eq('email', email);
        if (error) throw error;
        
        showToast("تم الحذف");
        loadUsersTable();
    } catch (err) {
        showToast("فشل الحذف", false);
    }
}
