// ════════════════════════════════════════════════════════════
// payment.js — Kashier HPP Integration
// ════════════════════════════════════════════════════════════

const KASHIER_CONFIG = {
    mid:        'MID-43854-991',
    // Payment API Key — لتوليد الـ hash
    apiKey:     'f44d05f6-a29d-49e5-9b51-2c11416322d9',
    mode:       'test',   // ← test الآن، غيّرها لـ 'live' لما تنقل
    currency:   'EGP',
    baseUrl:    'https://operix-cash.vercel.app',
    supabaseUrl:'https://hgzyjfsbqxqwzbdtuekh.supabase.co',
    get iframeBase() {
        return this.mode === 'live'
            ? 'https://iframe.kashier.io'
            : 'https://test-iframe.kashier.io';
    }
};

// ── توليد HMAC-SHA256 hash ──────────────────────────────────
async function generateKashierHash(orderId, amount) {
    // Kashier: path = /?payment=MID.orderId.amount.currency
    // amount كـ string بدون تعديل — بيتطابق مع اللي بيتبعت في الـ request
    const amountStr = String(amount);
    const path = '/?payment=' + KASHIER_CONFIG.mid + '.' + orderId + '.' + amountStr + '.' + KASHIER_CONFIG.currency;

    // Kashier بيستخدم ASCII encoding (مش UTF-8)
    function asciiEncode(str) {
        const buf = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i) & 0xff;
        return buf;
    }

    const keyData = asciiEncode(KASHIER_CONFIG.apiKey);
    const msgData = asciiEncode(path);

    const cryptoKey = await crypto.subtle.importKey(
        'raw', keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── بناء رابط HPP ───────────────────────────────────────────
async function buildKashierURL({ orderId, amount, planCode, customerEmail, customerName }) {
    const hash = await generateKashierHash(orderId, amount);

    // Kashier HPP — الـ format الرسمي من الـ docs
    // https://test-iframe.kashier.io/payment?mid=MID-xx&orderId=...
    const url = new URL(KASHIER_CONFIG.iframeBase + '/payment');
    url.searchParams.set('mid',             KASHIER_CONFIG.mid);
    url.searchParams.set('orderId',         orderId);
    url.searchParams.set('amount',          String(amount));
    url.searchParams.set('currency',        KASHIER_CONFIG.currency);
    url.searchParams.set('hash',            hash);
    url.searchParams.set('merchantRedirect',`${KASHIER_CONFIG.baseUrl}/payment-success.html?orderId=${orderId}&plan=${planCode}`);
    url.searchParams.set('merchantOrderId', orderId);
    url.searchParams.set('allowedMethods',  'card,wallet');
    url.searchParams.set('display',         'ar');
    if (customerName)  url.searchParams.set('shopper_name',  customerName);
    if (customerEmail) url.searchParams.set('shopper_email', customerEmail);

    console.log('Kashier URL:', url.toString());
    return url.toString();
}

// ── إنشاء order في DB ثم فتح Kashier HPP ────────────────────
async function initiateKashierPayment(planCode) {
    const u = window.currentUserData;
    if (!u?.company_id) return showToast('خطأ: بيانات المستخدم غير جاهزة', false);

    // جيب بيانات الخطة
    const { data: plan, error: planErr } = await window.supa
        .from('plans').select('*').eq('code', planCode).maybeSingle();

    if (planErr || !plan) return showToast('خطأ: الخطة غير موجودة', false);

    const orderId = `ORX-${u.company_id.slice(0,8)}-${Date.now()}`;
    const amount  = plan.price;

    if (!amount || amount <= 0) return showToast('هذه الخطة مجانية', false);

    // أضف loading على الزر
    const btn = document.querySelector(`[onclick*="${planCode}"]`);
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-circle-notch fa-spin"></i>'; }

    // احفظ الـ order في DB
    const { error: insErr } = await window.supa.from('payment_orders').insert({
        id:         orderId,
        company_id: u.company_id,
        plan_code:  planCode,
        amount:     amount,
        currency:   'EGP',
        status:     'pending',
    });

    if (insErr) {
        if (btn) { btn.disabled = false; btn.innerHTML = amount.toLocaleString('ar-EG') + ' ج.م/سنة'; }
        return showToast('خطأ في إنشاء الطلب: ' + insErr.message, false);
    }

    // جيب بيانات المستخدم
    const { data: { user } } = await window.supa.auth.getUser();
    const { data: userInfo  } = await window.supa.from('users').select('name').eq('id', user?.id).maybeSingle();
    const { data: compInfo  } = await window.supa.from('companies').select('name').eq('id', u.company_id).maybeSingle();

    const url = await buildKashierURL({
        orderId,
        amount,
        planCode,
        customerEmail: user?.email || '',
        customerName:  userInfo?.name || compInfo?.name || '',
    });

    window.location.href = url;
}

// ── payment-success.html — تحديث الاشتراك كـ fallback ───────
// (في حالة Test Mode أو لو الـ webhook وصل متأخر)
async function handlePaymentSuccess(supaClient) {
    const params      = new URLSearchParams(window.location.search);
    const orderId     = params.get('orderId')      || params.get('merchantOrderId');
    const planCode    = params.get('plan');
    const rawStatus   = (params.get('paymentStatus') || params.get('status') || '').toUpperCase();
    const kashierTxId = params.get('transactionId');

    if (!orderId) return { ok: false, reason: 'missing_order' };

    const isSuccess = rawStatus === 'SUCCESS';

    // حدّث الـ order في DB
    if (kashierTxId || rawStatus) {
        await supaClient.from('payment_orders').update({
            status:        isSuccess ? 'paid' : 'failed',
            kashier_tx_id: kashierTxId || null,
            paid_at:       isSuccess ? new Date().toISOString() : null,
        }).eq('id', orderId);
    }

    if (!isSuccess) return { ok: false, reason: rawStatus || 'failed' };

    // انتظر 2 ثانية للـ webhook
    await new Promise(r => setTimeout(r, 2000));

    // تحقق لو الـ webhook حدّث الاشتراك بالفعل
    const { data: order } = await supaClient
        .from('payment_orders').select('*').eq('id', orderId).maybeSingle();

    if (order?.status === 'paid' && planCode) {
        // Fallback: حدّث الاشتراك من الفرونت لو الـ webhook لم يصل
        const { data: sub } = await supaClient
            .from('subscriptions').select('plan_code').eq('company_id', order.company_id).maybeSingle();

        if (sub && sub.plan_code !== planCode) {
            const { data: plan } = await supaClient
                .from('plans').select('*').eq('code', planCode).maybeSingle();

            const now = new Date();
            const exp = new Date(now);
            exp.setDate(exp.getDate() + (plan?.duration_days || 365));

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
}// ════════════════════════════════════════════════════════════
// payment.js — Kashier HPP Integration
// ════════════════════════════════════════════════════════════

const KASHIER_CONFIG = {
    mid:        'MID-43854-991',
    // Payment API Key — لتوليد الـ hash
    apiKey:     'f44d05f6-a29d-49e5-9b51-2c11416322d9',
    mode:       'test',   // ← test الآن، غيّرها لـ 'live' لما تنقل
    currency:   'EGP',
    baseUrl:    'https://operix-cash.vercel.app',
    supabaseUrl:'https://hgzyjfsbqxqwzbdtuekh.supabase.co',
    get iframeBase() {
        return this.mode === 'live'
            ? 'https://iframe.kashier.io'
            : 'https://test-iframe.kashier.io';
    }
};

// ── توليد HMAC-SHA256 hash ──────────────────────────────────
async function generateKashierHash(orderId, amount) {
    // Kashier: path = /?payment=MID.orderId.amount.currency
    // amount كـ string بدون تعديل — بيتطابق مع اللي بيتبعت في الـ request
    const amountStr = String(amount);
    const path = '/?payment=' + KASHIER_CONFIG.mid + '.' + orderId + '.' + amountStr + '.' + KASHIER_CONFIG.currency;

    // Kashier بيستخدم ASCII encoding (مش UTF-8)
    function asciiEncode(str) {
        const buf = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i) & 0xff;
        return buf;
    }

    const keyData = asciiEncode(KASHIER_CONFIG.apiKey);
    const msgData = asciiEncode(path);

    const cryptoKey = await crypto.subtle.importKey(
        'raw', keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── بناء رابط HPP ───────────────────────────────────────────
async function buildKashierURL({ orderId, amount, planCode, customerEmail, customerName }) {
    const hash = await generateKashierHash(orderId, amount);

    // Kashier HPP — الـ format الرسمي من الـ docs
    // https://test-iframe.kashier.io/payment?mid=MID-xx&orderId=...
    const url = new URL(KASHIER_CONFIG.iframeBase + '/payment');
    url.searchParams.set('mid',             KASHIER_CONFIG.mid);
    url.searchParams.set('orderId',         orderId);
    url.searchParams.set('amount',          String(amount));
    url.searchParams.set('currency',        KASHIER_CONFIG.currency);
    url.searchParams.set('hash',            hash);
    url.searchParams.set('merchantRedirect',`${KASHIER_CONFIG.baseUrl}/payment-success.html?orderId=${orderId}&plan=${planCode}`);
    url.searchParams.set('merchantOrderId', orderId);
    url.searchParams.set('allowedMethods',  'card,wallet');
    url.searchParams.set('display',         'ar');
    if (customerName)  url.searchParams.set('shopper_name',  customerName);
    if (customerEmail) url.searchParams.set('shopper_email', customerEmail);

    console.log('Kashier URL:', url.toString());
    return url.toString();
}

// ── إنشاء order في DB ثم فتح Kashier HPP ────────────────────
async function initiateKashierPayment(planCode) {
    const u = window.currentUserData;
    if (!u?.company_id) return showToast('خطأ: بيانات المستخدم غير جاهزة', false);

    // جيب بيانات الخطة
    const { data: plan, error: planErr } = await window.supa
        .from('plans').select('*').eq('code', planCode).maybeSingle();

    if (planErr || !plan) return showToast('خطأ: الخطة غير موجودة', false);

    const orderId = `ORX-${u.company_id.slice(0,8)}-${Date.now()}`;
    const amount  = plan.price;

    if (!amount || amount <= 0) return showToast('هذه الخطة مجانية', false);

    // أضف loading على الزر
    const btn = document.querySelector(`[onclick*="${planCode}"]`);
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-circle-notch fa-spin"></i>'; }

    // احفظ الـ order في DB
    const { error: insErr } = await window.supa.from('payment_orders').insert({
        id:         orderId,
        company_id: u.company_id,
        plan_code:  planCode,
        amount:     amount,
        currency:   'EGP',
        status:     'pending',
    });

    if (insErr) {
        if (btn) { btn.disabled = false; btn.innerHTML = amount.toLocaleString('ar-EG') + ' ج.م/سنة'; }
        return showToast('خطأ في إنشاء الطلب: ' + insErr.message, false);
    }

    // جيب بيانات المستخدم
    const { data: { user } } = await window.supa.auth.getUser();
    const { data: userInfo  } = await window.supa.from('users').select('name').eq('id', user?.id).maybeSingle();
    const { data: compInfo  } = await window.supa.from('companies').select('name').eq('id', u.company_id).maybeSingle();

    const url = await buildKashierURL({
        orderId,
        amount,
        planCode,
        customerEmail: user?.email || '',
        customerName:  userInfo?.name || compInfo?.name || '',
    });

    window.location.href = url;
}

// ── payment-success.html — تحديث الاشتراك كـ fallback ───────
// (في حالة Test Mode أو لو الـ webhook وصل متأخر)
async function handlePaymentSuccess(supaClient) {
    const params      = new URLSearchParams(window.location.search);
    const orderId     = params.get('orderId')      || params.get('merchantOrderId');
    const planCode    = params.get('plan');
    const rawStatus   = (params.get('paymentStatus') || params.get('status') || '').toUpperCase();
    const kashierTxId = params.get('transactionId');

    if (!orderId) return { ok: false, reason: 'missing_order' };

    const isSuccess = rawStatus === 'SUCCESS';

    // حدّث الـ order في DB
    if (kashierTxId || rawStatus) {
        await supaClient.from('payment_orders').update({
            status:        isSuccess ? 'paid' : 'failed',
            kashier_tx_id: kashierTxId || null,
            paid_at:       isSuccess ? new Date().toISOString() : null,
        }).eq('id', orderId);
    }

    if (!isSuccess) return { ok: false, reason: rawStatus || 'failed' };

    // انتظر 2 ثانية للـ webhook
    await new Promise(r => setTimeout(r, 2000));

    // تحقق لو الـ webhook حدّث الاشتراك بالفعل
    const { data: order } = await supaClient
        .from('payment_orders').select('*').eq('id', orderId).maybeSingle();

    if (order?.status === 'paid' && planCode) {
        // Fallback: حدّث الاشتراك من الفرونت لو الـ webhook لم يصل
        const { data: sub } = await supaClient
            .from('subscriptions').select('plan_code').eq('company_id', order.company_id).maybeSingle();

        if (sub && sub.plan_code !== planCode) {
            const { data: plan } = await supaClient
                .from('plans').select('*').eq('code', planCode).maybeSingle();

            const now = new Date();
            const exp = new Date(now);
            exp.setDate(exp.getDate() + (plan?.duration_days || 365));

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
