// دوال مساعدة عامة

// تنسيق الأرقام
function formatNumber(num) {
  return Number(num).toLocaleString('en-US');
}

// تنسيق التاريخ
function formatDate(date) {
  return new Date(date).toLocaleDateString('ar-EG');
}

// عرض رسائل التوست
function showToast(message, isSuccess = true) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${isSuccess ? 'success' : 'error'}`;
  toast.style.display = 'block';
  setTimeout(() => toast.style.display = 'none', 3000);
}

// إظهار/إخفاء اللودينج
function setLoading(buttonId, isLoading) {
  const btn = document.getElementById(buttonId);
  if (btn) {
    btn.disabled = isLoading;
    btn.textContent = isLoading ? 'جاري...' : btn.dataset.originalText || 'تنفيذ';
  }
}

// جلب بيانات من Supabase
async function fetchFromSupabase(table, filters = {}) {
  let query = supabase.from(table).select('*');
  Object.keys(filters).forEach(key => {
    query = query.eq(key, filters[key]);
  });
  return await query;
}

// إدراج بيانات في Supabase
async function insertToSupabase(table, data) {
  return await supabase.from(table).insert([data]);
}

async function cleanNumber(val) {
    if (typeof val === 'string') {
        return parseFloat(val.replace(/,/g, '')) || 0;
    }
    return parseFloat(val) || 0;
}

// تحديث بيانات في Supabase
async function updateSupabase(table, updates, id) {
  return await supabase.from(table).update(updates).eq('id', id);
}

// حذف بيانات من Supabase
async function deleteFromSupabase(table, id) {
  return await supabase.from(table).delete().eq('id', id);
}

// دالة اختبار الاتصال بـ Supabase
async function testSupabaseConnection() {
  try {
    const { data, error } = await supabase.from('users').select('count').limit(1);
    if (error) {
      showToast('خطأ في الاتصال بـ Supabase', false);
      return false;
    }
    showToast('الاتصال بـ Supabase يعمل بنجاح');
    return true;
  } catch (e) {
    showToast('خطأ في الاتصال: ' + e.message, false);
    return false;
  }
}
