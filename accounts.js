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

    try {
        const { data: accounts, error } = await supabase
            .from('accounts')
            .select('*')
            .order('pin', { ascending: false }); // ترتيب المتبت أولاً

        if (error) throw error;

        let html = '';
        accounts.forEach(a => {
            const isPinned = a.pin === "true" || a.pin === true;
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

                <div style="width: 30%;" class="text-end d-flex justify-content-end gap-1 px-1">
                    <button class="btn btn-sm btn-light border p-1" onclick="handleTogglePin(${a.id}, ${isPinned})" title="تثبيت">
                        <i class="fa-solid fa-thumbtack ${isPinned ? 'text-warning' : 'text-muted opacity-50'}"></i>
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

async function confirmDeleteAccount(id, name) {
    const { isConfirmed } = await Swal.fire({
        title: 'حذف الحساب؟',
        text: `هل أنت متأكد من حذف "${name}"؟`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء'
    });

    if (isConfirmed) {
        const { error } = await supabase.from('accounts').delete().eq('id', id);
        if (!error) {
            showToast("تم الحذف بنجاح");
            loadAccountsTable();
        } else {
            showToast("خطأ في الحذف: " + error.message, false);
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
        preConfirm: () => {
            return {
                tag: document.getElementById('swal-tag').value,
                color: document.getElementById('swal-color').value
            }
        }
    });

    if (formValues) {
        const { error } = await supabase.from('accounts').update(formValues).eq('id', id);
        if (!error) {
            showToast("تم حفظ التغييرات");
            loadAccountsTable();
        }
    }
}
async function openEditAccountModal(id) {
    const { data: acc } = await supabase.from('accounts').select('*').eq('id', id).single();
    if (!acc) return;

    const { value: formValues } = await Swal.fire({
        title: '<span style="font-size:18px;">تعديل بيانات الحساب</span>',
        html: `
            <div style="direction: rtl; text-align: right;">
                <div class="mb-3">
                    <label class="form-label small fw-bold text-muted">اسم الحساب / الرقم</label>
                    <input id="edit-n" class="form-control form-control-sm" value="${acc.name}">
                </div>
                <div class="mb-3">
                    <label class="form-label small fw-bold text-muted">الرصيد الحالي (ج.م)</label>
                    <input id="edit-b" type="number" class="form-control form-control-sm english-num" value="${acc.balance}">
                </div>
                <div class="row g-2">
                    <div class="col-6">
                        <label class="form-label small fw-bold text-muted">حد السحب اليومي</label>
                        <input id="edit-lo" type="number" class="form-control form-control-sm" value="${acc.daily_out_limit || 0}">
                    </div>
                    <div class="col-6">
                        <label class="form-label small fw-bold text-muted">حد الإيداع اليومي</label>
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
        const { error } = await supabase.from('accounts').update(formValues).eq('id', id);
        if (!error) {
            showToast("✅ تم التحديث بنجاح");
            loadAccountsTable();
        }
    }
}

function filterAccounts() {
    // 1. جلب الكلمة المكتوبة وتجهيزها
    const query = document.getElementById('accSearchInput').value.toLowerCase().trim();
    
    // 2. تحديد كل صفوف الحسابات (تأكدنا من الكلاسات المستعملة سابقاً)
    const cards = document.querySelectorAll('.acc-row, .acc-card-pro, .client-card'); 
    
    let foundCount = 0;

    cards.forEach(card => {
        // 3. جلب النص بالكامل من داخل الكارت (الاسم + الوسم)
        const content = card.textContent.toLowerCase();
        
        // 4. المقارنة
        if (content.includes(query)) {
            card.classList.remove('d-none');
            card.classList.add('d-flex'); // الحفاظ على التنسيق المرن
            foundCount++;
        } else {
            card.classList.remove('d-flex');
            card.classList.add('d-none');
        }
    });

    // 5. تحديث العداد
    const badge = document.getElementById('countBadge');
    if (badge) badge.innerText = `${foundCount} حساب`;
}
// دالة تثبيت الحساب (Pin) - معدلة لتناسب عمود pin عندك
async function handleTogglePin(id, currentState) {
    showToast("جاري التحديث...", true);
    const { error } = await supabase
        .from('accounts')
        .update({ pin: (!currentState).toString() })
        .eq('id', id);

    if (!error) {
        showToast("✅ تم التحديث", true);
        loadAccountsTable();
        if (typeof renderPinnedWallets === "function") renderPinnedWallets();
    }
}
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
        await supabase.from('accounts').update({ tag: newTag }).eq('id', id);
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
