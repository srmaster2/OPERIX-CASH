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
    // تحميل بيانات المستخدم مع الفرع — لازم يكون أول حاجة
    const userInfo = await loadCurrentUserWithBranch();
    if (!userInfo) throw new Error('لم يتم جلب بيانات المستخدم');
    window.currentUserData = userInfo; // تخزين البيانات

    // Phase 7: Notifications
    if (typeof loadNotifications === 'function') {
        loadNotifications();
        subscribeToNotifications();
        checkSubscriptionExpiry();
    }

    // --- السطر المطلوب إضافته هنا ---
    if (typeof loadStock === 'function') {
        console.log("User data ready, triggering loadStock...");
        loadStock(); 
    }

    const isMaster = userInfo.isMaster || false;
    const isAdmin  = !isMaster && (userInfo.role || '').toUpperCase() === 'ADMIN' && !!userInfo.branch_id;

    // 1. اسم المستخدم وشارة الفرع
    const userNameEl = document.getElementById('user-display-name');
    if (userNameEl && userInfo.name) userNameEl.textContent = userInfo.name;
    if (typeof renderCurrentBranchBadge === 'function') renderCurrentBranchBadge();

    // 2. الـ Sidebar
    const navDash   = document.getElementById('nav-dash');
    const navManage = document.getElementById('nav-manage');
    if (navDash)   navDash.style.display   = '';
    if (navManage) navManage.style.display = (isMaster || isAdmin) ? '' : 'none';

    // 3. العناصر حسب الرول
    document.querySelectorAll('.admin-only-section').forEach(el => {
      el.style.display = (isMaster || isAdmin) ? '' : 'none';
    });
    document.querySelectorAll('.master-only').forEach(el => {
      el.style.display = isMaster ? '' : 'none';
    });

  } catch (e) {
    console.error('Access init error:', e);
    const navManage = document.getElementById('nav-manage');
    if (navManage) navManage.style.display = 'none';
    document.querySelectorAll('.admin-only-section, .master-only').forEach(el => {
      el.style.display = 'none';
    });
  }
}
async function initApp() {
  if (!(await checkSessionOrRedirect())) return;

  initializeViews();

  await initUserAccess();

  // تأكد إن currentUserData جاهز وعنده company_id قبل أي query
  const _u = window.currentUserData;
  if (!_u?.company_id) {
    console.error('company_id مش موجود في بيانات المستخدم — تأكد من إنشاء الشركة أولاً');
    // إظهار رسالة للمستخدم
    const dash = document.getElementById('view-dashboard');
    if (dash) dash.innerHTML = `
      <div style="text-align:center;padding:40px;direction:rtl;">
        <i class="fa fa-exclamation-triangle fa-3x text-warning mb-3 d-block"></i>
        <h5>حساب غير مكتمل</h5>
        <p class="text-muted small">لم يتم ربط حسابك بشركة بعد.<br>
        يرجى التواصل مع مسؤول النظام أو إنشاء شركة جديدة.</p>
        <a href="login.html" class="btn btn-sm btn-primary mt-2">العودة للدخول</a>
      </div>`;
    return;
  }

  // currentUserData جاهز — نشغّل كل الدوال اللي بتحتاج فلتر الفرع
  if (typeof loadWallets          === 'function') loadWallets();
  if (typeof loadClientsToSelect  === 'function') loadClientsToSelect();
  if (typeof renderPinnedWallets  === 'function') renderPinnedWallets();
  if (typeof fetchVaultBalance    === 'function') fetchVaultBalance();

  // تشغيل الباقي بالتوازي
  Promise.all([
     loadDashboard(),
     loadAccountsList(),
     getTransactionLogs()
  ]);

  setupEventListeners();
}// --- دالة تحميل لوحة التحكم المدمجة بالكامل (التصميم الجديد) ---
async function loadDashboard() {
  const dash = document.getElementById('dashContent');
  if (!dash) return;
  
  dash.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted fw-bold">جاري تجهيز لوحة القيادة...</p></div>';

  // getDashboardStats بتجيب accounts مفلترة بالفرع تلقائياً عبر applyBranchFilter
  const s = await getDashboardStats();

  if (!s || !s.success) {
    dash.innerHTML = '<div class="alert alert-danger text-center">خطأ في جلب البيانات</div>';
    return;
  }

  const f = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n) || 0);

  // نبني globalWalletsData من الـ accounts المفلترة اللي رجعتها getDashboardStats
  const user = window.currentUserData;
  const filteredAccounts = s.accounts || [];
  window.globalWalletsData = filteredAccounts.filter(acc => {
    const dLimit  = Number(acc.daily_out_limit) || 0;
    const name    = acc.name || '';
    const isVault = name.includes('الخزنة') || name.includes('كاش');
    if (isVault && !user?.isMaster) return false;
    return acc.name !== "الخزنة (الكاش)" && dLimit > 0 && dLimit < 10000000;
  }).map(acc => ({
    name: acc.name,
    bal: Number(acc.balance) || 0,
    limDay: Number(acc.daily_out_limit) || 0,
    usedDay: Number(acc.daily_out_usage) || 0,
    limMon: Number(acc.monthly_limit) || 0,
    usedMon: Number(acc.monthly_usage_out) || 0
  }));

  const lastFiveHTML = s.lastFive && s.lastFive.length > 0
    ? s.lastFive.map(tx => {
        const isOut = (tx.type || '').includes('سحب') || (tx.type || '').includes('صادر');
        return `
        <div class="last-tx-row">
            <div class="d-flex align-items-center gap-2">
                <div class="last-tx-icon ${isOut ? 'tx-out' : 'tx-in'}">
                    <i class="fas fa-${isOut ? 'arrow-up' : 'arrow-down'}"></i>
                </div>
                <div>
                    <div class="last-tx-type">${tx.type || '-'}</div>
                    <div class="last-tx-meta">${tx.date || ''} ${tx.time || ''} · ${tx.added_by || ''}</div>
                </div>
            </div>
            <div class="text-end">
                <div class="last-tx-amount ${isOut ? 'text-danger' : 'text-success'} english-num">
                    ${isOut ? '-' : '+'}${Number(tx.amount || 0).toLocaleString()}
                </div>
                <div class="last-tx-note">${tx.notes || ''}</div>
            </div>
        </div>`;
    }).join('')
    : '<div class="text-center text-muted p-4">لا توجد عمليات</div>';

  dash.innerHTML = `
  <div class="dashboard-header-modern mb-4">

    <!-- الكروت الرئيسية -->
    <div class="header-main-box">
      <div class="icon-container">
        <i class="fa-solid fa-chart-pie"></i>
        <div class="icon-pulse"></div>
      </div>
      <div class="title-text-group">
        <h2 class="m-0 fw-bold">لوحة التحكم <span class="badge-en">DASHBOARD</span></h2>
      </div>
    </div>

    <div class="stats-grid-main">
      <div class="stat-card-premium green">
        <div class="stat-icon-wrapper"><i class="fas fa-vault"></i></div>
        <div class="stat-info">
          <span class="stat-label">النقدية بالخزنة</span>
          <span class="stat-value">${f(s.cash)}</span>
        </div>
      </div>
      <div class="stat-card-premium blue">
        <div class="stat-icon-wrapper"><i class="fas fa-sack-dollar"></i></div>
        <div class="stat-info">
          <span class="stat-label">إجمالي السيولة (رأس المال)</span>
          <span class="stat-value">${f(s.totalAvailable)}</span>
        </div>
      </div>
      <div class="stat-card-premium orange">
        <div class="stat-icon-wrapper"><i class="fas fa-wallet"></i></div>
        <div class="stat-info">
          <span class="stat-label">أرصدة المحافظ</span>
          <span class="stat-value">${f(s.walletsTotal)}</span>
        </div>
      </div>
      <div class="stat-card-premium red">
        <div class="stat-icon-wrapper"><i class="fas fa-building-columns"></i></div>
        <div class="stat-info">
          <span class="stat-label">أرصدة الشركات</span>
          <span class="stat-value">${f(s.compTotal)}</span>
        </div>
      </div>
    </div>

    <!-- ملخص اليوم -->
    <!-- ملخص العمليات — نفس ستايل stat-card-premium -->
    <div class="stats-grid-main" style="grid-template-columns: repeat(auto-fit, minmax(200px,1fr)); margin-bottom:24px;">

      <!-- عدد العمليات -->
      <div class="stat-card-premium" style="color:#6366f1;">
        <div class="stat-icon-wrapper" style="background:rgba(99,102,241,0.12);color:#6366f1;">
          <i class="fas fa-list-check"></i>
        </div>
        <div class="stat-info" style="flex:1;">
          <span class="stat-label">عدد العمليات</span>
          <div class="d-flex align-items-baseline gap-2">
            <span class="stat-value english-num" style="color:var(--text-primary);">${s.mCount || 0}</span>
            <span class="text-muted" style="font-size:11px;">/ اليوم: ${s.todayCount || 0}</span>
          </div>
          <div class="mt-1"><span id="dash-count-badge"></span></div>
        </div>
      </div>

      <!-- إجمالي الوارد -->
      <div class="stat-card-premium" style="color:#10b981;">
        <div class="stat-icon-wrapper" style="background:rgba(16,185,129,0.12);color:#10b981;">
          <i class="fas fa-arrow-trend-up"></i>
        </div>
        <div class="stat-info" style="flex:1;">
          <span class="stat-label">إجمالي الوارد</span>
          <div class="d-flex align-items-baseline gap-2 flex-wrap">
            <span class="stat-value english-num" style="color:var(--text-primary);">${f(s.mIn || 0)}</span>
            <span class="text-muted" style="font-size:11px;">/ اليوم: ${f(s.todayIn || 0)}</span>
          </div>
          <div class="mt-1"><span id="dash-in-badge"></span></div>
        </div>
      </div>

      <!-- إجمالي الصادر -->
      <div class="stat-card-premium" style="color:#f59e0b;">
        <div class="stat-icon-wrapper" style="background:rgba(245,158,11,0.12);color:#f59e0b;">
          <i class="fas fa-arrow-trend-down"></i>
        </div>
        <div class="stat-info" style="flex:1;">
          <span class="stat-label">إجمالي الصادر</span>
          <div class="d-flex align-items-baseline gap-2 flex-wrap">
            <span class="stat-value english-num" style="color:var(--text-primary);">${f(s.mOut || 0)}</span>
            <span class="text-muted" style="font-size:11px;">/ اليوم: ${f(s.todayOut || 0)}</span>
          </div>
          <div class="mt-1"><span id="dash-out-badge"></span></div>
        </div>
      </div>

    </div>

    <!-- الديون والأرباح -->
    <div class="dashboard-row mb-4">
      <div class="dashboard-card-double">
        <div class="card-header border-0 bg-transparent px-0 pt-0 pb-3">
          <h6 class="fw-bold m-0"><i class="fas fa-hand-holding-dollar text-primary me-2"></i>الديون والسلف</h6>
        </div>
        <div class="row g-3">
          <div class="col-6">
            <div class="p-3 rounded-4" style="background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2);">
              <div class="d-flex align-items-center gap-2 mb-2">
                <i class="fas fa-arrow-trend-down text-danger"></i>
                <small class="fw-bold text-muted">علينا (التزامات)</small>
              </div>
              <h4 class="fw-bold text-danger m-0 english-num">${f(s.have)}</h4>
            </div>
          </div>
          <div class="col-6">
            <div class="p-3 rounded-4" style="background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.2);">
              <div class="d-flex align-items-center gap-2 mb-2">
                <i class="fas fa-arrow-trend-up text-success"></i>
                <small class="fw-bold text-muted">لنا (خارجية)</small>
              </div>
              <h4 class="fw-bold text-success m-0 english-num">${f(s.oweMe)}</h4>
            </div>
          </div>
        </div>
      </div>

      <div class="dashboard-card-double">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="fw-bold m-0"><i class="fas fa-chart-line text-success me-2"></i>صافي الأرباح</h6>
          <button class="btn btn-sm btn-light border rounded-pill px-3" onclick="unlock()">
            <i class="fas fa-eye-slash text-muted me-1"></i> إظهار
          </button>
        </div>
        <!-- أرباح اليوم + الشهر + مصروفات مع مقارنة شهرية جوا كل item -->
        <div class="profits-container">

          <div class="profit-item">
            <p class="profit-label">اليوم</p>
            <p class="profit-value blur-v prof text-success">${f(s.dP)}</p>
          </div>

          <div class="profit-item" style="position:relative;">
            <p class="profit-label">الشهر</p>
            <p class="profit-value blur-v prof text-primary">${f(s.mP)}</p>
            <p class="blur-v prof mt-1 mb-0" style="font-size:11px;line-height:1;">
              <span id="dash-profit-badge"></span>
            </p>
          </div>

          <div class="profit-item" style="position:relative;">
            <p class="profit-label">مصروفات</p>
            <p class="profit-value blur-v prof text-danger">${f(s.ex)}</p>
            <p class="blur-v prof mt-1 mb-0" style="font-size:11px;line-height:1;">
              <span id="dash-expense-badge"></span>
            </p>
          </div>

        </div>
      </div>
    </div>

    <!-- الشركات والعملاء -->
    <div class="row g-4 mb-4">
      <div class="col-lg-6">
        <h6 class="fw-bold mb-3"><i class="fas fa-briefcase text-warning me-2"></i>أرصدة الشركات</h6>
        <div class="dashboard-card-single p-0 overflow-hidden">
          <div class="list-group list-group-flush">
            ${Object.keys(s.breakdown).length > 0
              ? Object.entries(s.breakdown).map(([name, info]) => `
                <div class="list-group-item d-flex justify-content-between align-items-center p-3">
                  <div class="d-flex align-items-center gap-3">
                    <div class="rounded-circle p-2" style="background:${info.color}20; color:${info.color};">
                      <i class="fas fa-building"></i>
                    </div>
                    <span class="fw-bold">${name}</span>
                  </div>
                  <span class="fw-bold english-num">${f(info.balance)}</span>
                </div>`).join('')
              : '<div class="p-4 text-center text-muted fw-bold">لا توجد شركات بليميت ≥ 9M</div>'
            }
          </div>
        </div>
      </div>
      <div class="col-lg-6">
        <h6 class="fw-bold mb-3"><i class="fas fa-users text-purple me-2"></i>حسابات العملاء</h6>
        <div class="dashboard-card-single p-2" style="max-height:200px; overflow-y:auto;">
          ${s.clientsCards.length ? s.clientsCards.map(c => `
            <div class="d-flex justify-content-between align-items-center p-2 mb-2 rounded" style="background:var(--card-bg); border:1px solid var(--card-border)!important;">
              <div class="d-flex align-items-center gap-2">
                <i class="fas fa-user-circle text-muted"></i>
                <span class="small fw-bold">${c.name}</span>
              </div>
              <span class="small fw-bold english-num ${c.balance > 0 ? 'text-danger' : 'text-success'}">
                ${f(Math.abs(c.balance))}
              </span>
            </div>`).join('')
          : '<div class="text-center text-muted small p-3">لا توجد مديونيات</div>'}
        </div>
      </div>
    </div>

    <!-- مراقبة المحافظ وآخر العمليات -->
<div class="row g-4 align-items-start">
      <div class="col-lg-6">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="fw-bold m-0"><i class="fas fa-sim-card text-info me-2"></i>مراقبة المحافظ</h5>
          <div class="d-flex gap-2">
            <input type="text" id="dashWalletSearch" class="form-control form-control-sm" placeholder="بحث..." oninput="applyWalletFilters()">
            <select id="sortWalletsSelect" class="form-select form-select-sm" onchange="applyWalletFilters()">
              <option value="default">الترتيب</option>
              <option value="max_bal">الأكثر رصيداً</option>
              <option value="max_day">الأعلى استهلاكاً</option>
            </select>
          </div>
        </div>
        <div id="walletsLiveGrid"></div>
      </div>

<div class="col-lg-6">
        <h5 class="fw-bold m-0 mb-3"><i class="fas fa-clock-rotate-left text-warning me-2"></i>آخر العمليات</h5>
        <div class="wlt-grid-card">
          ${lastFiveHTML}
        </div>
      </div>
    </div>

  </div>`;

  applyWalletFilters();
  _renderCompareBadges(s);
}
window.unlock = function() {
  if (prompt("كلمة السر:") === "1234") {
    document.querySelectorAll('.prof').forEach(el => el.classList.remove('blur-v'));
  }
}

// alias: refreshDashboardData = loadDashboard
function refreshDashboardData() {
    return loadDashboard();
}
// alias: loadDash = loadDashboard (للتوافق مع transactions.js)
window.loadDash = loadDashboard;

function initRealtime() {
    const companyId = window.currentUserData?.company_id;
    const filter = companyId ? `company_id=eq.${companyId}` : undefined;

    window.supa
        .channel('schema-db-changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'transactions',
                ...(filter ? { filter } : {})
            },
            (payload) => {
                // فقط بيانات الشركة الحالية
                refreshDashboardData();
            }
        )
        .subscribe();
}

// تشغيل عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    // refreshDashboardData بيتشغّل من initApp بعد تحميل currentUserData
    // initRealtime بس هنا عشان تسمع التغييرات اللحظية
    initRealtime();
});


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

    const f = (n) => (Number(n) || 0).toLocaleString();

    const rows = (walletsList && walletsList.length > 0) ? walletsList.map(w => {
        const dayPct = w.limDay > 0 ? Math.min((w.usedDay / w.limDay) * 100, 100) : 0;
        const monPct = w.limMon > 0 ? Math.min((w.usedMon / w.limMon) * 100, 100) : 0;

        // المتبقي الفعلي = min(يومي, شهري)
        const remDay = Math.max(0, w.limDay - w.usedDay);
        const remMon = Math.max(0, w.limMon - w.usedMon);
        const remEff = w.limMon > 0 ? Math.min(remDay, remMon) : remDay;

        // المؤشر اليومي يعكس remEff — لو الشهري هو اللي بيحكم، نحسب نسبته على الشهري
        // مثال: limDay=60k, remDay=40k, remMon=20k → remEff=20k محكوم بالشهري
        // نعرض نسبة الشهري (monPct) على شريط اليومي عشان يكون صادق
        const effDayPct = (w.limMon > 0 && remMon < remDay) ? monPct : dayPct;

        // اللون والـ status بناءً على الأعلى استهلاكاً (يومي أو شهري)
        const effPct      = Math.max(dayPct, monPct);
        const dayColor    = effPct > 90 ? '#f43f5e' : effPct > 70 ? '#f59e0b' : '#10b981';
        const statusLabel = effPct > 90 ? '⚠ حرج' : effPct > 70 ? 'تحذير' : '✓ طبيعي';
        const statusClass = effPct > 90 ? 'status-critical' : effPct > 70 ? 'status-warn' : 'status-ok';

        return `
        <div class="wlt-item" style="
            border-radius:14px;
            border:1px solid var(--border-color,rgba(0,0,0,0.07));
            box-shadow:0 2px 10px rgba(0,0,0,0.07),0 1px 3px rgba(0,0,0,0.05);
            margin-bottom:10px;
            overflow:hidden;
            transition:box-shadow 0.2s ease,transform 0.2s ease;
            background:var(--card-bg,#fff);
        " onmouseenter="this.style.boxShadow='0 6px 20px rgba(0,0,0,0.12),0 2px 6px rgba(0,0,0,0.07)';this.style.transform='translateY(-1px)'"
           onmouseleave="this.style.boxShadow='0 2px 10px rgba(0,0,0,0.07),0 1px 3px rgba(0,0,0,0.05)';this.style.transform='translateY(0)'">
            <div class="wlt-item-header">
                <div class="wlt-left">
                    <div class="wlt-indicator" style="background:${dayColor}"></div>
                    <div>
                        <div class="wlt-item-name">${w.name}</div>
                        <span class="wlt-badge ${statusClass}">${statusLabel}</span>
                    </div>
                </div>
                <div class="wlt-item-bal">${f(w.bal)}<span>ج.م</span></div>
            </div>
            <div class="wlt-item-tracks">
                <div class="wlt-track-row">
                    <span>يومي</span>
                    <div class="wlt-track">
                        <div class="wlt-fill" style="width:${effDayPct}%;background:${dayColor}"></div>
                    </div>
                    <span style="color:${dayColor};min-width:32px;text-align:left">${Math.round(effDayPct)}%</span>
                </div>
                <div class="wlt-rem-row">
                    <small class="text-muted">متبقي:</small>
                    <small class="fw-bold english-num" style="color:${dayColor}">${f(remEff)} ج.م</small>
                </div>

                <div class="wlt-track-row mt-1">
                    <span>شهري</span>
                    <div class="wlt-track">
                        <div class="wlt-fill" style="width:${monPct}%;background:linear-gradient(90deg,#3b82f6,#818cf8)"></div>
                    </div>
                    <span style="color:#6366f1;min-width:32px;text-align:left">${Math.round(monPct)}%</span>
                </div>
                <div class="wlt-rem-row">
                    <small class="text-muted">متبقي:</small>
                    <small class="fw-bold english-num" style="color:#6366f1">${f(remMon)} ج.م</small>
                </div>
            </div>
        </div>`;
    }).join('') : '<div class="text-center text-muted p-4">لا توجد نتائج</div>';

    container.innerHTML = `
    <div class="wlt-grid-card">
        <div class="wlt-grid-body">${rows}</div>
    </div>`;
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

//// تحميل العمليات من Supabase إلى جدول السجل
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
window.toggleSidebar = function() {
    document.body.classList.toggle('sidebar-closed');
};

// إغلاق الـ sidebar تلقائياً لما تختار أي لينك على الموبايل
document.addEventListener('DOMContentLoaded', () => {
    // ربط زرار الـ sidebar
    const sidebarBtn = document.getElementById('sidebarToggleBtn');
    if (sidebarBtn) sidebarBtn.addEventListener('click', toggleSidebar);

    if (window.innerWidth < 768) {
        document.body.classList.add('sidebar-closed');
    }

    document.querySelectorAll('.sidebar-link, .submenu-link').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth < 768) {
                document.body.classList.add('sidebar-closed');
            }
        });
    });
});
// تشغيل التطبيق عند تحميل الصفحة
window.addEventListener('DOMContentLoaded', initApp);

// ========== دوال التنقل بين الصفحات ==========
window.showView = function(viewName) {
    // إخفاء جميع الصفحات بالـ class فقط
    document.querySelectorAll('.view-section').forEach(el => {
        el.classList.remove('active');
        el.style.display = '';
    });
    
    // إزالة active من جميع الـ links
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.classList.remove('active');
    });
    
    // إظهار الصفحة المختارة بالـ class فقط
    const viewId = `view-${viewName}`;
    const viewEl = document.getElementById(viewId);
    if (viewEl) {
        viewEl.classList.add('active');
        viewEl.style.display = '';
        
        // إضافة active للـ link المناسب
        const activeLink = document.querySelector(`[onclick="showView('${viewName}')"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }
        
        // تحميل البيانات حسب نوع الصفحة
        if (viewName === 'dash') {
            loadDashboard();
        } else if (viewName === 'op') {
            // تحميل البيانات للعرض المدمج
          if (typeof loadWalletsToSelect === 'function') loadWalletsToSelect();
            if (typeof executeAdvancedSearch === 'function') executeAdvancedSearch();            // على الموبايل: إظهار عملية جديدة كـ default
            switchMobileTab('new');
        } else if (viewName === 'manage') {
            if (typeof loadClientsTable === 'function') loadClientsTable();
            if (typeof loadAccountsTable === 'function') loadAccountsTable();
        } else if (viewName === 'reports') {
            // رسم التقارير إذا لزم الأمر
        } else if (viewName === 'counter') {
            if (typeof renderCounter === 'function') {
                renderCounter();
            }
        } else if (viewName === 'settings') {
            if (typeof loadProfileSettings  === 'function') loadProfileSettings();
            if (typeof loadSubscriptionPage === 'function') loadSubscriptionPage();
            
        }
    }
};

// ========== SIDEBAR TOGGLE ==========
window.toggleSidebar = function() {
    document.body.classList.toggle('sidebar-closed');
};

// Initialize views - ensure only dashboard is active on load
function initializeViews() {
    const views = document.querySelectorAll('.view-section');
    
    // إخفاء كل الـ views بإزالة الـ class وتنظيف inline styles
    views.forEach(view => {
        view.classList.remove('active');
        view.style.display = '';
    });
    
    // إظهار الداشبورد فقط
    const dashView = document.getElementById('view-dash');
    if (dashView) {
        dashView.classList.add('active');
        dashView.style.display = '';
    }
}

// ========== SUBMENU TOGGLE ==========
window.toggleSubMenu = function(element) {
    const parentLi = element.closest('.nav-parent');
    if (!parentLi) return;
    
    parentLi.classList.toggle('open');
};

// ========== MOBILE TAB SWITCH للعمليات ==========
// على الموبايل: عملية جديدة | سجل العمليات
window.switchMobileTab = function(tabName) {
    const colNew = document.getElementById('col-new-op');
    const colLog = document.getElementById('col-log-op');
    const btnNew = document.getElementById('mob-tab-new');
    const btnLog = document.getElementById('mob-tab-log');

    if (tabName === 'new') {
        colNew?.classList.add('mob-active');
        colLog?.classList.remove('mob-active');
        btnNew?.classList.replace('btn-outline-primary', 'btn-primary');
        btnNew?.classList.add('active');
        btnLog?.classList.replace('btn-secondary', 'btn-outline-secondary');
        btnLog?.classList.remove('active');
    } else {
        colLog?.classList.add('mob-active');
        colNew?.classList.remove('mob-active');
        btnLog?.classList.replace('btn-outline-secondary', 'btn-secondary');
        btnLog?.classList.add('active');
        btnNew?.classList.replace('btn-primary', 'btn-outline-primary');
        btnNew?.classList.remove('active');
        // تحميل السجل عند الانتقال إليه
if (typeof executeAdvancedSearch === 'function') executeAdvancedSearch();    }
};

// للتوافق مع الكود القديم
window.switchOpTab = function(tabName) {
    if (tabName === 'log') {
        switchMobileTab('log');
    } else {
        switchMobileTab('new');
    }
};

// ========== REPORT TABS SWITCH ==========
window.switchReportTab = function(tabName) {
    // إخفاء جميع التقارير
    document.querySelectorAll('.report-content').forEach(el => {
        el.style.display = 'none';
    });
    
    // إزالة active من أزرار التقارير
    document.querySelectorAll('[id^="rep-"] + ul .nav-link, .nav-pills .nav-link').forEach(link => {
        if (link.textContent.includes('يومية') || link.textContent.includes('محافظ') || link.textContent.includes('ذروة') || link.textContent.includes('أرباح')) {
            link.classList.remove('active');
        }
    });
    
    // عرض التقرير المختار
    const reportEl = document.getElementById(`rep-${tabName}`);
    if (reportEl) {
        reportEl.style.display = 'block';
    }
};
// ── دالة رسم بادجات المقارنة في الداشبورد ──
function _renderCompareBadges(s) {
    // السهم + الفرق الفعلي (لو صفر مش بيظهر حاجة)
    const badge = (cur, prev, invert) => {
        const diff = cur - prev;
        if (diff === 0) return '';
        const up   = diff >= 0;
        const good = invert ? !up : up;
        const color = good ? '#10b981' : '#ef4444';
        const fmt  = Math.abs(diff).toLocaleString('en-US', { maximumFractionDigits: 0 });
        return `<span style="font-size:11px;color:${color};font-weight:800;">${up ? '▲' : '▼'} ${fmt}</span>`;
    };

    const setEl = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

    setEl('dash-count-badge',   badge(s.mCount ||0, s.prevMCount||0, false));
    setEl('dash-in-badge',      badge(s.mIn    ||0, s.prevMIn   ||0, false));
    setEl('dash-out-badge',     badge(s.mOut   ||0, s.prevMOut  ||0, true));
    setEl('dash-profit-badge',  badge(s.mP     ||0, s.prevMP    ||0, false));
    setEl('dash-expense-badge', badge(s.ex     ||0, s.prevEx    ||0, true));
}