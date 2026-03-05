// ============================================================
// transactions.js — Sadek Cash (Supabase)
// ملاحظة: searchTimeout, loadClientsToSelect, getTransactionLogs
//         كلهم معرّفين في utils.js بس — مش هنا
// ============================================================
let dynamicLockList = []; // سيتم ملؤها تلقائياً بأسماء الشركات من قاعدة البيانات
var globalPendingData = null;
var selectedProvider  = "";
var isRenderingPins   = false;

const _supa = () => window.supa;
// دالة لتفعيل الاستماع اللحظي
function setupLiveLogs() {
    const supabase = _supa();

    supabase
        .channel('public:transactions')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'transactions'
        }, () => {
            executeAdvancedSearch();
        })
        .on('postgres_changes', {
            event: 'DELETE',
            schema: 'public',
            table: 'transactions'
        }, () => {
            // تحديث الجدول بعد الرول باك
            executeAdvancedSearch();
        })
        .subscribe();
}

// استدعاء الدالة عند تحميل الصفحة
// ✅ ننتظر حتى يكون window.supa جاهزاً قبل التشغيل
document.addEventListener('DOMContentLoaded', () => {
    var _txInitAttempts = 0;
    var _txInitTimer = setInterval(function() {
        _txInitAttempts++;
        // ننتظر supa + currentUserData مع company_id
        if (window.supa && window.currentUserData?.company_id) {
            clearInterval(_txInitTimer);
            setupLiveLogs();
            executeAdvancedSearch();
        } else if (_txInitAttempts > 40) {
            clearInterval(_txInitTimer);
        }
    }, 250);
});
async function getSession() {
    const { data } = await _supa().auth.getSession();
    return data.session;
}

// ============================================================
// 1. setOp
// ============================================================
function setOp(typeValue, provider, element) {
    const walletSelect = document.getElementById('wallet');
    const typeInput    = document.getElementById('type');

    if (typeInput) typeInput.value = typeValue;
    selectedProvider = provider || "";

    document.querySelectorAll('.op-card').forEach(c => c.classList.remove('active','active-op'));
    if (element) element.classList.add('active','active-op');

    const target = _norm(provider);
    
    // التحقق هل الشركة من ضمن قائمة الشركات الديناميكية؟
    // cash_supply (تزويد) لا يقفل الـ wallet — المحفظة يختارها المستخدم
    const isCashSupply = typeValue.includes("سحب كاش") && typeValue.includes("تزويد");
    const isLockOp = !isCashSupply &&
                     dynamicLockList.some(p => _norm(p) === target) &&
                     (typeValue.includes("سحب") || typeValue.includes("فاتورة"));

    if (isLockOp && walletSelect) {
        let found = false;
        for (let i = 0; i < walletSelect.options.length; i++) {
            if (_norm(walletSelect.options[i].text).includes(target)) {
                walletSelect.selectedIndex = i;
                found = true;
                break;
            }
        }
        
        if (found) {
            walletSelect.disabled = true;
            walletSelect.style.backgroundColor = "var(--bg-body)";
            walletSelect.style.cursor = "not-allowed";
        }
    } else if (walletSelect) {
        walletSelect.disabled = false;
        walletSelect.style.backgroundColor = "";
        walletSelect.style.cursor = "default";
        
        // إذا لم تكن شركة مسجلة، نعود للخيار الافتراضي
        if (!dynamicLockList.some(p => _norm(p) === target)) {
             walletSelect.selectedIndex = 0;
        }
    }

    _toggleOpFields(typeValue);
    if (typeof updateLimitDisplay === "function") updateLimitDisplay();
    walletSelect?.dispatchEvent(new Event('change'));

    // توجيه المستخدم لمبلغ العملية
    setTimeout(() => {
        const f = document.getElementById('amount');
        if (f) { f.scrollIntoView({ behavior:'smooth', block:'center' }); f.focus(); }
    }, 400);
}
function _norm(txt) {
    return txt ? String(txt).replace(/[أإآا]/g,'ا').replace(/\s+/g,'').trim().toLowerCase() : "";
}

function _toggleOpFields(typeValue) {
    const isDebt   = /دين|مديونية|سداد/.test(typeValue || '');
    const isWallet = typeValue && !isDebt && !typeValue.includes("مصروف");
    const show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? 'block' : 'none'; };
    show('clientFieldContainer',     isDebt);
    show('commDestinationContainer', isWallet);
    show('deductCommContainer',      isWallet);
    if (isDebt && typeof loadClientsToSelect === "function") loadClientsToSelect();
}

// ============================================================
// 2. openProviderSelect
// ============================================================
// ============================================================
// serviceMap: خريطة العمليات — الشركات بتتجيب من Supabase أوتوماتيك
// ============================================================
const serviceMap = {
    client_withdraw: {
        label: 'سحب من عميل',
        buildTitle: (prov) => `سحب من عميل (تزويد ${prov})`,
        filterTag: 'شركة',
        needsWallet: false   // المحفظة = الخزنة، مش محفظة منفصلة
    },
    pay_bill: {
        label: 'دفع فاتورة',
        buildTitle: (prov) => `دفع فاتورة (${prov})`,
        filterTag: 'شركة',
        needsWallet: false
    },
    cash_supply: {
        label: 'سحب كاش',
        buildTitle: (prov) => `سحب كاش (تزويد ${prov})`,
        filterTag: 'شركة',
        needsWallet: true    // ✅ تزويد: لازم يختار محفظة بعد الشركة
    },
    visa_withdraw: {
        label: 'سحب فيزا',
        buildTitle: (prov) => `سحب فيزا (ماكينة ${prov})`,
        filterTag: 'شركة',
        needsWallet: false
    }
};


function getProviderGradient(name) {
    const presets = {
        'فوري': ['#ff6b00', '#ff8f00'],
        'أمان': ['#21bce2', '#0ea5e9'],
        'مكسب': ['#153d96', '#1e40af'],
        'ضامن': ['#7c3aed', '#5b21b6'],
        'بساطة': ['#dc2626', '#ef4444'],
        'مشتريات': ['#059669', '#10b981'],
        '2090': ['#1e293b', '#475569']
    };

    if (presets[name]) {
        return `linear-gradient(135deg, ${presets[name][0]}, ${presets[name][1]})`;
    }

    // توليد لون عشوائي ذكي لأي شركة جديدة تضاف مستقبلاً
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const h = Math.abs(hash) % 360;
    return `linear-gradient(135deg, hsl(${h}, 75%, 40%), hsl(${h}, 75%, 30%))`;
}

// 3. دالة فتح اختيار الشركة (تحديث القائمة + رسم الكروت)
async function openProviderSelect(serviceKey, element) {
    // تمييز الكارت المختار
    document.querySelectorAll('.op-card').forEach(c => c.classList.remove('active','active-op'));
    if (element) element.classList.add('active','active-op');

    const config = serviceMap[serviceKey];
    if (!config) return;

    document.getElementById('selectedServiceKey').value = serviceKey;
    const grid = document.getElementById('providerButtonsGrid');
    const modal = document.getElementById('providerModal');
    if (!grid || !modal) return;

    grid.innerHTML = '<div class="text-center p-4"><i class="fa fa-circle-notch fa-spin fa-3x text-primary"></i></div>';
    modal.style.display = 'flex';

    try {
        const user = window.currentUserData;
        let compQuery = _supa()
            .from('accounts')
            .select('id, name, balance')
            .gt('daily_out_limit', 9000000)
            .not('name', 'ilike', '%خزنة%')
            .not('name', 'ilike', '%كاش%');
        if (typeof applyBranchFilter === 'function') compQuery = applyBranchFilter(compQuery, user);
        compQuery = compQuery.order('name');
        const { data: companies, error } = await compQuery;

        if (error) throw error;

        // تحديث مصفوفة الشركات للربط التلقائي
        dynamicLockList = companies ? companies.map(c => c.name) : [];
        grid.innerHTML = '';

        if (dynamicLockList.length === 0) {
            grid.innerHTML = '<div class="p-4 text-center text-muted">لا توجد شركات مسجلة حالياً</div>';
            return;
        }

        companies.forEach(company => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'provider-card';
            
            const gradient = getProviderGradient(company.name);
            const bal = Number(company.balance || 0).toLocaleString();

            btn.style.background = gradient;
            btn.innerHTML = `
                <div class="provider-info">
                    <span class="provider-name">${company.name}</span>
                    <span class="provider-balance"><i class="fa fa-wallet"></i> رصيد: ${bal} ج.م</span>
                </div>
                <i class="fa fa-university provider-icon-bg"></i>
                <i class="fa fa-chevron-left" style="z-index:2; font-size: 14px; opacity:0.8"></i>
            `;

            btn.onclick = () => confirmProviderSelection(serviceKey, company.name);
            grid.appendChild(btn);
        });

    } catch(e) {
        grid.innerHTML = '<div class="alert alert-danger mx-3">فشل تحميل بيانات الشركات</div>';
    }
}
function confirmProviderSelection(serviceKey, provider) {
    const config = serviceMap[serviceKey];
    if (!config) return;
    closeProviderModal();
    const originalCard = document.querySelector(`.op-card[onclick*="${serviceKey}"]`);

    if (config.needsWallet) {
        // ✅ تزويد: اضبط النوع والـ provider، ثم اطلب من المستخدم يختار محفظة من الـ pinned
        selectedProvider = provider;
        const typeInput = document.getElementById('type');
        if (typeInput) typeInput.value = config.buildTitle(provider);
        document.querySelectorAll('.op-card').forEach(c => c.classList.remove('active','active-op'));
        if (originalCard) originalCard.classList.add('active','active-op');
        _toggleOpFields(config.buildTitle(provider));

        // فتح محفظة الاختيار: reset الـ select وانتظر المستخدم
        const walletSelect = document.getElementById('wallet');
        if (walletSelect) {
            walletSelect.disabled = false;
            walletSelect.style.backgroundColor = "";
            walletSelect.style.cursor = "default";
            walletSelect.selectedIndex = 0;
        }

        // تمييز منطقة الـ pinned wallets عشان يشوفها
        const pinnedContainer = document.getElementById('pinnedWallets');
        if (pinnedContainer) {
            pinnedContainer.style.outline = '2px solid var(--primary-blue)';
            pinnedContainer.style.borderRadius = '14px';
            pinnedContainer.style.transition = 'outline 0.3s';
            setTimeout(() => {
                pinnedContainer.style.outline = 'none';
            }, 2500);
            pinnedContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        showToast("📌 اختر المحفظة من الكروت المثبتة", true);
        if (typeof updateLimitDisplay === "function") updateLimitDisplay();
    } else {
        // السلوك الطبيعي
        setOp(config.buildTitle(provider), provider, originalCard);
    }
}
function closeProviderModal() {
    const modal = document.getElementById('providerModal');
    if (modal) modal.style.display = 'none';
}


// ============================================================
// 3. renderPinnedWallets
// ============================================================
async function renderPinnedWallets() {
    const container = document.getElementById('pinnedWallets');
    if (!container || isRenderingPins) return;
    isRenderingPins = true;

    try {
        const user = window.currentUserData;
        if (!user?.company_id) { isRenderingPins = false; return; }
        let pinQuery = _supa()
            .from('accounts')
            .select('id, name, balance, is_pinned, tag, color, daily_out_limit, daily_in_limit, monthly_limit, daily_out_usage, daily_in_usage, monthly_usage_out, monthly_usage_in')
            .eq('company_id', user.company_id)
            .eq('is_pinned', true)
            .order('name');
        if (typeof applyBranchFilter === 'function') pinQuery = applyBranchFilter(pinQuery, user);
        const { data: accounts, error } = await pinQuery;

        container.innerHTML = '';
        if (error || !accounts || !accounts.length) {
            container.innerHTML = '<span class="text-muted small">لا توجد محافظ مثبتة.</span>';
            return;
        }

        // الثيم في CSS يعتمد على body.light-mode — الدارك هو الحالة الافتراضية
        const isDark = !document.body.classList.contains('light-mode');

        accounts.forEach(function(w) {
            const btn = document.createElement('div');

            const bal      = Number(w.balance || 0);
            const lo       = Number(w.daily_out_limit || 0);
            const li       = Number(w.daily_in_limit  || 0);
            const lm       = Number(w.monthly_limit   || 0);
            const uo       = Number(w.daily_out_usage || 0);
            const ui       = Number(w.daily_in_usage  || 0);
            const um       = Number(w.monthly_usage_out || 0);

            // المتبقي الفعلي = min(متبقي يومي, متبقي شهري)
            // لو الشهري خلص قبل اليومي → المتبقي الفعلي هو الشهري
            const remDayOut = Math.max(0, lo - uo);
            const remMonOut = lm > 0 ? Math.max(0, lm - um) : remDayOut;
            const availOut  = Math.min(remDayOut, remMonOut);

            // نفس المنطق للدخول — monthly_usage_in لو موجود
            const remDayIn  = Math.max(0, li - ui);
            const umIn      = Number(w.monthly_usage_in || 0);
            const remMonIn  = lm > 0 ? Math.max(0, lm - umIn) : remDayIn;
            const availIn   = Math.min(remDayIn, remMonIn);

            // ⭐ لون مضمون للدارك/لايت مود
            const dynamicMainColor  = isDark ? '#f1f5f9' : '#1e293b';
            const dynamicMutedColor = isDark ? '#94a3b8' : '#64748b';

            const balColor = bal < 300  ? '#ef4444'
                           : bal < 1000 ? '#f59e0b'
                           : '#10b981';

            const inColor  = availIn  < 500 ? '#ef4444'
                           : availIn  < 2000 ? '#f59e0b'
                           : '#10b981';

            const outColor = availOut < 500 ? '#ef4444'
                           : availOut < 2000 ? '#f59e0b'
                           : '#10b981';

            const tagColor = w.color || '#0ea5e9';

            btn.style.cssText = `
                display:inline-flex;
                flex-direction:column;
                gap:6px;
                background:var(--pin-card-bg);
                color:var(--pin-text-main);
                border:1px solid var(--pin-card-border);
                border-radius:14px;
                padding:10px 14px;
                cursor:pointer;
                min-width:140px;
                direction:rtl;
                user-select:none;
                box-shadow:var(--pin-card-shadow);
                transition: border-color 0.2s, box-shadow 0.2s;
            `;

            var tagHtml = (w.tag && w.tag.trim())
                ? `<span style="font-size:9px; background:${tagColor}; color:#fff; padding:1px 7px; border-radius:20px; font-weight:700;">${w.tag}</span>`
                : '';

            var line1 = `
                <div style="display:flex; justify-content:space-between;">
                    <div style="display:flex; gap:6px; align-items:center;">
                        <i class="fa-solid fa-bolt" style="color:${tagColor}; font-size:11px;"></i>
                        <span style="font-size:12px; font-weight:800; color:var(--pin-text-main);">${w.name}</span>
                    </div>
                    ${tagHtml}
                </div>`;

            var line2 = `
                <div style="border-top:1px dashed var(--pin-divider); padding-top:6px;">
                    <span style="font-size:9px; color:var(--pin-text-muted);">رصيد</span>
                    <span style="font-size:14px; font-weight:800; color:${balColor}; margin-right:4px;">${bal.toLocaleString()}</span>
                    <span style="font-size:9px; color:var(--pin-text-muted);">ج.م</span>
                </div>`;

            var line3 = `
                <div style="display:flex; gap:6px;">
                    <div style="flex:1; text-align:center; background:var(--pin-in-bg); border-radius:8px; padding:4px;">
                        <div style="font-size:8px; color:var(--pin-text-muted);">دخول</div>
                        <div style="font-weight:700; color:${inColor};">${availIn.toLocaleString()}</div>
                    </div>
                    <div style="flex:1; text-align:center; background:var(--pin-out-bg); border-radius:8px; padding:4px;">
                        <div style="font-size:8px; color:var(--pin-text-muted);">خروج</div>
                        <div style="font-weight:700; color:${outColor};">${availOut.toLocaleString()}</div>
                    </div>
                </div>`;

            btn.innerHTML = line1 + line2 + line3;

            btn.onmouseenter = function() { btn.style.borderColor = tagColor; btn.style.boxShadow = '0 0 0 2px ' + tagColor + '33'; };
            btn.onmouseleave = function() {
                if (!btn.classList.contains('active')) {
                    btn.style.borderColor = 'var(--border-color, #e2e8f0)';
                    btn.style.boxShadow = 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))';
                }
            };
            btn.onclick = function() {
                document.querySelectorAll('#pinnedWallets > div').forEach(function(b) {
                    b.classList.remove('active');
                    b.style.borderColor = 'var(--border-color, #e2e8f0)';
                    b.style.boxShadow = 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))';
                });
                btn.classList.add('active');
                btn.style.borderColor = tagColor;
                btn.style.boxShadow = '0 0 0 3px ' + tagColor + '44';
                selectWalletFast(w.id, w.name, btn);
            };

            container.appendChild(btn);
        });

    } catch(e) {
        if (container) container.innerHTML = '<span class="text-muted small">خطأ في العرض</span>';
    } finally {
        isRenderingPins = false;
    }
}
function selectWalletFast(walletId, walletName, btn) {
    const select = document.getElementById('wallet');
    if (!select) return;
    for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].value == walletId ||
            _norm(select.options[i].text).includes(_norm(walletName))) {
            select.selectedIndex = i; break;
        }
    }
    document.querySelectorAll('.pin-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (typeof updateLimitDisplay === "function") updateLimitDisplay();
    select.dispatchEvent(new Event('change'));
}

// ============================================================
// 4. loadWalletsToSelect — للفلترة حسب الفئة (SAFE/WALLET/COMPANY)
//    loadWallets في utils.js للقائمة العامة بدون فلترة
// ============================================================
async function loadWalletsToSelect(category) {
    const select = document.getElementById('wallet');
    if (!select) return;
    select.innerHTML = '<option value="">جاري التحميل...</option>';

    const user = window.currentUserData;
    let query = _supa().from('accounts')
        .select('id, name, balance, daily_out_limit')
        .eq('company_id', user?.company_id || '')
        .order('name');
    if (typeof applyBranchFilter === 'function') query = applyBranchFilter(query, user);
    const { data: accounts, error } = await query;

    if (error || !accounts) {
        select.innerHTML = '<option value="">خطأ في التحميل</option>';
        return;
    }
    select.innerHTML = '<option value="">اختر الحساب...</option>';
    accounts.forEach(acc => {
        const limit     = Number(acc.daily_out_limit) || 0;
        const isCompany = limit > 10000000;
        const isSafe    = acc.name.includes("الخزنة");
        if (category === 'SAFE'    && !isSafe)               return;
        if (category === 'WALLET'  && (isSafe || isCompany)) return;
        if (category === 'COMPANY' && !isCompany)             return;
        const bal = Number(acc.balance) || 0;
        select.innerHTML += `<option value="${acc.id}"
            data-lo="${acc.daily_out_limit||0}"
            data-li="${acc.daily_in_limit||0}"
            data-lm="${acc.monthly_limit||0}">
            ${acc.name} (${bal.toLocaleString()} ج.م)
        </option>`;
    });
}

// ============================================================
// 5. runTransaction
// ============================================================
function runTransaction() {
    try {
        const get = id => document.getElementById(id);
        const typeEl     = get('type');
        const amountEl   = get('amount');
        const walletEl   = get('wallet');
        const commEl     = get('comm');
        const commDestEl = get('commDestination');
        const clientEl   = get('client');
        const noteEl     = get('note');
        const deductEl   = get('deductCommFromAmount');

        if (!typeEl?.value?.trim())
            return showToast("⚠️ يجب اختيار نوع الخدمة من الكروت أولاً", false);
        if (!amountEl?.value || Number(amountEl.value) <= 0)
            return showToast("⚠️ برجاء إدخال مبلغ صحيح", false);
        if (!walletEl?.value)
            return showToast("⚠️ يرجى اختيار المحفظة أو الخزنة", false);

        const type       = typeEl.value;
        const amount     = amountEl.value.replace(/,/g,'');
        const walletId   = walletEl.value;
        const walletName = (walletEl.options[walletEl.selectedIndex]?.text||"").replace(/\s*\(.*\)/,'').trim();
        const comm       = (commEl?.value||'0').replace(/,/g,'');
        const commDest   = commDestEl?.value || 'CASH';
        const clientId   = clientEl?.value   || '';
        const note       = noteEl?.value     || '';
        const deductComm = deductEl?.checked  || false;
        const provider   = selectedProvider  || walletName || "الخزنة";

        if (/دين|مديونية|سداد/.test(type) && !clientId)
            return showToast("⚠️ هذه العملية تتطلب اختيار عميل", false);

        const summaryCard = `
            <div style="background:rgba(255,255,255,0.05);border-radius:18px;padding:15px;margin-bottom:15px;border:1px solid rgba(255,255,255,0.1);">
                <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                    <span style="color:var(--text-muted);font-size:13px;">نوع العملية:</span>
                    <span style="color:var(--text-main);font-weight:800;">${type}</span>
                </div>
                <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                    <span style="color:var(--text-muted);font-size:13px;">المبلغ:</span>
                    <span style="color:var(--text-main);font-weight:800;font-size:18px;">${Number(amount).toLocaleString()} ج.م</span>
                </div>
                ${Number(comm)>0 ? `
                <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                    <span style="color:var(--text-muted);font-size:13px;">العمولة:</span>
                    <span style="color:#f59e0b;font-weight:bold;">${Number(comm).toLocaleString()} ← ${commDest==='CASH'?'💰 الخزنة':'📱 المحفظة'}</span>
                </div>` : ''}
                <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.2);">
                    <span style="color:var(--text-muted);font-size:13px;">الجهة:</span>
                    <span style="color:#ffca28;font-weight:bold;">${provider}</span>
                </div>
            </div>`;

        globalPendingData = { walletId, walletName, type, provider, amount, comm, clientId, note, commDest, deductComm };
        showCustomConfirmModal(summaryCard + _buildFlowCard(type, provider, walletName), _getOpColor(type));
    } catch(err) {
        alert("خطأ: " + err.message);
    }
}

function _getOpColor(type) {
    if (/سداد|وارد|سحب من محفظة/.test(type)) return "#10b981";
    if (/مصروف|سحب|إيداع/.test(type))         return "#ef4444";
    return "#3b82f6";
}

function _buildFlowCard(type, provider, walletName) {
    const box = (from, fi, to, ti, color, detail) => `
        <div style="background:rgba(255,255,255,0.02);padding:15px;border-radius:18px;border:1px solid rgba(255,255,255,0.05);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <div style="text-align:center;width:70px;">
                    <div style="width:45px;height:45px;background:rgba(255,255,255,0.1);border-radius:12px;display:flex;align-items:center;justify-content:center;margin:0 auto 5px;">
                        <i class="fas ${fi}" style="color:var(--text-main)"></i></div>
                    <span style="font-size:10px;color:var(--text-muted);font-weight:bold;">${from}</span>
                </div>
                <i class="fas fa-long-arrow-alt-left fa-2x" style="color:${color};opacity:0.8;flex:1;text-align:center;"></i>
                <div style="text-align:center;width:70px;">
                    <div style="width:45px;height:45px;background:${color};border-radius:12px;display:flex;align-items:center;justify-content:center;margin:0 auto 5px;">
                        <i class="fas ${ti}" style="color:#fff"></i></div>
                    <span style="font-size:10px;color:var(--text-muted);font-weight:bold;">${to}</span>
                </div>
            </div>
            <p style="margin:0;font-size:13px;color:var(--text-main);direction:rtl;line-height:1.5;">${detail}</p>
        </div>`;

    if (/سحب من عميل|سحب فيزا/.test(type))
        return box("العميل","fa-user",provider,"fa-server","#10b981",`📥 رصيد ${provider} هيزيد.<br>📤 كاش الخزنة هيقل.`);
    if (type.includes("دفع فاتورة"))
        return box("العميل","fa-money-bill",provider,"fa-server","#ef4444",`📥 كاش الخزنة هيزيد.<br>📤 رصيد ${provider} هيقل.`);
    if (/سحب كاش|تزويد/.test(type))
        return box("المحفظة","fa-wallet",provider,"fa-server","#3b82f6",`📥 رصيد ${provider} هيزيد.<br>ℹ️ عملية تنظيمية.`);
    if (/إيداع|شحن|تحويل/.test(type))
        return box(walletName,"fa-wallet","العميل","fa-user","#ef4444","�ى كاش الخزنة زاد.<br>📤 رصيد المحفظة قل.");
    if (type.includes("سحب من محفظة"))
        return box("العميل","fa-user",walletName,"fa-wallet","#10b981","📥 رصيد المحفظة هيزيد.<br>📤 كاش الخزنة هيقل.");
    if (type.includes("سداد"))
        return `<div style="padding:15px;text-align:center;color:#10b981;font-weight:bold;">✅ العميل يسدد دين</div>`;
    if (/دين|مديونية/.test(type))
        return `<div style="padding:15px;text-align:center;color:#ef4444;font-weight:bold;">⚠️ تسجيل دين جديد</div>`;
    if (type.includes("مصروف"))
        return `<div style="padding:15px;text-align:center;color:#f59e0b;font-weight:bold;">💸 مصروف من الخزنة</div>`;
    return `<p style="text-align:center;padding:10px;">تأكيد: <b>${type}</b></p>`;
}

// ============================================================
// 6. showCustomConfirmModal
// ============================================================
function showCustomConfirmModal(content, themeColor) {
    themeColor = themeColor || "#3b82f6";
    document.getElementById('customConfirmModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', `
        <div id="customConfirmModal"
            style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.85);
                   backdrop-filter:blur(4px);display:flex;justify-content:center;align-items:center;
                   z-index:10000;padding:20px;font-family:'Cairo',sans-serif;">
            <div style="background:var(--bg-card,#1e293b);width:100%;max-width:390px;border-radius:24px;
                        box-shadow:0 20px 50px rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);overflow:hidden;">
                <div style="background:${themeColor};padding:15px;text-align:center;color:#fff;">
                    <i class="fas fa-file-invoice-dollar fa-2x mb-2"></i>
                    <h6 style="margin:0;font-weight:800;font-size:16px;">مراجعة وتأكيد العملية</h6>
                </div>
                <div style="padding:25px 20px;">${content}</div>
                <div style="padding:0 20px 25px;display:flex;gap:12px;">
                    <button onclick="finalExecuteStep(this)"
                        style="flex:2;padding:14px;border:none;border-radius:15px;background:${themeColor};
                               color:#fff;font-weight:bold;font-size:15px;cursor:pointer;">
                        ✅ تأكيد العملية
                    </button>
                    <button onclick="document.getElementById('customConfirmModal').remove()"
                        style="flex:1;padding:14px;border:1px solid #475569;border-radius:15px;
                               background:rgba(255,255,255,0.05);color:#94a3b8;cursor:pointer;">
                        إلغاء
                    </button>
                </div>
            </div>
        </div>`);
}

// ============================================================
// 7. finalExecuteStep
// ============================================================
async function finalExecuteStep(btn) {
    if (!globalPendingData) return;
    btn.disabled  = true;
    btn.innerHTML = '<i class="fa fa-circle-notch fa-spin"></i> جاري الحفظ...';

    try {
        const session  = await getSession();
        const userName = session?.user?.user_metadata?.name || session?.user?.email || 'Unknown';
        const now      = new Date();
        const { walletId, walletName, type, provider, amount, comm, clientId, note, commDest, deductComm } = globalPendingData;

        const cid = window.currentUserData?.company_id || '';
        const { data: allAccounts } = await _supa().from('accounts').select('*').eq('company_id', cid);
        const branchId  = window.currentUserData?.branch_id || null;
        const cashAcc   = allAccounts?.find(a => a.name.includes("الخزنة") && (!branchId || a.branch_id === branchId));
        const walletAcc = allAccounts?.find(a => a.id == walletId && !a.name.includes("الخزنة"));
        const provAcc   = allAccounts?.find(a => _norm(a.name).includes(_norm(provider)) && Number(a.daily_out_limit) > 10000000 && (!branchId || a.branch_id === branchId));

        if (!cashAcc) throw new Error("حساب الخزنة غير موجود لهذا الفرع");

        const val     = Number(amount);
        const fee     = Number(comm) || 0;
        const updates = [];
        let balanceAfter = 0;
        const push = (acc, changes) => { if (acc) updates.push({ id: acc.id, changes }); };


        // ── التحقق من الليميت قبل التنفيذ ──
        const _checkLimit = (acc, opVal, dir) => {
            if (!acc) return;
            if (Number(acc.daily_out_limit) > 10000000) return; // شركات بدون ليميت
            if (dir === 'OUT') {
                const availDay   = Math.max(0, Number(acc.daily_out_limit)  - Number(acc.daily_out_usage));
                const availMonth = Math.max(0, Number(acc.monthly_limit)    - Number(acc.monthly_usage_out));
                const avail      = Number(acc.monthly_limit) > 0 ? Math.min(availDay, availMonth) : availDay;
                if (opVal > avail)
                    throw new Error('❌ تجاوز الليميت — المتاح للإرسال: ' + avail.toLocaleString() + ' ج.م');
            } else if (dir === 'IN') {
                const availIn = Math.max(0, Number(acc.daily_in_limit) - Number(acc.daily_in_usage));
                if (Number(acc.daily_in_limit) > 0 && opVal > availIn)
                    throw new Error('❌ تجاوز ليميت الاستقبال — المتاح: ' + availIn.toLocaleString() + ' ج.م');
            }
        };

        if (/إيداع|شحن|تحويل|باقة|تجديد|رصيد|دفع فيزا/.test(type) && !type.includes("سحب من")) {
            _checkLimit(walletAcc, val, 'OUT');
        } else if (type.includes("سحب من محفظة")) {
            _checkLimit(walletAcc, val, 'IN');
        } else if (type.includes("سحب كاش")) {
            _checkLimit(walletAcc, val, 'OUT');
        } else if (/دين|مديونية/.test(type)) {
            if (/سحب|صادر/.test(type)) _checkLimit(walletAcc, val, 'OUT');
            else                        _checkLimit(walletAcc, val, 'IN');
        }

        if (type.includes("سحب كاش") && /مكسب|فوري/.test(provider)) {
            if (!walletAcc) throw new Error("❌ يجب تحديد المحفظة");
            if (!provAcc)   throw new Error(`❌ حساب ${provider} غير موجود`);
            const needed = val - fee; // الخصم الفعلي من المحفظة
            if (+walletAcc.balance < needed)
                throw new Error(`❌ رصيد المحفظة لا يكفي — المتاح: ${Number(walletAcc.balance).toLocaleString()} ج.م`);
            push(provAcc,   { balance: +provAcc.balance + val });
            push(walletAcc, { balance: +walletAcc.balance - val + fee, profit: +walletAcc.profit + fee,
                              daily_out_usage: +walletAcc.daily_out_usage + val,
                              monthly_usage_out: +walletAcc.monthly_usage_out + val });
            balanceAfter = +walletAcc.balance - val + fee;
        }
        else if (type.includes("سحب كاش") && provAcc) {
            if (!walletAcc) throw new Error("❌ يجب تحديد المحفظة");
            if (+walletAcc.balance < val)
                throw new Error(`❌ رصيد المحفظة لا يكفي — المتاح: ${Number(walletAcc.balance).toLocaleString()} ج.م`);
            push(walletAcc, { balance: +walletAcc.balance - val,
                              daily_out_usage: +walletAcc.daily_out_usage + val,
                              monthly_usage_out: +walletAcc.monthly_usage_out + val });
            if (commDest === 'CASH') {
                push(provAcc, { balance: +provAcc.balance + val });
                push(cashAcc, { balance: +cashAcc.balance + fee, profit: +cashAcc.profit + fee });
            } else {
                push(provAcc, { balance: +provAcc.balance + val + fee, profit: +provAcc.profit + fee });
            }
            balanceAfter = +walletAcc.balance - val;
        }
        else if (/سحب من عميل|سحب فيزا/.test(type)) {
            if (!provAcc)               throw new Error(`حساب ${provider} غير موجود`);
            if (+cashAcc.balance < val) throw new Error("رصيد الخزنة لا يكفي");
            if (commDest === 'CASH') {
                push(cashAcc, { balance: +cashAcc.balance - val + fee, profit: +cashAcc.profit + fee });
                push(provAcc, { balance: +provAcc.balance + val });
            } else {
                push(cashAcc, { balance: +cashAcc.balance - val });
                push(provAcc, { balance: +provAcc.balance + val + fee, profit: +provAcc.profit + fee });
            }
            balanceAfter = +provAcc.balance + val;
        }
        else if (type.includes("دفع فاتورة")) {
            if (!provAcc) throw new Error(`❌ حساب ${provider} غير موجود`);
            if (+provAcc.balance < val)
                throw new Error(`❌ رصيد ${provider} لا يكفي — المتاح: ${Number(provAcc.balance).toLocaleString()} ج.م`);
            push(provAcc, { balance: +provAcc.balance - val });
            push(cashAcc, { balance: +cashAcc.balance + val + fee, profit: +cashAcc.profit + fee });
            balanceAfter = +provAcc.balance - val;
        }
        else if (type.includes("مصروف")) {
            if (+cashAcc.balance < val) throw new Error("رصيد الخزنة لا يكفي");
            push(cashAcc, { balance: +cashAcc.balance - val });
            balanceAfter = +cashAcc.balance - val;
        }
        else if (/إيداع|شحن|تحويل|باقة|تجديد|رصيد|دفع فيزا/.test(type) && !type.includes("سحب من")) {
            if (!walletAcc) throw new Error("يجب تحديد المحفظة");
            let finalW = +walletAcc.balance - val - 1 + (commDest === 'WALLET' ? fee : 0);
            if (finalW < 0) throw new Error(`الرصيد لا يكفي — المتاح ${Number(walletAcc.balance).toLocaleString()}`);
            push(walletAcc, { balance: finalW,
                              daily_out_usage: +walletAcc.daily_out_usage + val,
                              monthly_usage_out: +walletAcc.monthly_usage_out + val,
                              ...(commDest==='WALLET' ? { profit: +walletAcc.profit + fee } : {}) });
            push(cashAcc,   { balance: +cashAcc.balance + val,
                              ...(commDest==='CASH' ? { profit: +cashAcc.profit + fee } : {}) });
            balanceAfter = finalW;
        }
        else if (type.includes("سحب من محفظة")) {
            if (!walletAcc) throw new Error("المحفظة غير محددة");
            const cashEffect = deductComm ? val : val - fee;
            if (+cashAcc.balance < cashEffect) throw new Error("رصيد الخزنة لا يكفي");
            push(walletAcc, { balance: +walletAcc.balance + val,
                              daily_in_usage: +walletAcc.daily_in_usage + val,
                              monthly_usage_in: +walletAcc.monthly_usage_in + val,
                              ...(commDest==='WALLET'&&fee>0 ? { profit: +walletAcc.profit + fee } : {}) });
            push(cashAcc,   { balance: +cashAcc.balance - cashEffect,
                              ...(commDest==='CASH'&&fee>0 ? { profit: +cashAcc.profit + fee } : {}) });
            balanceAfter = +walletAcc.balance + val;
        }
        else if (/دين|مديونية/.test(type)) {
            // التحقق من وجود العميل أولاً
            if (!clientId) throw new Error("❌ يجب اختيار العميل لعمليات الديون");

            const isOut  = /سحب|صادر/.test(type);
            // تحديد الحساب المستهدف: المحفظة لو موجودة، وإلا الخزنة
            const target = walletAcc || cashAcc;

            if (isOut) {
                // إخراج مبلغ (تسجيل دين جديد على العميل)
                if (+target.balance < val) throw new Error("❌ الرصيد لا يكفي");

                if (walletAcc) {
                    // صادر من محفظة
                    push(walletAcc, {
                        balance: +walletAcc.balance - val,
                        daily_out_usage:   +walletAcc.daily_out_usage   + val,
                        monthly_usage_out: +walletAcc.monthly_usage_out + val
                    });
                    // العمولة تروح للخزنة
                    if (fee > 0) push(cashAcc, { balance: +cashAcc.balance + fee, profit: +cashAcc.profit + fee });
                } else {
                    // صادر من الخزنة
                    push(cashAcc, {
                        balance: +cashAcc.balance - val + fee,
                        ...(fee > 0 ? { profit: +cashAcc.profit + fee } : {})
                    });
                }
                balanceAfter = +target.balance - val;
                // زيادة دين العميل (اشتغلنا ليه)
                await _updateClientBalance(clientId, val, "OUT");

            } else {
                // وارد (سداد دين من العميل)
                if (walletAcc) {
                    // وارد على محفظة
                    push(walletAcc, {
                        balance: +walletAcc.balance + val + fee,
                        daily_in_usage:  +walletAcc.daily_in_usage  + val,
                        monthly_usage_in: (+walletAcc.monthly_usage_in || 0) + val,
                        ...(fee > 0 ? { profit: +walletAcc.profit + fee } : {})
                    });
                } else {
                    // وارد على الخزنة
                    push(cashAcc, {
                        balance: +cashAcc.balance + val + fee,
                        ...(fee > 0 ? { profit: +cashAcc.profit + fee } : {})
                    });
                }
                balanceAfter = +target.balance + val + fee;
                // تقليل دين العميل (سدد)
                await _updateClientBalance(clientId, val, "IN");
            }
        }
        else {
            throw new Error(`نوع العملية '${type}' غير معرّف`);
        }

        for (const upd of updates) {
            const { error } = await _supa().from('accounts').update(upd.changes).eq('id', upd.id);
            if (error) throw error;
        }

        // جلب اسم العميل من الـ select عشان نحفظه نص في الـ DB
        const _cEl   = document.getElementById('client');
        const _cName = clientId
            ? (_cEl?.options[_cEl?.selectedIndex]?.text || '').replace(/\s*\(.*\)/,'').trim()
            : '';

        const { error: txErr } = await _supa().from('transactions').insert([{
            date:          now.toLocaleDateString('en-GB'),
            time:          now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }),
            type, amount: val, commission: fee,
            wallet_name: walletName, provider,
            balance_after: balanceAfter,
            notes:       note      || '',
            added_by:    userName,
            client:      _cName    || '',
            comm_dest:   commDest  || 'CASH',
            deduct_comm: deductComm || false,
            branch_id:   window.currentUserData?.branch_id  || null,
            company_id:  window.currentUserData?.company_id || null
        }]);
        if (txErr) throw txErr;

        document.getElementById('customConfirmModal')?.remove();
        showToast("✅ تمت العملية بنجاح", true);
        resetSystemInterface();

        if (typeof loadDash              === "function") loadDash();
        if (typeof loadTransactionLogs   === "function") loadTransactionLogs();
        if (typeof renderPinnedWallets   === "function") renderPinnedWallets();
        if (typeof refreshAllWalletViews === "function") refreshAllWalletViews();

    } catch(err) {
        showToast("❌ " + err.message, false);
        btn.disabled  = false;
        btn.innerHTML = "✅ تأكيد العملية";
    } finally {
        globalPendingData = null;
    }
}

async function _updateClientBalance(clientId, amount, mode) {
    if (!clientId) return;
    const { data: cl, error } = await _supa()
        .from('clients').select('id, balance').eq('id', clientId).maybeSingle();
    if (!cl || error) {
        return;
    }
    const currentBal = Number(cl.balance) || 0;
    // OUT = اشتغلنا للعميل (دينه علينا زاد) → نزيد الرصيد (موجب = العميل مدين)
    // IN  = العميل سدد (دينه قل)           → نقلل الرصيد
    const newBal = mode === "OUT"
        ? currentBal + amount
        : Math.max(0, currentBal - amount); // ما نخليش الرصيد يطلع سالب
    const { error: updErr } = await _supa().from('clients').update({ balance: newBal }).eq('id', cl.id);
}

// ============================================================
// 8. resetSystemInterface
// ============================================================
function resetSystemInterface() {
    ['amount','note','type'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    const commEl = document.getElementById('comm');
    if (commEl) commEl.value = '0';
    const commDest = document.getElementById('commDestination');
    if (commDest) { commDest.value = 'CASH'; commDest.dispatchEvent(new Event('change')); }
    ['wallet','client'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.selectedIndex = 0; el.disabled = false; el.style.backgroundColor = ""; el.style.cursor = "default"; }
    });
    document.querySelectorAll('.op-card').forEach(c => {
        c.classList.remove('active','active-op'); c.style.background = ""; c.style.borderColor = "";
    });
    document.querySelectorAll('.pin-btn').forEach(b => b.classList.remove('active'));
    globalPendingData = null; selectedProvider = "";
    const cs = document.getElementById('clientBalanceStatus'); if (cs) cs.innerHTML = '';
    const lb = document.getElementById('limitStatus'); if (lb) lb.style.display = 'none';
    if (typeof toggleClientField === "function") toggleClientField();
}

var resetTransactionForm = resetSystemInterface;

// ============================================================
// 9. renderTransactionsTable + executeAdvancedSearch + rollbackTx
// ============================================================
function renderTransactionsTable(data) {
    const container = document.getElementById('timelineContainer');
    if (!container) return;

    if (!data || !data.length) {
        container.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">لا توجد بيانات</td></tr>';
        return;
    }

    let i = 1;
    container.innerHTML = data.map(tx => {
        // 1. تحديد نوع العملية (وارد/صادر) بناءً على منطقك القديم
        const isOut = /سحب|صادر|مصروف|فاتورة/.test(tx.type || '');
        
        // 2. فحص إذا كانت العملية "لحظية" (تمت منذ أقل من 10 ثوانٍ) لإضافة ومضة
        const txTime = new Date(tx.created_at || new Date()); 
        const isLive = (new Date() - txTime) < 10000;
        const liveClass = isLive ? 'new-row-flash' : '';

        return `
            <tr class="${liveClass}">
                <td class="align-middle">${i++}</td>
                
                <td class="align-middle english-num small text-nowrap">
                    <div class="fw-bold">${tx.date || '-'}</div>
                    <div class="text-muted" style="font-size: 10px;">${tx.time || ''}</div>
                </td>
                
                <td class="align-middle text-center ${isOut ? 'text-danger' : 'text-success'} fw-bold">
                    <div><i class="fa ${isOut ? 'fa-arrow-up' : 'fa-arrow-down'} me-1" style="font-size:10px;"></i>${esc(tx.type) || '-'}</div>
                    ${(tx.wallet_name||tx.provider) ? `<div class="d-flex align-items-center justify-content-center gap-1 mt-1 flex-wrap">
                        ${tx.wallet_name ? `<span class="badge bg-light text-dark border fw-normal" style="font-size:9px;"><i class="fa fa-wallet me-1 text-primary" style="font-size:8px;"></i>${esc(tx.wallet_name)}</span>` : ''}
                        ${tx.wallet_name && tx.provider ? `<i class="fa fa-arrow-left text-muted" style="font-size:8px;"></i>` : ''}
                        ${tx.provider ? `<span class="badge bg-light text-dark border fw-normal" style="font-size:9px;"><i class="fa fa-building me-1 text-warning" style="font-size:8px;"></i>${esc(tx.provider)}</span>` : ''}
                    </div>` : ''}
                </td>
                
                <td class="align-middle english-num fw-bold">
                    <div>${Number(tx.amount || 0).toLocaleString()}</div>
                    ${tx.commission ? `<small class="text-warning fw-normal" style="font-size: 10px;">عمولة: ${Number(tx.commission).toLocaleString()}</small>` : ''}
                </td>
                
                <td class="align-middle english-num text-primary fw-bold">
                    ${Number(tx.balance_after || 0).toLocaleString()}
                </td>
                
                <td class="align-middle small text-muted" style="max-width: 150px; overflow: hidden; text-overflow: ellipsis;">
                    ${esc(tx.notes) || '-'}
                </td>
                
                <td class="align-middle">
                    <span class="badge bg-light text-dark border fw-normal">
                        <i class="fa fa-user-circle me-1 text-secondary"></i>${esc(tx.added_by) || '-'}
                    </span>
                </td>
                
                <td class="align-middle">
                    <div class="d-flex justify-content-center gap-1">
                        <button class="btn btn-sm btn-outline-secondary border-0" onclick="showDetails(${tx.id})" title="عرض">
                            <i class="fa fa-eye"></i>
                        </button>
                        
                        <button class="btn btn-sm btn-outline-danger admin-only border-0" onclick="rollbackTx(${tx.id})" title="تراجع">
                            <i class="fa fa-undo"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');
}// دالة لتنسيق التاريخ والوقت بشكل احترافي
function formatDate(dateString) {
    if (!dateString) return "-";
    const date = new Date(dateString);
    
    // تنسيق الوقت (الساعة:الدقيقة AM/PM)
    const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
    const time = date.toLocaleTimeString('en-US', timeOptions);
    
    // تنسيق التاريخ (يوم/شهر)
    const day = date.getDate();
    const month = date.getMonth() + 1;
    
    return `${day}/${month} | ${time}`;
}
function executeAdvancedSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
        const filters = {
            text:     (document.getElementById('advSearchText')?.value||"").trim().toLowerCase(),
            type:     document.getElementById('advSearchType')?.value  || "",
            dateFrom: document.getElementById('advDateFrom')?.value    || "",
            dateTo:   document.getElementById('advDateTo')?.value      || ""
        };
        const container = document.getElementById('timelineContainer');
        if (container)
            container.innerHTML = '<tr><td colspan="8" class="py-4 text-center"><i class="fa fa-sync fa-spin"></i> جاري البحث...</td></tr>';

        const data = await getTransactionLogs(filters);
        if (!data) return;

        const filtered = data.filter(tx =>
            (tx.wallet_name?.toLowerCase()||"").includes(filters.text) ||
            (tx.notes?.toLowerCase()||"").includes(filters.text)       ||
            String(tx.amount).includes(filters.text)
        );
        renderTransactionsTable(filtered);
        const countEl = document.getElementById('rowsCountDisplay');
        if (countEl) countEl.innerText = `تم العثور على ${filtered.length} عملية`;
    }, 500);
}

async function rollbackTx(txId) {
    if (!confirm("⚠️ هل أنت متأكد من التراجع عن هذه العملية؟")) return;
    const { data: tx } = await _supa().from('transactions').select('*').eq('id', txId).maybeSingle();
    if (!tx) return showToast("❌ العملية غير موجودة", false);

    const { data: allAccounts } = await _supa().from('accounts').select('*').eq('company_id', window.currentUserData?.company_id || '');
    const val     = Number(tx.amount);
    const fee     = Number(tx.commission) || 0;
    const updates = [];
    const clamp   = v => Math.max(0, v);
    const cashAcc   = allAccounts?.find(a => a.name.includes("الخزنة"));
    const walletAcc = allAccounts?.find(a => a.name === tx.wallet_name &&
                      !a.name.includes("الخزنة") && Number(a.daily_out_limit) <= 10000000);
    const provAcc   = allAccounts?.find(a =>
        _norm(a.name).includes(_norm(tx.provider)) && Number(a.daily_out_limit) > 10000000);
    const push = (acc, ch) => { if (acc) updates.push({ id: acc.id, changes: ch }); };

    if (tx.type.includes("دفع فاتورة")) {
        // العملية الأصلية: provAcc - val، cashAcc + val + fee
        // العكس:          provAcc + val، cashAcc - val - fee
        if (!provAcc) return showToast(`❌ حساب ${tx.provider} غير موجود`, false);
        push(provAcc, { balance: +provAcc.balance + val });
        push(cashAcc, { balance: +cashAcc.balance - val - fee, profit: clamp(+cashAcc.profit - fee) });
    }
    else if (/سحب من عميل|سحب فيزا/.test(tx.type)) {
        // العملية الأصلية: cashAcc - val، provAcc + val
        // العكس:          cashAcc + val، provAcc - val
        push(provAcc, { balance: +provAcc?.balance - val });
        push(cashAcc, { balance: +cashAcc?.balance + val - fee, profit: clamp(+cashAcc?.profit - fee) });
    }
    else if (/إيداع|شحن|تحويل|باقة|تجديد|رصيد/.test(tx.type) && walletAcc) {
        // العملية الأصلية: walletAcc - val - 1، cashAcc + val
        // العكس:          walletAcc + val + 1، cashAcc - val
        push(walletAcc, { balance: +walletAcc.balance + val + 1,
                          daily_out_usage:   clamp(+walletAcc.daily_out_usage   - val),
                          monthly_usage_out: clamp(+walletAcc.monthly_usage_out - val) });
        push(cashAcc,   { balance: +cashAcc?.balance - val,
                          profit: clamp(+cashAcc?.profit - fee) });
    }
    else if (tx.type.includes("سحب من محفظة") && walletAcc) {
        // العملية الأصلية: walletAcc + val، cashAcc - cashEffect
        // cashEffect = deductComm ? val : val - fee — نفترض val - fee (الأكثر شيوعاً)
        push(walletAcc, { balance: +walletAcc.balance - val,
                          daily_in_usage:  clamp(+walletAcc.daily_in_usage  - val),
                          monthly_usage_in: clamp(+walletAcc.monthly_usage_in - val) });
        push(cashAcc,   { balance: +cashAcc?.balance + val - fee,
                          profit: clamp(+cashAcc?.profit - fee) });
    }
    else if (tx.type.includes("سحب كاش") && walletAcc) {
        // العملية الأصلية: walletAcc - val، provAcc + val (+ fee لو commDest=provAcc)
        // العكس: walletAcc + val، provAcc - val
        push(walletAcc, { balance: +walletAcc.balance + val,
                          profit: clamp(+walletAcc.profit - fee),
                          daily_out_usage:   clamp(+walletAcc.daily_out_usage   - val),
                          monthly_usage_out: clamp(+walletAcc.monthly_usage_out - val) });
        push(provAcc,   { balance: +provAcc?.balance - val });
        // لو العمولة كانت للخزنة نرجعها
        if (fee > 0) push(cashAcc, { balance: +cashAcc?.balance - fee, profit: clamp(+cashAcc?.profit - fee) });
    }
    else if (tx.type.includes("مصروف")) {
        // العملية الأصلية: cashAcc - val
        // العكس:          cashAcc + val
        push(cashAcc, { balance: +cashAcc?.balance + val });
    }
    else if (/دين|مديونية/.test(tx.type)) {
        // عكس عملية الديون
        const isOut = /سحب|صادر/.test(tx.type);
        const target = walletAcc || cashAcc;
        if (isOut) {
            // كانت صادرة (اشتغلنا للعميل) → نرجع المبلغ
            if (walletAcc) {
                push(walletAcc, { balance: +walletAcc.balance + val,
                    daily_out_usage:   clamp(+walletAcc.daily_out_usage   - val),
                    monthly_usage_out: clamp(+walletAcc.monthly_usage_out - val) });
                if (fee > 0) push(cashAcc, { balance: +cashAcc?.balance - fee, profit: clamp(+cashAcc?.profit - fee) });
            } else {
                push(cashAcc, { balance: +cashAcc?.balance + val - fee, profit: clamp(+cashAcc?.profit - fee) });
            }
            // عكس دين العميل: كان زاد → نقلل
            if (tx.client_id) await _updateClientBalance(tx.client_id, val, "IN");
        } else {
            // كانت واردة (سداد) → نرجع المبلغ
            if (walletAcc) {
                push(walletAcc, { balance: +walletAcc.balance - val - fee,
                    daily_in_usage:  clamp(+walletAcc.daily_in_usage  - val),
                    monthly_usage_in: clamp((+walletAcc.monthly_usage_in || 0) - val),
                    profit: clamp(+walletAcc.profit - fee) });
            } else {
                push(cashAcc, { balance: +cashAcc?.balance - val - fee, profit: clamp(+cashAcc?.profit - fee) });
            }
            // عكس سداد العميل: كان قل → نزيد
            if (tx.client_id) await _updateClientBalance(tx.client_id, val, "OUT");
        }
    }

    for (const upd of updates)
        await _supa().from('accounts').update(upd.changes).eq('id', upd.id);

    await _supa().from('transactions').delete().eq('id', txId);
const session = await getSession();
const userId = session?.user?.id;

// 2. جلب الاسم من جدول users باستخدام الـ id
const { data: profile } = await _supa()
    .from('users')
    .select('name')
    .eq('id', userId)
    .single();

// 3. تخزين الاسم في متغير (ووضع الإيميل كخيار احتياطي إذا كان الاسم فارغاً)
const adminName = profile?.name || session?.user?.email;

// 4. الآن قم بعملية الإدراج في الـ logs
await _supa().from('admin_logs').insert([{
    action:     'ROLLBACK',
    details:    `تراجع: ${tx.type} بمبلغ ${val}`,
    created_by: adminName,
    branch_id:  window.currentUserData?.branch_id  || null,
    company_id: window.currentUserData?.company_id || null
}]);
    showToast("✅ تم التراجع بنجاح", true);
    if (typeof executeAdvancedSearch === "function") executeAdvancedSearch();
    if (typeof renderPinnedWallets   === "function") renderPinnedWallets();
    if (typeof loadDash              === "function") loadDash();
}


// ============================================================
// 10-A. _getTxFlow — مسار العملية الصح
// ============================================================
// القاعدة: السهم يمثل اتجاه الفلوس الحقيقي
// FROM (مصدر الفلوس)  ←  TO (المستلم)
//
// دفع فاتورة (فوري وغيره): الخزنة/المحفظة ← الشركة
// سحب دين:               الخزنة/المحفظة ← العميل    (بنديله)
// سداد مديونية:           العميل ← الخزنة/المحفظة  (بيرجعلنا)
// تزويد:                 المحفظة ← الشركة
// إيداع محفظة:            الخزنة ← المحفظة
// سحب من محفظة:           المحفظة ← الخزنة
// سحب من عميل/فيزا:       العميل/الشركة ← الخزنة
// مصاريف:                الخزنة ← مصاريف
// ============================================================
function _getTxFlow(tx) {
    const t  = (tx.type        || '').trim();
    const w  = (tx.wallet_name || '').trim();
    const p  = (tx.provider    || '').trim();
    const cl = (tx.client      || '').trim();
    const SAFE = 'الخزنة';

    // دفع فواتير (فوري، وي، اورنچ...) — الخزنة/المحفظة تدفع للشركة
    if (/فاتورة|دفع فاتورة|دفع بيل|pay.*bill/i.test(t)) {
        const src = (w && w !== p) ? w : SAFE;
        return { from: src, to: p || '—', icon: 'fa-file-invoice', color: '#8b5cf6' };
    }

    // تزويد — المحفظة تزوّد الشركة
    if (/تزويد/.test(t)) {
        return { from: w || SAFE, to: p || '—', icon: 'fa-money-bill-transfer', color: '#f59e0b' };
    }

    // سحب كاش لشركة (تزويد بطريقة ثانية)
    if (/سحب كاش/.test(t) && p && p !== 'SAFE' && p !== SAFE) {
        return { from: w || SAFE, to: p, icon: 'fa-money-bill-transfer', color: '#f59e0b' };
    }

    // إيداع لمحفظة — الخزنة تودع في المحفظة
    if (/إيداع/.test(t)) {
        return { from: SAFE, to: w || '—', icon: 'fa-upload', color: '#3b82f6' };
    }

    // سحب من محفظة — المحفظة تسحب للخزنة
    if (/سحب من محفظة/.test(t)) {
        return { from: w || '—', to: SAFE, icon: 'fa-download', color: '#10b981' };
    }

    // سحب دين — الخزنة تدي للعميل (بندينه)
    if (/سحب دين/.test(t)) {
        return { from: w || SAFE, to: cl || '—', icon: 'fa-user-minus', color: '#ef4444' };
    }

    // سداد مديونية — العميل يرجعلنا للخزنة
    if (/سداد|مديونية/.test(t)) {
        return { from: cl || '—', to: w || SAFE, icon: 'fa-user-check', color: '#10b981' };
    }

    // سحب من عميل / فيزا — العميل/الشركة تدي للخزنة
    if (/سحب من عميل|سحب فيزا|client.*withdraw/i.test(t)) {
        return { from: cl || p || '—', to: w || SAFE, icon: 'fa-arrow-down', color: '#10b981' };
    }

    // مصاريف — خارجة من الخزنة
    if (/مصروف|مصاريف/.test(t)) {
        return { from: SAFE, to: 'مصاريف', icon: 'fa-coins', color: '#f97316' };
    }

    // fallback
    const isOut = /سحب|صادر|مصروف|فاتورة/.test(t);
    return {
        from:  isOut ? (w || SAFE)       : (cl || p || '—'),
        to:    isOut ? (cl || p || '—')  : (w || SAFE),
        icon:  isOut ? 'fa-arrow-up'     : 'fa-arrow-down',
        color: isOut ? '#ef4444'         : '#10b981'
    };
}

// ============================================================
// 10-B. showDetails
// ============================================================
async function showDetails(txId) {
    const modal   = document.getElementById('txDetailsModal');
    const content = document.getElementById('txd-content');
    if (!modal || !content) return;

    modal.style.display = 'flex';
    content.innerHTML = `
        <div class="txd-loading">
            <div class="txd-spinner"></div>
            <span>جاري التحميل...</span>
        </div>`;

    try {
        const { data: tx, error } = await _supa()
            .from('transactions')
            .select('*')
            .eq('id', txId)
            .maybeSingle();

        if (error) throw new Error(error.message);
        if (!tx)   throw new Error('العملية غير موجودة');

        // اسم الفرع — query منفصل لأن مفيش join FK
        let branchName = '';
        if (tx.branch_id) {
            const { data: br } = await _supa()
                .from('branches').select('name')
                .eq('id', tx.branch_id).maybeSingle();
            branchName = br?.name || '';
        }

        const flow     = _getTxFlow(tx);
        const isOut    = /سحب|صادر|مصروف|فاتورة/.test(tx.type || '');
        const amt      = Number(tx.amount     || 0).toLocaleString('en');
        const comm     = Number(tx.commission || 0);
        const balAfter = Number(tx.balance_after || 0).toLocaleString('en');

        // badge لون حسب نوع العملية
        const BMAP = [
            [/تزويد|سحب كاش/,        '#d97706','rgba(245,158,11,.13)','تزويد'      ],
            [/إيداع/,                 '#2563eb','rgba(59,130,246,.13)','إيداع'      ],
            [/سحب من محفظة/,          '#059669','rgba(16,185,129,.13)','سحب محفظة' ],
            [/سحب دين/,               '#dc2626','rgba(239,68,68,.13)' ,'دين صادر'  ],
            [/سداد|مديونية/,          '#059669','rgba(16,185,129,.13)','سداد دين'  ],
            [/سحب من عميل|سحب فيزا/,  '#059669','rgba(16,185,129,.13)','وارد'      ],
            [/فاتورة|دفع/,            '#7c3aed','rgba(139,92,246,.13)','فاتورة'    ],
            [/مصروف|مصاريف/,          '#ea580c','rgba(249,115,22,.13)','مصروفات'   ],
        ];
        let [btxt,bbg,blbl] = isOut
            ? ['#dc2626','rgba(239,68,68,.13)','صادر']
            : ['#059669','rgba(16,185,129,.13)','وارد'];
        for (const [rx,t2,bg2,lb2] of BMAP) {
            if (rx.test(tx.type||'')) { btxt=t2; bbg=bg2; blbl=lb2; break; }
        }

        // helper صف
        const row = (ico,lbl,val,cls='') => val ? `
            <div class="txd-row ${cls}">
                <div class="txd-row-label"><i class="fa fa-fw ${ico}"></i>${lbl}</div>
                <div class="txd-row-val">${val}</div>
            </div>` : '';

        // مش نعرض provider لو هو نفس wallet_name أو SAFE أو الخزنة
        const showProv = tx.provider
            && tx.provider !== 'SAFE'
            && tx.provider !== 'الخزنة'
            && tx.provider !== tx.wallet_name;

        content.innerHTML = `
            <div class="txd-hero">
                <div class="txd-hero-icon" style="background:${bbg}">
                    <i class="fa fa-fw ${flow.icon}" style="color:${flow.color};font-size:19px;"></i>
                </div>
                <div class="txd-hero-info">
                    <div class="txd-hero-type">${esc(tx.type)||'—'}</div>
                    <div class="txd-hero-amount" style="color:${flow.color}">
                        ${amt}<span> ج.م</span>
                    </div>
                </div>
                <span class="txd-hero-badge" style="background:${bbg};color:${btxt};">
                    ${blbl}
                </span>
            </div>

            <div style="padding:11px 16px 13px;
                        border-bottom:1px solid var(--border-color,rgba(0,0,0,.06));
                        background:var(--bg-secondary,#f8fafc);">
                <div style="font-size:10px;color:var(--text-muted,#6b7280);font-weight:700;
                            letter-spacing:.05em;margin-bottom:9px;text-transform:uppercase;">
                    <i class="fa fa-fw fa-route me-1" style="color:${flow.color};"></i>مسار العملية
                </div>
                <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
                    <span style="background:var(--bg-card,#fff);
                                 border:1.5px solid var(--border-color,#e2e8f0);
                                 border-radius:10px;padding:5px 12px;
                                 font-size:12.5px;font-weight:800;
                                 color:var(--card-text,#1a2035);
                                 max-width:130px;white-space:nowrap;
                                 overflow:hidden;text-overflow:ellipsis;"
                          title="${esc(flow.from)}">${esc(flow.from)}</span>
                    <span style="display:flex;align-items:center;justify-content:center;
                                 width:24px;height:24px;border-radius:50%;
                                 background:${bbg};flex-shrink:0;">
                        <i class="fa fa-fw fa-arrow-left" style="color:${flow.color};font-size:10px;"></i>
                    </span>
                    <span style="background:var(--bg-card,#fff);
                                 border:1.5px solid var(--border-color,#e2e8f0);
                                 border-radius:10px;padding:5px 12px;
                                 font-size:12.5px;font-weight:800;
                                 color:var(--card-text,#1a2035);
                                 max-width:130px;white-space:nowrap;
                                 overflow:hidden;text-overflow:ellipsis;"
                          title="${esc(flow.to)}">${esc(flow.to)}</span>
                </div>
            </div>

            <div class="txd-grid">
                ${row('fa-calendar-alt',  'التاريخ',    esc(tx.date)||'—')}
                ${row('fa-clock',         'الوقت',      esc(tx.time)||'—')}
                ${row('fa-wallet',        'الحساب',     esc(tx.wallet_name)||'—')}
                ${showProv ? row('fa-building','الشركة', esc(tx.provider)) : ''}
                ${tx.client ? row('fa-user','العميل', esc(tx.client)) : ''}
                ${comm > 0 ? `
                <div class="txd-row txd-highlight">
                    <div class="txd-row-label"><i class="fa fa-fw fa-coins"></i>العمولة</div>
                    <div class="txd-row-val txd-comm">${comm.toLocaleString('en')} ج.م</div>
                </div>` : ''}
                ${row('fa-scale-balanced','الرصيد بعد',
                    `<span class="txd-mono">${balAfter} ج.م</span>`)}
                ${tx.notes ? `
                <div class="txd-row">
                    <div class="txd-row-label"><i class="fa fa-fw fa-note-sticky"></i>ملاحظات</div>
                    <div class="txd-row-val txd-notes">${esc(tx.notes)}</div>
                </div>` : ''}
                ${row('fa-user-circle',   'بواسطة',     esc(tx.added_by)||'—')}
                ${branchName ? row('fa-code-branch','الفرع', esc(branchName)) : ''}
            </div>

            <div class="txd-footer">
                <div class="txd-id">
                    <i class="fa fa-fw fa-hashtag" style="font-size:9px;"></i>
                    #${tx.id}
                    <span style="opacity:.3;margin:0 5px;">|</span>
                    ${esc(tx.date)||''} ${esc(tx.time)||''}
                </div>
            </div>`;

    } catch(err) {
        content.innerHTML = `
            <div class="txd-error">
                <i class="fa fa-circle-exclamation"></i>
                <span>${String(err.message)}</span>
            </div>`;
    }
}

function closeTxDetails() {
    const modal = document.getElementById('txDetailsModal');
    if (modal) modal.style.display = 'none';
}

// ============================================================
// 10. الدوال الثانوية
// ============================================================
function applySecurityUI(role) {
    document.querySelectorAll('.admin-only').forEach(el => {
        if (role === 'ADMIN')
            el.style.setProperty('display', (el.tagName==='TD'||el.tagName==='TH') ? 'table-cell' : 'block', 'important');
        else el.style.display = 'none';
    });
}

async function calculateStats() {
    const cid = window.currentUserData?.company_id || '';
    const { data: accounts }     = await _supa().from('accounts').select('balance').eq('company_id', cid);
    const { data: transactions } = await _supa().from('transactions').select('commission').eq('company_id', cid).limit(1000);
    return {
        totalBalance:      (accounts||[]).reduce((s,a) => s + Number(a.balance), 0),
        totalProfit:       (transactions||[]).reduce((s,t) => s + Number(t.commission), 0),
        totalTransactions: transactions?.length || 0
    };
}

window.addEventListener('DOMContentLoaded', function() {
    if (typeof applyTheme         === "function") applyTheme();
    if (typeof toggleClientField  === "function") toggleClientField();
    if (typeof renderWalletsCards === "function") renderWalletsCards();
    // loadDash + checkUserRole بيتشغلوا من initApp بعد تحميل currentUserData
});

// ============================================================
// loadAdminLogs — سجل عمليات الإدارة (مفلتر بـ company_id)
// ============================================================
async function loadAdminLogs() {
    const container = document.getElementById('admin-logs-body');
    if (!container) return;
    container.innerHTML = '<div class="text-center p-3"><i class="fa fa-spin fa-circle-notch"></i></div>';

    const cid = window.currentUserData?.company_id || '';
    if (!cid) {
        container.innerHTML = '<div class="text-center text-danger p-3">خطأ: لم يتم تحديد الشركة</div>';
        return;
    }

    const { data: logs, error } = await _supa()
        .from('admin_logs')
        .select('*')
        .eq('company_id', cid)
        .order('created_at', { ascending: false })
        .limit(50);

    if (error || !logs) {
        container.innerHTML = '<div class="text-center text-danger p-3">خطأ في تحميل السجل</div>';
        return;
    }
    if (!logs.length) {
        container.innerHTML = '<div class="text-center text-muted small p-4">لا يوجد سجلات</div>';
        return;
    }

    container.innerHTML = logs.map(log => {
        const date = new Date(log.created_at);
        const dateStr = date.toLocaleDateString('ar-EG');
        const timeStr = date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        const isRollback = log.action === 'ROLLBACK';

        return `
        <div class="d-flex align-items-start p-2 mb-2 border rounded-3" style="direction:rtl;font-size:12px;">
            <div class="me-2 mt-1">
                <span class="badge ${isRollback ? 'bg-danger' : 'bg-secondary'}" style="font-size:10px;">
                    ${log.action || '—'}
                </span>
            </div>
            <div class="flex-grow-1">
                <div class="fw-bold text-dark" style="font-size:12px;">${log.details || '—'}</div>
                <div class="text-muted" style="font-size:10px; margin-top:2px;">
                    <i class="fa fa-user me-1"></i>${log.created_by || '—'}
                    &nbsp;·&nbsp;
                    <i class="fa fa-clock me-1"></i>${dateStr} ${timeStr}
                </div>
            </div>
        </div>`;
    }).join('');
}