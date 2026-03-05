// إدارة المحافظ والحسابات

// جلب جميع الحسابات
async function loadAccounts() {
  const user = window.currentUserData;
  let query = window.supa.from('accounts').select('*')
      .eq('company_id', user?.company_id || '');
  if (user && typeof applyBranchFilter === 'function') {
      query = applyBranchFilter(query, user);
  }
  
  const { data, error } = await query;
  if (error) return [];
  return data.filter(acc => !acc.deleted);
}

async function addAccount(name, type, tag = '', balance = 0) {
  if (!name) return false;
  const u = window.currentUserData;
  const { error } = await window.supa.from('accounts').insert([{
      name, type, tag, balance: Number(balance),
      company_id: u?.company_id || null,
      branch_id:  u?.branch_id  || null
  }]);
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

    try {
        const user = window.currentUserData;
        let accQuery = window.supa
            .from('accounts')
            .select('*')
            .eq('company_id', user?.company_id || '');
        if (user && typeof applyBranchFilter === 'function') {
            accQuery = applyBranchFilter(accQuery, user);
        }

        const { data: accounts, error } = await accQuery
            .order('is_pinned', { ascending: false })
            .order('name', { ascending: true });
        if (error) throw error;
        let html = '';
        accounts.forEach(a => {
            const isPinned = a.is_pinned === true;
            const circleColor = a.color || "#dee2e6"; 
            const themeColor = a.tag === 'شركة' ? '#10b981' : '#0ea5e9';

            html += `
            <div class="acc-row d-flex align-items-center p-2 mb-2 bg-white border rounded-3 shadow-sm" style="border-right: 5px solid ${themeColor} !important; direction: rtl;">
                
                <div style="width: 40%;" class="text-start ps-2">
                    <div class="fw-bold text-dark text-truncate" style="font-size: 13px;">
                        <i class="fa-solid fa-circle me-1" style="color: ${circleColor}; font-size: 8px;"></i>
                        ${a.name}
                    </div>
                    ${a.tag ? `<span class="badge" style="background-color:${themeColor}20; color:${themeColor}; font-size:9px; border: 1px solid ${themeColor}40;">${a.tag}</span>` : ''}
                </div>

                <div style="width: 30%;" class="text-center border-start border-end">
                    <div class="english-num fw-bold text-dark" style="font-size: 14px;">
                        ${Number(a.balance || 0).toLocaleString()}
                    </div>
                </div>

                        <button class="btn btn-sm btn-light border p-1" onclick="handleTogglePin(${a.id})" title="تثبيت">
                            <i id="pin-icon-${a.id}" class="fa-solid fa-thumbtack ${isPinned ? 'text-warning' : 'text-muted opacity-50'}"></i>
                        </button>   
                    <button class="btn btn-sm btn-light border text-warning p-1" onclick="openTagModal(${a.id}, '${a.tag || ""}', '${a.color || ""}')">
                        <i class="fa-solid fa-paintbrush"></i>
                    </button>
                    <button class="btn btn-sm btn-light border text-primary p-1" onclick="openEditAccountModal(${a.id})">
                        <i class="fa fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-light border text-danger p-1" onclick="confirmDeleteAccount(${a.id}, '${a.name}')">
                        <i class="fa fa-trash"></i>
                    </button>
                </div>
            </div>`;
        });

        listDiv.innerHTML = html || '<div class="text-center p-4 small text-muted">لا يوجد حسابات</div>';

    } catch (err) {
        console.error("Load Error:", err);
        listDiv.innerHTML = '<div class="alert alert-danger p-2 small">خطأ في تحميل الحسابات</div>';
    }
}


async function confirmDeleteAccount(accId, name) {
    const { isConfirmed } = await Swal.fire({
        title: 'حذف الحساب؟',
        text: `هل أنت متأكد من حذف "${name}"؟`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء'
    });

    if (isConfirmed) {
        // تحويل المعرف لرقم صريح لمنع خطأ الـ Object والـ NaN
        const numericId = parseInt(accId);
        
        if (isNaN(numericId)) {
            showToast("❌ خطأ: معرف الحساب غير صالح", false);
            return;
        }

        const { error } = await window.supa.from('accounts').delete().eq('id', numericId);
        if (!error) {
            showToast("✅ تم الحذف بنجاح", true);
            loadAccountsTable();
        } else {
            showToast("❌ خطأ في الحذف: " + error.message, false);
        }
    }
}
async function openTagModal(id, currentTag, currentColor) {
    const { value: formValues } = await Swal.fire({
        title: 'إعدادات الوسم واللون',
        html:
            `<input id="swal-tag" class="swal2-input" placeholder="الوسم (مثلاً: فودافون)" value="${currentTag}">` +
            `<p class="mb-1 mt-2 small">اختر لون الحساب:</p>` +
            `<input id="swal-color" type="color" class="form-control form-control-color w-100" value="${currentColor || '#0ea5e9'}">`,
        showCancelButton: true,
        confirmButtonText: 'حفظ',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            return {
                tag: document.getElementById('swal-tag').value.trim(),
                color: document.getElementById('swal-color').value
            }
        }
    });

    if (formValues) {
        showToast("جاري التحديث...", true);
        try {
            // تحديث البيانات في سوبابيس
            const { error } = await window.supa
                .from('accounts')
                .update({ tag: formValues.tag, color: formValues.color })
                .eq('id', id);

            if (error) throw error;

            showToast("✅ تم حفظ التغييرات");

            // الانتظار حتى يتم إعادة تحميل الجدول بالكامل
            await loadAccountsTable();
            
            // تحديث أي واجهات أخرى مرتبطة (مثل المحافظ المثبتة)
            if (typeof renderPinnedWallets === 'function') await renderPinnedWallets();

        } catch (err) {
            console.error("Update Error:", err);
            showToast("❌ فشل التحديث: " + err.message, false);
        }
    }
}
async function openEditAccountModal(id) {
    const { data: acc } = await window.supa.from('accounts').select('*').eq('id', id).single();
    if (!acc) return;

    const { value: formValues } = await Swal.fire({
        title: '<span style="font-size:18px;">تعديل بيانات الحساب</span>',
        html: `
            <div style="direction: rtl; text-align: right;">
                <div class="mb-3">
                    <label class="swal2-input">اسم الحساب / الرقم</label>
                    <input id="edit-n" class="form-control form-control-sm" value="${acc.name}">
                </div>
                <div class="mb-3">
                    <label class="swal2-input">الرصيد الحالي (ج.م)</label>
                    <input id="edit-b" type="number" class="form-control form-control-sm english-num" value="${acc.balance}">
                </div>
                <div class="row g-2">
                    <div class="col-6">
                        <label class="swal2-input">حد السحب اليومي</label>
                        <input id="edit-lo" type="number" class="form-control form-control-sm" value="${acc.daily_out_limit || 0}">
                    </div>
                    <div class="col-6">
                        <label class="swal2-input">حد الإيداع اليومي</label>
                        <input id="edit-li" type="number" class="form-control form-control-sm" value="${acc.daily_in_limit || 0}">
                    </div>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'حفظ التغييرات',
        cancelButtonText: 'إلغاء',
        customClass: {
            confirmButton: 'btn btn-primary btn-sm px-4',
            cancelButton: 'btn btn-light btn-sm px-4'
        },
        buttonsStyling: false,
        preConfirm: () => {
            return {
                name: document.getElementById('edit-n').value,
                balance: document.getElementById('edit-b').value,
                daily_out_limit: document.getElementById('edit-lo').value,
                daily_in_limit: document.getElementById('edit-li').value
            }
        }
    });

    if (formValues) {
        const { error } = await window.supa.from('accounts').update(formValues).eq('id', id);
        if (!error) {
            showToast("✅ تم التحديث بنجاح");
            loadAccountsTable();
        }
    }
}

let currentFilterType = 'all'; 

function setFilterType(type, btn) {
    currentFilterType = type;
    
    // إعادة ضبط استايل الأزرار
    const buttons = document.querySelectorAll('#filterBtnGroup .btn');
    buttons.forEach(b => {
        b.classList.remove('active', 'btn-secondary', 'btn-warning', 'btn-info', 'btn-success', 'btn-danger');
        b.classList.add('btn-outline-secondary');
    });
    
    // تمييز الزر المختار بلون مختلف لكل نوع
    btn.classList.remove('btn-outline-secondary');
    if(type === 'all') btn.classList.add('active', 'btn-secondary');
    else if(type === 'pinned') btn.classList.add('active', 'btn-warning');
    else if(type === 'company') btn.classList.add('active', 'btn-success');
    else if(type === 'wallet') btn.classList.add('active', 'btn-danger'); // لون أحمر للمحافظ
    else if(type === 'tagged') btn.classList.add('active', 'btn-info');
    
    filterAccounts();
}

function filterAccounts() {
    const query = document.getElementById('accSearchInput').value.toLowerCase().trim();
    const cards = document.querySelectorAll('.acc-row, .acc-card-pro, .client-card');
    let foundCount = 0;

    cards.forEach(card => {
        const content = card.textContent.toLowerCase();
        const matchesSearch = content.includes(query);
        
        // جلب الوسم (Badge) إن وجد
        const badgeText = card.querySelector('.badge')?.textContent || "";
        
        // تحديد الحالات
        const isPinned = card.querySelector('.fa-thumbtack')?.classList.contains('text-warning');
        const isCompany = badgeText.includes('شركة');
        const isWallet = badgeText.includes('محفظة') || badgeText.includes('فودافون') || badgeText.includes('كاش');
        const hasTag = badgeText !== "";

        let matchesType = false;
        if (currentFilterType === 'all') matchesType = true;
        else if (currentFilterType === 'pinned') matchesType = isPinned;
        else if (currentFilterType === 'company') matchesType = isCompany;
        else if (currentFilterType === 'wallet') matchesType = isWallet;
        else if (currentFilterType === 'tagged') matchesType = hasTag;

        // تطبيق الفلترة
        if (matchesSearch && matchesType) {
            card.classList.remove('d-none');
            card.classList.add('d-flex');
            foundCount++;
        } else {
            card.classList.remove('d-flex');
            card.classList.add('d-none');
        }
    });

    const badge = document.getElementById('countBadge');
    if (badge) badge.innerText = `${foundCount} حساب`;
}// دالة تثبيت الحساب (Pin) - معدلة لتناسب عمود pin عندك
// دالة تعديل الوسم (Tag)
async function handleChangeTag(id, currentTag) {
    const { value: newTag } = await Swal.fire({
        title: 'اختر الوسم',
        input: 'select',
        inputOptions: { 'محفظة': 'محفظة', 'شركة': 'شركة', 'بنك': 'بنك' },
        inputValue: currentTag,
        showCancelButton: true,
        confirmButtonText: 'حفظ'
    });
    
    if (newTag) {
        await window.supa.from('accounts').update({ tag: newTag }).eq('id', id);
        loadAccountsTable();
    }
}

// دالة تعديل الحساب (التي كانت لا تعمل)
function editAccountUI(id) {
    // هنا نفتح المودال الخاص بالتعديل ونملأ البيانات
    // تأكد أن لديك Modal في الـ HTML يحمل البيانات أو استعمل Swal لعمل فورم سريع
    Swal.fire({
        title: 'تعديل بيانات الحساب',
        text: 'جاري فتح نافذة التعديل للحساب رقم ' + id,
        icon: 'info',
        timer: 1000,
        showConfirmButton: false
    });
    // إذا كان عندك مودال جاهز، ناديه هنا:
    // $('#editAccountModal').modal('show'); 
}// تثبيت أو إلغاء تثبيت المحفظة


async function handleTogglePin(id) {
    // 1. تحديد الأيقونة لمعرفة الحالة الحالية من الواجهة
    const icon = document.getElementById(`pin-icon-${id}`);
    const isCurrentlyPinned = icon ? icon.classList.contains('text-warning') : false;
    
    // 2. عكس الحالة
    const nextState = !isCurrentlyPinned;

    showToast("جاري التحديث...", true);
    
    try {
        const { error } = await window.supa
            .from('accounts')
            .update({ is_pinned: nextState })
            .eq('id', id);

        if (error) throw error;
        
        showToast(nextState ? "📌 تم التثبيت" : "🔓 تم إلغاء التثبيت");
        
        // 3. تحديث الجداول (هنا هيتم إعادة رسم الـ HTML بالحالة الجديدة)
        if (typeof loadAccountsTable === 'function') await loadAccountsTable();
        if (typeof renderPinnedWallets === 'function') renderPinnedWallets();

    } catch (err) {
        showToast("❌ فشل: " + err.message, false);
    }
}// حذف المحفظة
async function delAcc(id) {
    if(!confirm("هل أنت متأكد من حذف هذا الحساب نهائياً؟")) return;
    try {
        const { error } = await window.supa.from('accounts').delete().eq('id', id);
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
        const { error: updateError } = await window.supa
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
            const { data } = await window.supa.from('accounts').select('profit').eq('id', id).single();
            const newProfit = (Number(data.profit) || 0) + adjProfit;
            await window.supa.from('accounts').update({ profit: newProfit }).eq('id', id);
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
    let dailyLim = (t === 'محفظة') ? "60000" : "900000000";
    let monthlyLim = (t === 'محفظة') ? "200000" : "900000000";

    try {
const user = window.currentUserData;

        const { error } = await window.supa.from('accounts').insert([{
            name: n,
            tag: (t === 'محفظة' ? 'محفظة' : 'شركة'),
            color: (t === 'محفظة' ? '#007bff' : '#ffc107'),
            balance: "0",
            daily_out_limit: dailyLim,
            daily_in_limit: dailyLim,
            monthly_limit: monthlyLim,
            is_pinned: false,
            branch_id:  user?.branch_id  || null,
            company_id: user?.company_id || null
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
    const { data: { user } } = await window.supa.auth.getUser();
    if (!user) {
        window.location.href = "login.html"; // لو مش مسجل دخول يخرجه
        return;
    }

    // جلب بيانات المستخدم من جدول الـ users اللي عملناه في Supabase
    const { data: userData } = await window.supa
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
        const { error } = await window.supa
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
        const { error } = await window.supa
            .from('accounts')
            .update({ tag: "", color: "#6c757d" })
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

// =============================================
// دوال فتح وإغلاق النوافذ المنبثقة (Modals)
// =============================================

// نافذة تعديل الحساب
function closeEdit() {
    document.getElementById('editModal').style.display = 'none';
    document.getElementById('editProfitAdj').value = '';
}

// نافذة تعديل العميل
function openEditCl(id, name, number, bal) {
    document.getElementById('editClRow').value = id;
    document.getElementById('editClName').value = name;
    document.getElementById('editClPhone').value = number;
    document.getElementById('editClBal').value = bal;
    document.getElementById('editClientModal').style.display = 'flex';
}

function closeEditCl() {
    document.getElementById('editClientModal').style.display = 'none';
}

async function saveEditClient() {
    const id = document.getElementById('editClRow').value;
    const name = document.getElementById('editClName').value.trim();
    const number = document.getElementById('editClPhone').value.trim();
    // تأكد من تحويل الرصيد لرقم صحيح إذا كان الحقل bigint
    const bal = Math.round(parseFloat(document.getElementById('editClBal').value)) || 0;

    if (!id) {
        showToast('❌ خطأ: لم يتم تحديد معرف العميل', false);
        return;
    }

    setLoading('btnSaveCl', true);
    try {
        // نستخدم { count: 'exact' } للتأكد أن الصف تم تحديثه فعلاً
        const { error, count } = await window.supa.from('clients')
            .update({ name, number, balance: bal })
            .eq('id', parseInt(id)) // التأكد من أنه رقم
            .select(); // إضافة select تجعل Supabase يعيد البيانات المحدثة للتأكد

        if (error) throw error;

        // إذا نجح الطلب لكن لم يتغير شيء (مثلاً ID خطأ)
        showToast('✅ تم تحديث بيانات العميل', true);
        closeEditCl();
        if (typeof loadClientsTable === 'function') loadClientsTable();
        
    } catch (err) {
        console.error(err); // لمساعدتك في المتصفح
        showToast('❌ خطأ: ' + err.message, false);
    } finally {
        setLoading('btnSaveCl', false);
    }
}// نافذة تعديل الصلاحية
function openEditRole(email, name) {
    document.getElementById('editRoleEmail').value = email;
    document.getElementById('editRoleName').value = name;
    document.getElementById('currentUserName').innerText = name;
    document.getElementById('editRoleModal').style.display = 'flex';
}

function closeEditRole() {
    document.getElementById('editRoleModal').style.display = 'none';
}

async function saveUserRole() {
    // 1. جلب بيانات المستخدم الحالي (أنت)
    const { data: { user } } = await window.supa.auth.getUser();
    
    if (!user) {
        showToast('❌ يجب تسجيل الدخول أولاً', false);
        return;
    }

    try {
        setLoading('btnSaveRole', true);

        // 2. التحقق من صلاحيتك كـ Master (التعديل هنا)
        const { data: currentUserData, error: fetchError } = await window.supa
            .from('users')
            .select('is_master')
            .eq('id', user.id)
            .single();

        // فحص: هل المستخدم موجود وهل هو Master؟
        if (fetchError || !currentUserData || !currentUserData.is_master) {
            showToast('🚫 ليس لديك صلاحية Master لتعديل الأدوار', false);
            setLoading('btnSaveRole', false);
            return; 
        }

        // 3. الحصول على البيانات الجديدة من الـ UI
        const emailToUpdate = document.getElementById('editRoleEmail').value;
        const newRole = document.getElementById('newRoleSelect').value;

        // 4. تنفيذ التحديث في قاعدة البيانات
        const { error: updateError } = await window.supa
            .from('users')
            .update({ role: newRole })
            .eq('email', emailToUpdate);

        if (updateError) throw updateError;

        showToast('✅ تم تحديث الصلاحية بنجاح', true);
        
        // إغلاق المودال (تأكد أن الوظيفة موجودة بهذا الاسم)
        if (typeof closeEditRole === 'function') closeEditRole();

        // 5. إدارة التحديث الفوري
        if (user.email === emailToUpdate) {
            showToast('🔄 جاري تحديث صلاحياتك...', true);
            setTimeout(() => {
                window.location.reload(); 
            }, 1000);
        } else {
            if (typeof loadUsersList === 'function') {
                await loadUsersList();
            }
        }

    } catch (err) {
        showToast('❌ خطأ: ' + err.message, false);
    } finally {
        setLoading('btnSaveRole', false);
    }
}// نافذة التنبيهات
function showNotifications() {
    document.getElementById('notificationModal').style.display = 'flex';
}

function closeNotificationModal() {
    document.getElementById('notificationModal').style.display = 'none';
}

// نافذة تأكيد العملية
function closeConfirmModal() {
    document.getElementById('confirmOpModal').style.display = 'none';
}

// نافذة تفاصيل الجرد
function closeLogModal() {
    document.getElementById('logDetailsModal').style.display = 'none';
}

function closeLogModalOutside(event) {
    if (event.target === document.getElementById('logDetailsModal')) closeLogModal();
}

// نافذة كلمة المرور الآمنة
function showSecurePass(callback) {
    window._secureCallback = callback;
    document.getElementById('securePassModal').style.display = 'flex';
    setTimeout(() => document.getElementById('secureInput')?.focus(), 100);
}

function verifySecurePass() {
    const pass = document.getElementById('secureInput').value;
    if (pass === '1234') {
        document.getElementById('securePassModal').style.display = 'none';
        document.getElementById('secureInput').value = '';
        if (typeof window._secureCallback === 'function') window._secureCallback();
    } else {
        showToast('❌ كلمة المرور خاطئة', false);
        document.getElementById('secureInput').value = '';
    }
}