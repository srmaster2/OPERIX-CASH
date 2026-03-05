// ============================================================
// members.js — إدارة الأعضاء + الدعوات + اسم الشركة + Admin Logs
// ============================================================

// ══════════════════════════════════════════════════════════
// 1. اسم الشركة — يظهر في الهيدر والإعدادات
// ══════════════════════════════════════════════════════════
async function loadCompanyInfo() {
    const u = window.currentUserData;
    if (!u?.company_id) return;

    const { data: company } = await window.supa
        .from('companies')
        .select('name, is_active')
        .eq('id', u.company_id)
        .maybeSingle();

    if (!company) return;

    // هيدر — tagline تحت OPERIX
    const tagline = document.querySelector('.brand-tagline');
    if (tagline) tagline.textContent = company.name;

    // الإعدادات — لو في عنصر مخصص
    const companyNameEl = document.getElementById('displayCompanyName');
    if (companyNameEl) companyNameEl.textContent = company.name;

    // تخزين اسم الشركة في الـ currentUserData
    window.currentUserData.companyName = company.name;
}


// ══════════════════════════════════════════════════════════
// 2. Admin Logs — تصليح اسم الـ div
// ══════════════════════════════════════════════════════════
async function loadAdminLogs() {
    // يدعم الاسمين: adminLogsDiv (القديم) و admin-logs-body (الجديد)
    const container = document.getElementById('adminLogsDiv')
                   || document.getElementById('admin-logs-body');
    if (!container) return;

    container.innerHTML = `
        <div class="text-center p-4 text-muted small">
            <i class="fa fa-circle-notch fa-spin me-1"></i> جاري التحميل...
        </div>`;

    const cid = window.currentUserData?.company_id || '';
    if (!cid) {
        container.innerHTML = '<div class="text-center text-danger p-3 small">خطأ: لم يتم تحديد الشركة</div>';
        return;
    }

    const { data: logs, error } = await window.supa
        .from('admin_logs')
        .select('*')
        .eq('company_id', cid)
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        container.innerHTML = `<div class="text-center text-danger p-3 small">خطأ: ${error.message}</div>`;
        return;
    }
    if (!logs?.length) {
        container.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="fa fa-clipboard-list fa-2x mb-2 opacity-25 d-block"></i>
                <span class="small">لا يوجد سجلات بعد</span>
            </div>`;
        return;
    }

    container.innerHTML = logs.map(log => {
        const date     = new Date(log.created_at);
        const dateStr  = date.toLocaleDateString('ar-EG');
        const timeStr  = date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        const isRollback = log.action === 'ROLLBACK';

        return `
        <div class="d-flex align-items-start p-2 mb-2 rounded-3"
             style="background:var(--card-bg);border:1px solid var(--card-border);direction:rtl;font-size:12px;">
            <div class="flex-shrink-0 me-2 mt-1">
                <span class="badge ${isRollback ? 'bg-danger' : 'bg-secondary'}" style="font-size:10px;">
                    ${log.action || '—'}
                </span>
            </div>
            <div class="flex-grow-1">
                <div class="fw-bold" style="font-size:12px;color:var(--card-text);">${log.details || '—'}</div>
                <div class="text-muted mt-1" style="font-size:10px;">
                    <i class="fa fa-user me-1"></i>${log.created_by || '—'}
                    &nbsp;·&nbsp;
                    <i class="fa fa-clock me-1"></i>${dateStr} ${timeStr}
                </div>
            </div>
        </div>`;
    }).join('');
}


// ══════════════════════════════════════════════════════════
// 3. نظام الدعوات — إرسال + عرض
// ══════════════════════════════════════════════════════════

// عرض قسم الدعوات (للـ owner/master فقط)
async function loadInvitationsSection() {
    const container = document.getElementById('invitationsSection');
    if (!container) return;

    const u = window.currentUserData;
    if (!u?.isMaster && !u?.is_owner) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';

    // جلب الفروع لبناء map اسم الفرع
    const { data: branchesData } = await window.supa
        .from('branches').select('id, name').eq('company_id', u.company_id);
    const _branchMap = {};
    (branchesData || []).forEach(b => { _branchMap[b.id] = b.name; });

    // جلب الدعوات المرسلة
    const { data: invites } = await window.supa
        .from('invitations')
        .select('*')
        .eq('company_id', u.company_id)
        .order('created_at', { ascending: false })
        .limit(20);

    const listEl = document.getElementById('invitesList');
    if (!listEl) return;

    if (!invites?.length) {
        listEl.innerHTML = '<div class="text-center text-muted small py-3">لا يوجد دعوات مرسلة</div>';
        return;
    }

    const statusMap = {
        pending:  { label: 'في الانتظار', cls: 'bg-warning text-dark' },
        accepted: { label: 'تم القبول',   cls: 'bg-success' },
        expired:  { label: 'منتهية',       cls: 'bg-secondary' },
    };

    listEl.innerHTML = invites.map(inv => {
        const st      = statusMap[inv.status] || statusMap.pending;
        const branch  = _branchMap[inv.branch_id] || inv.branch_id?.slice(0,8) || '—';
        const roleLabel = inv.role === 'ADMIN' ? 'مدير فرع' : 'موظف';
        const expires = new Date(inv.expires_at).toLocaleDateString('ar-EG');
        const isExpired = new Date(inv.expires_at) < new Date() && inv.status === 'pending';

        return `
        <div class="d-flex align-items-center p-2 mb-2 rounded-3"
             style="background:var(--card-bg);border:1px solid var(--card-border);direction:rtl;font-size:12px;">
            <div class="flex-grow-1">
                <div class="fw-bold" style="color:var(--card-text);">${inv.email}</div>
                <div class="text-muted mt-1" style="font-size:10px;">
                    <i class="fa fa-building me-1"></i>${branch}
                    &nbsp;·&nbsp;
                    <i class="fa fa-user-tag me-1"></i>${roleLabel}
                    &nbsp;·&nbsp;
                    <i class="fa fa-clock me-1"></i>${expires}
                </div>
            </div>
            <div class="d-flex flex-column align-items-end gap-1">
                <span class="badge ${isExpired ? 'bg-danger' : st.cls}" style="font-size:9px;">
                    ${isExpired ? 'منتهية' : st.label}
                </span>
                ${inv.status === 'pending' && !isExpired ? `
                <button class="btn btn-outline-primary" style="font-size:9px;padding:2px 7px;border-radius:6px;"
                    onclick="copyInviteLink('${inv.token}')">
                    <i class="fa fa-copy me-1"></i>نسخ الرابط
                </button>` : ''}
            </div>
        </div>`;
    }).join('');
}

// نسخ رابط الدعوة
function copyInviteLink(token) {
    const url = `${window.location.origin}/login.html?token=${token}`;
    navigator.clipboard.writeText(url).then(() => {
        if (typeof showToast === 'function') showToast('✅ تم نسخ رابط الدعوة');
    }).catch(() => {
        prompt('انسخ الرابط يدوياً:', url);
    });
}

// إرسال دعوة جديدة
async function sendInvitation() {
    const email    = document.getElementById('inviteEmail')?.value?.trim();
    const role     = document.getElementById('inviteRole')?.value;
    const branchId = document.getElementById('inviteBranch')?.value;

    const u = window.currentUserData;

    if (!email)    return showToast('يرجى إدخال البريد الإلكتروني', false);
    if (!branchId) return showToast('يرجى اختيار الفرع', false);

    // التحقق من البريد
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return showToast('البريد الإلكتروني غير صحيح', false);

    const btn = document.getElementById('btnSendInvite');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-circle-notch fa-spin me-1"></i>جاري الإرسال...'; }

    try {
        // التحقق من وجود دعوة سابقة pending لنفس البريد
        const { data: existing } = await window.supa
            .from('invitations')
            .select('id, status')
            .eq('company_id', u.company_id)
            .eq('email', email)
            .eq('status', 'pending')
            .maybeSingle();

        if (existing) {
            showToast('يوجد دعوة معلقة لهذا البريد بالفعل', false);
            return;
        }

        // إنشاء token عشوائي
        const token = crypto.randomUUID().replace(/-/g, '');

        const { error } = await window.supa.from('invitations').insert({
            company_id: u.company_id,
            branch_id:  branchId,
            email,
            role:       role || 'USER',
            token,
            status:     'pending',
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        });

        if (error) throw error;

        // نسخ الرابط تلقائياً
        const url = `${window.location.origin}/login.html?token=${token}`;
        navigator.clipboard.writeText(url).catch(() => {});

        showToast('✅ تم إنشاء الدعوة — تم نسخ الرابط تلقائياً');

        // تفريغ الحقول وإعادة تحميل القائمة
        if (document.getElementById('inviteEmail'))  document.getElementById('inviteEmail').value  = '';
        if (document.getElementById('inviteBranch')) document.getElementById('inviteBranch').value = '';

        await loadInvitationsSection();

    } catch (err) {
        showToast('خطأ: ' + err.message, false);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-paper-plane me-1"></i>إرسال الدعوة'; }
    }
}


// ══════════════════════════════════════════════════════════
// 4. تحديث loadUsersList — يضيف زر دعوة في أعلى القائمة
// ══════════════════════════════════════════════════════════
async function loadMembersTab() {
    const u = window.currentUserData;
    const isOwner = u?.isMaster || u?.is_owner;

    // ملء select الفروع في فورم الدعوة
    if (isOwner) {
        const branchSel = document.getElementById('inviteBranch');
        if (branchSel) {
            const { data: branches } = await window.supa
                .from('branches')
                .select('id, name')
                .eq('company_id', u.company_id)
                .order('created_at');
            branchSel.innerHTML = '<option value="">— اختر الفرع —</option>';
            (branches || []).forEach(b => {
                branchSel.innerHTML += `<option value="${b.id}">${b.name}</option>`;
            });
        }
    }

    // تحميل قائمة الأعضاء
    if (typeof loadUsersList === 'function') loadUsersList();

    // تحميل الدعوات
    await loadInvitationsSection();
}


// ══════════════════════════════════════════════════════════
// 5. Hook على showManageTab — تشغيل loadMembersTab
// ══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    // تحميل اسم الشركة بعد ما currentUserData يكون جاهز
    const _waitCompany = setInterval(() => {
        if (window.currentUserData?.company_id) {
            clearInterval(_waitCompany);
            loadCompanyInfo();
        }
    }, 200);

    // Override showManageTab عشان نضيف loadMembersTab
    const _origShowManageTab = window.showManageTab;
    window.showManageTab = function(el) {
        if (typeof _origShowManageTab === 'function') _origShowManageTab(el);
        const tabId = el?.dataset?.tab;
        if (tabId === 'users-tab') loadMembersTab();
    };
});