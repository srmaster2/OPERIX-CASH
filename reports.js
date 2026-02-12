// التقارير والإحصائيات
// حساب الإحصائيات الأساسية (مستخدم في أماكن بسيطة)
async function calculateStats() {
  const accounts = await loadAccounts();
  const transactions = await loadTransactions(1000);

  let stats = {
    totalBalance: 0,
    totalTransactions: transactions.length,
    totalProfit: 0
  };

  accounts.forEach(acc => {
    stats.totalBalance += Number(acc.balance) || 0;
  });

  transactions.forEach(tx => {
    stats.totalProfit += Number(tx.commission) || 0;
  });

  return stats;
}

// تقرير يومي
async function getDailyReport(date) {
  const { data, error } = await supabase
    .from(TABLES.transactions)
    .select('*')
    .gte('date', date)
    .lt('date', new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  if (error) return [];
  return data;
}

// تقرير شهري
async function getMonthlyReport(month, year) {
  const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from(TABLES.transactions)
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate);
  if (error) return [];
  return data;
}

// Dashboard Stats — تجميع شامل لأرقام الداشبورد من Supabase
async function getDashboardStats() {
  try {
    // 1. جلب الحسابات (الخزنة، المحافظ، الشركات) - كما هي في كودك
    const { data: accountsRaw, error: accErr } = await supabase.from(TABLES.accounts).select('*');
    if (accErr) throw accErr;

    const accounts = (accountsRaw || []).filter(a => !a.deleted);
    let cashBal = 0, walletBal = 0, compBal = 0;
    let breakdown = { fawry: 0, maksab: 0, moshtrayat: 0 };

    accounts.forEach(acc => {
      const name = (acc.name || '').toLowerCase().trim();
      const bal = Number(acc.balance) || 0;
      const limit = Number(acc.daily_limit || acc.limit_out || 0);

      if (name.includes('الخزنة') || name.includes('كاش') || name.includes('cash')) {
        cashBal += bal;
      } else if (limit >= 900000000 || name.includes('فوري') || name.includes('fawry') || name.includes('مكسب') || name.includes('maksab') || name.includes('مشتريات')) {
        compBal += bal;
        if (name.includes('فوري') || name.includes('fawry')) breakdown.fawry += bal;
        else if (name.includes('مكسب') || name.includes('maksab')) breakdown.maksab += bal;
        else if (name.includes('مشتريات')) breakdown.moshtrayat += bal;
      } else {
        walletBal += bal;
      }
    });

    // 2. جلب مديونيات العملاء - كما هي في كودك
    const { data: clients } = await supabase.from('clients').select('name, balance');
    let oweMe = 0, have = 0, clientsCards = [];
    (clients || []).forEach(c => {
      const b = Number(c.balance) || 0;
      if (b > 0) oweMe += b; 
      else if (b < 0) have += Math.abs(b);
      if (b !== 0) clientsCards.push({ name: c.name, balance: b });
    });

    // 3. تجهيز التواريخ
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    const todayStr = `${d}/${m}/${y}`;
    const monthStr = `/${m}/${y}`;

    // --- 4. جلب "كل" عمليات الشهر (حل مشكلة الـ 10 آلاف صف) ---
    let allMonthTxs = [];
    let from = 0;
    let to = 999;
    let hasMore = true;

    while (hasMore) {
      const { data: part, error: txErr } = await supabase
        .from(TABLES.transactions)
        .select('commission, amount, type, date')
        .ilike('date', `%${monthStr}`)
        .range(from, to); // جلب البيانات على أجزاء 1000 بـ 1000

      if (txErr) throw txErr;
      if (!part || part.length === 0) {
        hasMore = false;
      } else {
        allMonthTxs = allMonthTxs.concat(part);
        if (part.length < 1000) hasMore = false; // إذا رجع أقل من 1000 يعني خلصنا
        from += 1000;
        to += 1000;
      }
    }

    // 5. الحساب اليدوي من المصفوفة الكاملة لضمان الدقة
    let dP = 0, mP = 0, ex = 0;

    allMonthTxs.forEach(tx => {
      const txDate = (tx.date || "").trim();
      const type = (tx.type || "").toLowerCase().trim();
      const comm = parseFloat(tx.commission) || 0;
      const amt = parseFloat(tx.amount) || 0;

      // أ - حساب الأرباح
      if (comm !== 0) {
        if (txDate === todayStr) dP += comm;
        mP += comm;
      }

      // ب - حساب المصروفات
      const isExpense = type.includes('مصروف') || 
                        type.includes('مصاريف') || 
                        type.includes('خارج') || 
                        type.includes('عجز');
      if (isExpense) {
        ex += amt;
      }
    });

    // 6. إرجاع النتائج النهائية
    return {
      success: true, 
      cash: cashBal, walletsTotal: walletBal, compTotal: compBal,
      totalAvailable: cashBal + walletBal + compBal,
      grandTotal: (cashBal + walletBal + compBal + oweMe) - have,
      oweMe, have, dP, mP, ex, breakdown,
      clientsCards: clientsCards.sort((a,b) => Math.abs(b.balance) - Math.abs(a.balance)).slice(0, 6)
    };

  } catch (err) {
    console.error("Dashboard Error:", err);
    return { success: false };
  }
}
// متغير عالمي لتخزين رصيد السيستم

/**
 * 1. حساب الإجمالي وتحديث الواجهة
 */
// 1. التعريفات الأساسية
// أضف هذا في أعلى ملف reports.js و app.js
const STORAGE_KEY = 'sadek_cash_temp_data';
if (typeof window.denominations === 'undefined') {
    window.denominations = [200, 100, 50, 20, 10, 5, 1]; // الفئات الافتراضية
}
// تعديل دالة fetchVaultBalance لتجنب الأخطاء
async function fetchVaultBalance() {
    const valSpan = document.getElementById('system-vault-val');
    const refreshBtn = document.querySelector('.fa-sync-alt'); // أيقونة الزر
    
    if (refreshBtn) refreshBtn.classList.add('fa-spin'); // بدء الدوران

    try {
        const { data, error } = await window.supa
            .from('accounts')
            .select('balance')
            .ilike('name', '%الخزنة%')
            .maybeSingle();

        if (error) throw error;

        // تحديث المتغير العالمي
        vaultBalanceFromSystem = data ? parseFloat(data.balance) : 0;
        
        if (valSpan) {
            valSpan.innerText = vaultBalanceFromSystem.toLocaleString('en-US') + " ج.م";
        }
        
        // تشغيل المقارنة فوراً بعد جلب الرصيد
        calculateTotalCash();

    } catch (err) {
        console.error("Vault fetch error:", err);
        if (valSpan) valSpan.innerText = "خطأ في الجلب";
    } finally {
        if (refreshBtn) refreshBtn.classList.remove('fa-spin'); // إيقاف الدوران
    }
}/**
 * 3. رسم واجهة الفئات (Inputs)
 */
function renderCounter() {
    const container = document.getElementById('denominations-container');
    if (!container) return;

    container.innerHTML = window.denominations.map(unit => `
        <div class="col-6 col-md-4">
            <div class="p-2 border rounded-4 bg-white shadow-sm mb-2">
                <div class="d-flex justify-content-between align-items-center mb-2 px-1">
                    <span class="fw-bold text-dark small" style="white-space: nowrap;">فئة ${unit}</span>
                    <span class="badge rounded-pill bg-primary-subtle text-primary border-primary-subtle english-num" 
                          id="subtotal-${unit}" style="font-size: 10px;">0</span>
                </div>
                <input type="number" 
                       inputmode="numeric"
                       class="form-control form-control-sm text-center fw-bold english-num denom-input" 
                       placeholder="عدد الورق" 
                       data-unit="${unit}" 
                       oninput="updateSubtotal(this)"
                       style="border-radius: 10px; background: #f8fafc;">
            </div>
        </div>
    `).join('');
}

// --- 1. دالة التحديث الفوري للعداد والمجموع ---
function updateSubtotal(input) {
    const unit = parseFloat(input.dataset.unit);
    const count = parseFloat(input.value) || 0;
    const subtotalElement = document.getElementById(`subtotal-${unit}`);

    const total = unit * count;

    if (subtotalElement) {
        subtotalElement.innerText = total.toLocaleString();
        if (total > 0) {
            subtotalElement.classList.replace('bg-primary-subtle', 'bg-primary');
            subtotalElement.classList.replace('text-primary', 'text-white');
        } else {
            subtotalElement.classList.replace('bg-primary', 'bg-primary-subtle');
            subtotalElement.classList.replace('text-white', 'text-primary');
        }
    }
    calculateTotalCash(); // استدعاء الجمع الإجمالي والمقارنة
}

// --- 2. دالة حساب الإجمالي والمقارنة بالسيستم ---
async function calculateTotalCash() {
    let grandTotal = 0;
    const inputs = document.querySelectorAll('.denom-input');
    let detailsArr = [];

    inputs.forEach(input => {
        const unit = parseFloat(input.dataset.unit);
        const count = parseFloat(input.value) || 0;
        const sub = unit * count;
        grandTotal += sub;
        if (count > 0) detailsArr.push(`${unit}x${count}=${sub}`);
    });

    // تحديث الرقم الكبير
    document.getElementById('total-cash').innerText = grandTotal.toLocaleString();

    // جلب رصيد السيستم من الشاشة
    const systemBalText = document.getElementById('system-vault-val').innerText;
    const systemBalance = parseFloat(systemBalText.replace(/,/g, '').replace(' ج.م', '')) || 0;

    const diff = grandTotal - systemBalance;
    const badge = document.getElementById('reconciliation-badge');
    
    if (grandTotal > 0) {
        badge.style.display = 'block';
        const diffValueLabel = document.getElementById('diff-value');
        const diffTextLabel = document.getElementById('diff-label');

        if (Math.abs(diff) < 1) {
            badge.style.background = "#10b981"; // أخضر
            diffTextLabel.innerText = "الحالة: مطابق ✨";
            diffValueLabel.innerText = "0";
        } else if (diff < 0) {
            badge.style.background = "#ef4444"; // أحمر
            diffTextLabel.innerText = "عجز بقيمة:";
            diffValueLabel.innerText = Math.abs(diff).toLocaleString() + " -";
        } else {
            badge.style.background = "#3b82f6"; // أزرق
            diffTextLabel.innerText = "زيادة بقيمة:";
            diffValueLabel.innerText = diff.toLocaleString() + " +";
        }
    } else {
        badge.style.display = 'none';
    }

    // حفظ للارسال
    window.lastInventoryData = { grandTotal, systemBalance, diff, details: detailsArr.join(' - ') };
}
// --- 3. دالة تبديل التبويبات (إصلاح مشكلة عدم الفتح) ---
function switchInventoryTab(tabName) {
    const counterTab = document.getElementById('inventory-tab-counter');
    const logsTab = document.getElementById('inventory-tab-logs');
    const btnCounter = document.getElementById('tab-btn-counter');
    const btnLogs = document.getElementById('tab-btn-logs');

    if (tabName === 'counter') {
        counterTab.style.display = 'block';
        logsTab.style.display = 'none';
        btnCounter.className = "btn btn-sm flex-fill rounded-pill fw-bold shadow-sm py-2 bg-white text-primary border";
        btnLogs.className = "btn btn-sm flex-fill rounded-pill fw-bold shadow-sm py-2 bg-light text-muted border-0";
    } else {
        counterTab.style.display = 'none';
        logsTab.style.display = 'block';
        btnLogs.className = "btn btn-sm flex-fill rounded-pill fw-bold shadow-sm py-2 bg-white text-primary border";
        btnCounter.className = "btn btn-sm flex-fill rounded-pill fw-bold shadow-sm py-2 bg-light text-muted border-0";
        loadInventoryLogs(); 
    }
}
// --- 4. دالة اعتماد وحفظ الجرد في القاعدة ---
// دالة مساعدة لإظهار رسائل النظام (بدلاً من المتصفح)
 
function showSystemToast(title, icon = 'success') {
    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer)
            toast.addEventListener('mouseleave', Swal.resumeTimer)
        }
    });

    Toast.fire({
        icon: icon,
        title: title
    });
}
// دالة تسجيل الجرد المحدثة
async function submitInventory() {
    // التأكد من وجود بيانات
    if (!window.lastInventoryData || window.lastInventoryData.grandTotal <= 0) {
        Swal.fire({
            title: 'تنبيه',
            text: 'لا يمكن تسجيل جرد فارغ، يرجى إدخال الفئات أولاً',
            icon: 'warning',
            confirmButtonText: 'موافق',
            customClass: { confirmButton: 'btn btn-warning rounded-pill px-4' }
        });
        return;
    }

    const { grandTotal, systemBalance, diff, details } = window.lastInventoryData;

    // رسالة التأكيد من السيستم
    Swal.fire({
        title: 'تأكيد عملية الحفظ',
        html: `
            <div style="text-align: right; direction: rtl;">
                <p><b>إجمالي الجرد:</b> ${grandTotal.toLocaleString()} ج.م</p>
                <p><b>رصيد السيستم:</b> ${systemBalance.toLocaleString()} ج.م</p>
                <p><b>الفارق:</b> <span style="color: ${diff < 0 ? 'red' : 'green'}">${diff.toLocaleString()} ج.م</span></p>
            </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'تأكيد الحفظ',
        cancelButtonText: 'إلغاء',
        customClass: {
            confirmButton: 'btn btn-primary rounded-pill px-4 me-2',
            cancelButton: 'btn btn-light rounded-pill px-4'
        },
        buttonsStyling: false
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                // إظهار علامة تحميل (Loading)
                Swal.showLoading();

                // جلب اسم المستخدم
const { data: { user } } = await window.supa.auth.getUser();

// تعديل هذا السطر بدقة:
const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "موظف غير معروف";
                // الحفظ في قاعدة البيانات
                const { error } = await window.supa.from('inventory_logs').insert([{
                    system_balance: systemBalance,
                    actual_balance: grandTotal,
                    diff: diff,
                    details: details,
                    user_name: userName
                }]);

                if (error) throw error;

                // رسالة نجاح (Toast)
                showSystemToast("تم تسجيل الجرد بنجاح");
                
                resetCounter();
                loadInventoryLogs();
                switchInventoryTab('logs');

            } catch (e) {
                Swal.fire('خطأ!', e.message, 'error');
            }
        }
    });
}

async function calculateTotalCash() {
    let grandTotal = 0;
    const inputs = document.querySelectorAll('.denom-input');
    let detailsArr = [];

    inputs.forEach(input => {
        const unit = parseFloat(input.dataset.unit);
        const count = parseFloat(input.value) || 0;
        const sub = unit * count;
        grandTotal += sub;
        if (count > 0) detailsArr.push(`${unit}x${count}=${sub}`);
    });

    // تحديث الرقم الكبير في الواجهة
    document.getElementById('total-cash').innerText = grandTotal.toLocaleString();

    // جلب رصيد السيستم وتنظيفه من أي نصوص
    const systemBalElement = document.getElementById('system-vault-val');
    const systemBalance = parseArabicNumber(systemBalElement.innerText);

    const diff = grandTotal - systemBalance;
    const badge = document.getElementById('reconciliation-badge');
    const diffValueLabel = document.getElementById('diff-value');
    const diffTextLabel = document.getElementById('diff-label');

    // إظهار المقارنة فقط إذا بدأ المستخدم في العد
    if (grandTotal > 0 || inputs.length > 0) {
        badge.style.display = 'block';
        
        if (Math.abs(diff) < 0.1) {
            badge.style.background = "#10b981"; // أخضر للمطابق
            diffTextLabel.innerText = "الحالة: مطابق للسيستم ✨";
            diffValueLabel.innerText = "0";
        } else if (diff < 0) {
            badge.style.background = "#ef4444"; // أحمر للعجز
            diffTextLabel.innerText = "النتيجة: عجز بقيمة";
            diffValueLabel.innerText = Math.abs(diff).toLocaleString() + " -";
        } else {
            badge.style.background = "#3b82f6"; // أزرق للزيادة
            diffTextLabel.innerText = "النتيجة: زيادة بقيمة";
            diffValueLabel.innerText = diff.toLocaleString() + " +";
        }
    } else {
        badge.style.display = 'none';
    }

    // تخزين البيانات المسجلة للإرسال
    window.lastInventoryData = { 
        grandTotal, 
        systemBalance, 
        diff, 
        details: detailsArr.join(' - ') 
    };
}/**
 * 5. تحديث واجهة المقارنة (Badge)
 */
function updateReconciliationUI(grandTotal, denomDetails) {
    const badge = document.getElementById('reconciliation-badge');
    const label = document.getElementById('diff-label');
    const value = document.getElementById('diff-value');
    
    if (!badge) return;

    if (grandTotal === 0 && vaultBalanceFromSystem === 0) {
        badge.style.display = 'none';
        return;
    }

    badge.style.display = 'block';
    const diff = grandTotal - vaultBalanceFromSystem; 
    const detailsString = denomDetails.join(' - ');

    const saveBtnHtml = `
        <div class="mt-3 pt-3" style="border-top: 1px dashed rgba(255,255,255,0.4)">
            <button id="btnSaveInventory" class="btn w-100 fw-bold shadow-sm" 
                    style="background: rgba(255,255,255,0.2); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); color: white; border-radius: 12px; padding: 10px; font-size: 13px;"
                    onclick="saveInventoryToSupabase(${vaultBalanceFromSystem}, ${grandTotal}, ${diff}, '${detailsString}')">
                <i class="fas fa-check-circle me-1"></i> اعتماد وتسجيل الجرد في السجل
            </button>
        </div>`;

    if (Math.abs(diff) < 1) { 
        badge.style.background = 'linear-gradient(135deg, #059669, #10b981)';
        label.innerHTML = '✨ جرد مطابق';
        value.innerHTML = '0' + saveBtnHtml;
    } else if (diff < 0) { 
        badge.style.background = 'linear-gradient(135deg, #dc2626, #ef4444)';
        label.innerHTML = '⚠️ عجز:';
        value.innerHTML = Math.abs(diff).toLocaleString() + ' ج.م' + saveBtnHtml;
    } else { 
        badge.style.background = 'linear-gradient(135deg, #2563eb, #3b82f6)';
        label.innerHTML = '💰 زيادة:';
        value.innerHTML = diff.toLocaleString() + ' ج.م' + saveBtnHtml;
    }
}

/**
 * 6. استعادة البيانات وتصفيرها
 */
function restoreInventoryData() {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const data = JSON.parse(saved);
    document.querySelectorAll('.denom-input').forEach(input => {
        const unit = input.getAttribute('data-unit');
        if (data[unit]) input.value = data[unit];
    });
    calculateTotalCash();
}

function resetCounter() {
    // إظهار نافذة تأكيد من السيستم
    Swal.fire({
        title: 'تصفير الحاسبة؟',
        text: "سيتم مسح جميع الأرقام المدخلة في الفئات حالاً",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، تصفير',
        cancelButtonText: 'إلغاء',
        customClass: {
            confirmButton: 'btn btn-danger rounded-pill px-4 me-2',
            cancelButton: 'btn btn-light rounded-pill px-4'
        },
        buttonsStyling: false
    }).then((result) => {
        if (result.isConfirmed) {
            // 1. مسح جميع خانات الإدخال
            const inputs = document.querySelectorAll('.denom-input');
            inputs.forEach(input => input.value = '');

            // 2. تصفير العدادات الصغيرة (Badges)
            const subtotals = document.querySelectorAll('.sub-total');
            subtotals.forEach(span => {
                span.innerText = '0';
                // إعادة اللون الأصلي للبادج
                span.classList.replace('bg-primary', 'bg-primary-subtle');
                span.classList.replace('text-white', 'text-primary');
            });

            // 3. تحديث الإجمالي الكبير والمقارنة
            calculateTotalCash();

            // 4. إظهار رسالة نجاح خفيفة (Toast)
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 2000,
                timerProgressBar: true
            });
            Toast.fire({
                icon: 'success',
                title: 'تم تصفير الحاسبة بنجاح'
            });
        }
    });
}
/**
 * 7. حفظ الجرد في السجل (Supabase)
 */
async function saveInventoryToSupabase(sys, act, diff, details) {
    if (!confirm("تأكيد حفظ الجرد في السجل؟")) return;

    setLoading('btnSaveInventory', true);
    try {
        const { data: { user } } = await window.supa.auth.getUser();
        
        const { error } = await window.supa
            .from('inventory_logs')
            .insert([{
                system_balance: sys,
                actual_balance: act,
                diff: diff,
                details: details,
                user_name: user?.user_metadata?.name || user?.email
            }]);

        if (error) throw error;

        showToast("تم تسجيل الجرد بنجاح");
        sessionStorage.removeItem(STORAGE_KEY);
        resetCounter();
    } catch (err) {
        showToast("خطأ: " + err.message, false);
    } finally {
        setLoading('btnSaveInventory', false);
    }
}

// تعديل دالة التنقل showView (تأكد من وجودها في app.js)
const oldShowView = window.showView;
window.showView = function(v) {
    if (typeof oldShowView === 'function') oldShowView(v);
    if (v === 'counter') {
        renderCounter();
        fetchVaultBalance();
    }
};
// تعريف الدالة التي يطلبها النظام لتجنب توقف الكود
async function loadDenominations() {
    // إذا لم يكن لديك جدول فئات، سنستخدم الفئات الثابتة مباشرة
    if (typeof renderCounter === 'function') {
        renderCounter();
    }
}
function switchInventoryTab(tabName) {
    const counterTab = document.getElementById('inventory-tab-counter');
    const logsTab = document.getElementById('inventory-tab-logs');
    const btnCounter = document.getElementById('tab-btn-counter');
    const btnLogs = document.getElementById('tab-btn-logs');

    if (tabName === 'counter') {
        counterTab.style.display = 'block';
        logsTab.style.display = 'none';
        
        // تحديث استايل الأزرار
        btnCounter.className = "btn btn-sm flex-fill rounded-pill fw-bold shadow-sm py-2 bg-white text-primary border";
        btnLogs.className = "btn btn-sm flex-fill rounded-pill fw-bold shadow-sm py-2 bg-light text-muted border-0";
    } else {
        counterTab.style.display = 'none';
        logsTab.style.display = 'block';
        
        // تحديث استايل الأزرار
        btnLogs.className = "btn btn-sm flex-fill rounded-pill fw-bold shadow-sm py-2 bg-white text-primary border";
        btnCounter.className = "btn btn-sm flex-fill rounded-pill fw-bold shadow-sm py-2 bg-light text-muted border-0";
        
        // جلب البيانات من السيستم فور فتح التبويب
        loadInventoryLogs();
    }
}

async function loadInventoryLogs() {
    const listContainer = document.getElementById('inventory-logs-list');
    const icon = document.getElementById('log-refresh-icon');
    
    // إظهار تأثير التحميل
    if (icon) icon.classList.add('fa-spin');
    if (!listContainer.innerHTML) {
        listContainer.innerHTML = '<div class="text-center py-4 text-muted small">جاري جلب البيانات...</div>';
    }

    try {
        const { data, error } = await window.supa
            .from('inventory_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        let html = '';
        if (!data || data.length === 0) {
            html = '<div class="text-center py-5 text-muted">لا يوجد سجلات حالياً</div>';
        } else {
            data.forEach(log => {
                const date = new Date(log.created_at);
                const diff = parseFloat(log.diff) || 0;
                
                // تنسيق الحالة
                let statusBadge = '';
                if (Math.abs(diff) < 1) {
                    statusBadge = '<span class="badge bg-success-subtle text-success border-0 rounded-pill px-3">مطابق ✨</span>';
                } else if (diff < 0) {
                    statusBadge = `<span class="badge bg-danger-subtle text-danger border-0 rounded-pill px-2">عجز: ${Math.abs(diff).toLocaleString()}</span>`;
                } else {
                    statusBadge = `<span class="badge bg-primary-subtle text-primary border-0 rounded-pill px-2">زيادة: ${diff.toLocaleString()}</span>`;
                }

                html += `
                <div class="log-card shadow-sm border rounded-4 p-3 mb-2 bg-white d-flex align-items-center">
                    <div class="col-4 text-start">
                        <div class="fw-bold text-dark small">${date.toLocaleDateString('ar-EG')}</div>
                        <div class="text-muted" style="font-size: 10px;">${date.toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'})}</div>
                    </div>
                    <div class="col-5 text-center">${statusBadge}</div>
                    <div class="col-3 text-end d-flex justify-content-end gap-1">
                        <button class="btn btn-action view" onclick='openLogModal(${JSON.stringify(log)})' title="التفاصيل">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-action delete" onclick="deleteInventoryLog('${log.id}')" title="حذف">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>`;
            });
        }
        listContainer.innerHTML = html;
    } catch (e) {
        console.error("Error loading logs:", e);
        listContainer.innerHTML = '<div class="alert alert-danger m-2 small text-center">خطأ في الاتصال بالقاعدة</div>';
    } finally {
        if (icon) icon.classList.remove('fa-spin');
    }
}
function openLogModal(log) {
    // التأكد من وجود العناصر قبل الكتابة فيها لمنع الخطأ
    const dateHead = document.getElementById('modal-date-head');
    const user = document.getElementById('modal-user');
    const system = document.getElementById('modal-system');
    const actual = document.getElementById('modal-actual');
    const detailsList = document.getElementById('modal-details-list');

    if (dateHead) dateHead.innerText = new Date(log.created_at).toLocaleString('ar-EG');
    if (user) user.innerText = log.user_name || 'غير معروف';
    if (system) system.innerText = Number(log.system_balance || 0).toLocaleString() + ' ج.م';
    if (actual) actual.innerText = Number(log.actual_balance || 0).toLocaleString() + ' ج.م';

    // تحديث تفاصيل الفئات
    if (detailsList) {
        if (log.details) {
            const items = log.details.split(' - ');
            detailsList.innerHTML = items.map(item => `<div class="denom-tag border p-1 rounded bg-light small px-2">${item}</div>`).join('');
        } else {
            detailsList.innerHTML = '<span class="text-muted small">لا توجد تفاصيل</span>';
        }
    }

    // إظهار المودال
    const modal = document.getElementById('logDetailsModal');
    if (modal) modal.classList.add('active');
    else console.error("عنصر logDetailsModal غير موجود في الـ HTML");
}

function closeLogModal() {
    document.getElementById('logDetailsModal').classList.remove('active');
}
// دالة إظهار التفاصيل (زر الفارق)
function viewLogDetails(user, details) {
    const content = `المسؤول: ${user}\n\nالتفاصيل:\n${details}`;
    if (window.Swal) {
        Swal.fire({
            title: 'تفاصيل عملية الجرد',
            html: `<div style="text-align: right; font-size: 14px;"><b>المسؤول:</b> ${user}<br><hr>${details.replace(/-/g, '<br>')}</div>`,
            icon: 'info',
            confirmButtonText: 'إغلاق'
        });
    } else {
        alert(content);
    }
}// دالة مساعدة لعرض التفاصيل

// تأكد من تعريف هذا المتغير في أعلى الملف
function renderAdminDenomsList() {
    const listContainer = document.getElementById('delete-denoms-list');
    if (!listContainer) return;

    let html = '';
    // denominations هي المصفوفة التي نستخدمها في حاسبة العد
    window.denominations.forEach(unit => {
        html += `
        <div class="badge bg-white text-dark border p-2 d-flex align-items-center gap-2 shadow-sm" style="border-radius: 10px;">
            <span class="fw-bold">${unit} ج.م</span>
            <i class="fas fa-times-circle text-danger" style="cursor: pointer;" onclick="deleteDenomination(${unit})" title="حذف الفئة"></i>
        </div>`;
    });
    listContainer.innerHTML = html || '<span class="text-muted small">لا توجد فئات مضافة</span>';
}
async function deleteInventoryLog(logId) {
    // استخدام Swal إذا كان متاحاً لشكل احترافي
    const confirmDelete = confirm("هل أنت متأكد من حذف هذا السجل؟ لا يمكن التراجع.");
    if (!confirmDelete) return;

    try {
        const { error } = await window.supa
            .from('inventory_logs')
            .delete()
            .eq('id', logId);

        if (error) throw error;

        // تحديث القائمة فوراً بعد الحذف (تحديث تلقائي)
        loadInventoryLogs();
        
        if (window.showToast) showToast("تم حذف السجل بنجاح");
        else alert("تم حذف السجل بنجاح");

    } catch (e) {
        console.error("Delete error:", e);
        alert("فشل الحذف: تأكد من صلاحيات قاعدة البيانات");
    }
}

// التحديث التلقائي كل 30 ثانية عند فتح تبويب السجل
setInterval(() => {
    const logsTab = document.getElementById('inventory-tab-logs');
    if (logsTab && logsTab.style.display !== 'none') {
        loadInventoryLogs();
    }
}, 30000);

/**
 * تحديث رصيد السيستم مع إظهار توست
 */
async function refreshVaultWithToast() {
    const icon = document.getElementById('refresh-vault-icon');
    if (icon) icon.classList.add('fa-spin');

    try {
        if (typeof fetchVaultBalance === "function") {
            await fetchVaultBalance();
            // بعد جلب الرصيد، نعيد حساب المقارنة فوراً
            setTimeout(calculateTotalCash, 500); 
            if (window.showToast) showToast("تم تحديث رصيد السيستم", true);
        }
    } finally {
        if (icon) setTimeout(() => icon.classList.remove('fa-spin'), 800);
    }
}
function parseArabicNumber(text) {
    if (!text) return 0;
    // حذف أي شيء ليس رقماً أو علامة عشرية (مثل ج.م، الفواصل، المسافات)
    let clean = text.toString().replace(/[^\d.]/g, '');
    return parseFloat(clean) || 0;
}