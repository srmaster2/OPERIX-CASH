// الدالة الرئيسية للتطبيق
async function checkSessionOrRedirect() {
  try {
    const { data: { session } } = await window.supa.auth.getSession();
    if (!session) {
      if (!window.__redirecting) {
        window.__redirecting = true;
        window.location.replace('login.html');
      }
      return false;
    }
    return true;
  } catch (e) {
    if (!window.__redirecting) {
      window.__redirecting = true;
      window.location.replace('login.html');
    }
    return false;
  }
}

async function initUserAccess() {
  try {
    const userInfo = await getCurrentUser();

    // ترحيب بالمستخدم
    const titleEl = document.getElementById('page-title');
    if (titleEl && userInfo && userInfo.name) {
      titleEl.innerHTML = `<i class="fa-solid fa-shield-halved me-1 text-info"></i> SADEK CASH — أهلاً بك يا ${userInfo.name}`;
    }

    // إظهار/إخفاء الأقسام بناءً على الدور
    const navDash = document.getElementById('nav-dash');
    const navManage = document.getElementById('nav-manage');
    if (navDash) navDash.style.display = '';

    const isAdmin = Boolean(userInfo?.isMaster) || (String(userInfo?.role || '').toUpperCase() === 'ADMIN');
    if (navManage) navManage.style.display = isAdmin ? '' : 'none';

    // إخفاء/إظهار العناصر ذات الصلاحية الإدارية
    document.querySelectorAll('.admin-only-section').forEach(el => {
      el.style.display = isAdmin ? '' : 'none';
    });
  } catch (e) {
    // فشل جلب بيانات المستخدم -> إخفاء الإدارة احترازياً
    const navManage = document.getElementById('nav-manage');
    if (navManage) navManage.style.display = 'none';
    document.querySelectorAll('.admin-only-section').forEach(el => {
      el.style.display = 'none';
    });
  }
}

async function initApp() {
  if (!(await checkSessionOrRedirect())) return;
  
  await initUserAccess(); // ننتظر الصلاحيات أولاً
  
  // تشغيل الباقي بالتوازي لتسريع الصفحة
  Promise.all([
     loadDashboard(),
     loadAccountsList(),
     getTransactionLogs()
  ]);
  
  setupEventListeners();
}
// تحميل الداشبورد من Supabase (آمن في حال عدم وجود العناصر)
// --- دالة تحميل لوحة التحكم المدمجة بالكامل ---
async function loadDashboard() {
  const dash = document.getElementById('dashContent');
  if (!dash) return;
  
  dash.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div><p class="mt-2">جاري تحميل لوحة التحكم...</p></div>';

  const [s, allAccounts] = await Promise.all([
    getDashboardStats(),
    loadAccounts()
  ]);

  if (!s || !s.success || !allAccounts) {
    dash.innerHTML = '<div class="alert alert-danger text-center">خطأ في جلب البيانات</div>';
    return;
  }

  const f = (n) => (Number(n) || 0).toLocaleString();

  // 1. تجهيز البيانات العالمية للمحافظ (للفلترة السريعة)
  window.globalWalletsData = allAccounts.filter(acc => {
    const dLimit = Number(acc.daily_out_limit) || 0;
    return acc.name !== "الخزنة (الكاش)" && dLimit > 0 && dLimit < 10000000;
  }).map(acc => ({
    name: acc.name,
    bal: Number(acc.balance) || 0,
    limDay: Number(acc.daily_out_limit) || 0,
    usedDay: Number(acc.daily_out_usage) || 0,
    limMon: Number(acc.monthly_limit) || 0,
    usedMon: Number(acc.monthly_usage_out) || 0
  }));

  // 2. بناء هيكل الصفحة بالكامل
  dash.innerHTML = `
    <div class="container-fluid p-0" style="direction:rtl; font-family:'Cairo'">
      
      <div class="row g-3 mb-3 row-cols-3">
        <div class="col"><div class="card-3d bg-grad-1"><span class="v-num">${f(s.cash)}</span><span class="v-lbl text-white">الخزنة</span></div></div>
        <div class="col"><div class="card-3d bg-grad-2"><span class="v-num">${f(s.walletsTotal)}</span><span class="v-lbl text-white">المحافظ</span></div></div>
        <div class="col"><div class="card-3d bg-grad-3"><span class="v-num">${f(s.compTotal)}</span><span class="v-lbl text-white">الشركات</span></div></div>
      </div>

      <div class="row g-3 mb-3 row-cols-2">
        <div class="col"><div class="card-3d" style="border-right: 6px solid #8b5cf6;"><span class="v-num text-dark">${f(s.have)}</span><span class="v-lbl">علينا (ديون)</span></div></div>
        <div class="col"><div class="card-3d" style="border-right: 6px solid #ef4444;"><span class="v-num text-dark">${f(s.oweMe)}</span><span class="v-lbl">لنا (سلف)</span></div></div>
      </div>

      <div class="row g-3 mb-4 row-cols-2">
        <div class="col"><div class="card-3d" style="background:#2d3436; color:white;"><span class="v-num text-success">${f(s.totalAvailable)}</span><span class="v-lbl text-light">إجمالي المتاح</span></div></div>
        <div class="col"><div class="card-3d" style="background:#0984e3; color:white;"><span class="v-num text-warning">${f(s.grandTotal)}</span><span class="v-lbl text-light">الصافي النهائي</span></div></div>
      </div>

      <div class="section-header">
        <span>📊 الأرباح والمصروفات</span>
        <div class="pass-btn" onclick="unlock()" title="إدخال كلمة المرور"><i class="fa fa-key"></i></div>
      </div>
      <div class="row g-3 mb-4 row-cols-3">
        <div class="col"><div class="card-3d"><span class="v-num blur-v prof">${f(s.dP)}</span><span class="v-lbl">ربح اليوم</span></div></div>
        <div class="col"><div class="card-3d"><span class="v-num blur-v prof">${f(s.mP)}</span><span class="v-lbl">ربح الشهر</span></div></div>
        <div class="col"><div class="card-3d"><span class="v-num blur-v prof text-danger">${f(s.ex)}</span><span class="v-lbl text-danger">مصروفات</span></div></div>
      </div>

      <div class="section-header">🏢 شركات الدفع</div>
      <div class="row g-3 mb-4 row-cols-3">
        <div class="col"><div class="card-3d" style="border-bottom: 4px solid #f39c12;"><span class="v-num" style="color:#f39c12;">${f(s.breakdown.fawry)}</span><span class="v-lbl">فوري</span></div></div>
        <div class="col"><div class="card-3d" style="border-bottom: 4px solid #e67e22;"><span class="v-num" style="color:#e67e22;">${f(s.breakdown.maksab)}</span><span class="v-lbl">مكسب</span></div></div>
        <div class="col"><div class="card-3d" style="border-bottom: 4px solid #d35400;"><span class="v-num" style="color:#d35400;">${f(s.breakdown.moshtrayat)}</span><span class="v-lbl">مشتريات</span></div></div>
      </div>

      <div class="section-header">👥 مديونيات العملاء</div>
      <div class="row g-2 mb-4 row-cols-3">
        ${s.clientsCards.map((c, i) => `
          <div class="col">
            <div class="card-3d p-2" style="border-top: 3px solid ${c.balance > 0 ? '#ef4444' : '#38ef7d'}">
              <div class="v-lbl text-dark fw-bold" style="white-space:nowrap; overflow:hidden; font-size:0.75rem;">${c.name}</div>
              <div class="v-num ${c.balance > 0 ? 'text-danger' : 'text-success'}" style="font-size:1.1rem;">${f(Math.abs(c.balance))}</div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="section-header d-flex justify-content-between align-items-center">
        <span>📱 مراقبة المحافظ</span>
        <div class="d-flex gap-1">
            <input type="text" id="dashWalletSearch" class="form-control form-control-sm" placeholder="بحث..." oninput="applyWalletFilters()" style="width: 100px; font-size: 1.2rem;">
<select 
  id="sortWalletsSelect"
  class="form-select"
  onchange="applyWalletFilters()"
  style="
    width: 140px;
    font-size: 1.2rem;
    padding: 10px 14px;
    height: 55px;
  ">
                <option value="default">📍 ترتيب افتراضي</option>
                <option value="max_bal">💰 الأكثر رصيداً</option>
                <option value="max_day">🔥الأعلى يومي</option>
                <option value="min_day">🧊 يومي</option>
                <option value="max_mon">📅 الأعلى شهري</option>
                <option value="min_mon">📉الأقل شهري</option>
            </select>
        </div>
      </div>
      
      <div id="walletsLiveGrid"></div>

    </div>
  `;

  // استدعاء الفلترة لأول مرة لرسم المحافظ
  applyWalletFilters();
}

// --- الدوال المساعدة للفلترة والرسم ---

function applyWalletFilters() {
    const searchInput = document.getElementById('dashWalletSearch');
    const sortSelect = document.getElementById('sortWalletsSelect');
    if (!searchInput || !sortSelect) return;

    const searchText = searchInput.value.toLowerCase();
    const sortMode = sortSelect.value;
    
    let filteredData = [...window.globalWalletsData];

    // 1. تصفية البحث
    if (searchText) {
      filteredData = filteredData.filter(w => w.name.toLowerCase().includes(searchText));
    }

    // 2. تطبيق الترتيب المطلوب
    switch (sortMode) {
      case 'max_bal': filteredData.sort((a, b) => b.bal - a.bal); break;
      case 'max_day': filteredData.sort((a, b) => b.usedDay - a.usedDay); break;
      case 'min_day': filteredData.sort((a, b) => a.usedDay - b.usedDay); break;
      case 'max_mon': filteredData.sort((a, b) => b.usedMon - a.usedMon); break;
      case 'min_mon': filteredData.sort((a, b) => a.usedMon - b.usedMon); break;
    }

    // 3. الرسم
    renderWalletsGrid(filteredData);
}

function renderWalletsGrid(walletsList) {
    const container = document.getElementById('walletsLiveGrid');
    if (!container) return;

    if (!walletsList || walletsList.length === 0) {
      container.innerHTML = '<div class="text-center text-muted p-3">لا توجد نتائج</div>';
      return;
    }

    const f = (n) => (Number(n) || 0).toLocaleString();

    let html = `<div class="row g-2">`; 
    walletsList.forEach((w, i) => { 
      let dayPct = w.limDay > 0 ? (w.usedDay / w.limDay) * 100 : 0; 
      let monPct = w.limMon > 0 ? (w.usedMon / w.limMon) * 100 : 0; 
      let dayColor = dayPct > 90 ? '#ef4444' : '#10b981'; 
      let remDay = Math.max(0, w.limDay - w.usedDay);
      let remMon = Math.max(0, w.limMon - w.usedMon);

      html += `
      <div class="col-4">
        <div class="wallet-card-live card-3d" style="padding: 10px; animation-delay: ${i*0.05}s">
          <div class="w-header d-flex justify-content-between align-items-center mb-1">
             <div class="w-num fw-bold text-dark" style="font-size:0.75rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:55%">${w.name}</div>
             <div class="w-bal english-num fw-bold text-success" style="font-size:0.95rem;">${f(w.bal)}</div>
          </div>
          
          <div class="d-flex justify-content-between text-muted monitor-lbl" style="font-size:0.65rem;">
            <span>متبقي: <b class="english-num">${f(remDay)}</b></span>
            <span>${Math.round(dayPct)}%</span>
          </div>
          <div class="progress-slim" style="height:5px; background:#eee; border-radius:10px; overflow:hidden;">
            <div class="pg-bar" style="width:${dayPct}%; background:${dayColor}; height:100%"></div>
          </div>
          
          <div class="d-flex justify-content-between text-muted mt-2 monitor-lbl" style="font-size:0.65rem;">
            <span>شهري: <b class="english-num">${f(remMon)}</b></span>
            <span>${Math.round(monPct)}%</span>
          </div>
          <div class="progress-slim" style="height:5px; background:#eee; border-radius:10px; overflow:hidden;">
            <div class="pg-bar bg-info" style="width:${monPct}%; height:100%"></div>
          </div>
        </div>
      </div>`; 
    }); 
    html += `</div>`;
    container.innerHTML = html;
}
window.unlock = function() {
  if (prompt("كلمة السر:") === "1234") {
    document.querySelectorAll('.prof').forEach(el => el.classList.remove('blur-v'));
  }
}

// تحميل الحسابات (استخدام للواجهات البسيطة الأخرى إن وجدت)
async function loadAccountsList() {
  const accounts = await loadAccounts();
  const container = document.getElementById('accountsList');
  if (!container) return; // قد لا تكون موجودة في هذا القالب
  container.innerHTML = accounts.map(acc => `
    <div class="account-card">
      <h5>${acc.name}</h5>
      <p>الرصيد: ${Number(acc.balance).toLocaleString()}</p>
    </div>
  `).join('');
}

// تحميل العمليات من Supabase إلى جدول السجل
async function getTransactionLogs() {
  const transactions = await loadTransactions(500);
  const tbody = document.getElementById('timelineContainer');
  const countEl = document.getElementById('rowsCountDisplay');
  if (!tbody) return;

  const rows = transactions.map((tx, idx) => {
    const dateStr = tx.created_at ? new Date(tx.created_at).toLocaleString('ar-EG') : '';
    const amount = Number(tx.amount || 0).toLocaleString();
    const comm = Number(tx.commission || 0);
    const profitBadge = comm ? `<span class="profit-badge">${comm.toLocaleString()}</span>` : '<span class="profit-badge profit-zero">0</span>';
    const balAfter = typeof tx.balance_after !== 'undefined' && tx.balance_after !== null ? Number(tx.balance_after).toLocaleString() : '';
    const op = tx.type || '';
    const acc = tx.account_name || '';
    const user = tx.user_name || tx.user_email || '';

    return `
      <tr class="${tx.is_out ? 'row-out' : 'row-in'}">
        <td>${idx + 1}</td>
        <td>${dateStr}</td>
        <td>
          <div class="fw-bold text-dark">${op}</div>
          <div class="text-muted text-xs">${acc}</div>
        </td>
        <td>
          <div class="fw-bold english-num">${amount}</div>
          <div>${profitBadge}</div>
        </td>
        <td class="english-num">${balAfter}</td>
        <td>${tx.note || ''}</td>
        <td>${user}</td>
        <td>
          <div class="action-menu" title="إجراءات">
            <i class="fa fa-ellipsis-h"></i>
          </div>
        </td>
      </tr>`;
  }).join('');

  tbody.innerHTML = rows || '<tr><td colspan="8" class="text-muted">لا توجد عمليات</td></tr>';
  if (countEl) countEl.textContent = `إجمالي الصفوف: ${transactions.length}`;
}

// إعداد الأحداث مع التحقق من وجود العناصر
function setupEventListeners() {
  const addAccBtn = document.getElementById('addAccountBtn');
  if (addAccBtn) {
    addAccBtn.onclick = async () => {
      const name = document.getElementById('accountName')?.value;
      const type = document.getElementById('accountType')?.value;
      const balance = document.getElementById('accountBalance')?.value;
      if (await addAccount(name, type, '', balance)) {
        loadAccountsList();
      }
    };
  }

  const addTxBtn = document.getElementById('addTransactionBtn');
  if (addTxBtn) {
    addTxBtn.onclick = async () => {
      const type = document.getElementById('transactionType')?.value;
      const amount = document.getElementById('transactionAmount')?.value;
      if (await addTransaction(type, amount, 0, null, null, '')) {
        loadTransactionsList();
        loadDashboard();
      }
    };
  }
}

// تسجيل الخروج
window.signOut = async function() {
  try {
    await window.supa.auth.signOut();
  } finally {
    if (!window.__redirecting) {
      window.__redirecting = true;
      window.location.replace('login.html');
    }
  }
};

// تشغيل التطبيق عند تحميل الصفحة
window.addEventListener('DOMContentLoaded', initApp);
// دالة لتحديث مراقبة المحافظ بناءً على بيانات Supabase
/**
 * دالة مراقبة المحافظ (Live Monitor)
 * تقوم بفلترة البيانات ورسم الجدول والـ Sparklines ديناميكياً
 */
async function renderWalletsMonitor() {
    const monitorDiv = document.getElementById('wallets-monitor-container');
    if (!monitorDiv) return;

    try {
        // جلب البيانات من الدالة الموجودة في reports.js
        const accounts = await loadAccounts();
        
        // الفلترة: نفس منطق الشيت (استبعاد الخزنة والحسابات اللي حدها أكبر من 10 مليون)
        const filtered = accounts.filter(acc => 
            acc.name !== "الخزنة (الكاش)" && 
            (Number(acc.limit_out) || 0) < 10000000
        );

        let tableHtml = `
            <div class="card-box border-0 shadow-sm" style="background: #ffffff; border-radius: 12px; overflow: hidden;">
                <div class="text-center py-2" style="background: #1f2937; color: white;">
                    <h6 class="m-0 fw-bold">📊 مراقبة المحافظ (Live Monitor)</h6>
                </div>
                <div class="table-responsive">
                    <table class="table table-sm align-middle text-center mb-0">
                        <thead style="background: #cfd8dc; font-weight: bold;">
                            <tr>
                                <th>المحفظة</th>
                                <th>الرصيد</th>
                                <th>متبقي يومي</th>
                                <th>متبقي شهري</th>
                                <th style="width:120px">الاستهلاك</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        filtered.forEach(acc => {
            const bal = Number(acc.balance) || 0;
            const limD = Number(acc.limit_out) || 0;
            const usedD = Number(acc.used_day) || 0;
            const limM = Number(acc.limit_month) || 0;
            const usedM = Number(acc.used_month) || 0;

            const remD = Math.max(0, limD - usedD);
            const remM = Math.max(0, limM - usedM);
            const percent = limD > 0 ? (usedD / limD) * 100 : 0;
            
            // لون المؤشر: أحمر لو المتبقي أقل من 2000 (نفس منطقك في جوجل شيت)
            const barColor = remD < 2000 ? "#c62828" : "#2e7d32";

            tableHtml += `
                <tr>
                    <td class="fw-bold text-dark">${acc.name}</td>
                    <td class="english-num secure-item" data-real="${bal.toLocaleString()}">****</td>
                    <td class="english-num ${remD < 1000 ? 'text-danger fw-bold' : ''}">${remD.toLocaleString()}</td>
                    <td class="english-num">${remM.toLocaleString()}</td>
                    <td>
                        <div class="progress" style="height: 8px; background: #eee;">
                            <div class="progress-bar" style="width: ${percent}%; background: ${barColor};"></div>
                        </div>
                    </td>
                </tr>
            `;
        });

        tableHtml += `</tbody></table></div></div>`;
        monitorDiv.innerHTML = tableHtml;

        // تحديث حالة الإخفاء/الإظهار (Secure Item) إذا كانت مفعلة
        if (typeof applyVisibility === 'function') {
            const icon = document.getElementById('mainEyeIcon');
            const isVisible = icon && icon.classList.contains('fa-eye');
            applyVisibility(isVisible);
        }

    } catch (err) {
        monitorDiv.innerHTML = `<div class="alert alert-danger">خطأ في تحميل المراقبة: ${err.message}</div>`;
    }
}

// جلب وعرض العملاء بستايل سجل الجرد
async function loadClientsTable() {
    const listDiv = document.getElementById('manage-clients-body');
    if (!listDiv) return;

    // إظهار اللودينج في البداية
    listDiv.innerHTML = '<div class="text-center p-4 text-muted"><i class="fas fa-spinner fa-spin me-2"></i>جاري جلب البيانات...</div>';

    try {
        const { data: clients, error } = await supabase
            .from('clients')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;

        if (!clients || clients.length === 0) {
            listDiv.innerHTML = '<div class="text-center p-5 text-muted">لا يوجد عملاء مسجلين</div>';
            return;
        }

        // بناء الصفوف بتنسيق الأعمدة المنفصلة
        let html = '';
        clients.forEach(client => {
            const bal = Number(client.balance || 0);
            const balColor = bal < 0 ? '#dc3545' : '#198754'; // أحمر للعجز وأخضر للزيادة
            
            html += `
            <div class="client-row d-flex align-items-center p-2 mb-2 bg-white border rounded-3 shadow-sm hover-shadow">
                <div style="width: 35%;" class="text-start ps-2">
                    <div class="fw-bold text-dark text-truncate" style="font-size: 13px;">${client.name}</div>
                    <div class="text-muted" style="font-size: 9px;">اسم العميل</div>
                </div>

                <div style="width: 30%;" class="text-center border-start border-end">
                    <div class="english-num fw-bold text-secondary" style="font-size: 12px;">${client.number || '---'}</div>
                    <div class="text-muted" style="font-size: 9px;">الموبايل</div>
                </div>

                <div style="width: 25%;" class="text-center">
                    <div class="english-num fw-bold" style="font-size: 13px; color: ${balColor};">
                        ${bal.toLocaleString()}
                    </div>
                    <div class="text-muted" style="font-size: 9px;">الرصيد</div>
                </div>

                <div style="width: 10%;" class="text-end pe-1">
                    <button class="btn btn-sm text-danger opacity-75 border-0 bg-transparent" 
                            onclick="confirmDeleteClient('${client.id}', '${client.name}')">
                        <i class="fa fa-trash-alt"></i>
                    </button>
                </div>
            </div>`;
        });

        listDiv.innerHTML = html;

    } catch (err) {
        console.error("Error:", err);
        listDiv.innerHTML = `<div class="alert alert-danger p-2 small m-2">حدث خطأ: ${err.message}</div>`;
    }
}

// دالة حذف العميل بتبويتة السيستم
async function deleteClientConfirm(id, name) {
    const result = await Swal.fire({
        title: 'حذف العميل؟',
        text: `هل أنت متأكد من حذف العميل: ${name}؟`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء',
        customClass: { confirmButton: 'btn btn-danger rounded-pill px-4 me-2', cancelButton: 'btn btn-light rounded-pill px-4' },
        buttonsStyling: false
    });

    if (result.isConfirmed) {
        const { error } = await supabase.from('clients').delete().eq('id', id);
        if (!error) {
            Swal.fire({ title: 'تم الحذف', icon: 'success', timer: 1500, showConfirmButton: false });
            loadClientsTable();
        }
    }
}
async function addClient() {
    const nameEl = document.getElementById('newClName');
    const phoneEl = document.getElementById('newClPhone');
    
    const name = nameEl.value.trim();
    const phone = phoneEl.value.trim();

    if (!name) {
        showToast("يرجى إدخال اسم العميل", false);
        return;
    }

    setLoading('btnAddClient', true);
    try {
        const { error } = await supabase.from('clients').insert([{
            name: name,
            number: phone,
            balance: 0 // رصيد افتتاحي صفر
        }]);

        if (error) throw error;

        showToast("تم إضافة العميل بنجاح");
        nameEl.value = '';
        phoneEl.value = '';
        loadClientsTable(); // تحديث الجدول فوراً

    } catch (err) {
        showToast("خطأ: " + err.message, false);
    } finally {
        setLoading('btnAddClient', false);
    }
}

async function getCurrentUser() {
  try {
    const { data: { user } } = await window.supa.auth.getUser();
    if (!user) return null;

    // طلب البيانات باستخدام ID المستخدم المسجل فقط
    const { data: profile, error: dbError } = await window.supa
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (dbError) throw dbError;
    return profile;
  } catch (err) {
    console.error("خطأ في جلب البروفايل:", err.message);
    return null;
  }
}