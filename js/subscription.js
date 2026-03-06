// ============================================================
// subscription.js — Phase 5: Subscription Enforcement
// يتحمّل بعد config.js وقبل أي ملف تاني
// ============================================================

window._subCache = null; // cache للـ subscription الحالية

// ════════════════════════════════════════════════════════════
// getSubscription — جيب الاشتراك الحالي (مع cache)
// ════════════════════════════════════════════════════════════
async function getSubscription(forceRefresh = false) {
    if (window._subCache && !forceRefresh) return window._subCache;

    const u = window.currentUserData;
    if (!u?.company_id) return null;

    const { data: sub } = await window.supa
        .from('subscriptions')
        .select('*')
        .eq('company_id', u.company_id)
        .maybeSingle();

    window._subCache = sub || null;
    return window._subCache;
}

// ════════════════════════════════════════════════════════════
// checkSubscriptionActive — هل الاشتراك نشط؟
// يُعرض banner لو منتهي ويرجع false
// ════════════════════════════════════════════════════════════
async function checkSubscriptionActive() {
    const sub = await getSubscription();
    if (!sub) return true; // لو مفيش اشتراك → سماح (للتطوير)

    const now = new Date();
    const expired = sub.expires_at && new Date(sub.expires_at) < now;
    const isExpiredStatus = sub.status === 'expired' || sub.status === 'cancelled';

    if (expired || isExpiredStatus) {
        _showSubBanner('expired', sub.expires_at);
        return false;
    }

    // تحذير قبل الانتهاء بـ 7 أيام
    if (sub.expires_at) {
        const daysLeft = Math.ceil((new Date(sub.expires_at) - now) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 7 && daysLeft > 0) {
            _showSubBanner('warning', null, daysLeft);
        } else {
            _hideSubBanner();
        }
    }

    return true;
}

// ════════════════════════════════════════════════════════════
// canAddBranch — هل يمكن إضافة فرع جديد؟
// ════════════════════════════════════════════════════════════
async function canAddBranch() {
    const active = await checkSubscriptionActive();
    if (!active) return { allowed: false, reason: 'الاشتراك منتهي' };

    const sub = await getSubscription();
    if (!sub?.max_branches) return { allowed: true };

    const u = window.currentUserData;
    const { count } = await window.supa
        .from('branches')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', u.company_id);

    if (count >= sub.max_branches) {
        return {
            allowed: false,
            reason: `وصلت للحد الأقصى من الفروع (${sub.max_branches} فروع)\nيرجى الترقية إلى خطة أعلى`
        };
    }
    return { allowed: true };
}

// ════════════════════════════════════════════════════════════
// canSendInvitation — هل يمكن دعوة عضو جديد؟
// ════════════════════════════════════════════════════════════
async function canSendInvitation() {
    const active = await checkSubscriptionActive();
    if (!active) return { allowed: false, reason: 'الاشتراك منتهي' };

    const sub = await getSubscription();
    if (!sub?.max_employees) return { allowed: true };

    const u = window.currentUserData;
    const { count } = await window.supa
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', u.company_id);

    if (count >= sub.max_employees) {
        return {
            allowed: false,
            reason: `وصلت للحد الأقصى من الأعضاء (${sub.max_employees} أعضاء)\nيرجى الترقية إلى خطة أعلى`
        };
    }
    return { allowed: true };
}

// ════════════════════════════════════════════════════════════
// canAddTransaction — هل يمكن إضافة عملية جديدة؟
// ════════════════════════════════════════════════════════════
async function canAddTransaction() {
    const active = await checkSubscriptionActive();
    if (!active) return { allowed: false, reason: 'الاشتراك منتهي، لا يمكن إضافة عمليات' };

    const sub = await getSubscription();
    if (!sub?.max_transactions) return { allowed: true };

    const u = window.currentUserData;
    const now = new Date();
    const monthStr = `/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

    const { count } = await window.supa
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', u.company_id)
        .ilike('date', `%${monthStr}`);

    if (count >= sub.max_transactions) {
        return {
            allowed: false,
            reason: `وصلت للحد الشهري من العمليات (${sub.max_transactions.toLocaleString('ar-EG')} عملية)\nيرجى الترقية إلى خطة أعلى`
        };
    }

    // تحذير عند 90%
    const pct = Math.round((count / sub.max_transactions) * 100);
    return { allowed: true, warning: pct >= 90 ? `استهلكت ${pct}% من عمليات الشهر (${count} / ${sub.max_transactions})` : null };
}

// ════════════════════════════════════════════════════════════
// Banner UI — شريط تحذير في أعلى الصفحة
// ════════════════════════════════════════════════════════════
function _showSubBanner(type, expiresAt, daysLeft) {
    let el = document.getElementById('sub-enforcement-banner');
    if (!el) {
        el = document.createElement('div');
        el.id = 'sub-enforcement-banner';
        el.style.cssText = `
            position: fixed; top: 75px; left: 0; right: 0; z-index: 1099;
            padding: 10px 24px; font-family: 'Cairo', sans-serif;
            font-size: 13px; font-weight: 700; text-align: center;
            display: flex; align-items: center; justify-content: center; gap: 10px;
        `;
        document.body.appendChild(el);

        // دفع المحتوى للأسفل
        const main = document.querySelector('.main-content, .content-area');
        if (main) main.style.marginTop = (parseInt(main.style.marginTop || 70) + 42) + 'px';
    }

    if (type === 'expired') {
        el.style.background = 'linear-gradient(135deg, #dc2626, #991b1b)';
        el.style.color = '#fff';
        el.innerHTML = `
            <i class="fa fa-ban"></i>
            <span>انتهى اشتراككم${expiresAt ? ' في ' + new Date(expiresAt).toLocaleDateString('ar-EG') : ''} — النظام في وضع القراءة فقط</span>
            <a href="mailto:support@operix.app" style="color:#fde68a;text-decoration:underline;margin-right:8px;">تجديد الاشتراك</a>
        `;
    } else if (type === 'warning') {
        el.style.background = 'linear-gradient(135deg, #d97706, #b45309)';
        el.style.color = '#fff';
        el.innerHTML = `
            <i class="fa fa-triangle-exclamation"></i>
            <span>ينتهي اشتراككم خلال <b>${daysLeft}</b> ${daysLeft === 1 ? 'يوم' : 'أيام'} — يرجى التجديد قريباً</span>
            <button onclick="document.getElementById('sub-enforcement-banner').style.display='none'" 
                style="background:none;border:none;color:#fff;cursor:pointer;font-size:16px;margin-right:8px;">×</button>
        `;
    }
}

function _hideSubBanner() {
    const el = document.getElementById('sub-enforcement-banner');
    if (el) el.style.display = 'none';
}

// ════════════════════════════════════════════════════════════
// invalidateSubCache — امسح الـ cache بعد أي تعديل
// ════════════════════════════════════════════════════════════
function invalidateSubCache() {
    window._subCache = null;
}

// ════════════════════════════════════════════════════════════
// تشغيل الفحص عند تحميل الصفحة
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    // ننتظر currentUserData يكون جاهز
    let _attempts = 0;
    const _timer = setInterval(async () => {
        _attempts++;
        if (window.currentUserData?.company_id) {
            clearInterval(_timer);
            await checkSubscriptionActive();
        } else if (_attempts > 40) {
            clearInterval(_timer);
        }
    }, 250);
});

// ════════════════════════════════════════════════════════════
// loadSubscriptionPage — تحميل صفحة الاشتراك في settings
// ════════════════════════════════════════════════════════════
async function loadSubscriptionPage() {
    const section = document.getElementById('subscriptionSection');
    if (!section) return;

    const u = window.currentUserData;
    // يظهر لكل المستخدمين — بس فيه بيانات حسب الشركة
    section.style.display = 'block';

    const sub = await getSubscription(true);
    if (!sub) return;

    // ── الخطة الحالية ──
    const planNames = { FREE: 'الخطة المجانية', PRO: 'خطة Pro', ENTERPRISE: 'خطة Enterprise' };
    const statusNames = { active: 'نشط ✅', trial: 'تجريبي ⏳', expired: 'منتهي ❌', cancelled: 'ملغي' };
    const planColors  = { FREE: 'bg-secondary', PRO: 'bg-primary', ENTERPRISE: 'bg-purple' };

    const nameEl   = document.getElementById('planName');
    const statEl   = document.getElementById('planStatus');
    const badgeEl  = document.getElementById('planBadge');
    const expiryEl = document.getElementById('planExpiry');

    if (nameEl)   nameEl.textContent   = planNames[sub.plan_code]  || sub.plan_code;
    if (statEl)   statEl.textContent   = statusNames[sub.status]   || sub.status;
    if (badgeEl)  { badgeEl.textContent = sub.plan_code; badgeEl.className = 'badge fs-6 ' + (planColors[sub.plan_code] || 'bg-secondary'); }
    if (expiryEl) expiryEl.textContent = sub.expires_at
        ? new Date(sub.expires_at).toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' })
        : 'غير محدد';

    // ── الاستهلاك ──
    const cid = u.company_id;
    const now = new Date();
    const mStr = '/' + String(now.getMonth()+1).padStart(2,'0') + '/' + now.getFullYear();

    const [
        { count: brCount },
        { count: mbCount },
        { count: txCount }
    ] = await Promise.all([
        window.supa.from('branches').select('id', { count:'exact', head:true }).eq('company_id', cid),
        window.supa.from('users').select('id', { count:'exact', head:true }).eq('company_id', cid),
        window.supa.from('transactions').select('id', { count:'exact', head:true }).eq('company_id', cid).ilike('date', '%' + mStr)
    ]);

    function setUsage(labelId, progressId, used, max) {
        const lbl  = document.getElementById(labelId);
        const prog = document.getElementById(progressId);
        const pct  = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
        const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '';
        if (lbl)  lbl.textContent = used + ' / ' + (max || '∞');
        if (prog) {
            prog.style.width  = pct + '%';
            if (color) prog.style.background = color;
        }
    }
    setUsage('usageBranches', 'progressBranches', brCount || 0, sub.max_branches);
    setUsage('usageMembers',  'progressMembers',  mbCount || 0, sub.max_employees);
    setUsage('usageTxs',      'progressTxs',      txCount || 0, sub.max_transactions);

    // ── مقارنة الخطط من جدول plans ──
    const { data: plans } = await window.supa.from('plans').select('*');
    const tbody = document.getElementById('plansCompareBody');
    if (tbody && plans?.length) {
        const planOrder = ['FREE', 'PRO', 'ENTERPRISE'];
        const sortedPlans = planOrder.map(c => plans.find(p => p.code === c)).filter(Boolean);
        const rows = [
            { label: 'السعر', key: null, fmt: p => p.price ? p.price.toLocaleString('ar-EG') + ' ج.م' : 'مجاناً' },
            { label: 'الفروع',    key: 'max_branches',    fmt: p => p.max_branches >= 999 ? '∞' : p.max_branches },
            { label: 'الأعضاء',   key: 'max_employees',   fmt: p => p.max_employees >= 999 ? '∞' : p.max_employees },
            { label: 'عمليات/شهر',key: 'max_transactions',fmt: p => p.max_transactions >= 999999 ? '∞' : p.max_transactions?.toLocaleString('ar-EG') },
            { label: 'المدة',     key: null,               fmt: p => p.duration_days ? p.duration_days + ' يوم' : '—' },
        ];
        tbody.innerHTML = rows.map(row => {
            const isCurrent = (plan) => plan.code === sub.plan_code;
            return '<tr>' +
                '<td style="padding:9px 14px;font-size:12px;color:var(--text-muted);">' + row.label + '</td>' +
                sortedPlans.map(p =>
                    '<td style="padding:9px;text-align:center;font-size:12px;font-weight:' + (isCurrent(p)?'800':'500') + ';'
                    + (isCurrent(p)?'background:rgba(59,130,246,.07);color:#3b82f6;':'') + '">'
                    + row.fmt(p) + (isCurrent(p)?' <i class="fa fa-check-circle text-primary" style="font-size:10px;"></i>':'')
                    + '</td>'
                ).join('') + '</tr>';
        }).join('');
    }

    // ── طلب ترقية معلّق؟ ──
    const { data: pending } = await window.supa
        .from('upgrade_requests')
        .select('*')
        .eq('company_id', cid)
        .eq('status', 'pending')
        .maybeSingle();

    const pendingAlert = document.getElementById('pendingUpgradeAlert');
    const requestForm  = document.getElementById('upgradeRequestForm');
    if (pending) {
        if (pendingAlert) {
            pendingAlert.style.display = 'flex';
            const msg = document.getElementById('pendingUpgradeMsg');
            if (msg) msg.textContent = 'طلب ترقية إلى ' + pending.requested_plan + ' — بتاريخ ' +
                new Date(pending.created_at).toLocaleDateString('ar-EG');
            pendingAlert.dataset.reqId = pending.id;
        }
        if (requestForm) requestForm.style.display = 'none';
    } else {
        if (pendingAlert) pendingAlert.style.display = 'none';
        if (requestForm) requestForm.style.display = 'block';
        // إخفاء الخطط الأقل من الحالية في select
        const sel = document.getElementById('requestedPlan');
        if (sel) {
            const order = ['FREE','PRO','ENTERPRISE'];
            const idx   = order.indexOf(sub.plan_code);
            Array.from(sel.options).forEach(opt => {
                if (opt.value && order.indexOf(opt.value) <= idx)
                    opt.style.display = 'none';
            });
        }
    }
}

// ════════════════════════════════════════════════════════════
// sendUpgradeRequest — إرسال طلب ترقية
// ════════════════════════════════════════════════════════════
async function sendUpgradeRequest() {
    const plan  = document.getElementById('requestedPlan')?.value;
    const notes = document.getElementById('upgradeNotes')?.value?.trim();
    const btn   = document.querySelector('[onclick="sendUpgradeRequest()"]');

    if (!plan) return showToast('يرجى اختيار الخطة المطلوبة', false);

    const u = window.currentUserData;
    if (!u?.company_id) return;

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-circle-notch fa-spin me-1"></i>جاري الإرسال...'; }

    const { error } = await window.supa.from('upgrade_requests').insert({
        company_id:     u.company_id,
        requested_plan: plan,
        notes:          notes || null,
        status:         'pending'
    });

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-paper-plane me-1"></i> إرسال طلب الترقية'; }

    if (error) return showToast('خطأ: ' + error.message, false);
    showToast('✅ تم إرسال طلب الترقية — سيتم مراجعته قريباً');
    await loadSubscriptionPage(); // تحديث الصفحة
}

// ════════════════════════════════════════════════════════════
// cancelUpgradeRequest — إلغاء طلب معلّق
// ════════════════════════════════════════════════════════════
async function cancelUpgradeRequest() {
    const alert = document.getElementById('pendingUpgradeAlert');
    const reqId = alert?.dataset?.reqId;
    if (!reqId) return;

    const { error } = await window.supa
        .from('upgrade_requests').update({ status: 'cancelled' }).eq('id', reqId);

    if (error) return showToast('خطأ: ' + error.message, false);
    showToast('تم إلغاء الطلب');
    await loadSubscriptionPage();
}
