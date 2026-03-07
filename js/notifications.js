// ════════════════════════════════════════════════════════════
// notifications.js — Phase 7: Notifications System
// ════════════════════════════════════════════════════════════

const NOTIF_ICONS = {
    subscription_expiring:        '⚠️',
    subscription_expired:         '🔴',
    member_added:                 '👤',
    member_removed:               '👤',
    transactions_limit_warning:   '⚠️',
    transactions_limit_reached:   '🔴',
    client_debt_added:            '💳',
    client_debt_paid:             '✅',
    payment_success:              '✅',
    payment_failed:               '❌',
};

const NOTIF_COLORS = {
    subscription_expiring:        '#f59e0b',
    subscription_expired:         '#ef4444',
    member_added:                 '#3b82f6',
    member_removed:               '#6b7280',
    transactions_limit_warning:   '#f59e0b',
    transactions_limit_reached:   '#ef4444',
    client_debt_added:            '#8b5cf6',
    client_debt_paid:             '#10b981',
    payment_success:              '#10b981',
    payment_failed:               '#ef4444',
};

// ── تحميل الإشعارات ──────────────────────────────────────────
async function loadNotifications() {
    const companyId = window.currentUserData?.company_id;
    if (!companyId) return;

    const { data, error } = await window.supa
        .from('notifications')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) { console.error('Notifications error:', error); return; }

    updateNotificationBadge(data);
    renderNotifications(data);
}

// ── تحديث الـ Badge ───────────────────────────────────────────
function updateNotificationBadge(notifications) {
    const unread = notifications.filter(n => !n.is_read).length;
    let badge = document.getElementById('notif-badge');
    const bell = document.querySelector('[onclick="showNotifications()"]');

    if (!bell) return;

    if (!badge) {
        bell.style.position = 'relative';
        badge = document.createElement('span');
        badge.id = 'notif-badge';
        badge.style.cssText = `
            position:absolute; top:-4px; right:-4px;
            background:#ef4444; color:#fff;
            font-size:10px; font-weight:700;
            min-width:16px; height:16px;
            border-radius:50%; display:flex;
            align-items:center; justify-content:center;
            padding:0 3px; line-height:1;
            pointer-events:none;
        `;
        bell.appendChild(badge);
    }

    if (unread > 0) {
        badge.textContent = unread > 99 ? '99+' : unread;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

// ── رسم الإشعارات ─────────────────────────────────────────────
function renderNotifications(notifications) {
    const container = document.getElementById('notificationsList');
    if (!container) return;

    if (!notifications || notifications.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px; color:var(--text-muted);">
                <i class="fa fa-bell-slash" style="font-size:32px; opacity:.3; display:block; margin-bottom:10px;"></i>
                لا توجد إشعارات
            </div>`;
        return;
    }

    container.innerHTML = notifications.map(n => {
        const color  = NOTIF_COLORS[n.type] || '#6b7280';
        const timeAgo = formatTimeAgo(n.created_at);
        const unreadStyle = n.is_read ? '' : `background:${color}11; border-right:3px solid ${color};`;

        return `
        <div class="notif-item" id="notif-${n.id}"
             style="padding:12px; margin-bottom:8px; border-radius:10px; cursor:pointer;
                    ${unreadStyle} transition:all .2s;"
             onclick="markNotifRead('${n.id}', '${n.link || ''}')">
            <div style="display:flex; gap:10px; align-items:flex-start;">
                <div style="font-size:20px; line-height:1; flex-shrink:0;">${NOTIF_ICONS[n.type] || '🔔'}</div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:${n.is_read ? '400' : '600'}; font-size:13px; margin-bottom:3px;">
                        ${n.title}
                    </div>
                    <div style="font-size:12px; color:var(--text-muted); line-height:1.5;">
                        ${n.message}
                    </div>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:5px; opacity:.7;">
                        ${timeAgo}
                    </div>
                </div>
                ${!n.is_read ? `<div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;margin-top:4px;"></div>` : ''}
            </div>
        </div>`;
    }).join('');
}

// ── تحديد إشعار كمقروء ───────────────────────────────────────
async function markNotifRead(id, link) {
    await window.supa
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);

    const el = document.getElementById('notif-' + id);
    if (el) {
        el.style.background = '';
        el.style.borderRight = '';
        el.querySelector('[style*="border-radius:50%"]')?.remove();
    }

    // أعد حساب الـ badge
    await loadNotifications();

    if (link) {
        closeNotificationModal();
        if (link === '#subscription') showView('subscription');
        else if (link === '#manage')   showView('manage');
        else if (link === '#settings') showView('settings');
    }
}

// ── تحديد الكل كمقروء ────────────────────────────────────────
async function markAllNotifsRead() {
    const companyId = window.currentUserData?.company_id;
    if (!companyId) return;

    await window.supa
        .from('notifications')
        .update({ is_read: true })
        .eq('company_id', companyId)
        .eq('is_read', false);

    await loadNotifications();
}

// ── فتح/إغلاق Modal ──────────────────────────────────────────
function showNotifications() {
    document.getElementById('notificationModal').style.display = 'flex';
    loadNotifications();
}

function closeNotificationModal() {
    document.getElementById('notificationModal').style.display = 'none';
}

// ── تنسيق الوقت ──────────────────────────────────────────────
function formatTimeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);

    if (mins < 1)   return 'الآن';
    if (mins < 60)  return `منذ ${mins} دقيقة`;
    if (hours < 24) return `منذ ${hours} ساعة`;
    if (days < 7)   return `منذ ${days} يوم`;
    return new Date(dateStr).toLocaleDateString('ar-EG');
}

// ── Realtime subscription ─────────────────────────────────────
function subscribeToNotifications() {
    const companyId = window.currentUserData?.company_id;
    if (!companyId) return;

    window.supa
        .channel('notifications-' + companyId)
        .on('postgres_changes', {
            event:  'INSERT',
            schema: 'public',
            table:  'notifications',
            filter: `company_id=eq.${companyId}`,
        }, async (payload) => {
            // صوت تنبيه خفيف
            try {
                const ctx = new AudioContext();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.frequency.value = 880;
                gain.gain.setValueAtTime(0.1, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                osc.start(); osc.stop(ctx.currentTime + 0.3);
            } catch(e) {}

            await loadNotifications();

            // Toast سريع
            const n = payload.new;
            showToast(`${n.title}: ${n.message.substring(0, 60)}...`, true);
        })
        .subscribe();
}

// ── تشغيل يدوي لفحص انتهاء الاشتراكات (من الـ client) ────────
async function checkSubscriptionExpiry() {
    const companyId = window.currentUserData?.company_id;
    if (!companyId) return;

    const { data: sub } = await window.supa
        .from('subscriptions')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();

    if (!sub) return;

    const now      = new Date();
    const expires  = sub.expires_at ? new Date(sub.expires_at) : null;
    const diffDays = expires ? Math.ceil((expires - now) / 86400000) : null;

    if (diffDays !== null && diffDays <= 3 && diffDays > 0 && sub.status !== 'expired') {
        // تحقق إنه مش اتبعت نفس الإشعار
        const { data: existing } = await window.supa
            .from('notifications')
            .select('id')
            .eq('company_id', companyId)
            .eq('type', 'subscription_expiring')
            .gte('created_at', new Date(now - 86400000).toISOString())
            .maybeSingle();

        if (!existing) {
            await window.supa.from('notifications').insert({
                company_id: companyId,
                type:       'subscription_expiring',
                title:      '⚠️ اشتراكك قرب ينتهي',
                message:    `اشتراكك سينتهي خلال ${diffDays} يوم — جدد الاشتراك عشان تفضل شغال.`,
                link:       '#subscription',
            });
        }
    }
}
