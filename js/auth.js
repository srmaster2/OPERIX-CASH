// ============================================================
// auth.js — Multi-Tenant Version
// ============================================================

// ── جلب بيانات المستخدم الحالي مع company_id ──
async function getCurrentUser() {
  const { data: { user } } = await window.supa.auth.getUser();
  if (!user) return { role: 'GUEST', email: '', isMaster: false };

  const { data, error } = await window.supa
    .from('users')
    .select('*, branches(name, location), companies(name, is_active)')
    .eq('email', user.email)
    .maybeSingle();

  if (!error && data) {
    // التحقق من أن الشركة فعالة
    if (data.companies && !data.companies.is_active) {
      await window.supa.auth.signOut();
      window.location.href = 'login.html?reason=suspended';
      return null;
    }

    return {
      id:          data.id,
      role:        data.role        || 'USER',
      email:       user.email,
      name:        data.name        || user.email,
      isMaster:    data.is_master   || false,
      isOwner:     data.is_owner    || false,
      branch_id:   data.branch_id   || null,
      branchName:  data.branches?.name || '',
      company_id:  data.company_id  || null,
      companyName: data.companies?.name || '',
    };
  }

  // مستخدم موجود في Auth لكن مش في جدول users
  // (ممكن يكون تسجيل قديم قبل الـ multi-tenant)
  return {
    role: 'GUEST', email: user.email,
    isMaster: false, isOwner: false,
    company_id: null, branch_id: null
  };
}

// ── جلب بيانات الاشتراك الحالي ──
async function getSubscription() {
  const user = window.currentUserData;
  if (!user?.company_id) return null;

  const { data, error } = await window.supa
    .from('subscriptions')
    .select('*, plans(name)')
    .eq('company_id', user.company_id)
    .in('status', ['active', 'trial'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

// ── التحقق من حدود الاشتراك ──
async function checkSubscriptionLimit(type) {
  // type: 'branch' | 'employee' | 'transaction'
  const sub = await getSubscription();
  if (!sub) return { allowed: false, reason: 'لا يوجد اشتراك فعال' };

  const now = new Date();
  if (sub.status === 'trial' && new Date(sub.trial_ends_at) < now)
    return { allowed: false, reason: 'انتهت الفترة التجريبية' };
  if (sub.status === 'active' && new Date(sub.expires_at) < now)
    return { allowed: false, reason: 'انتهى الاشتراك' };

  return { allowed: true, sub };
}

// ── إرسال دعوة لموظف ──
async function sendInvitation(email, role, branchId) {
  const user = window.currentUserData;
  if (!user?.company_id) return { error: 'غير مصرح' };

  // التحقق من حد الموظفين
  const { allowed, reason } = await checkSubscriptionLimit('employee');
  if (!allowed) return { error: reason };

  // التحقق من أن الإيميل مش موجود
  const { data: existing } = await window.supa
    .from('users')
    .select('id')
    .eq('email', email)
    .eq('company_id', user.company_id)
    .maybeSingle();

  if (existing) return { error: 'هذا البريد مسجّل بالفعل في شركتك' };

  // إنشاء الدعوة
  const { data, error } = await window.supa
    .from('invitations')
    .insert({
      company_id: user.company_id,
      branch_id:  branchId || user.branch_id,
      email:      email.toLowerCase().trim(),
      role:       role || 'USER',
    })
    .select('token')
    .single();

  if (error) return { error: error.message };

  const inviteUrl = `${window.location.origin}/invite.html?token=${data.token}`;
  return { success: true, url: inviteUrl, token: data.token };
}

// ── إلغاء دعوة ──
async function cancelInvitation(inviteId) {
  const { error } = await window.supa
    .from('invitations')
    .update({ status: 'expired' })
    .eq('id', inviteId)
    .eq('company_id', window.currentUserData?.company_id);

  return !error;
}

// ── جلب الدعوات المفتوحة ──
async function getPendingInvitations() {
  const user = window.currentUserData;
  if (!user?.company_id) return [];

  const { data } = await window.supa
    .from('invitations')
    .select('*, branches(name)')
    .eq('company_id', user.company_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  return data || [];
}

// ── تسجيل الدخول ──
async function signIn(email, password) {
  const { data, error } = await window.supa.auth.signInWithPassword({ email, password });
  if (error) {
    showToast('خطأ في تسجيل الدخول: ' + error.message, false);
    return false;
  }
  showToast('تم تسجيل الدخول بنجاح');
  window.location.href = 'index.html';
  return true;
}

// ── تسجيل الخروج ──
async function signOut() {
  const { error } = await window.supa.auth.signOut();
  if (error) {
    showToast('خطأ في تسجيل الخروج', false);
  } else {
    window.currentUserData = null;
    window.location.href = 'login.html';
  }
}

// ── التحقق من الصلاحيات ──
function hasPermission(user, requiredRole) {
  if (!user) return false;
  if (user.isMaster || user.isOwner) return true;
  if (requiredRole === 'USER') return true;
  if (requiredRole === 'ADMIN' && user.role === 'ADMIN') return true;
  return user.role === requiredRole;
}

// ── جلب كل المستخدمين في الشركة ──
async function getAllUsers() {
  const user = window.currentUserData;
  const { data, error } = await window.supa
    .from('users')
    .select('*, branches(name)')
    .eq('company_id', user?.company_id)
    .order('name');

  if (error) { showToast('خطأ في جلب المستخدمين: ' + error.message, false); return []; }
  return data || [];
}

// ── جلب مستخدم بالإيميل ──
async function getUserByEmail(email) {
  const { data, error } = await window.supa
    .from('users')
    .select('*')
    .eq('email', email)
    .eq('company_id', window.currentUserData?.company_id)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

// ── عرض بيانات الملف الشخصي ──
async function loadAccountData() {
  try {
    const { data: { user } } = await window.supa.auth.getUser();
    if (!user) return;

    const { data: dbUser } = await window.supa
      .from('users')
      .select('*, branches(name), companies(name)')
      .eq('email', user.email)
      .maybeSingle();

    const safe = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

    safe('displayProfileEmail',   user.email);
    safe('displayProfileName',    dbUser?.name || user.user_metadata?.name || 'غير محدد');
    safe('displayProfileCompany', dbUser?.companies?.name || '—');
    safe('displayProfileBranch',  dbUser?.branches?.name  || '—');

    const roleMap = { 'ADMIN': '🔴 مدير فرع', 'USER': '🟢 موظف' };
    const roleStr = dbUser?.is_master
      ? (dbUser?.is_owner ? '⭐ المالك' : '👑 المدير العام')
      : (roleMap[dbUser?.role] || 'موظف');
    safe('displayProfileRole', roleStr);

  } catch (err) {
    console.error('loadAccountData error:', err);
  }
}

// ── تحديث كلمة المرور ──
async function handleUpdatePassword() {
  const newPass     = document.getElementById('newPass')?.value;
  const confirmPass = document.getElementById('confirmPass')?.value;

  if (!newPass || newPass.length < 6) return showToast('يجب أن تكون كلمة المرور 6 أحرف على الأقل', false);
  if (newPass !== confirmPass)        return showToast('كلمات المرور غير متطابقة', false);

  const { error } = await window.supa.auth.updateUser({ password: newPass });
  if (error) {
    showToast('خطأ: ' + error.message, false);
  } else {
    showToast('✅ تم تحديث كلمة المرور بنجاح');
    if (document.getElementById('newPass'))     document.getElementById('newPass').value = '';
    if (document.getElementById('confirmPass')) document.getElementById('confirmPass').value = '';
  }
}

// ── فتح الإعدادات ──
function onSettingsOpen() {
  window.supa.auth.getUser().then(({ data: { user } }) => {
    if (user) {
      const el = document.getElementById('profileNameInput');
      if (el) el.value = user.user_metadata?.name || '';
    }
  });
}
