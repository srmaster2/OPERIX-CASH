async function checkSessionOrRedirect(){try{let{data:{session:a}}=await window.supa.auth.getSession();if(!a)return window.__redirecting||(window.__redirecting=!0,window.location.replace("login.html")),!1;return!0}catch(e){return window.__redirecting||(window.__redirecting=!0,window.location.replace("login.html")),!1}}async function initUserAccess(){try{let a=await loadCurrentUserWithBranch();if(!a)throw Error("لم يتم جلب بيانات المستخدم");let e=a.isMaster||!1,s=!e&&"ADMIN"===(a.role||"").toUpperCase()&&!!a.branch_id,t=document.getElementById("user-display-name");t&&a.name&&(t.textContent=a.name),"function"==typeof renderCurrentBranchBadge&&renderCurrentBranchBadge();let l=document.getElementById("nav-dash"),i=document.getElementById("nav-manage");l&&(l.style.display=""),i&&(i.style.display=e||s?"":"none"),document.querySelectorAll(".admin-only-section").forEach(a=>{a.style.display=e||s?"":"none"}),document.querySelectorAll(".master-only").forEach(a=>{a.style.display=e?"":"none"})}catch(d){console.error("Access init error:",d);let n=document.getElementById("nav-manage");n&&(n.style.display="none"),document.querySelectorAll(".admin-only-section, .master-only").forEach(a=>{a.style.display="none"})}}async function initApp(){await checkSessionOrRedirect()&&(initializeViews(),await initUserAccess(),"function"==typeof loadWallets&&loadWallets(),"function"==typeof loadClientsToSelect&&loadClientsToSelect(),"function"==typeof renderPinnedWallets&&renderPinnedWallets(),"function"==typeof fetchVaultBalance&&fetchVaultBalance(),Promise.all([loadDashboard(),loadAccountsList(),getTransactionLogs()]),setupEventListeners())}async function loadDashboard(){let a=document.getElementById("dashContent");if(!a)return;a.innerHTML='<div class="text-center p-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted fw-bold">جاري تجهيز لوحة القيادة...</p></div>';let[e,s]=await Promise.all([getDashboardStats(),loadAccounts()]);if(!e||!e.success||!s){a.innerHTML='<div class="alert alert-danger text-center">خطأ في جلب البيانات</div>';return}let t=a=>new Intl.NumberFormat("en-US",{minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(a)||0),l=window.currentUserData;window.globalWalletsData=s.filter(a=>{let e=Number(a.daily_out_limit)||0,s=a.name||"",t=s.includes("الخزنة")||s.includes("كاش");return(!t||!!l?.isMaster)&&"الخزنة (الكاش)"!==a.name&&e>0&&e<1e7}).map(a=>({name:a.name,bal:Number(a.balance)||0,limDay:Number(a.daily_out_limit)||0,usedDay:Number(a.daily_out_usage)||0,limMon:Number(a.monthly_limit)||0,usedMon:Number(a.monthly_usage_out)||0}));let i=e.lastFive&&e.lastFive.length>0?e.lastFive.map(a=>{let e=(a.type||"").includes("سحب")||(a.type||"").includes("صادر");return`
        <div class="last-tx-row">
            <div class="d-flex align-items-center gap-2">
                <div class="last-tx-icon ${e?"tx-out":"tx-in"}">
                    <i class="fas fa-${e?"arrow-up":"arrow-down"}"></i>
                </div>
                <div>
                    <div class="last-tx-type">${a.type||"-"}</div>
                    <div class="last-tx-meta">${a.date||""} ${a.time||""} \xb7 ${a.added_by||""}</div>
                </div>
            </div>
            <div class="text-end">
                <div class="last-tx-amount ${e?"text-danger":"text-success"} english-num">
                    ${e?"-":"+"}${Number(a.amount||0).toLocaleString()}
                </div>
                <div class="last-tx-note">${a.notes||""}</div>
            </div>
        </div>`}).join(""):'<div class="text-center text-muted p-4">لا توجد عمليات</div>';a.innerHTML=`
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
          <span class="stat-value">${t(e.cash)}</span>
        </div>
      </div>
      <div class="stat-card-premium blue">
        <div class="stat-icon-wrapper"><i class="fas fa-sack-dollar"></i></div>
        <div class="stat-info">
          <span class="stat-label">إجمالي السيولة (رأس المال)</span>
          <span class="stat-value">${t(e.totalAvailable)}</span>
        </div>
      </div>
      <div class="stat-card-premium orange">
        <div class="stat-icon-wrapper"><i class="fas fa-wallet"></i></div>
        <div class="stat-info">
          <span class="stat-label">أرصدة المحافظ</span>
          <span class="stat-value">${t(e.walletsTotal)}</span>
        </div>
      </div>
      <div class="stat-card-premium red">
        <div class="stat-icon-wrapper"><i class="fas fa-building-columns"></i></div>
        <div class="stat-info">
          <span class="stat-label">أرصدة الشركات</span>
          <span class="stat-value">${t(e.compTotal)}</span>
        </div>
      </div>
    </div>

    <!-- ملخص اليوم -->
    <div class="row g-3 mb-4">
      <div class="col-md-4">
        <div class="dashboard-card-single p-3">
          <div class="d-flex align-items-center gap-3">
            <div class="day-stat-icon" style="background:rgba(99,102,241,0.1); color:#6366f1;">
              <i class="fas fa-calendar-day"></i>
            </div>
            <div>
              <div class="text-muted small">عمليات اليوم</div>
              <div class="fw-bold fs-5 english-num">${e.todayCount||0} عملية</div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="dashboard-card-single p-3">
          <div class="d-flex align-items-center gap-3">
            <div class="day-stat-icon" style="background:rgba(16,185,129,0.1); color:#10b981;">
              <i class="fas fa-arrow-trend-up"></i>
            </div>
            <div>
              <div class="text-muted small">إجمالي وارد اليوم</div>
              <div class="fw-bold fs-5 english-num text-success">${t(e.todayIn||0)}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="dashboard-card-single p-3">
          <div class="d-flex align-items-center gap-3">
            <div class="day-stat-icon" style="background:rgba(239,68,68,0.1); color:#ef4444;">
              <i class="fas fa-arrow-trend-down"></i>
            </div>
            <div>
              <div class="text-muted small">إجمالي صادر اليوم</div>
              <div class="fw-bold fs-5 english-num text-danger">${t(e.todayOut||0)}</div>
            </div>
          </div>
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
              <h4 class="fw-bold text-danger m-0 english-num">${t(e.have)}</h4>
            </div>
          </div>
          <div class="col-6">
            <div class="p-3 rounded-4" style="background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.2);">
              <div class="d-flex align-items-center gap-2 mb-2">
                <i class="fas fa-arrow-trend-up text-success"></i>
                <small class="fw-bold text-muted">لنا (خارجية)</small>
              </div>
              <h4 class="fw-bold text-success m-0 english-num">${t(e.oweMe)}</h4>
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
        <div class="profits-container">
          <div class="profit-item">
            <p class="profit-label">اليوم</p>
            <p class="profit-value blur-v prof text-success">${t(e.dP)}</p>
          </div>
          <div class="profit-item">
            <p class="profit-label">الشهر</p>
            <p class="profit-value blur-v prof text-primary">${t(e.mP)}</p>
          </div>
          <div class="profit-item">
            <p class="profit-label">مصروفات</p>
            <p class="profit-value blur-v prof text-danger">${t(e.ex)}</p>
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
            ${Object.keys(e.breakdown).length>0?Object.entries(e.breakdown).map(([a,e])=>`
                <div class="list-group-item d-flex justify-content-between align-items-center p-3">
                  <div class="d-flex align-items-center gap-3">
                    <div class="rounded-circle p-2" style="background:${e.color}20; color:${e.color};">
                      <i class="fas fa-building"></i>
                    </div>
                    <span class="fw-bold">${a}</span>
                  </div>
                  <span class="fw-bold english-num">${t(e.balance)}</span>
                </div>`).join(""):'<div class="p-4 text-center text-muted fw-bold">لا توجد شركات بليميت ≥ 9M</div>'}
          </div>
        </div>
      </div>
      <div class="col-lg-6">
        <h6 class="fw-bold mb-3"><i class="fas fa-users text-purple me-2"></i>حسابات العملاء</h6>
        <div class="dashboard-card-single p-2" style="max-height:200px; overflow-y:auto;">
          ${e.clientsCards.length?e.clientsCards.map(a=>`
            <div class="d-flex justify-content-between align-items-center p-2 mb-2 rounded" style="background:var(--card-bg); border:1px solid var(--card-border)!important;">
              <div class="d-flex align-items-center gap-2">
                <i class="fas fa-user-circle text-muted"></i>
                <span class="small fw-bold">${a.name}</span>
              </div>
              <span class="small fw-bold english-num ${a.balance>0?"text-danger":"text-success"}">
                ${t(Math.abs(a.balance))}
              </span>
            </div>`).join(""):'<div class="text-center text-muted small p-3">لا توجد مديونيات</div>'}
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
          ${i}
        </div>
      </div>
    </div>

  </div>`,applyWalletFilters()}function refreshDashboardData(){return loadDashboard()}function initRealtime(){window.supa.channel("schema-db-changes").on("postgres_changes",{event:"*",schema:"public",table:"transactions"},a=>{console.log("تغيير لحظي اكتشفناه!",a),refreshDashboardData()}).subscribe(a=>{console.log("حالة الاتصال اللحظي:",a)})}function applyWalletFilters(){let a=document.getElementById("dashWalletSearch"),e=document.getElementById("sortWalletsSelect");if(!a||!e)return;let s=a.value.toLowerCase(),t=e.value,l=[...window.globalWalletsData];switch(s&&(l=l.filter(a=>a.name.toLowerCase().includes(s))),t){case"max_bal":l.sort((a,e)=>e.bal-a.bal);break;case"max_day":l.sort((a,e)=>e.usedDay-a.usedDay);break;case"min_day":l.sort((a,e)=>a.usedDay-e.usedDay);break;case"max_mon":l.sort((a,e)=>e.usedMon-a.usedMon);break;case"min_mon":l.sort((a,e)=>a.usedMon-e.usedMon)}renderWalletsGrid(l)}function renderWalletsGrid(a){let e=document.getElementById("walletsLiveGrid");if(!e)return;let s=a=>(Number(a)||0).toLocaleString(),t=a&&a.length>0?a.map(a=>{let e=a.limDay>0?Math.min(a.usedDay/a.limDay*100,100):0,t=a.limMon>0?Math.min(a.usedMon/a.limMon*100,100):0,l=e>90?"#f43f5e":e>70?"#f59e0b":"#10b981",i=Math.max(0,a.limDay-a.usedDay),d=Math.max(0,a.limMon-a.usedMon);return`
        <div class="wlt-item">
            <div class="wlt-item-header">
                <div class="wlt-left">
                    <div class="wlt-indicator" style="background:${l}"></div>
                    <div>
                        <div class="wlt-item-name">${a.name}</div>
                        <span class="wlt-badge ${e>90?"status-critical":e>70?"status-warn":"status-ok"}">${e>90?"⚠ حرج":e>70?"تحذير":"✓ طبيعي"}</span>
                    </div>
                </div>
                <div class="wlt-item-bal">${s(a.bal)}<span>ج.م</span></div>
            </div>
            <div class="wlt-item-tracks">
                <div class="wlt-track-row">
                    <span>يومي</span>
                    <div class="wlt-track">
                        <div class="wlt-fill" style="width:${e}%;background:${l}"></div>
                    </div>
                    <span style="color:${l};min-width:32px;text-align:left">${Math.round(e)}%</span>
                </div>
                <div class="wlt-rem-row">
                    <small class="text-muted">متبقي:</small>
                    <small class="fw-bold english-num" style="color:${l}">${s(i)} ج.م</small>
                </div>

                <div class="wlt-track-row mt-1">
                    <span>شهري</span>
                    <div class="wlt-track">
                        <div class="wlt-fill" style="width:${t}%;background:linear-gradient(90deg,#3b82f6,#818cf8)"></div>
                    </div>
                    <span style="color:#6366f1;min-width:32px;text-align:left">${Math.round(t)}%</span>
                </div>
                <div class="wlt-rem-row">
                    <small class="text-muted">متبقي:</small>
                    <small class="fw-bold english-num" style="color:#6366f1">${s(d)} ج.م</small>
                </div>
            </div>
        </div>`}).join(""):'<div class="text-center text-muted p-4">لا توجد نتائج</div>';e.innerHTML=`
    <div class="wlt-grid-card">
        <div class="wlt-grid-body">${t}</div>
    </div>`}async function loadAccountsList(){let a=await loadAccounts(),e=document.getElementById("accountsList");e&&(e.innerHTML=a.map(a=>`
    <div class="account-card">
      <h5>${a.name}</h5>
      <p>الرصيد: ${Number(a.balance).toLocaleString()}</p>
    </div>
  `).join(""))}function setupEventListeners(){let a=document.getElementById("addAccountBtn");a&&(a.onclick=async()=>{let a=document.getElementById("accountName")?.value,e=document.getElementById("accountType")?.value,s=document.getElementById("accountBalance")?.value;await addAccount(a,e,"",s)&&loadAccountsList()});let e=document.getElementById("addTransactionBtn");e&&(e.onclick=async()=>{let a=document.getElementById("transactionType")?.value,e=document.getElementById("transactionAmount")?.value;await addTransaction(a,e,0,null,null,"")&&(loadTransactionsList(),loadDashboard())})}function initializeViews(){let a=document.querySelectorAll(".view-section");a.forEach(a=>{a.classList.remove("active"),a.style.display=""});let e=document.getElementById("view-dash");e&&(e.classList.add("active"),e.style.display="")}window.unlock=function(){"1234"===prompt("كلمة السر:")&&document.querySelectorAll(".prof").forEach(a=>a.classList.remove("blur-v"))},window.loadDash=loadDashboard,document.addEventListener("DOMContentLoaded",()=>{refreshDashboardData(),initRealtime()}),window.signOut=async function(){try{await window.supa.auth.signOut()}finally{window.__redirecting||(window.__redirecting=!0,window.location.replace("login.html"))}},window.toggleSidebar=function(){document.body.classList.toggle("sidebar-closed")},document.addEventListener("DOMContentLoaded",()=>{let a=document.getElementById("sidebarToggleBtn");a&&a.addEventListener("click",toggleSidebar),window.innerWidth<768&&document.body.classList.add("sidebar-closed"),document.querySelectorAll(".sidebar-link, .submenu-link").forEach(a=>{a.addEventListener("click",()=>{window.innerWidth<768&&document.body.classList.add("sidebar-closed")})})}),window.addEventListener("DOMContentLoaded",initApp),window.showView=function(a){document.querySelectorAll(".view-section").forEach(a=>{a.classList.remove("active"),a.style.display=""}),document.querySelectorAll(".sidebar-link").forEach(a=>{a.classList.remove("active")});let e=`view-${a}`,s=document.getElementById(e);if(s){s.classList.add("active"),s.style.display="";let t=document.querySelector(`[onclick="showView('${a}')"]`);t&&t.classList.add("active"),"dash"===a?loadDashboard():"op"===a?("function"==typeof loadWalletsToSelect&&loadWalletsToSelect(),"function"==typeof executeAdvancedSearch&&executeAdvancedSearch(),switchMobileTab("new")):"manage"===a?("function"==typeof loadClientsTable&&loadClientsTable(),"function"==typeof loadAccountsTable&&loadAccountsTable()):"reports"===a||("counter"===a?"function"==typeof renderCounter&&renderCounter():"settings"===a&&"function"==typeof loadProfileSettings&&loadProfileSettings())}},window.toggleSidebar=function(){document.body.classList.toggle("sidebar-closed")},window.toggleSubMenu=function(a){let e=a.closest(".nav-parent");e&&e.classList.toggle("open")},window.switchMobileTab=function(a){let e=document.getElementById("col-new-op"),s=document.getElementById("col-log-op"),t=document.getElementById("mob-tab-new"),l=document.getElementById("mob-tab-log");"new"===a?(e?.classList.add("mob-active"),s?.classList.remove("mob-active"),t?.classList.replace("btn-outline-primary","btn-primary"),t?.classList.add("active"),l?.classList.replace("btn-secondary","btn-outline-secondary"),l?.classList.remove("active")):(s?.classList.add("mob-active"),e?.classList.remove("mob-active"),l?.classList.replace("btn-outline-secondary","btn-secondary"),l?.classList.add("active"),t?.classList.replace("btn-primary","btn-outline-primary"),t?.classList.remove("active"),"function"==typeof executeAdvancedSearch&&executeAdvancedSearch())},window.switchOpTab=function(a){"log"===a?switchMobileTab("log"):switchMobileTab("new")},window.switchReportTab=function(a){document.querySelectorAll(".report-content").forEach(a=>{a.style.display="none"}),document.querySelectorAll('[id^="rep-"] + ul .nav-link, .nav-pills .nav-link').forEach(a=>{(a.textContent.includes("يومية")||a.textContent.includes("محافظ")||a.textContent.includes("ذروة")||a.textContent.includes("أرباح"))&&a.classList.remove("active")});let e=document.getElementById(`rep-${a}`);e&&(e.style.display="block")};
