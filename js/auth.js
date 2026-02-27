// إدارة المصادقة والصلاحيات

// جلب بيانات المستخدم الحالي
async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { role: 'GUEST', email: '', isMaster: false };

  // نستخدم .single() هنا لأن البريد الإلكتروني فريد لكل مستخدم
const { data, error } = await supabase
    .from(TABLES.users)
    .select('*, branches(name, location)')   // ← تعديل هنا
    .eq('email', user.email)
    .maybeSingle(); 

if (!error && data) {
    return {
        role: data.role || 'USER',
        email: user.email,
        name: data.name || user.email,
        isMaster: data.is_master || false,
        branch_id: data.branch_id || null,            // ← جديد
        branchName: data.branches?.name || 'الرئيسي'  // ← جديد
    };
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

// دالة لجلب البيانات عند فتح قسم الإعدادات
function onSettingsOpen() {
    window.supa.auth.getUser().then(({ data: { user } }) => {
        if (user) {
            document.getElementById('profileNameInput').value = user.user_metadata?.name || "";
        }
    });
}

// تحديث الاسم
async function handleUpdateName() {
    const newName = document.getElementById('profileNameInput').value;
    if (!newName) return showToast('يرجى إدخال اسم', false);

    const { error } = await window.supa.auth.updateUser({
        data: { name: newName }
    });

    if (error) {
        showToast('خطأ: ' + error.message, false);
    } else {
        // تحديث الاسم في جدول المستخدمين أيضاً للتقارير
        const { data: { user } } = await window.supa.auth.getUser();
        await window.supa.from('users').update({ name: newName }).eq('email', user.email);
        showToast('تم تحديث الاسم بنجاح');
    }
}

// تحديث كلمة المرور
async function handleUpdatePassword() {
    const newPass = document.getElementById('newPass').value;
    const confirmPass = document.getElementById('confirmPass').value;

    if (newPass.length < 6) return showToast('يجب أن تكون 6 رموز على الأقل', false);
    if (newPass !== confirmPass) return showToast('كلمات المرور غير متطابقة', false);

    const { error } = await window.supa.auth.updateUser({ password: newPass });

    if (error) {
        showToast('حدث خطأ: ' + error.message, false);
    } else {
        showToast('تم تغيير كلمة المرور بنجاح');
        togglePasswordFields();
        document.getElementById('newPass').value = '';
        document.getElementById('confirmPass').value = '';
    }
}

// إظهار وإخفاء حقول الباسورد
function togglePasswordFields() {
    const div = document.getElementById('passwordFields');
    div.style.display = (div.style.display === 'none') ? 'block' : 'none';
}
// 1. دالة لجلب البيانات الحالية عند فتح الإعدادات
async function loadAccountData() {
    try {
        // جلب بيانات المستخدم من الـ Auth
        const { data: { user }, error: authError } = await window.supa.auth.getUser();
        if (authError || !user) return;

        // جلب بيانات المستخدم من جدول users لضمان الحصول على الاسم الصحيح
        const { data: dbUser } = await window.supa
            .from('users')
            .select('*')
            .eq('email', user.email)
            .maybeSingle();

        // تعبئة الحقول
        if (document.getElementById('profileEmailInput')) {
            document.getElementById('profileEmailInput').value = user.email;
        }
        
        const nameInput = document.getElementById('profileNameInput');
        if (nameInput) {
            // الأولوية لاسم الجدول، ثم ميتاداتا الحساب، ثم الجزء الأول من الإيميل
            nameInput.value = dbUser?.name || user.user_metadata?.name || user.email.split('@')[0];
        }
    } catch (err) {
        console.error("Error loading profile:", err);
    }
}

// 2. دالة تحديث الاسم
async function handleUpdateName() {
    const newName = document.getElementById('profileNameInput').value;
    if (!newName) return showToast('يرجى إدخال اسم', false);

    // تحديث في الـ Auth Metadata
    const { error: authError } = await window.supa.auth.updateUser({
        data: { name: newName }
    });

    // تحديث في جدول الـ users
    const { data: { user } } = await window.supa.auth.getUser();
    const { error: dbError } = await window.supa
        .from('users')
        .update({ name: newName })
        .eq('email', user.email);

    if (authError || dbError) {
        showToast('فشل تحديث الاسم', false);
    } else {
        showToast('تم تحديث الاسم بنجاح');
        // تحديث الاسم في واجهة البرنامج العلوية إذا وجد
        const topName = document.querySelector('.user-name'); 
        if(topName) topName.innerText = newName;
    }
}

// 3. دالة تحديث كلمة المرور
async function handleUpdatePassword() {
    const newPass = document.getElementById('newPass').value;
    const confirmPass = document.getElementById('confirmPass').value;

    if (newPass.length < 6) {
        showToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل', false);
        return;
    }
    if (newPass !== confirmPass) {
        showToast('كلمات المرور غير متطابقة', false);
        return;
    }

    const { error } = await window.supa.auth.updateUser({ password: newPass });

    if (error) {
        showToast('خطأ: ' + error.message, false);
    } else {
        showToast('تم تغيير كلمة المرور بنجاح');
        togglePasswordFields(); // إغلاق القائمة
        document.getElementById('newPass').value = '';
        document.getElementById('confirmPass').value = '';
    }
}

// 4. دالة إظهار وإخفاء حقول كلمة المرور
function togglePasswordFields() {
    const fields = document.getElementById('passwordFields');
    fields.style.display = fields.style.display === 'none' ? 'block' : 'none';
}
/**
 * جلب وعرض بيانات العميل كاملة
 */
async function loadAccountData() {
    try {
        // 1. جلب المستخدم من نظام المصادقة
        const { data: { user }, error: authError } = await window.supa.auth.getUser();
        if (authError || !user) return;

        // 2. جلب بياناته التفصيلية من جدول users
        const { data: dbUser, error: dbError } = await window.supa
            .from('users')
            .select('*')
            .eq('email', user.email)
            .maybeSingle();

        // 3. عرض البيانات في الواجهة
        document.getElementById('displayProfileEmail').innerText = user.email;
        document.getElementById('displayProfileName').innerText = dbUser?.name || user.user_metadata?.name || "غير محدد";
        
        // عرض الرتبة بشكل أنيق
        const roleStr = dbUser?.role === 'admin' ? 'مدير نظام' : (dbUser?.is_master ? 'المدير العام' : 'موظف');
        document.getElementById('displayProfileRole').innerText = roleStr;

    } catch (err) {
        console.error("Error loading account data:", err);
    }
}

/**
 * تحديث كلمة المرور فقط
 */
async function handleUpdatePassword() {
    const newPass = document.getElementById('newPass').value;
    const confirmPass = document.getElementById('confirmPass').value;

    // التحقق من المدخلات
    if (!newPass || newPass.length < 6) {
        showToast('يجب أن تكون كلمة المرور 6 أحرف على الأقل', false);
        return;
    }
    if (newPass !== confirmPass) {
        showToast('كلمات المرور غير متطابقة', false);
        return;
    }

    // تنفيذ التحديث في Supabase Auth
    const { error } = await window.supa.auth.updateUser({ password: newPass });

    if (error) {
        showToast('خطأ: ' + error.message, false);
    } else {
        showToast('✅ تم تحديث كلمة المرور بنجاح');
        // تفريغ الحقول بعد النجاح
        document.getElementById('newPass').value = '';
        document.getElementById('confirmPass').value = '';
    }
}
// مثال لمكان الاستدعاء في نظام التنقل الخاص بك
async function showSection(sectionId) {
    // إخفاء جميع الأقسام أولاً
    document.querySelectorAll('.view-section').forEach(section => {
        section.style.display = 'none';
    });

    // إظهار القسم المطلوب
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.style.display = 'block';
    }

    // --- التعديل الجديد هنا ---
    if (sectionId === 'view-settings') {
        loadAccountData(); // استدعاء جلب بيانات العميل فور فتح الإعدادات
    }
}
function toggleTheme() {

    const body = document.body;

    const themeIcon = document.getElementById('themeIcon');

    

    // تبديل الكلاس

    body.classList.toggle('light-mode');

    

    // تغيير الأيقونة وحفظ الإعداد

    if (body.classList.contains('light-mode')) {

        themeIcon.classList.replace('fa-moon', 'fa-sun');

        localStorage.setItem('theme', 'light');

    } else {

        themeIcon.classList.replace('fa-sun', 'fa-moon');

        localStorage.setItem('theme', 'dark');

    }

}

// عند تحميل الصفحة: استرجاع الثيم المفضل للمستخدم

document.addEventListener('DOMContentLoaded', () => {

    const savedTheme = localStorage.getItem('theme');

    if (savedTheme === 'light') {

        document.body.classList.add('light-mode');

        document.getElementById('themeIcon').classList.replace('fa-moon', 'fa-sun');

    }

});
