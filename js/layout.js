// ============================================================
// layout.js — تفضيلات الـ Layout
// المنطق: يضيف class على #view-op بس — الـ CSS هو اللي يتحكم
// ============================================================

const LAYOUT_KEY = 'operix_layout_pref';

const LAYOUTS = {
  drawer: { label: 'Drawer', icon: 'fa-arrow-right-to-bracket', desc: 'السجل يطلع في درج من الشمال' },
  sheet:  { label: 'Sheet',  icon: 'fa-layer-group',            desc: 'السجل يطلع من أسفل الشاشة' },
  tabs:   { label: 'Tabs',   icon: 'fa-table-list',             desc: 'تاب للفورم وتاب للسجل' },
};

function getLayoutPref() {
  const saved = localStorage.getItem(LAYOUT_KEY) || 'drawer';
  // split اتشال — حوّل لـ drawer تلقائياً
  if (saved === 'split') {
    localStorage.setItem(LAYOUT_KEY, 'drawer');
    return 'drawer';
  }
  return saved;
}

// ── تطبيق الـ layout: يضيف class على #view-op فقط
function applyLayout(layout) {
  const viewOp = document.getElementById('view-op');
  if (!viewOp) return;

  // إزالة كل الـ layout classes
  viewOp.classList.remove('lyt-split', 'lyt-drawer', 'lyt-sheet', 'lyt-tabs');
  viewOp.classList.add('lyt-' + layout);

  // لو tabs: نشوف أيه التاب النشط
  if (layout === 'tabs') {
    const colNew = document.getElementById('col-new-op');
    const colLog = document.getElementById('col-log-op');
    // نتأكد إن الفورم ظاهر والسجل مخبي في الأول
    if (colNew) colNew.classList.remove('lyt-tab-hidden');
    if (colLog) colLog.classList.add('lyt-tab-hidden');
    // نضيف active للزرار الأول
    document.getElementById('lyt-tab-new-btn')?.classList.add('active');
    document.getElementById('lyt-tab-log-btn')?.classList.remove('active');
  } else {
    // إزالة أي tab state
    const colNew = document.getElementById('col-new-op');
    const colLog = document.getElementById('col-log-op');
    if (colNew) colNew.classList.remove('lyt-tab-hidden');
    if (colLog) colLog.classList.remove('lyt-tab-hidden');
  }

  // تحديث الـ UI في الإعدادات
  document.querySelectorAll('.layout-opt-card').forEach(card => {
    card.classList.toggle('active', card.dataset.layout === layout);
  });
}

// ── حفظ وتطبيق
function setLayoutPref(layout) {
  localStorage.setItem(LAYOUT_KEY, layout);
  applyLayout(layout);
  renderLayoutSettings(); // تحديث الكاردز
  if (typeof showToast === 'function') showToast('✅ تم تغيير طريقة العرض', true);
}

// ── فتح السجل حسب الـ layout الحالي
function openLogPanel() {
  const layout = getLayoutPref();
  if (layout === 'drawer') openLayoutDrawer();
  else if (layout === 'sheet') openLayoutSheet();
  else if (layout === 'tabs') switchLayoutTab('log');
}

// ── تحديث عداد العمليات على الزرار
function updateLogCountBadge(count) {
  const badge = document.getElementById('logCountBadge');
  if (badge) badge.textContent = count != null ? count.toLocaleString('en-US') + ' عملية' : '—';
}

// ── Drawer open/close
function openLayoutDrawer() {
  document.getElementById('layoutDrawerOverlay')?.classList.add('open');
  if (typeof executeAdvancedSearch === 'function') setTimeout(executeAdvancedSearch, 100);
}
function closeLayoutDrawer() {
  document.getElementById('layoutDrawerOverlay')?.classList.remove('open');
}

// ── Sheet open/close
function openLayoutSheet() {
  document.getElementById('layoutSheetOverlay')?.classList.add('open');
  if (typeof executeAdvancedSearch === 'function') setTimeout(executeAdvancedSearch, 100);
}
function closeLayoutSheet() {
  document.getElementById('layoutSheetOverlay')?.classList.remove('open');
}

// ── مزامنة البحث بين الجدول الأصلي والـ drawer/sheet
function syncSearch(sourceEl, targetId) {
  const target = document.getElementById(targetId);
  if (target) {
    target.value = sourceEl.value;
    target.dispatchEvent(new Event('change'));
  }
  if (typeof executeAdvancedSearch === 'function') executeAdvancedSearch();
}

// ── Tabs switch
function switchLayoutTab(tab) {
  const colNew = document.getElementById('col-new-op');
  const colLog = document.getElementById('col-log-op');
  const btnNew = document.getElementById('lyt-tab-new-btn');
  const btnLog = document.getElementById('lyt-tab-log-btn');

  if (tab === 'new') {
    colNew?.classList.remove('lyt-tab-hidden');
    colLog?.classList.add('lyt-tab-hidden');
    btnNew?.classList.add('active');
    btnLog?.classList.remove('active');
  } else {
    colNew?.classList.add('lyt-tab-hidden');
    colLog?.classList.remove('lyt-tab-hidden');
    btnNew?.classList.remove('active');
    btnLog?.classList.add('active');
    if (typeof executeAdvancedSearch === 'function') setTimeout(executeAdvancedSearch, 100);
  }
}

// ── رندر كاردز الإعدادات
function renderLayoutSettings() {
  const container = document.getElementById('layoutSettingsContainer');
  if (!container) return;

  const current = getLayoutPref();
  container.innerHTML = Object.entries(LAYOUTS).map(([key, val]) => `
    <div class="layout-opt-card ${current === key ? 'active' : ''}" data-layout="${key}" onclick="setLayoutPref('${key}')">
      <div class="layout-opt-preview lop-${key}">
        <div class="lop-form"></div>
        <div class="lop-log"></div>
      </div>
      <div class="layout-opt-label">
        <i class="fa ${val.icon}"></i> ${val.label}
        ${current === key ? '<span class="lop-curr">✓</span>' : ''}
      </div>
      <div class="layout-opt-desc">${val.desc}</div>
    </div>
  `).join('');
}

// ── تشغيل عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  applyLayout(getLayoutPref());

  // hook على showView عشان نرندر الإعدادات لما يفتحها
  const _orig = window.showView;
  if (_orig) {
    window.showView = function(v) {
      _orig(v);
      if (v === 'settings') setTimeout(renderLayoutSettings, 60);
    };
  }

  // hook على renderTransactionsTable عشان نعمل mirror للـ drawer وsheet
  const _origRender = window.renderTransactionsTable;
  if (_origRender) {
    window.renderTransactionsTable = function(data) {
      _origRender(data); // الأصلي أولاً

      // mirror للـ drawer
      const drawerBody = document.getElementById('timelineContainerDrawer');
      const mainBody   = document.getElementById('timelineContainer');
      if (drawerBody && mainBody) drawerBody.innerHTML = mainBody.innerHTML;

      // mirror للـ sheet
      const sheetBody = document.getElementById('timelineContainerSheet');
      if (sheetBody && mainBody) sheetBody.innerHTML = mainBody.innerHTML;

      // تحديث count
      const count = data?.length || 0;
      const drawerCount = document.getElementById('rowsCountDrawer');
      const sheetCount  = document.getElementById('rowsCountSheet');
      if (drawerCount) drawerCount.innerText = `${count} عملية`;
      if (sheetCount)  sheetCount.innerText  = `${count} عملية`;
      updateLogCountBadge(count);
    };
  }
});