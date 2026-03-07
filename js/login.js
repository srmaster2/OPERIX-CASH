/* ============================================================
   login.js — OPERIX Auth Logic
   تسجيل الدخول + تسجيل شركة جديدة + قبول دعوة
   ============================================================ */

/* ══ Dark / Light Mode — يشتغل بعد تحميل الـ DOM ══ */
(function () {
  // تطبيق الثيم على الـ body فوراً (قبل الـ DOM عشان ما يحصلش flash)
  if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-mode');
  }
})();

// تحديث الأيقونة بعد تحميل الـ DOM
document.addEventListener('DOMContentLoaded', function () {
  if (localStorage.getItem('theme') === 'light') {
    const ico = document.getElementById('themeIco');
    if (ico) ico.className = 'fa fa-sun';
  }
});

function toggleTheme() {
  const light = document.body.classList.toggle('light-mode');
  const ico = document.getElementById('themeIco');
  if (ico) ico.className = light ? 'fa fa-sun' : 'fa fa-moon';
  localStorage.setItem('theme', light ? 'light' : 'dark');
}

/* ══ التابات ══ */
const TAB_CLASSES = { login: '', register: 'tab-register', invite: 'tab-invite' };

function switchTab(tab) {
  // إخفاء كل المحتويات
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

  // إظهار المطلوب
  const content = document.getElementById('tab-' + tab);
  const btn     = document.getElementById('btn-tab-' + tab);
  if (content) content.classList.add('active');
  if (btn)     btn.classList.add('active');

  // تغيير لون الـ orb حسب التاب
  document.body.classList.remove('tab-register', 'tab-invite');
  if (TAB_CLASSES[tab]) document.body.classList.add(TAB_CLASSES[tab]);

  // حفظ التاب الحالي
  window._currentTab = tab;
}

/* ══ Toast ══ */
function toast(msg, ok = true) {
  const el = document.getElementById('toast');
  el.innerHTML = `<i class="fa fa-${ok ? 'check-circle' : 'circle-exclamation'}"></i> ${msg}`;
  el.className = `toast ${ok ? 'ok' : 'err'} show`;
  setTimeout(() => el.classList.remove('show'), 4000);
}

/* ══ Eye Toggle ══ */
function toggleEye(id, btn) {
  const inp = document.getElementById(id);
  const ico = btn.querySelector('i');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  ico.className = inp.type === 'password' ? 'fa fa-eye' : 'fa fa-eye-slash';
}

/* ══════════════════════════════════════
   1. تسجيل الدخول
══════════════════════════════════════ */
async function login() {
  if (window.LoginSecurity) {
    const blocked = window.LoginSecurity.isBlocked();
    if (blocked) { toast(`محظور مؤقتاً، حاول بعد ${blocked} دقيقة`, false); return; }
  }

  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPassword').value;
  if (!email || !pass) return toast('يرجى إدخال البريد وكلمة المرور', false);

  const btn = document.getElementById('btnLogin');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-circle-notch fa-spin" style="margin-left:8px;"></i>جاري الدخول...';

  const { error } = await window.supa.auth.signInWithPassword({ email, password: pass });

  btn.disabled = false;
  btn.innerHTML = '<i class="fa fa-bolt" style="margin-left:8px;"></i>دخول';

  if (error) {
    if (window.LoginSecurity) window.LoginSecurity.record();
    toast('بيانات خاطئة، حاول مرة أخرى', false);
  } else {
    if (window.LoginSecurity) window.LoginSecurity.reset();
    toast('تم تسجيل الدخول بنجاح ✓');
    setTimeout(() => window.location.href = 'dashboard.html', 900);
  }
}

async function forgotPassword() {
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) return toast('اكتب البريد الإلكتروني أولاً', false);
  const { error } = await window.supa.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/reset-password.html'
  });
  error ? toast('خطأ: ' + error.message, false) : toast('تم إرسال رابط إعادة التعيين');
}

/* ══════════════════════════════════════
   2. تسجيل شركة جديدة
══════════════════════════════════════ */
async function registerCompany() {
  const companyName = document.getElementById('regCompanyName').value.trim();
  const ownerName   = document.getElementById('regOwnerName').value.trim();
  const email       = document.getElementById('regEmail').value.trim();
  const pass        = document.getElementById('regPassword').value;
  const passConf    = document.getElementById('regPasswordConfirm').value;

  if (!companyName)       return toast('يرجى إدخال اسم الشركة', false);
  if (!ownerName)         return toast('يرجى إدخال اسم المدير', false);
  if (!email)             return toast('يرجى إدخال البريد الإلكتروني', false);
  if (pass.length < 8)   return toast('كلمة المرور 8 أحرف على الأقل', false);
  if (pass !== passConf) return toast('كلمتا المرور غير متطابقتين', false);

  const btn = document.getElementById('btnRegister');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-circle-notch fa-spin" style="margin-left:8px;"></i>جاري الإنشاء...';

  try {
    window.__registering = true; // منع onAuthStateChange من الـ redirect أثناء التسجيل

    // 1. إنشاء المستخدم في Supabase Auth
    const { data: authData, error: authErr } = await window.supa.auth.signUp({
      email, password: pass,
      options: { data: { name: ownerName } }
    });
    if (authErr) throw new Error(authErr.message);

    const userId = authData.user?.id;
    if (!userId) throw new Error('فشل إنشاء المستخدم');

    // 2. انتظر ثانية عشان Supabase يكمل إنشاء الـ session
    await new Promise(r => setTimeout(r, 1000));

    // 3. تسجيل الدخول عشان الـ RLS يسمح باستدعاء الدالة
    const { error: signInErr } = await window.supa.auth.signInWithPassword({ email, password: pass });
    if (signInErr) throw new Error('فشل تسجيل الدخول: ' + signInErr.message);

    // 4. استدعاء create_company_with_owner — بتعمل: شركة + فرع + خزنة + اشتراك
    const { error: fnErr } = await window.supa.rpc('create_company_with_owner', {
      p_company_name: companyName,
      p_user_id:      userId,
      p_user_email:   email,
      p_user_name:    ownerName
    });
    if (fnErr) throw new Error(fnErr.message);

    // 4. إظهار نجاح
    document.getElementById('tab-register').innerHTML = `
      <div class="success-box">
        <div class="success-icon green"><i class="fas fa-check"></i></div>
        <h3>🎉 تم إنشاء شركتك بنجاح!</h3>
        <p>تم إنشاء حسابك وفرعك الرئيسي.<br>
        <strong style="color:var(--green);">فترة تجريبية: 7 أيام مجانية</strong><br><br>
        يتم تحويلك للنظام...</p>
      </div>`;

    window.__registering = false;
    setTimeout(() => window.location.href = 'dashboard.html', 2200);

  } catch (err) {
    window.__registering = false;
    console.error(err);
    toast('خطأ: ' + err.message, false);
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-rocket" style="margin-left:8px;"></i>إنشاء الشركة والبدء';
  }
}

/* ══════════════════════════════════════
   3. قبول دعوة الموظف
══════════════════════════════════════ */
let _inviteData = null;

async function loadInvitation() {
  const token = new URLSearchParams(window.location.search).get('token');

  // لو فيه token في الـ URL → افتح تاب الدعوة تلقائياً
  if (token) {
    // إخفاء تابات الدخول والتسجيل
    document.getElementById('btn-tab-login').style.display    = 'none';
    document.getElementById('btn-tab-register').style.display = 'none';
    switchTab('invite');
    await _fetchInvite(token);
  } else {
    // مفيش دعوة — اخفي تاب الدعوة
    const inviteTab = document.getElementById('btn-tab-invite');
    if (inviteTab) inviteTab.style.display = 'none';
    switchTab('login');
  }
}

async function _fetchInvite(token) {
  const inviteContent = document.getElementById('invite-content');

  try {
    const { data: inv, error } = await window.supa
      .from('invitations')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    console.log('Invite fetch:', { inv, error });

    // تحقق من صلاحية الدعوة أولاً
    if (error) {
      inviteContent.innerHTML = `
        <div class="error-state">
          <div class="error-icon"><i class="fas fa-times"></i></div>
          <h3>خطأ في التحقق</h3>
          <p>${error.message}</p>
        </div>`;
      return;
    }
    if (!inv) {
      inviteContent.innerHTML = `
        <div class="error-state">
          <div class="error-icon"><i class="fas fa-times"></i></div>
          <h3>رابط الدعوة غير صالح</h3>
          <p>لم يتم العثور على هذه الدعوة.<br>يرجى التواصل مع مسؤول الشركة.</p>
        </div>`;
      return;
    }
    if (inv.status !== 'pending') {
      inviteContent.innerHTML = `
        <div class="error-state">
          <div class="error-icon"><i class="fas fa-check-circle" style="color:#10b981"></i></div>
          <h3>تم استخدام هذه الدعوة</h3>
          <p>تم قبول هذه الدعوة من قبل.<br>يمكنك تسجيل الدخول مباشرة.</p>
        </div>`;
      return;
    }
    if (new Date(inv.expires_at) < new Date()) {
      inviteContent.innerHTML = `
        <div class="error-state">
          <div class="error-icon"><i class="fas fa-clock" style="color:#f59e0b"></i></div>
          <h3>انتهت صلاحية الدعوة</h3>
          <p>هذا الرابط انتهت صلاحيته.<br>يرجى طلب دعوة جديدة من مسؤول الشركة.</p>
        </div>`;
      return;
    }

    _inviteData = inv;

    // جيب اسم الشركة بـ query منفصلة
    let _companyName = '—';
    try {
      const { data: co } = await window.supa
        .from('companies').select('name').eq('id', inv.company_id).maybeSingle();
      _companyName = co?.name || '—';
      console.log('Company fetch:', co);
    } catch(e) { console.warn('company fetch failed:', e); }

    const roleLabel = inv.role === 'ADMIN' ? 'مدير فرع' : 'موظف';
    const roleIcon  = inv.role === 'ADMIN' ? 'fa-user-shield' : 'fa-user';

    inviteContent.innerHTML = `
      <div class="invite-info-card">
        <div style="font-size:11px;color:var(--text2);margin-bottom:5px;">
          <i class="fas fa-envelope-open" style="color:var(--purple);margin-left:5px;"></i>دعوة للانضمام إلى
        </div>
        <div class="company-nm">${_companyName}</div>
        <div class="invite-role-badge"><i class="fas ${roleIcon}"></i> ${roleLabel}</div>
        ${inv.branches?.name ? `<div class="invite-branch">الفرع: ${inv.branches.name}</div>` : ''}
      </div>

      <div class="field">
        <label>الاسم الكامل</label>
        <div class="inp-wrap">
          <input type="text" id="invName" placeholder="اسمك كما تريد ظهوره">
          <i class="fas fa-user ico"></i>
        </div>
      </div>

      <div class="field">
        <label>البريد الإلكتروني</label>
        <div class="inp-wrap">
          <input type="email" id="invEmail" value="${inv.email}" readonly>
          <i class="fas fa-envelope ico"></i>
        </div>
      </div>

      <div class="field">
        <label>كلمة المرور</label>
        <div class="inp-wrap">
          <input type="password" id="invPassword" placeholder="8 أحرف على الأقل" class="purple-focus">
          <i class="fas fa-lock ico"></i>
          <button class="eye-btn" type="button" onclick="toggleEye('invPassword',this)"><i class="fa fa-eye"></i></button>
        </div>
      </div>

      <div class="field">
        <label>تأكيد كلمة المرور</label>
        <div class="inp-wrap">
          <input type="password" id="invPasswordConfirm" placeholder="أعد كتابة كلمة المرور" class="purple-focus">
          <i class="fas fa-lock ico"></i>
        </div>
      </div>

      <button class="btn-go btn-purple" id="btnAccept" onclick="acceptInvitation()">
        <i class="fas fa-user-check" style="margin-left:8px;"></i>قبول الدعوة والدخول
      </button>`;

  } catch (err) {
    console.error(err);
    inviteContent.innerHTML = `<div class="error-state"><div class="error-icon"><i class="fas fa-times"></i></div><h3>خطأ في التحقق</h3><p>${err.message}</p></div>`;
  }
}

async function acceptInvitation() {
  if (!_inviteData) return;

  const name     = document.getElementById('invName')?.value.trim();
  const pass     = document.getElementById('invPassword')?.value;
  const passConf = document.getElementById('invPasswordConfirm')?.value;

  if (!name)             return toast('يرجى إدخال اسمك', false);
  if (pass.length < 8)  return toast('كلمة المرور 8 أحرف على الأقل', false);
  if (pass !== passConf) return toast('كلمتا المرور غير متطابقتين', false);

  const btn = document.getElementById('btnAccept');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-circle-notch fa-spin" style="margin-left:8px;"></i>جاري الإنشاء...';

  try {
    window.__registering = true;
    const email = _inviteData.email;

    // 1. إنشاء المستخدم في Auth
    const { data: authData, error: authErr } = await window.supa.auth.signUp({
      email, password: pass,
      options: { data: { name } }
    });
    if (authErr) throw new Error(authErr.message);

    const userId = authData.user?.id;
    if (!userId) throw new Error('فشل إنشاء المستخدم');

    // 2. تسجيل الدخول أولاً عشان RLS يسمح بالـ insert
    const { error: signInErr } = await window.supa.auth.signInWithPassword({ email, password: pass });
    if (signInErr) throw new Error('فشل تسجيل الدخول: ' + signInErr.message);

    // 3. إنشاء سجل المستخدم في جدول users
    const { error: userErr } = await window.supa.from('users').upsert({
      id: userId, email, name,
      role:       _inviteData.role || 'USER',
      is_master:  false, is_owner: false,
      company_id: _inviteData.company_id,
      branch_id:  _inviteData.branch_id
    }, { onConflict: 'id' });
    if (userErr) throw new Error(userErr.message);

    // 4. حذف الدعوة بعد القبول عشان ما تظهرش في القائمة
    const { error: invDelErr } = await window.supa
        .from('invitations').delete().eq('id', _inviteData.id);
    if (invDelErr) {
        // fallback: لو الحذف فشل، حدّث الحالة
        await window.supa.from('invitations').update({ status: 'accepted' }).eq('id', _inviteData.id);
    }

    document.getElementById('tab-invite').innerHTML = `
      <div class="success-box">
        <div class="success-icon purple"><i class="fas fa-check"></i></div>
        <h3>مرحباً بك في الفريق! 🎉</h3>
        <p>تم إنشاء حسابك بنجاح.<br>جاري تحويلك للنظام...</p>
      </div>`;

    window.__registering = false;
    setTimeout(() => window.location.href = 'dashboard.html', 2000);

  } catch (err) {
    window.__registering = false;
    console.error(err);
    toast('خطأ: ' + err.message, false);
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-check" style="margin-left:8px;"></i>قبول الدعوة والدخول';
  }
}

/* ══ Preloader ══ */
window.addEventListener('load', () => {
  setTimeout(() => document.getElementById('preloader')?.classList.add('hide'), 600);
});

/* ══ Enter Key ══ */
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const tab = window._currentTab || 'login';
  if (tab === 'login')    login();
  if (tab === 'register') registerCompany();
  if (tab === 'invite')   acceptInvitation();
});

/* ══ Auto redirect لو مسجّل دخول ══ */
// window.__registering = true أثناء التسجيل — يمنع الـ redirect المبكر
window.supa?.auth.getUser().then(({ data: { user } }) => {
  if (user && !window.__r && !window.__registering) { window.__r = true; window.location.replace('dashboard.html'); }
});
window.supa?.auth.onAuthStateChange((e, s) => {
  if (s && !window.__r && !window.__registering) { window.__r = true; window.location.replace('dashboard.html'); }
});

/* ══ تشغيل loadInvitation عند فتح الصفحة ══ */
document.addEventListener('DOMContentLoaded', loadInvitation);