// ════════════════════════════════════════════════════════════
// payment.js — Kashier HPP Integration
// ════════════════════════════════════════════════════════════

var KASHIER_MID        = 'MID-43854-991';
var KASHIER_MODE       = 'test';
var KASHIER_CURRENCY   = 'EGP';
var KASHIER_BASE_URL   = 'https://operix-cash.vercel.app';
var KASHIER_SUP_URL    = 'https://hgzyjfsbqxqwzbdtuekh.supabase.co';
var KASHIER_HPP_BASE   = 'https://test-iframe.kashier.io';
// Secret Key — يُستخدم للـ hash (مش الـ API Key)
var KASHIER_SECRET_KEY = '4120190dc13c819b109bdb29268df1e0$05f63d185a5b73a3dda0e23ee9f11d2216eeb3fb0ff1593732b751b6192f64bfb8c743a2cebdd26d4f5dd31076fc72fa';

// ── توليد hash ───────────────────────────────────────────────
async function generateKashierHash(orderId, amount) {
    const message = `${KASHIER_MID}.${orderId}.${amount}.${KASHIER_CURRENCY}`;

    function asciiEncode(str) {
        const buf = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i) & 0xff;
        return buf;
    }

    const keyData   = asciiEncode(KASHIER_SECRET_KEY);
    const msgData   = asciiEncode(message);

    const cryptoKey = await crypto.subtle.importKey(
        'raw', keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── بناء HPP URL ─────────────────────────────────────────────
async function buildKashierURL({ orderId, amount, planCode, customerEmail, customerName }) {
    const amountStr  = Number(amount).toFixed(2);
    const hash       = await generateKashierHash(orderId, amountStr);
    const successUrl = `${KASHIER_BASE_URL}/payment-success.html?orderId=${orderId}&plan=${planCode}`;
    const failUrl    = `${KASHIER_BASE_URL}/payment-success.html?orderId=${orderId}&plan=${planCode}&status=failed`;

    const params = [
        `mid=${KASHIER_MID}`,
        `orderId=${orderId}`,
        `amount=${amountStr}`,
        `currency=${KASHIER_CURRENCY}`,
        `hash=${hash}`,
        `mode=${KASHIER_MODE}`,
        `merchantOrderId=${orderId}`,
        `merchantRedirect=${encodeURIComponent(successUrl)}`,
        `failureRedirect=${encodeURIComponent(failUrl)}`,
        `webhookUrl=${encodeURIComponent(KASHIER_SUP_URL + '/functions/v1/super-api')}`,
        `allowedMethods=card`,
        `display=ar`,
        `metaData=${encodeURIComponent(JSON.stringify({ planCode: planCode }))}`,
        customerName  ? `shopper_name=${encodeURIComponent(customerName)}`   : '',
        customerEmail ? `shopper_email=${encodeURIComponent(customerEmail)}` : '',
    ].filter(Boolean).join('&');

    const url = `${KASHIER_HPP_BASE}/payment?${params}`;
    console.log('[Kashier] URL:', url);
    return url;
}

// ── initiateKashierPayment ───────────────────────────────────
async function initiateKashierPayment(planCode) {
    const u = window.currentUserData;
    if (!u?.company_id) return showToast('خطأ: بيانات المستخدم غير جاهزة', false);

    const { data: plan, error: planErr } = await window.supa
        .from('plans').select('*').eq('code', planCode).maybeSingle();
    if (planErr || !plan) return showToast('خطأ: الخطة غير موجودة', false);

    const amount  = plan.price;
    if (!amount || amount <= 0) return showToast('هذه الخطة مجانية', false);

    const orderId = `ORX-${Date.now()}`.slice(0, 40);

    const btn = document.querySelector(`[onclick*="${planCode}"]`);
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-circle-notch fa-spin"></i>'; }

    const { error: insErr } = await window.supa.from('payment_orders').insert({
        id: orderId, company_id: u.company_id,
        plan_code: planCode, amount, currency: 'EGP', status: 'pending',
    });

    if (insErr) {
        if (btn) { btn.disabled = false; btn.innerHTML = Number(amount).toLocaleString('ar-EG') + ' ج.م/سنة'; }
        return showToast('خطأ: ' + insErr.message, false);
    }

    const { data: { user } } = await window.supa.auth.getUser();
    const { data: userInfo  } = await window.supa.from('users').select('name').eq('id', user?.id).maybeSingle();
    const { data: compInfo  } = await window.supa.from('companies').select('name').eq('id', u.company_id).maybeSingle();

    const url = await buildKashierURL({
        orderId, amount, planCode,
        customerEmail: user?.email || '',
        customerName:  userInfo?.name || compInfo?.name || '',
    });

    window.location.href = url;
}

// ── handlePaymentSuccess ─────────────────────────────────────
async function handlePaymentSuccess(supaClient) {
    const params      = new URLSearchParams(window.location.search);
    const orderId     = params.get('orderId') || params.get('merchantOrderId');
    const planCode    = params.get('plan');
    const kashierTxId = params.get('transactionId');
    const rawStatus   = (params.get('paymentStatus') || params.get('status') || '').toUpperCase();
    const isSuccess   = rawStatus === 'SUCCESS' || rawStatus === 'APPROVED';

    if (!orderId) return { ok: false, reason: 'missing_order' };

    if (kashierTxId || rawStatus) {
        await supaClient.from('payment_orders').update({
            status:        isSuccess ? 'paid' : 'failed',
            kashier_tx_id: kashierTxId || null,
            paid_at:       isSuccess ? new Date().toISOString() : null,
        }).eq('id', orderId);
    }

    if (!isSuccess) return { ok: false, reason: rawStatus || 'failed' };

    await new Promise(r => setTimeout(r, 5000));

    const { data: order } = await supaClient
        .from('payment_orders').select('*').eq('id', orderId).maybeSingle();

    if (order?.status === 'paid' && planCode) {
        const { data: sub } = await supaClient
            .from('subscriptions').select('plan_code').eq('company_id', order.company_id).maybeSingle();

        if (sub && sub.plan_code !== planCode) {
            const { data: plan } = await supaClient
                .from('plans').select('*').eq('code', planCode).maybeSingle();
            const now = new Date();
            const exp = new Date(now);
            exp.setDate(exp.getDate() + (plan?.duration_days || 30));
            await supaClient.from('subscriptions').update({
                plan_code: planCode, status: 'active',
                started_at: now.toISOString(), expires_at: exp.toISOString(),
                trial_ends_at: null,
                max_branches: plan?.max_branches ?? 3,
                max_employees: plan?.max_employees ?? 10,
                max_transactions: plan?.max_transactions ?? 500,
            }).eq('company_id', order.company_id);
        }
    }

    return { ok: true, orderId, planCode, txId: kashierTxId };
}
