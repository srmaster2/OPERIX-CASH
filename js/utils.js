// ================================================
// UTILS.JS - الدوال المساعدة العامة
// ================================================

// ---- Toast Notification ----
var _toastTimer = null;
function showToast(msg, success) {
    if (success === undefined) success = true;
    const el = document.getElementById('toastMsg');
    if (!el) return;
    el.textContent = msg;
    el.className = 'custom-toast show ' + (success ? 'toast-success' : 'toast-error');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { el.className = 'custom-toast'; }, 3500);
}

// ---- Loading State ----
function setLoading(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = isLoading;
    if (isLoading) {
        btn._originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa fa-circle-notch fa-spin me-1"></i> جاري التنفيذ...';
    } else {
        btn.innerHTML = btn._originalText || btn.innerHTML;
    }
}

// ---- تنسيق أرقام المدخلات ----
function formatNumberInput(input) {
    let val = input.value.replace(/[^0-9.]/g, '');
    const parts = val.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    input.value = parts.join('.');
}

// ---- تحميل المحافظ ----
async function loadWallets() {
    const select = document.getElementById('wallet');
    if (!select) return;
    select.innerHTML = '<option>جاري التحميل...</option>';
    try {
        const user = window.currentUserData;
        let query = window.supa
            .from('accounts')
            .select('id, name, balance, daily_out_limit, daily_in_limit, monthly_limit, daily_out_usage, daily_in_usage, monthly_usage_out')
            .order('name');
        if (typeof applyBranchFilter === 'function') query = applyBranchFilter(query, user);
        const { data: accounts, error } = await query;

        if (error) throw error;

        select.innerHTML = '<option value="">اختر الحساب...</option>';
        accounts?.forEach(acc => {
            const bal = Number(acc.balance || 0).toLocaleString();
            select.innerHTML += `<option value="${acc.id}"
                data-bal="${acc.balance             || 0}"
                data-lo="${acc.daily_out_limit      || 0}"
                data-li="${acc.daily_in_limit       || 0}"
                data-lm="${acc.monthly_limit        || 0}"
                data-uo="${acc.daily_out_usage      || 0}"
                data-ui="${acc.daily_in_usage       || 0}"
                data-um="${acc.monthly_usage_out    || 0}">
                ${acc.name} (${bal} ج.م)
            </option>`;
        });
    } catch (err) {
        select.innerHTML = '<option>خطأ في التحميل</option>';
        console.error('loadWallets error:', err);
    }
}

// ---- عرض حالة الليميت (متاح فعلي = limit - usage) ----
function updateLimitDisplay() {
    const select   = document.getElementById('wallet');
    const limitDiv = document.getElementById('limitStatus');
    if (!select || !limitDiv) return;

    const opt  = select.options[select.selectedIndex];
    const type = document.getElementById('type')?.value || '';

    if (!opt || !opt.value || type.includes("مصروف")) {
        limitDiv.style.display = 'none';
        return;
    }

    const bal = Number(opt.dataset.bal) || 0;
    const lo  = Number(opt.dataset.lo)  || 0;  // daily_out_limit
    const li  = Number(opt.dataset.li)  || 0;  // daily_in_limit
    const lm  = Number(opt.dataset.lm)  || 0;  // monthly_limit
    const uo  = Number(opt.dataset.uo)  || 0;  // daily_out_usage
    const ui  = Number(opt.dataset.ui)  || 0;  // daily_in_usage
    const um  = Number(opt.dataset.um)  || 0;  // monthly_usage_out

    // لو مفيش أي ليميت (زي الخزنة) اخفي الكارت
    if (!lo && !li && !lm) { limitDiv.style.display = 'none'; return; }

    // المتاح الفعلي
    const availOut = Math.max(0, Math.min(lo - uo, lm - um)); // أقل قيمة بين اليومي والشهري
    const availIn  = Math.max(0, li - ui);
    const isMonthRestricted = lm > 0 && (lm - um) < (lo - uo);

    // ألوان ديناميكية
    const balClass = bal < 300  ? 'text-danger fw-bold'
                   : bal < 1000 ? 'text-warning fw-bold'
                   : 'text-success fw-bold';
    const outClass = availOut < 500  ? 'text-danger fw-bold'
                   : availOut < 2000 ? 'text-warning fw-bold'
                   : 'text-success fw-bold';
    const incClass = availIn  < 500  ? 'text-danger fw-bold'
                   : availIn  < 2000 ? 'text-warning fw-bold'
                   : 'text-success fw-bold';

    limitDiv.style.display = 'block';
    limitDiv.innerHTML = `
        <div class="wallet-info-card shadow-sm" style="
            background: var(--bg-card, #1e293b);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 16px;
            padding: 12px 15px;
            margin-top: 8px;
            direction: rtl;
        ">
            <!-- الرصيد الحالي -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding-bottom:10px; border-bottom:1px dashed rgba(255,255,255,0.1);">
                <span style="font-size:12px; color:var(--text-muted, #94a3b8);">الرصيد الحالي</span>
                <span class="${balClass}" style="font-size:15px;">${bal.toLocaleString()} <small style="font-size:11px">ج.م</small></span>
            </div>
            <!-- متاح دخول / خروج -->
            <div style="display:flex; gap:8px;">
                <div style="flex:1; text-align:center; background:rgba(16,185,129,0.08); border-radius:10px; padding:8px 6px;">
                    <div style="font-size:10px; color:var(--text-muted,#94a3b8); margin-bottom:4px;">
                        <i class="fa fa-arrow-down" style="color:#10b981;"></i> متاح دخول
                    </div>
                    <div class="${incClass}" style="font-size:14px;">${availIn.toLocaleString()}</div>
                </div>
                <div style="flex:1; text-align:center; background:rgba(239,68,68,0.08); border-radius:10px; padding:8px 6px;">
                    <div style="font-size:10px; color:var(--text-muted,#94a3b8); margin-bottom:4px;">
                        <i class="fa fa-arrow-up" style="color:#ef4444;"></i> متاح خروج
                    </div>
                    <div class="${outClass}" style="font-size:14px;">${availOut.toLocaleString()}</div>
                </div>
            </div>
            ${isMonthRestricted ? `
            <div style="margin-top:8px; font-size:10px; color:#ef4444; font-weight:bold; text-align:center;">
                ⚠️ المحفظة مقيدة بالحد الشهري
            </div>` : ''}
        </div>`;
}

function updateLimitDisplayBoth() {
    const select = document.getElementById('wallet-both');
    if (!select) return;
}

// ---- جلب رصيد العميل ----
async function fetchClientBalance() {
    const clientId = document.getElementById('client')?.value;
    const statusEl = document.getElementById('clientBalanceStatus');
    if (!statusEl) return;
    if (!clientId) { statusEl.textContent = ''; return; }

    const { data, error } = await window.supa
        .from('clients').select('balance, name').eq('id', clientId).single();

    if (!error && data) {
        const bal = Number(data.balance || 0);
        statusEl.className = `small fw-bold mt-1 text-center ${bal > 0 ? 'text-danger' : 'text-success'}`;
        statusEl.textContent = `رصيد ${data.name}: ${Math.abs(bal).toLocaleString()} ج.م ${bal > 0 ? '(عليه)' : '(له)'}`;
    }
}

// ---- جلب العملاء لقائمة الاختيار ----
// ✅ دالة واحدة بس — اتشالت من transactions.js
async function loadClientsToSelect() {
    const select = document.getElementById('client');
    if (!select) return;
    const user = window.currentUserData;
    let qc = window.supa.from('clients').select('id, name, balance').order('name');
    if (typeof applyBranchFilter === 'function') qc = applyBranchFilter(qc, user);
    const { data: clients } = await qc;
    if (!clients) return;
    select.innerHTML = '<option value="">اختر العميل...</option>';
    clients.forEach(c => {
        const bal  = Number(c.balance) || 0;
        const info = bal < 0 ? ` | عليه: ${Math.abs(bal).toLocaleString()}`
                   : bal > 0 ? ` | له: ${bal.toLocaleString()}` : '';
        select.innerHTML += `<option value="${c.id}">${c.name}${info}</option>`;
    });
}

// ---- تحميل جدول العملاء ----
async function loadClientsTable() {
    const container = document.getElementById('manage-clients-body');
    if (!container) return;
    container.innerHTML = '<div class="text-center p-3"><i class="fa fa-spin fa-circle-notch"></i></div>';

    const user = window.currentUserData;
    let qt = window.supa.from('clients').select('*').order('name');
    if (typeof applyBranchFilter === 'function') qt = applyBranchFilter(qt, user);
    const { data: clients, error } = await qt;

    if (error || !clients) {
        container.innerHTML = '<div class="text-center text-danger small p-3">خطأ في التحميل</div>';
        return;
    }
    if (!clients.length) {
        container.innerHTML = '<div class="text-center text-muted small p-3">لا يوجد عملاء</div>';
        return;
    }

    container.innerHTML = clients.map(c => {
        const bal = Number(c.balance || 0);
        return `
        <div class="d-flex align-items-center p-2 border-bottom" style="font-size:13px;">
            <div style="width:25%;" class="fw-bold text-start text-truncate">${c.name}</div>
            <div style="width:30%;" class="text-center english-num text-muted">${c.number || '-'}</div>
            <div style="width:30%;" class="text-center english-num fw-bold ${bal > 0 ? 'text-danger' : 'text-success'}">${Math.abs(bal).toLocaleString()}</div>
            <div style="width:10%;" class="text-center">
                <button class="btn btn-sm p-1" onclick="openEditCl('${c.id}','${c.name}','${c.number||''}',${bal})">
                    <i class="fa fa-edit text-primary"></i>
                </button>
                <button class="btn btn-sm btn-light border text-danger p-1" onclick="deleteClient(${c.id},'${c.name}')">
                    <i class="fa fa-trash"></i>
                </button>
            </div>
        </div>`;
    }).join('');
}

async function deleteClient(clientId, name) {
    const { isConfirmed } = await Swal.fire({
        title: 'حذف العميل؟',
        text: `هل أنت متأكد من حذف "${name}"؟`,
        icon: 'warning', showCancelButton: true,
        confirmButtonText: 'حذف', cancelButtonText: 'إلغاء'
    });
    if (!isConfirmed) return;
    const numericId = parseInt(clientId);
    if (isNaN(numericId)) { showToast("❌ خطأ في معرف العميل", false); return; }
    const { error } = await window.supa.from('clients').delete().eq('id', numericId);
    if (!error) {
        showToast("✅ تم حذف العميل بنجاح", true);
        loadClientsTable();
    } else {
        showToast("❌ فشل الحذف: " + error.message, false);
    }
}

async function addClient() {
    // يدعم الـ id القديم (newClName/newClPhone) والجديد (newClientName/newClientPhone)
    const nameEl  = document.getElementById('newClientName')  || document.getElementById('newClName');
    const phoneEl = document.getElementById('newClientPhone') || document.getElementById('newClPhone');
    const name    = nameEl?.value?.trim();
    const phone   = phoneEl?.value?.trim() || '';
    if (!name) return showToast("⚠️ أدخل اسم العميل", false);
    setLoading('btnAddClient', true);
    try {
        const { error } = await window.supa.from('clients').insert([{ name, number: phone, balance: 0, branch_id: window.currentUserData?.branch_id || null }]);
        if (error) throw error;
        showToast("✅ تم إضافة العميل", true);
        if (nameEl)  nameEl.value  = '';
        if (phoneEl) phoneEl.value = '';
        loadClientsTable();
        loadClientsToSelect();
    } catch(err) {
        showToast("❌ " + err.message, false);
    } finally {
        setLoading('btnAddClient', false);
    }
}

// ---- تحميل قائمة المستخدمين ----
async function loadUsersList() {
    const container = document.getElementById('usersList');
    if (!container) return;
    container.innerHTML = '<div class="text-center p-3"><i class="fa fa-spin fa-circle-notch"></i></div>';

    const { data: users, error } = await window.supa.from('users').select('*').order('name');

    if (error || !users) {
        container.innerHTML = '<div class="text-center text-danger p-3">خطأ في التحميل</div>';
        return;
    }
    container.innerHTML = users.map(u => `
        <div class="d-flex align-items-center p-2 mb-2 border rounded-3" style="direction:rtl;">
            <div style="width:50%;">
                <div class="fw-bold small">${u.name || u.email}</div>
                <div class="text-muted" style="font-size:11px;">${u.email}</div>
            </div>
            <div style="width:25%;" class="text-center">
                <span class="badge ${u.role==='ADMIN'?'bg-danger':'bg-secondary'}">${u.role==='ADMIN'?'أدمن':'موظف'}</span>
            </div>
            <div style="width:25%;" class="text-end pe-2">
                <button class="btn btn-sm btn-light border" onclick="openEditRole('${u.email}','${u.name||u.email}')">
                    <i class="fa fa-user-shield text-primary"></i>
                </button>
            </div>
        </div>`).join('');
}

// ---- تبديل فلتر التاريخ ----
function toggleDateFilters() {
    const sec = document.getElementById('dateFilterSection');
    if (!sec) return;
    sec.style.display = (sec.style.display === 'none' || !sec.style.display) ? 'flex' : 'none';
}

// ---- إعادة ضبط البحث ----
function resetAdvancedSearch() {
    ['advSearchText','advSearchType','advDateFrom','advDateTo'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    const ds = document.getElementById('dateFilterSection');
    if (ds) ds.style.display = 'none';
    if (typeof executeAdvancedSearch === 'function') executeAdvancedSearch();
}

// ---- إعداد تبويبات إدارة النظام ----
function showManageTab(el) {
    const tabId = el.dataset.tab;
    document.querySelectorAll('.manage-tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.nav-pills .nav-link').forEach(l => l.classList.remove('active'));
    const tab = document.getElementById(tabId);
    if (tab) tab.style.display = 'block';
    el.classList.add('active');
    if      (tabId === 'clients-tab')  loadClientsTable();
    else if (tabId === 'accounts-tab') { if (typeof loadAccountsTable  === 'function') loadAccountsTable(); }
    else if (tabId === 'users-tab')    loadUsersList();
    else if (tabId === 'logs-tab')     { if (typeof loadAdminLogs      === 'function') loadAdminLogs(); }
    else if (tabId === 'branches-tab') {
        if (typeof loadBranchesTable    === 'function') loadBranchesTable();
        if (typeof populateBranchSelect === 'function') populateBranchSelect('assignBranchSelect');
        if (typeof loadUsersForAssign   === 'function') loadUsersForAssign();
    }
}

// ✅ searchTimeout معرّف هنا بس — اتشال من transactions.js
var searchTimeout;

// ============================================================
// LIVE — اشتراك لحظي على جدول accounts
// بيحدث loadWallets + updateLimitDisplay + renderPinnedWallets
// تلقائياً عند أي تغيير في الأرصدة بدون ريفريش
// ============================================================
var _accountsLiveSub = null;

function setupAccountsLive() {
    // منع تكرار الاشتراك
    if (_accountsLiveSub) return;

    _accountsLiveSub = window.supa
        .channel('live:accounts')
        .on('postgres_changes', {
            event:  'UPDATE',
            schema: 'public',
            table:  'accounts'
        }, function(payload) {
            const updated = payload.new;
            if (!updated) return;

            // 1. تحديث data-* على الـ option المطابق في select#wallet
            _patchWalletOption(updated);

            // 2. لو الحساب ده هو المختار حالياً → حدّث limitDisplay فوراً
            const select = document.getElementById('wallet');
            const opt    = select?.options[select.selectedIndex];
            if (opt && String(opt.value) === String(updated.id)) {
                _patchOptionDataset(opt, updated);
                if (typeof updateLimitDisplay === 'function') updateLimitDisplay();
            }

            // 3. حدّث كروت المحافظ المثبتة
            if (typeof renderPinnedWallets === 'function') renderPinnedWallets();
        })
        .subscribe();
}

// تحديث data-* attributes على option معين
function _patchOptionDataset(opt, acc) {
    opt.dataset.bal = acc.balance           != null ? acc.balance           : opt.dataset.bal;
    opt.dataset.lo  = acc.daily_out_limit   != null ? acc.daily_out_limit   : opt.dataset.lo;
    opt.dataset.li  = acc.daily_in_limit    != null ? acc.daily_in_limit    : opt.dataset.li;
    opt.dataset.lm  = acc.monthly_limit     != null ? acc.monthly_limit     : opt.dataset.lm;
    opt.dataset.uo  = acc.daily_out_usage   != null ? acc.daily_out_usage   : opt.dataset.uo;
    opt.dataset.ui  = acc.daily_in_usage    != null ? acc.daily_in_usage    : opt.dataset.ui;
    opt.dataset.um  = acc.monthly_usage_out != null ? acc.monthly_usage_out : opt.dataset.um;
    // تحديث نص الرصيد في الـ option
    var name = opt.text.replace(/\s*\(.*\)/, '').trim();
    opt.text = name + ' (' + Number(acc.balance || 0).toLocaleString() + ' ج.م)';
}

// البحث عن الـ option المطابق وتحديثه
function _patchWalletOption(acc) {
    var select = document.getElementById('wallet');
    if (!select) return;
    for (var i = 0; i < select.options.length; i++) {
        if (String(select.options[i].value) === String(acc.id)) {
            _patchOptionDataset(select.options[i], acc);
            break;
        }
    }
}

// ---- Theme Toggle ----
function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    document.querySelectorAll('.icon-btn .fa-moon, .icon-btn .fa-sun').forEach(icon => {
        if (isLight) icon.classList.replace('fa-moon','fa-sun');
        else         icon.classList.replace('fa-sun','fa-moon');
    });
    const settingsToggle = document.getElementById('darkModeToggleIcon');
    if (settingsToggle) settingsToggle.className = isLight ? 'fa fa-toggle-on text-primary' : 'fa fa-toggle-off';
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
}

// ---- بيانات الإعدادات الشخصية ----
async function loadProfileSettings() {
    try {
        const { data: { user } } = await window.supa.auth.getUser();
        if (!user) return;
        const { data: dbUser } = await window.supa
            .from('users').select('*').eq('email', user.email).maybeSingle();

        const nameEl  = document.getElementById('displayProfileName');
        const emailEl = document.getElementById('displayProfileEmail');
        const roleEl  = document.getElementById('displayProfileRole');

        if (nameEl)  nameEl.textContent  = dbUser?.name || user.user_metadata?.name || 'غير محدد';
        if (emailEl) emailEl.textContent = user.email;
        if (roleEl) {
            const roleMap = { 'ADMIN':'🔴 أدمن', 'USER':'🟢 موظف' };
            roleEl.textContent = dbUser?.is_master ? '⭐ المدير العام' : (roleMap[dbUser?.role] || 'موظف');
        }
    } catch(err) {
        console.error('loadProfileSettings error:', err);
    }
}

// ---- تبديل تبويبات الجرد ----
function switchInventoryTab(tabName) {
    const counter    = document.getElementById('inventory-tab-counter');
    const logs       = document.getElementById('inventory-tab-logs');
    const btnCounter = document.getElementById('tab-btn-counter');
    const btnLogs    = document.getElementById('tab-btn-logs');

    if (tabName === 'counter') {
        if (counter) counter.style.display = 'block';
        if (logs)    logs.style.display    = 'none';
        if (btnCounter) { btnCounter.classList.add('bg-white','text-primary');    btnCounter.classList.remove('bg-light','text-muted'); }
        if (btnLogs)    { btnLogs.classList.remove('bg-white','text-primary');    btnLogs.classList.add('bg-light','text-muted'); }
        if (typeof renderCounter === 'function') renderCounter();
    } else {
        if (counter) counter.style.display = 'none';
        if (logs)    logs.style.display    = 'block';
        if (btnLogs)    { btnLogs.classList.add('bg-white','text-primary');       btnLogs.classList.remove('bg-light','text-muted'); }
        if (btnCounter) { btnCounter.classList.remove('bg-white','text-primary'); btnCounter.classList.add('bg-light','text-muted'); }
        if (typeof loadInventoryLogs === 'function') loadInventoryLogs();
    }
}

// ---- رفرش الخزنة ----
async function refreshVaultWithToast() {
    const icon = document.getElementById('refresh-vault-icon');
    if (icon) icon.classList.add('fa-spin');
    try {
        const { data } = await window.supa.from('accounts')
            .select('balance').eq('name','الخزنة (الكاش)').single();
        const val = document.getElementById('system-vault-val');
        if (val && data) val.textContent = Number(data.balance).toLocaleString();
        showToast('✅ تم تحديث رصيد الخزنة');
    } catch(e) {
        showToast('❌ خطأ في التحديث', false);
    } finally {
        if (icon) icon.classList.remove('fa-spin');
    }
}

// ---- getTransactionLogs — دالة واحدة بس هنا ----
// ✅ اتشالت من transactions.js — هنا النسخة الوحيدة
async function getTransactionLogs(filters) {
    filters = filters || {};
    try {
        const user = window.currentUserData;
        let query = window.supa
            .from('transactions')
            .select('id, date, time, type, amount, commission, wallet_name, provider, balance_after, notes, added_by')
            .order('id', { ascending: false });
        if (typeof applyBranchFilter === 'function') query = applyBranchFilter(query, user);

        if (filters.type && !filters.type.includes("كل العمليات"))
            query = query.ilike('type', `%${filters.type}%`);
        if (filters.dateFrom) query = query.gte('date', filters.dateFrom);
        if (filters.dateTo)   query = query.lte('date', filters.dateTo);

        const limit = (filters.type || filters.dateFrom || filters.dateTo) ? 1000 : 50;
        query = query.limit(limit);

        const { data, error } = await query;
        if (error) throw error;
        return data;
    } catch(e) {
        console.error('getTransactionLogs error:', e);
        return null;
    }
}

// ---- تطبيق الثيم عند التحميل ----
document.addEventListener('DOMContentLoaded', function() {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') {
        document.body.classList.add('light-mode');
        document.querySelectorAll('.icon-btn .fa-moon').forEach(i => i.classList.replace('fa-moon','fa-sun'));
        const t = document.getElementById('darkModeToggleIcon');
        if (t) t.className = 'fa fa-toggle-on text-primary';
    }

    // ✅ تفعيل Live updates للأرصدة — بعد ما supa يكون جاهز
    // setupAccountsLive بيتأخر شوية عشان window.supa ياخد وقت للتهيئة
    var _liveInitAttempts = 0;
    var _liveInitTimer = setInterval(function() {
        _liveInitAttempts++;
        if (window.supa) {
            clearInterval(_liveInitTimer);
            setupAccountsLive();
        } else if (_liveInitAttempts > 20) {
            clearInterval(_liveInitTimer); // وقف بعد 10 ثواني
        }
    }, 500);
});