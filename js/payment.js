// ════════════════════════════════════════════════════════════
// payment.js — Kashier HPP Integration
// ════════════════════════════════════════════════════════════

var KASHIER_MID        = 'MID-43854-991';
var KASHIER_MODE       = 'test';
var KASHIER_CURRENCY   = 'EGP';
var KASHIER_BASE_URL   = 'https://operix-cash.vercel.app';
var KASHIER_SUP_URL    = 'https://hgzyjfsbqxqwzbdtuekh.supabase.co';
var KASHIER_HPP_BASE   = 'https://test-iframe.kashier.io';

// ── توليد hash عبر Edge Function (آمن — الـ key في الـ backend) ──
async function generateKashierHash(orderId, amount) {
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnenlqZnNicXhxd3piZHR1ZWtoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MzI4NDAsImV4cCI6MjA4NTAwODg0MH0.eR8p2SM66S8TSKjSMNzNG8Ip2B5kZYLXWoOBYKMTRCQ";
const res = await fetch(
"https://hgzyjfsbqxqwzbdtuekh.supabase.co/functions/v1/kashier-hash",
{
method: "POST",
headers: {
"Content-Type": "application/json",
"apikey": SUPABASE_ANON_KEY,
"Authorization": "Bearer " + SUPABASE_ANON_KEY
},
body: JSON.stringify({
merchantId: KASHIER_MID,
orderId: orderId,
amount: amount,
currency: KASHIER_CURRENCY
})
})

const data = await res.json()

if(!data.hash){
throw new Error("Hash generation failed")
}

return data.hash
}
// ── بناء HPP URL ─────────────────────────────────────────────
async function buildKashierURL({ orderId, amount, planCode, customerEmail, customerName }) {
    const amountStr  = Number(amount).toFixed(2);
    const hash       = await generateKashierHash(orderId, amountStr);
    const successUrl = KASHIER_BASE_URL + '/payment-success.html?orderId=' + orderId + '&plan=' + planCode;
    const failUrl    = KASHIER_BASE_URL + '/payment-success.html?orderId=' + orderId + '&plan=' + planCode + '&status=failed';
    const enc        = window.encodeURIComponent;

    const params = [
        'mid='            + KASHIER_MID,
        'orderId='        + orderId,
        'amount='         + amountStr,
        'currency='       + KASHIER_CURRENCY,
        'hash='           + hash,
        'mode='           + KASHIER_MODE,
        'merchantOrderId='+ orderId,
        'merchantRedirect='  + enc(successUrl),
        'failureRedirect='   + enc(failUrl),
        'webhookUrl='        + enc(KASHIER_SUP_URL + '/functions/v1/kashier-webhook'),
        'allowedMethods=card',
        'display=ar',
        'metaData='          + enc(JSON.stringify({ planCode: planCode })),
        customerName  ? 'shopper_name='  + enc(customerName)  : '',
        customerEmail ? 'shopper_email=' + enc(customerEmail) : '',
    ].filter(Boolean).join('&');

    const url = KASHIER_HPP_BASE + '/payment?' + params;
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