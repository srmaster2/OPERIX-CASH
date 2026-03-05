/* ================================================================
   stock.js — SADEK CASH
   ================================================================ */
'use strict';

/* ══ TAB NAVIGATION ══════════════════════════════════════════ */
function switchStockTab(tabId) {
  // Hide all screens
  document.querySelectorAll('#view-stock .stk-screen').forEach(s => {
    s.style.display = 'none';
    s.classList.remove('active');
  });
  // Remove active from all nav tabs
  document.querySelectorAll('.stk-tab').forEach(t => t.classList.remove('active'));
  // Show target screen
  const target = document.getElementById(tabId);
  if (target) { target.style.display = 'block'; target.classList.add('active'); }
  // Map tabId → nav tab index
  const tabMap = { stockView: 0, invoiceView: 1, invoicesListView: 2 };
  const idx = tabMap[tabId];
  const navTabs = document.querySelectorAll('.stk-tab');
  if (idx !== undefined && navTabs[idx]) navTabs[idx].classList.add('active');
  // Load invoices list when switching to that tab
  if (tabId === 'invoicesListView') loadInvoicesList();
}
window.switchStockTab = switchStockTab;


const _db  = () => window.supa;
const _usr = () => window.currentUserData || {};
const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const _fmt = n => Number(n || 0).toLocaleString('en-US');
const _now = () => {
  const d = new Date();
  return { date: d.toLocaleDateString('en-GB'), time: d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) };
};

let stockProducts = [];
let stockCategory = 'all';
let stockSearch   = '';
let invoiceItems  = [];
let allInvoices   = [];

const CAT_LABEL = { mobile:'موبايل', accessory:'اكسسوار', tablet:'تابلت/لابتوب', spare:'قطع غيار' };
const CAT_ICON  = { mobile:'fa-mobile-screen', accessory:'fa-headphones', tablet:'fa-tablet-screen-button', spare:'fa-screwdriver-wrench' };
const CAT_BG    = { mobile:'rgba(59,130,246,0.12)', accessory:'rgba(139,92,246,0.12)', tablet:'rgba(6,182,212,0.12)', spare:'rgba(245,158,11,0.12)' };
const CAT_CLR   = { mobile:'#3b82f6', accessory:'#8b5cf6', tablet:'#06b6d4', spare:'#f59e0b' };

/* ══ 1. LOAD STOCK ══════════════════════════════════════════ */
async function loadStock() {
  const grid = document.getElementById('stockGrid');
  if (!grid) return;
  grid.innerHTML = `<div class="empty-state"><div class="spinner-border text-primary mb-2" style="width:2rem;height:2rem;"></div><p>جاري التحميل...</p></div>`;
  try {
    if (!window.supa) throw new Error('Supabase غير جاهز');
    const user = _usr();
    let q = _db().from('products').select('*').order('created_at',{ascending:false});
    if (!user.isMaster && user.branch_id)  q = q.eq('branch_id', user.branch_id);
    if (!user.isMaster && user.company_id) q = q.eq('company_id', user.company_id);
    const { data, error } = await q;
    if (error) throw error;
    stockProducts = data || [];
    _renderStats();
    _renderGrid();
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">
      <i class="fa fa-triangle-exclamation" style="color:#ef4444;"></i>
      <p>خطأ: ${_esc(err.message)}</p>
      <button class="btn btn-ghost btn-sm mt-2" onclick="loadStock()"><i class="fa fa-rotate-right"></i> إعادة المحاولة</button>
    </div>`;
  }
}

function _renderStats() {
  const c = { mobile:0, accessory:0, tablet:0, spare:0 };
  stockProducts.forEach(p => { if (c[p.category] !== undefined) c[p.category]++; });
  ['mobile','accessory','tablet','spare'].forEach(cat => {
    const key = 'stat' + cat[0].toUpperCase() + cat.slice(1);
    const el  = document.getElementById(key); if (el) el.textContent = c[cat];
  });
  const counts = { all: stockProducts.length, ...c };
  ['all','mobile','accessory','tablet','spare'].forEach(k => {
    const el = document.getElementById('cnt' + k[0].toUpperCase() + k.slice(1)); if (el) el.textContent = counts[k];
  });
  const sub = document.getElementById('stockSubTitle');
  if (sub) sub.textContent = `إجمالي ${stockProducts.length} منتج في الفرع الحالي`;
}

function _renderGrid() {
  const grid = document.getElementById('stockGrid'); if (!grid) return;
  let list = stockProducts;
  if (stockCategory !== 'all') list = list.filter(p => p.category === stockCategory);
  if (stockSearch.trim()) {
    const q = stockSearch.trim().toLowerCase();
    list = list.filter(p =>
      (p.name||'').toLowerCase().includes(q) ||
      (p.brand||'').toLowerCase().includes(q) ||
      (p.model||'').toLowerCase().includes(q)
    );
  }
  if (!list.length) {
    grid.innerHTML = `<div class="empty-state"><i class="fa fa-box-open"></i><p>لا توجد منتجات</p></div>`;
    return;
  }
  grid.innerHTML = list.map(p => {
    const cat  = p.category || 'mobile';
    const qCls = p.quantity <= 0 ? 'out' : p.quantity <= 2 ? 'low' : 'ok';
    const qTxt = p.quantity <= 0 ? '0 قطع' : p.quantity === 1 ? '1 قطعة' : `${p.quantity} قطع`;
    return `
    <div class="product-card ${_esc(cat)}">
      <div class="cat-badge ${_esc(cat)}"><i class="fa ${_esc(CAT_ICON[cat]||'fa-box')}"></i> ${_esc(CAT_LABEL[cat]||cat)}</div>
      <div class="p-name">${_esc(p.name)}</div>
      <div class="p-brand">${_esc([p.brand, p.model].filter(Boolean).join(' — ') || '—')}</div>
      <div class="p-footer">
        <div class="p-price english-num">${_fmt(p.sell_price)} ج.م</div>
        <div class="p-qty ${qCls}">${_esc(qTxt)}</div>
      </div>
      <div class="p-actions">
        ${p.quantity > 0
          ? `<button class="btn btn-primary btn-sm" style="flex:1;" onclick="openNewInvoice(${p.id})"><i class="fa fa-file-invoice"></i> بيع</button>`
          : `<button class="btn btn-ghost btn-sm" style="flex:1;" onclick="openSupplyModal(${p.id})"><i class="fa fa-plus"></i> إعادة تعبئة</button>`}
        <button class="btn btn-ghost btn-sm" onclick="openEditProduct(${p.id})"><i class="fa fa-pen"></i></button>
        <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})"><i class="fa fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

function setStockCategory(cat, btn) {
  stockCategory = cat;
  document.querySelectorAll('#view-stock .cat-tab').forEach(b => b.classList.remove('active'));
  if (btn) { btn.classList.add('active'); }
  else {
    const idx = { all:0, mobile:1, accessory:2, tablet:3, spare:4 };
    const tabs = document.querySelectorAll('#view-stock .cat-tab');
    if (tabs[idx[cat]]) tabs[idx[cat]].classList.add('active');
  }
  _renderGrid();
}

function stockSearchChanged(val) { stockSearch = val; _renderGrid(); }


/* ══ 2. ADD / EDIT PRODUCT ══════════════════════════════════ */
function _buildProductForm(p) {
  document.getElementById('pmForm').innerHTML = `
    <div class="form-row" style="grid-template-columns:1fr auto;gap:12px;margin-bottom:12px;">
      <div class="form-group">
        <label>اسم المنتج *</label>
        <input type="text" id="productName" placeholder="مثال: iPhone 15 Pro" value="${_esc(p.name||'')}">
      </div>
      <div class="form-group">
        <label>الفئة *</label>
        <select id="productCategory" style="min-width:140px;">
          <option value="mobile"    ${p.category==='mobile'    ?'selected':''}>📱 موبايل</option>
          <option value="accessory" ${p.category==='accessory' ?'selected':''}>🎧 اكسسوار</option>
          <option value="tablet"    ${p.category==='tablet'    ?'selected':''}>💻 تابلت / لابتوب</option>
          <option value="spare"     ${p.category==='spare'     ?'selected':''}>🔧 قطع غيار</option>
        </select>
      </div>
    </div>
    <div class="form-row" style="margin-bottom:12px;">
      <div class="form-group"><label>البراند</label><input type="text" id="productBrand" placeholder="Apple / Samsung..." value="${_esc(p.brand||'')}"></div>
      <div class="form-group"><label>الموديل / المواصفات</label><input type="text" id="productModel" placeholder="256GB / أسود" value="${_esc(p.model||'')}"></div>
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label>IMEI <span style="font-weight:400;color:#475569;">(للموبايلات — اختياري)</span></label>
      <input type="text" id="productImei" class="ltr" placeholder="351234567890123" value="${_esc(p.imei||'')}">
    </div>
    <div class="form-row cols-4" style="margin-bottom:0;">
      <div class="form-group"><label>سعر الشراء</label><input type="number" id="productCost" class="ltr english-num" placeholder="0" value="${p.cost_price||''}" style="text-align:right;"></div>
      <div class="form-group"><label>سعر البيع *</label><input type="number" id="productSell" class="ltr english-num" placeholder="0" value="${p.sell_price||''}" style="text-align:right;"></div>
      <div class="form-group"><label>الكمية</label><input type="number" id="productQty" class="ltr english-num" placeholder="0" value="${p.quantity||''}" style="text-align:right;"></div>
      <div class="form-group"><label>ضمان</label>
        <select id="productWarranty">
          <option value="0"  ${!p.warranty_months||p.warranty_months==0  ?'selected':''}>بدون</option>
          <option value="3"  ${p.warranty_months==3  ?'selected':''}>3 شهور</option>
          <option value="6"  ${p.warranty_months==6  ?'selected':''}>6 شهور</option>
          <option value="12" ${p.warranty_months==12 ?'selected':''}>12 شهر</option>
          <option value="24" ${p.warranty_months==24 ?'selected':''}>24 شهر</option>
        </select>
      </div>
    </div>`;
}

function openAddProduct() {
  document.getElementById('productModalTitle').textContent = 'منتج جديد';
  document.getElementById('productId').value = '';
  _buildProductForm({});
  document.getElementById('productModal').classList.add('open');
}

function openEditProduct(id) {
  const p = stockProducts.find(x => x.id === id); if (!p) return;
  document.getElementById('productModalTitle').textContent = 'تعديل المنتج';
  document.getElementById('productId').value = p.id;
  _buildProductForm(p);
  document.getElementById('productModal').classList.add('open');
}

function closeProductModal() { document.getElementById('productModal').classList.remove('open'); }

async function saveProduct() {
  const id   = document.getElementById('productId').value;
  const name = document.getElementById('productName').value.trim();
  const sell = Number(document.getElementById('productSell').value) || 0;
  if (!name) return showToast('أدخل اسم المنتج', false);
  if (!sell) return showToast('أدخل سعر البيع', false);
  setLoading('btnSaveProduct', true);
  try {
    const user = _usr();
    const payload = {
      name, category: document.getElementById('productCategory').value,
      brand: document.getElementById('productBrand').value.trim(),
      model: document.getElementById('productModel').value.trim(),
      imei:  document.getElementById('productImei').value.trim(),
      cost_price:      Number(document.getElementById('productCost').value) || 0,
      sell_price:      sell,
      quantity:        Number(document.getElementById('productQty').value) || 0,
      warranty_months: Number(document.getElementById('productWarranty').value) || 0,
      branch_id: user.branch_id||null, company_id: user.company_id||null,
      created_by: user.name||user.email||''
    };
    if (id) { const { error } = await _db().from('products').update(payload).eq('id', id); if (error) throw error; showToast('تم تحديث المنتج ✅', true); }
    else    { const { error } = await _db().from('products').insert([payload]); if (error) throw error; showToast('تمت الإضافة ✅', true); }
    closeProductModal();
    await loadStock();
  } catch (err) { showToast('خطأ: ' + err.message, false); }
  finally { setLoading('btnSaveProduct', false); }
}

async function deleteProduct(id) {
  const p = stockProducts.find(x => x.id === id);
  if (!p || !confirm(`حذف "${p.name}"؟`)) return;
  try {
    const { error } = await _db().from('products').delete().eq('id', id);
    if (error) throw error;
    showToast('تم الحذف', true);
    await loadStock();
  } catch (err) { showToast('خطأ: ' + err.message, false); }
}


/* ══ 3. INVOICE ═════════════════════════════════════════════ */
window.openNewInvoice = function(productId) {
  invoiceItems = [];
  document.getElementById('invClientName').value  = '';
  document.getElementById('invClientPhone').value = '';
  document.getElementById('invNotes').value       = '';
  document.getElementById('invoicePaid').value    = '';
  document.getElementById('invWarranty').value    = '0';
  document.querySelectorAll('#invoiceView .pay-type').forEach(b => b.classList.remove('active'));
  document.querySelector('#invoiceView .pay-type[data-type="cash"]')?.classList.add('active');
  switchStockTab('invoiceView');
  if (productId) { const p = stockProducts.find(x => x.id === productId); if (p) addInvoiceItem(p); }
  _renderInvoiceItems();
  filterInvoiceProducts('');
  const s = document.getElementById('invProductSearch'); if (s) s.value = '';
};

function closeInvoiceView() {
  switchStockTab('stockView');
}

function addInvoiceItem(product) {
  if (!product) return;
  const exists = invoiceItems.find(i => i.product.id === product.id);
  if (exists) {
    if (exists.qty < (product.quantity||99)) exists.qty++;
    else { showToast('لا يوجد مخزون كافٍ', false); return; }
  } else {
    invoiceItems.push({ product, qty:1, unit_price: product.sell_price });
  }
  _renderInvoiceItems();
}

function removeInvoiceItem(idx) { invoiceItems.splice(idx, 1); _renderInvoiceItems(); }

function _renderInvoiceItems() {
  const total   = invoiceItems.reduce((s, i) => s + i.qty * i.unit_price, 0);
  const listEl  = document.getElementById('invoiceItemsList');
  const summEl  = document.getElementById('invSummaryItems');
  const totalEl = document.getElementById('invoiceTotalDisplay');
  const vaultEl = document.getElementById('invoiceVaultImpact');

  if (!invoiceItems.length) {
    if (listEl)  listEl.innerHTML  = `<div style="text-align:center;color:var(--text3);font-size:12px;padding:12px;">لم تُضف منتجات بعد</div>`;
    if (summEl)  summEl.innerHTML  = `<div class="inv-summary-item"><span class="lbl">لا توجد منتجات</span><span class="val">—</span></div>`;
    if (totalEl) totalEl.textContent = '0 ج.م';
    if (vaultEl) vaultEl.textContent = '+ 0 ج.م';
  } else {
    if (listEl) listEl.innerHTML = invoiceItems.map((item, idx) => `
      <div class="added-item">
        <div class="item-qty">×${item.qty}</div>
        <div class="item-name">${_esc(item.product.name)}</div>
        <div class="item-price english-num">${_fmt(item.qty * item.unit_price)} ج.م</div>
        <button class="remove-item" onclick="removeInvoiceItem(${idx})"><i class="fa fa-times"></i></button>
      </div>`).join('');

    if (summEl) summEl.innerHTML =
      invoiceItems.map(i => `
        <div class="inv-summary-item">
          <span class="lbl">${_esc(i.product.name)} ×${i.qty}</span>
          <span class="val english-num">${_fmt(i.qty * i.unit_price)} ج.م</span>
        </div>`).join('') +
      `<div class="inv-summary-item">
        <span class="lbl">عدد الأصناف</span>
        <span class="val">${invoiceItems.length} صنف</span>
      </div>`;

    if (totalEl) totalEl.textContent = _fmt(total) + ' ج.م';
    if (vaultEl) vaultEl.textContent = '+ ' + _fmt(total) + ' ج.م';
  }

  const payType = document.querySelector('#invoiceView .pay-type.active')?.dataset.type;
  const paidEl  = document.getElementById('invoicePaid');
  if (paidEl && payType === 'cash') paidEl.value = total || '';
  updateRemaining();
}

function setPayType(type, btn) {
  document.querySelectorAll('#invoiceView .pay-type').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const total  = invoiceItems.reduce((s, i) => s + i.qty * i.unit_price, 0);
  const paidEl = document.getElementById('invoicePaid');
  if (paidEl) paidEl.value = type === 'cash' ? (total || '') : '';
  updateRemaining();
}

function updateRemaining() {
  const total = invoiceItems.reduce((s, i) => s + i.qty * i.unit_price, 0);
  const paid  = Number(document.getElementById('invoicePaid')?.value) || 0;
  const rem   = Math.max(0, total - paid);
  const el    = document.getElementById('invoiceRemaining');
  const box   = document.getElementById('remainingBox');
  if (el)  el.textContent = _fmt(rem) + ' ج.م';
  if (box) box.classList.toggle('warn', rem > 0);
}

function filterInvoiceProducts(q) {
  const container = document.getElementById('invoiceProductsList'); if (!container) return;
  const list = q
    ? stockProducts.filter(p => p.quantity > 0 && (
        (p.name||'').toLowerCase().includes(q.toLowerCase()) ||
        (p.brand||'').toLowerCase().includes(q.toLowerCase()) ||
        (p.model||'').toLowerCase().includes(q.toLowerCase())
      ))
    : stockProducts.filter(p => p.quantity > 0);

  if (!list.length) {
    container.innerHTML = `<div class="empty-state" style="padding:20px;grid-column:unset;">
      <i class="fa fa-magnifying-glass" style="font-size:24px;"></i>
      <p>${q ? 'لا توجد نتائج' : 'ابدأ الكتابة للبحث'}</p>
    </div>`;
    return;
  }

  container.innerHTML = list.slice(0, 8).map(p => `
    <div class="prod-result-row" onclick="addInvoiceItem(stockProducts.find(x=>x.id==${p.id}))">
      <div class="prod-result-icon" style="background:${CAT_BG[p.category]||CAT_BG.mobile};color:${CAT_CLR[p.category]||CAT_CLR.mobile};">
        <i class="fa ${_esc(CAT_ICON[p.category]||'fa-box')}"></i>
      </div>
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:700;color:var(--text);">${_esc(p.name)}</div>
        <div style="font-size:11px;color:var(--text2);">${_esc([p.brand,p.model].filter(Boolean).join(' — ')||'—')}</div>
      </div>
      <div style="text-align:left;flex-shrink:0;">
        <div style="font-size:14px;font-weight:800;color:var(--green);" class="english-num">${_fmt(p.sell_price)}</div>
        <div style="font-size:10px;color:var(--text2);">${p.quantity} متاح</div>
      </div>
      <button class="btn btn-primary btn-sm" style="pointer-events:none;"><i class="fa fa-plus"></i></button>
    </div>`).join('');
}

async function confirmInvoice() {
  if (!invoiceItems.length) return showToast('أضف منتجات للفاتورة', false);
  const clientName  = document.getElementById('invClientName')?.value.trim()  || '';
  const clientPhone = document.getElementById('invClientPhone')?.value.trim() || '';
  const warrantyM   = Number(document.getElementById('invWarranty')?.value)    || 0;
  const notes       = document.getElementById('invNotes')?.value.trim()        || '';
  const paid        = Number(document.getElementById('invoicePaid')?.value)    || 0;
  const total       = invoiceItems.reduce((s, i) => s + i.qty * i.unit_price, 0);
  const payType     = document.querySelector('#invoiceView .pay-type.active')?.dataset.type || 'cash';
  if (!clientName)  return showToast('أدخل اسم العميل', false);
  if (paid <= 0)    return showToast('أدخل المبلغ المدفوع', false);
  if (paid > total) return showToast('المدفوع أكبر من الإجمالي!', false);

  setLoading('btnConfirmInvoice', true);
  try {
    const user = _usr();
    let warrantyExpires = null;
    if (warrantyM > 0) { const d = new Date(); d.setMonth(d.getMonth()+warrantyM); warrantyExpires = d.toISOString().split('T')[0]; }
    const { data: inv, error: e1 } = await _db().from('invoices').insert([{
      invoice_number:'PENDING', client_name:clientName, client_phone:clientPhone,
      total, paid, payment_type:payType, warranty_expires:warrantyExpires, notes,
      branch_id:user.branch_id||null, company_id:user.company_id||null, created_by:user.name||user.email||''
    }]).select().single();
    if (e1) throw e1;
    await _db().from('invoice_items').insert(invoiceItems.map(i=>({ invoice_id:inv.id, product_id:i.product.id, product_name:i.product.name, quantity:i.qty, unit_price:i.unit_price })));
    for (const item of invoiceItems)
      await _db().from('products').update({ quantity: Math.max(0,(item.product.quantity||0)-item.qty) }).eq('id', item.product.id);
    await _updateVault(paid, 'add', `بيع - استوك | ${clientName}`);
    showToast('تمت الفاتورة بنجاح ✅', true);
    const snap = [...invoiceItems];
    printInvoice(inv.invoice_number||inv.id, clientName, clientPhone, snap, total, paid, warrantyExpires);
    invoiceItems = [];
    closeInvoiceView();
    await loadStock(); await loadInvoicesList();
    if (typeof fetchVaultBalance==='function') fetchVaultBalance();
    if (typeof loadDashboard==='function')     loadDashboard();
  } catch (err) { showToast('خطأ: '+err.message, false); }
  finally { setLoading('btnConfirmInvoice', false); }
}


/* ══ 4. SUPPLY ══════════════════════════════════════════════ */
function openSupplyModal(productId) {
  document.getElementById('supplyQty').value       = '';
  document.getElementById('supplyNotes').value     = '';
  document.getElementById('supplyTotalCost').textContent = '0 ج.م';
  if (productId) {
    document.getElementById('supplyProductId').value = productId;
    document.getElementById('supplySelectProduct').style.display = 'none';
    const p = stockProducts.find(x => x.id === productId);
    if (p) {
      document.getElementById('supplyProductName').textContent = p.name;
      document.getElementById('supplyProductMeta').textContent = [p.brand,p.model].filter(Boolean).join(' — ');
      document.getElementById('supplyCostPrice').value = p.cost_price || '';
    }
  } else {
    document.getElementById('supplyProductId').value = '';
    document.getElementById('supplyProductName').textContent = 'اختار منتجاً';
    document.getElementById('supplyProductMeta').textContent = '';
    document.getElementById('supplyCostPrice').value = '';
    document.getElementById('supplySelectProduct').style.display = 'block';
    const sel = document.getElementById('supplyProductSelect');
    if (sel) sel.innerHTML = '<option value="">— اختار المنتج —</option>' +
      stockProducts.map(p=>`<option value="${p.id}">${_esc(p.name)} (${p.quantity} قطعة)</option>`).join('');
  }
  document.getElementById('supplyModal').classList.add('open');
}
function closeSupplyModal() { document.getElementById('supplyModal').classList.remove('open'); }
function onSupplySelectChange(sel) {
  const p = stockProducts.find(x=>x.id==sel.value); if(!p) return;
  document.getElementById('supplyProductId').value = p.id;
  document.getElementById('supplyProductName').textContent = p.name;
  document.getElementById('supplyProductMeta').textContent = [p.brand,p.model].filter(Boolean).join(' — ');
  document.getElementById('supplyCostPrice').value = p.cost_price||'';
  updateSupplyCost();
}
function updateSupplyCost() {
  const qty  = Number(document.getElementById('supplyQty')?.value)      || 0;
  const cost = Number(document.getElementById('supplyCostPrice')?.value) || 0;
  const el   = document.getElementById('supplyTotalCost'); if(el) el.textContent = _fmt(qty*cost)+' ج.م';
}
async function confirmSupply() {
  const productId = document.getElementById('supplyProductId').value;
  const qty       = Number(document.getElementById('supplyQty').value)       || 0;
  const cost      = Number(document.getElementById('supplyCostPrice').value) || 0;
  const notes     = document.getElementById('supplyNotes').value.trim()      || '';
  if (!productId) return showToast('اختار منتجاً', false);
  if (qty<=0)     return showToast('أدخل الكمية', false);
  if (cost<=0)    return showToast('أدخل سعر الشراء', false);
  const product = stockProducts.find(p=>p.id==productId);
  if (!product) return showToast('المنتج غير موجود', false);
  setLoading('btnConfirmSupply', true);
  try {
    const user = _usr();
    await _db().from('products').update({ quantity:(product.quantity||0)+qty, cost_price:cost }).eq('id', productId);
    await _updateVault(qty*cost, 'subtract', `توريد - استوك | ${product.name} ×${qty}`);
    await _db().from('admin_logs').insert([{ action:'توريد - استوك', details:`${product.name} ×${qty} | ${_fmt(qty*cost)} ج.م`, created_by:user.name||user.email||'', branch_id:user.branch_id||null, company_id:user.company_id||null }]);
    showToast('تم التوريد ✅', true);
    closeSupplyModal(); await loadStock();
    if(typeof fetchVaultBalance==='function') fetchVaultBalance();
    if(typeof loadDashboard==='function')     loadDashboard();
  } catch(err) { showToast('خطأ: '+err.message, false); }
  finally { setLoading('btnConfirmSupply', false); }
}


/* ══ 5. VAULT ═══════════════════════════════════════════════ */
async function _updateVault(amount, direction, note) {
  const user=_usr(); const t=_now();
  let q = _db().from('accounts').select('*').ilike('name','%الخزنة%');
  if(user.branch_id) q=q.eq('branch_id',user.branch_id);
  const {data:vaults,error}=await q; if(error) throw error;
  const vault=(vaults||[])[0]; if(!vault) throw new Error('حساب الخزنة غير موجود');
  const newBal = direction==='add' ? (Number(vault.balance)||0)+Number(amount) : (Number(vault.balance)||0)-Number(amount);
  await _db().from('accounts').update({balance:newBal}).eq('id',vault.id);
  await _db().from('transactions').insert([{
    date:t.date, time:t.time,
    type:direction==='add'?'بيع - استوك':'توريد - استوك',
    amount:Number(amount), commission:0,
    wallet_name:vault.name||'الخزنة (الكاش)',
    provider:'الاستوك', balance_after:newBal, notes:note||'',
    added_by:user.name||user.email||'', client:'',
    comm_dest:'CASH', deduct_comm:false,
    branch_id:user.branch_id||null, company_id:user.company_id||null
  }]);
}


/* ══ 6. INVOICES LIST ═══════════════════════════════════════ */
async function loadInvoicesList() {
  const tbody=document.getElementById('invoicesTableBody'); if(!tbody) return;
  tbody.innerHTML=`<tr><td colspan="7" class="text-center p-4"><div class="spinner-border spinner-border-sm text-primary"></div></td></tr>`;
  try {
    const user=_usr();
    let q=_db().from('invoices').select('*,invoice_items(product_name,quantity)').order('created_at',{ascending:false}).limit(100);
    if(!user.isMaster&&user.branch_id)  q=q.eq('branch_id',user.branch_id);
    if(!user.isMaster&&user.company_id) q=q.eq('company_id',user.company_id);
    const{data,error}=await q; if(error) throw error;
    allInvoices=data||[];
    _renderInvoicesTable(allInvoices); _updateInvStats(allInvoices);
  } catch(err) {
    tbody.innerHTML=`<tr><td colspan="7" class="text-center text-danger p-4">خطأ: ${_esc(err.message)}</td></tr>`;
  }
}

function _updateInvStats(list) {
  const paid=list.filter(i=>!i.remaining||i.remaining<=0).length;
  const partial=list.filter(i=>i.remaining&&i.remaining>0).length;
  const total=list.reduce((s,i)=>s+(Number(i.total)||0),0);
  const e1=document.getElementById('invCountPaid');    if(e1) e1.textContent=paid;
  const e2=document.getElementById('invCountPartial'); if(e2) e2.textContent=partial;
  const e3=document.getElementById('invTotalSales');   if(e3) e3.textContent=_fmt(total);
}

function _renderInvoicesTable(list) {
  const tbody=document.getElementById('invoicesTableBody'); if(!tbody) return;
  if(!list.length){ tbody.innerHTML=`<tr><td colspan="7" class="text-center p-4" style="color:var(--text3);">لا توجد فواتير</td></tr>`; return; }
  tbody.innerHTML=list.map(inv=>{
    const isPartial=inv.remaining&&inv.remaining>0;
    const status=isPartial
      ?`<span class="inv-status partial"><i class="fa fa-clock"></i> جزئية</span>`
      :`<span class="inv-status paid"><i class="fa fa-circle-check"></i> مكتملة</span>`;
    const products=(inv.invoice_items||[]).map(i=>_esc(i.product_name)).join('، ')||'—';
    const warranty=inv.warranty_expires
      ?`<span class="warranty-badge"><i class="fa fa-shield-halved"></i> ${_esc(inv.warranty_expires)}</span>`
      :`<span style="color:var(--text3);">—</span>`;
    return `
    <tr onclick="printInvoiceById(${inv.id})">
      <td><span class="inv-num">${_esc(inv.invoice_number||'#'+inv.id)}</span></td>
      <td><div class="inv-client"><div class="name">${_esc(inv.client_name||'—')}</div>${inv.client_phone?`<div class="phone">${_esc(inv.client_phone)}</div>`:''}</div></td>
      <td style="font-size:12px;color:var(--text2);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${products}">${products}</td>
      <td>${warranty}</td>
      <td><div class="inv-amount"><div class="total english-num">${_fmt(inv.total)} ج.م</div>${isPartial?`<div class="remaining">متبقي: ${_fmt(inv.remaining)} ج.م</div>`:''}</div></td>
      <td>${status}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();printInvoiceById(${inv.id})"><i class="fa fa-print"></i></button></td>
    </tr>`;
  }).join('');
}

function filterInvoicesTable(q) {
  if(!q.trim()){_renderInvoicesTable(allInvoices);return;}
  const t=q.trim().toLowerCase();
  _renderInvoicesTable(allInvoices.filter(i=>(i.client_name||'').toLowerCase().includes(t)||(i.invoice_number||'').toLowerCase().includes(t)));
}


/* ══ 7. PRINT ═══════════════════════════════════════════════ */
function printInvoice(invNum, clientName, clientPhone, items, total, paid, warrantyExpires) {
  const rem=total-paid; const user=_usr(); const today=new Date().toLocaleDateString('ar-EG');
  const rows=items.map(i=>`<tr><td>${_esc(i.product.name)}${i.qty>1?` ×${i.qty}`:''}</td><td style="text-align:left;font-weight:700;">${_fmt(i.qty*i.unit_price)} ج.م</td></tr>`).join('');
  const win=window.open('','_blank','width=480,height=720'); if(!win) return;
  win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800;900&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Cairo',sans-serif;background:#fff;color:#1e293b;padding:24px;direction:rtl;font-size:13px;}
.ph{font-size:20px;font-weight:900;color:#1d4ed8;margin-bottom:4px;}.ps{font-size:11px;color:#64748b;margin-bottom:16px;padding-bottom:14px;border-bottom:2px dashed #e2e8f0;}
.info-row{display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:14px;}
.client-box{background:#f8fafc;border-radius:8px;padding:12px;margin-bottom:14px;}
.client-name{font-size:13px;font-weight:700;color:#0f172a;}.client-phone{font-size:11px;color:#475569;margin-top:2px;}
table{width:100%;border-collapse:collapse;margin-bottom:12px;}
th{background:#f1f5f9;padding:8px;font-size:10px;font-weight:700;color:#475569;text-align:right;}
td{padding:8px;border-bottom:1px solid #f1f5f9;}
.pi-total{display:flex;justify-content:space-between;padding:10px 0;font-weight:800;font-size:15px;color:#1d4ed8;border-top:2px solid #1d4ed8;}
.pay-row{display:flex;justify-content:space-between;font-size:12px;color:#64748b;padding:3px 0;}
.warranty-box{background:#eff6ff;border-radius:8px;padding:10px 12px;margin-top:14px;display:flex;align-items:center;gap:8px;}
.footer{text-align:center;font-size:10px;color:#94a3b8;margin-top:16px;padding-top:12px;border-top:1px dashed #e2e8f0;}
@media print{body{padding:10px;}}</style></head><body>
<div class="ph">SADEK CASH</div>
<div class="ps">فاتورة مبيعات — ${_esc(user.branch_name||'الفرع')}</div>
<div class="info-row"><span>رقم الفاتورة: <strong style="color:#0f172a;">${invNum}</strong></span><span>التاريخ: <strong style="color:#0f172a;">${today}</strong></span></div>
<div class="client-box"><div class="client-name">${_esc(clientName||'عميل')}</div>${clientPhone?`<div class="client-phone">📞 ${_esc(clientPhone)}</div>`:''}</div>
<div style="font-size:10px;color:#64748b;margin-bottom:8px;font-weight:700;">تفاصيل الفاتورة</div>
<table><thead><tr><th>المنتج</th><th style="text-align:left;">السعر</th></tr></thead><tbody>${rows}</tbody></table>
<div class="pi-total"><span>الإجمالي</span><span>${_fmt(total)} ج.م</span></div>
<div style="margin-top:10px;"><div class="pay-row"><span>المدفوع</span><span style="color:#10b981;font-weight:700;">${_fmt(paid)} ج.م</span></div>${rem>0?`<div class="pay-row"><span>المتبقي</span><span style="color:#f59e0b;font-weight:700;">${_fmt(rem)} ج.م</span></div>`:''}</div>
${warrantyExpires?`<div class="warranty-box"><span style="font-size:18px;">🛡️</span><div><div style="font-size:11px;font-weight:700;color:#1d4ed8;">ضمان حتى ${warrantyExpires}</div><div style="font-size:10px;color:#3b82f6;">يُرجى الاحتفاظ بهذه الفاتورة</div></div></div>`:''}
<div class="footer">شكراً لتعاملكم معنا 🙏</div>
<script>window.onload=()=>{setTimeout(()=>window.print(),400);}<\/script></body></html>`);
  win.document.close();
}

async function printInvoiceById(id) {
  try {
    const{data:inv,error:e1}=await _db().from('invoices').select('*').eq('id',id).single(); if(e1) throw e1;
    const{data:items,error:e2}=await _db().from('invoice_items').select('*').eq('invoice_id',id); if(e2) throw e2;
    printInvoice(inv.invoice_number||inv.id,inv.client_name,inv.client_phone,(items||[]).map(i=>({product:{name:i.product_name},qty:i.quantity,unit_price:i.unit_price})),inv.total,inv.paid,inv.warranty_expires);
  } catch(err) { showToast('خطأ في تحميل الفاتورة', false); }
}


/* ══ 8. INIT ════════════════════════════════════════════════ */
window.initStockView = async function() {
  switchStockTab('stockView');
  stockCategory='all'; stockSearch='';
  document.querySelectorAll('#view-stock .cat-tab').forEach((b,i)=>b.classList.toggle('active',i===0));
  let tries=0;
  while(!window.supa && tries<20){ await new Promise(r=>setTimeout(r,300)); tries++; }
  await Promise.all([loadStock(), loadInvoicesList()]);
};