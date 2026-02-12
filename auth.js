// إدارة المصادقة والصلاحيات

// جلب بيانات المستخدم الحالي
async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { role: 'GUEST', email: '', isMaster: false };

  // نستخدم .single() هنا لأن البريد الإلكتروني فريد لكل مستخدم
  const { data, error } = await supabase.from(TABLES.users).select('*').eq('email', user.email).maybeSingle(); 
  
  if (!error && data) {
    return {
      role: data.role || 'USER',
      email: user.email,
      name: data.name || user.email,
      isMaster: data.is_master || false    };
  }
  // إذا لم يكن في جدول users أضفه كمستخدم عادي
  await supabase.from(TABLES.users).insert({
    email: user.email,
    name: user.user_metadata?.name || user.email,
    role: 'USER',
    is_master: false
  });
  return {
    role: 'USER',
    email: user.email,
    name: user.user_metadata?.name || user.email,
    isMaster: false
  };
}
// أضف هذه الدالة في ملف auth.js
async function getAllUsers() {
  const { data, error } = await supabase
    .from('users') // تأكد أن اسم الجدول هنا هو نفس الموجود في قاعدة بياناتك
    .select('*');

  if (error) {
    showToast('خطأ في جلب قائمة المستخدمين: ' + error.message, false);
    return [];
  }
  
  return data; // ستعيد لك كل الصفوف الموجودة في الجدول
}
async function renderUsersList() {
  const users = await getAllUsers(); // استدعاء الدالة الجديدة
  const container = document.getElementById('users-table-body'); // تأكد من وجود tbody بهذا الـ ID
  
  if (users.length === 0) {
    container.innerHTML = '<tr><td colspan="3">لا يوجد مستخدمين حالياً</td></tr>';
    return;
  }

  container.innerHTML = users.map(user => `
    <tr>
      <td>${user.name}</td>
      <td>${user.email}</td>
      <td>${user.role}</td>
    </tr>
  `).join('');
}
// تسجيل الدخول
async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    showToast('خطأ في تسجيل الدخول: ' + error.message, false);
    return false;
  }
  showToast('تم تسجيل الدخول بنجاح');
  window.location.href = 'index.html';
  return true;
}

// إنشاء حساب جديد
async function signUp(email, password, name) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } }
  });
  if (error) {
    showToast('خطأ في إنشاء الحساب: ' + error.message, false);
    return false;
  }
  showToast('تم إنشاء الحساب، تحقق من بريدك الإلكتروني');
  return true;
}

// تسجيل الخروج
async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    showToast('خطأ في تسجيل الخروج', false);
  } else {
    showToast('تم تسجيل الخروج');
    window.location.href = 'login.html';
  }
}

// التحقق من الصلاحيات
async function hasPermission(user, requiredRole) {
  // 1. المدير العام له كل الصلاحيات دائماً
  if (user.isMaster) return true;
  
  // 2. إذا كان المطلوب صلاحية موظف، والمنفذ أدمن، اسمح له
  if (requiredRole === 'staff' && user.role === 'admin') return true;
  
  // 3. التحقق المباشر
  return user.role === requiredRole;
}

// جلب بيانات مستخدم واحد من جدول users حسب الإيميل
async function getUserByEmail(email) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();
  if (error || !data) return null;
  return data;
}

// مثال استخدام:
// const user = await getUserByEmail('user@example.com');
// if (user) { /* بيانات المستخدم موجودة */ }