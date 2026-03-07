// ════════════════════════════════════════════════════════════
// payment.js — Kashier HPP Integration (Fixed)
// ════════════════════════════════════════════════════════════

var KASHIER_MID      = 'MID-43854-991';
var KASHIER_MODE     = 'test'; // غيّر لـ 'live' لما تنقل
var KASHIER_CURRENCY = 'EGP';
var KASHIER_BASE_URL = 'https://operix-cash.vercel.app';
var KASHIER_SUP_URL  = 'https://hgzyjfsbqxqwzbdtuekh.supabase.co';
var KASHIER_HPP_BASE = 'https://test-iframe.kashier.io'; // غيّر لـ https://iframe.kashier.io في live

// ── توليد hash — الصيغة الصحيحة: mid.orderId.amount.currency ──
async function generateKashierHash(orderId, amount) {
    // الصيغة الصحيحة من Kashier docs: mid.orderId.amount.currency (بدون /?payment=)
    const message = `${KASHIER_MID}.${orderId}.${amount}.${KASHIER_CURRENCY}`;

    function asciiEncode(str) {
        const buf = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i) & 0xff;
        return buf;
    }

    // الـ API Key يُستخدم كـ HMAC secret
    const apiKey    = 'f44d05f6-a29d-49e5-9b51-2c11416322d9';
    const keyData   = asciiEncode(apiKey);
    const msgData   = asciiEncode(message);

    const cryptoKey = await crypto.subtle.importKey(
        'raw', keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── بناء Kashier HPP URL ─────────────────────────────────────
async function buildKashierURL({ orderId, amount, planCode, customerEmail, customerName }) {
    // FIX 5: amount.toFixed(2) — بدون decimals ممكن يرفض
    const amountStr = Number(amount).toFixed(2);

    const hash = await generateKashierHash(orderId, amountStr);

    const successUrl = `${KASHIER_BASE_URL}/payment-success.html?orderId=${orderId}&plan=${planCode}`;
    const failUrl    = `${KASHIER_BASE_URL}/payment-success.html?orderId=${orderId}&plan=${planCode}&status=failed`;

    // FIX 9: orderId max 40 chars
    // FIX 3: webhook parameter name — جرّب webhookUrl
    // FIX 4: allowedMethods = 'card' فقط (wallet ممكن مش مفعّل)
    // FIX 7: metadata مش metaData
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
    console.log('[Kashier] Hash message:', `${KASHIER_MID}.${orderId}.${amountStr}.${KASHIER_CURRENCY}`);
    console.log('[Kashier] Hash:', hash);
    return url;
}

// ── initiateKashierPayment ───────────────────────────────────
async function initiateKashierPayment(planCode) {
    const u = window.currentUserData;
    if (!u?.company_id) return showToast('خطأ: بيانات المستخدم غير جاهزة', false);

    const { data: plan, error: planErr } = await window.supa
        .from('plans').select('*').eq('code', planCode).maybeSingle();
    if (planErr || !plan) return showToast('خطأ: الخطة غير موجودة', false);

    const amount = plan.price;
    if (!amount || amount <= 0) return showToast('هذه الخطة مجانية', false);

    // FIX 9: orderId max 40 chars — استخدم timestamp فقط
    const orderId = `ORX-${Date.now()}`.slice(0, 40);
    console.log('[Kashier] orderId:', orderId, 'length:', orderId.length);

    const btn = document.querySelector(`[onclick*="${planCode}"]`);
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-circle-notch fa-spin"></i>'; }

    const { error: insErr } = await window.supa.from('payment_orders').insert({
        id:         orderId,
        company_id: u.company_id,
        plan_code:  planCode,
        amount:     amount,
        currency:   'EGP',
        status:     'pending',
    });

    if (insErr) {
        if (btn) { btn.disabled = false; btn.innerHTML = Number(amount).toLocaleString('ar-EG') + ' ج.م/سنة'; }
        return showToast('خطأ في إنشاء الطلب: ' + insErr.message, false);
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

// ── handlePaymentSuccess — fallback لو webhook أتأخر ─────────
async function handlePaymentSuccess(supaClient) {
    const params      = new URLSearchParams(window.location.search);
    const orderId     = params.get('orderId') || params.get('merchantOrderId');
    const planCode    = params.get('plan');
    const kashierTxId = params.get('transactionId');

    // FIX 5: تحقق من APPROVED كمان مش بس SUCCESS
    const rawStatus = (
        params.get('paymentStatus') ||
        params.get('status')        ||
        params.get('success')       || ''
    ).toUpperCase();

    const isSuccess = rawStatus === 'SUCCESS' || rawStatus === 'APPROVED';

    if (!orderId) return { ok: false, reason: 'missing_order' };

    if (kashierTxId || rawStatus) {
        await supaClient.from('payment_orders').update({
            status:        isSuccess ? 'paid' : 'failed',
            kashier_tx_id: kashierTxId || null,
            paid_at:       isSuccess ? new Date().toISOString() : null,
        }).eq('id', orderId);
    }

    if (!isSuccess) return { ok: false, reason: rawStatus || 'failed' };

    // FIX 8: انتظر 5 ثواني للـ webhook (مش 2)
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
                plan_code:        planCode,
                status:           'active',
                started_at:       now.toISOString(),
                expires_at:       exp.toISOString(),
                trial_ends_at:    null,
                max_branches:     plan?.max_branches    ?? 3,
                max_employees:    plan?.max_employees   ?? 10,
                max_transactions: plan?.max_transactions ?? 500,
            }).eq('company_id', order.company_id);
        }
    }

    return { ok: true, orderId, planCode, txId: kashierTxId };
}
