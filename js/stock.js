/* ================================================================
   stock.js — SADEK CASH
   ================================================================ */

   'use strict';

/* ══ TAB NAVIGATION ══════════════════════════════════════════ */
function switchStockTab(tabId) {
  document.querySelectorAll('#view-stock .stk-screen').forEach(s => {
    s.style.display = 'none';
    s.classList.remove('active');
  });
  document.querySelectorAll('.stk-tab').forEach(t => t.classList.remove('active'));
  const target = document.getElementById(tabId);
  if (target) { target.style.display = 'block'; target.classList.add('active'); }
  const tabMap = { stockView: 0, invoiceView: 1, invoicesListView: 2 };
  const idx = tabMap[tabId];
  const navTabs = document.querySelectorAll('.stk-tab');
  if (idx !== undefined && navTabs[idx]) navTabs[idx].classList.add('active');
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


async function _waitReady() {
  let t=0; while(!window.supa&&t<30){await new Promise(r=>setTimeout(r,200));t++;}
  if(!window.supa) throw new Error('Supabase غير جاهز');
  t=0; while(!window.currentUserData?.company_id&&t<20){await new Promise(r=>setTimeout(r,200));t++;}
}
let stockProducts = [];
let stockCategory = 'all';
let stockSearch   = '';
let invoiceItems  = [];
let allInvoices   = [];
let allClients    = [];   // for ajel

const CAT_LABEL = { mobile:'موبايل', accessory:'اكسسوار', tablet:'تابلت/لابتوب', spare:'قطع غيار',all: 'الكل',
  mobile: 'هواتف',
  accessory: 'إكسسوارات',
  tablet: 'تابلت',
  spare: 'قطع غيار'
 };
const CAT_ICON  = { mobile:'fa-mobile-screen', accessory:'fa-headphones', tablet:'fa-tablet-screen-button', spare:'fa-screwdriver-wrench' };
const CAT_BG    = { mobile:'rgba(59,130,246,0.12)', accessory:'rgba(139,92,246,0.12)', tablet:'rgba(6,182,212,0.12)', spare:'rgba(245,158,11,0.12)' };
const CAT_CLR   = { mobile:'#3b82f6', accessory:'#8b5cf6', tablet:'#06b6d4', spare:'#f59e0b' };

/* ══ 1. LOAD STOCK ══════════════════════════════════════════ */
async function loadStock() {
  const grid = document.getElementById('stockGrid');
  if (!grid) return;

  grid.innerHTML = `<div class="empty-state"><div class="spinner-border text-primary"></div><p class="mt-2">جاري جلب المنتجات...</p></div>`;

  try {
    // 1. التأكد من اتصال السيرفر
    if (!window.supa) {
        let t = 0; while(!window.supa && t<20){ await new Promise(r=>setTimeout(r,200)); t++; }
    }

    const user = window.currentUserData || {};
    console.log("Current User for Filtering:", user); // للـ Debugging

    // 2. بناء الاستعلام
    let q = window.supa.from('products').select('*');

    // 3. الفلترة الذكية
    if (!user.isMaster) {
      // إذا كان مستخدم عادي، سنحاول جلب منتجات فرعه أو المنتجات العامة (NULL)
      // ملاحظة: لدعم الـ OR في Supabase نستخدم فلتر .or
      if (user.branch_id) {
         q = q.or(`branch_id.eq.${user.branch_id},branch_id.is.null`);
      }
      
      if (user.company_id) {
         q = q.eq('company_id', user.company_id);
      }
    }

    // ترتيب المضاف حديثاً أولاً
    q = q.order('created_at', { ascending: false });

    const { data, error } = await q;
    if (error) throw error;

    console.log(`Loaded ${data?.length || 0} products`); // لعرض عدد المنتجات في الـ Console

    stockProducts        = data || [];   // متغير محلي
    window.stockProducts = stockProducts; // متغير عالمي — لازم متزامنين

    _renderStats();  // تحديث العدادات
    _renderGrid();   // رسم الكروت

  } catch (err) {
    console.error('Final Load Error:', err);
    grid.innerHTML = `<div class="empty-state text-danger"><p>حدث خطأ: ${err.message}</p></div>`;
  }
}
function _renderStats() {
  const products = window.stockProducts || [];
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  // عداد لكل قسم
  const cnt = { mobile:0, accessory:0, tablet:0, spare:0 };
  products.forEach(p => { if (cnt[p.category] !== undefined) cnt[p.category]++; });

  // الكروت الكبيرة (statMobile etc.)
  s('statMobile',    cnt.mobile);
  s('statAccessory', cnt.accessory);
  s('statTablet',    cnt.tablet);
  s('statSpare',     cnt.spare);

  // الأرقام في تابات الفلتر (cntAll etc.)
  s('cntAll',       products.length);
  s('cntMobile',    cnt.mobile);
  s('cntAccessory', cnt.accessory);
  s('cntTablet',    cnt.tablet);
  s('cntSpare',     cnt.spare);

  // العنوان الفرعي
  s('stockSubTitle', `إجمالي ${products.length} منتج`);
}
function _renderGrid() {
  const grid = document.getElementById('stockGrid');
  if (!grid) return;

  // تأكد من استخدام المصفوفة العالمية
  let list = window.stockProducts || [];

  // 1. الفلترة حسب القسم
  if (stockCategory !== 'all') {
    list = list.filter(p => p.category === stockCategory);
  }

  // 2. الفلترة حسب البحث
  if (stockSearch && stockSearch.trim()) {
    const q = stockSearch.trim().toLowerCase();
    list = list.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.brand || '').toLowerCase().includes(q) ||
      (p.model || '').toLowerCase().includes(q)
    );
  }

  // 3. لو مفيش بيانات
  if (!list.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fa fa-box-open" style="font-size:3rem; color:#ccc; margin-bottom:1rem;"></i>
        <p>لا توجد منتجات حالياً</p>
      </div>`;
    return;
  }

  // 4. الرسم
  grid.innerHTML = list.map(p => {
    const cat  = p.category || 'mobile';
    const qCls = p.quantity <= 0 ? 'out' : p.quantity <= 2 ? 'low' : 'ok';
    const qTxt = p.quantity <= 0 ? 'نفذت' : p.quantity === 1 ? 'قطعة واحدة' : `${p.quantity} قطع`;
    
    // استخدام الرموز من القاموس مع حماية لو مش موجودة
    const icon = CAT_ICON[cat] || 'fa-box';
    const label = CAT_LABEL[cat] || cat;

    return `
      <div class="product-card ${_esc(cat)}">
        <div class="cat-badge ${_esc(cat)}"><i class="fa ${icon}"></i> ${_esc(label)}</div>
        <div class="p-name">${_esc(p.name)}</div>
        <div class="p-brand">${_esc([p.brand, p.model].filter(Boolean).join(' — ') || '—')}</div>
        <div class="p-footer">
          <div class="p-price english-num">${_fmt(p.sell_price)} ج.م</div>
          <div class="p-qty ${qCls}">${_esc(qTxt)}</div>
        </div>
        <div class="p-actions">
          ${p.quantity > 0
            ? `<button class="btn btn-primary btn-sm" style="flex:1;" onclick="openNewInvoice(${p.id})"><i class="fa fa-file-invoice"></i> بيع</button>`
            : `<button class="btn btn-ghost btn-sm" style="flex:1;" onclick="showToast('الكمية غير كافية', false)"><i class="fa fa-minus-circle"></i> نفذ</button>`}
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
  _setAjelSection(false);
  const s = document.getElementById('invProductSearch'); if (s) s.value = '';
};

function closeInvoiceView() { switchStockTab('stockView'); }

function addInvoiceItem(product) {
  if (!product) return;
  const existing = invoiceItems.find(i => i.product.id === product.id);
  if (existing) {
    if (existing.qty < (product.quantity || 99)) { existing.qty++; }
    else { showToast('لا يوجد مخزون كافٍ', false); return; }
  } else {
    invoiceItems.push({ product, qty: 1, unit_price: product.sell_price || 0 });
  }
  _renderInvoiceItems();
}
function addInvoiceItemById(id) {
  const product = (window.stockProducts || stockProducts).find(p => p.id == id);
  if (!product) return;
  addInvoiceItem(product);
  // أعد رسم قائمة المنتجات مع الكميات المحدثة
  const searchInput = document.getElementById('invProductSearch');
  _renderInvoiceProductList(searchInput?.value || '');
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
  if (paidEl) paidEl.value = (type === 'cash') ? (total || '') : '';
  _setAjelSection(type === 'ajel');
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

function filterInvoiceProducts(query){ _renderInvoiceProductList(query||''); }

function _renderInvoiceProductList(query){
  /* الـ ID الصح في HTML */
  const listEl=document.getElementById('invoiceProductsList'); if(!listEl) return;
  const q=query.trim().toLowerCase();
  const src=window.stockProducts?.length?window.stockProducts:stockProducts;
  let list=src.filter(p=>(p.quantity||0)>0);
  if(q) list=list.filter(p=>(p.name||'').toLowerCase().includes(q)||(p.brand||'').toLowerCase().includes(q)||(p.model||'').toLowerCase().includes(q));
  if(!list.length){
    listEl.innerHTML=`<div style="text-align:center;padding:16px;color:var(--s-text3,#475569);font-size:12px;">
      <i class="fa fa-box-open" style="font-size:20px;display:block;margin-bottom:6px;opacity:.4;"></i>
      ${q?'لا توجد نتائج للبحث':'لا توجد منتجات متاحة'}</div>`;
    return;
  }
  const bg  ={mobile:'rgba(59,130,246,.12)',accessory:'rgba(139,92,246,.12)',tablet:'rgba(6,182,212,.12)',spare:'rgba(245,158,11,.12)'};
  const clr ={mobile:'#3b82f6',accessory:'#8b5cf6',tablet:'#06b6d4',spare:'#f59e0b'};
  const icon={mobile:'fa-mobile-screen',accessory:'fa-headphones',tablet:'fa-tablet-screen-button',spare:'fa-screwdriver-wrench'};
  listEl.innerHTML=list.slice(0,20).map(p=>`
    <div class="inv-product-row" onclick="addInvoiceItemById(${p.id})">
      <div class="inv-product-icon" style="background:${bg[p.category]||bg.mobile};color:${clr[p.category]||clr.mobile};">
        <i class="fa ${icon[p.category]||'fa-box'}"></i>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(p.name)}</div>
        <div style="font-size:10px;color:var(--s-text2,#94a3b8);">${_esc([p.brand,p.model].filter(Boolean).join(' · '))||'—'}</div>
      </div>
      <div style="text-align:left;flex-shrink:0;">
        <div style="font-size:13px;font-weight:900;color:var(--s-green,#10b981);" class="english-num">${_fmt(p.sell_price)}</div>
        <div style="font-size:9px;color:var(--s-text2,#94a3b8);">${p.quantity} متاح</div>
      </div>
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
  const ajelClientId = document.getElementById('ajelClientSelect')?.value;

  if (!clientName)  return showToast('أدخل اسم العميل', false);
  if (paid > total) return showToast('المدفوع أكبر من الإجمالي!', false);
  if (payType === 'ajel' && !ajelClientId) return showToast('يجب اختيار عميل مسجل للأجل', false);

  setLoading('btnConfirmInvoice', true);
  try {
    const user = _usr();
    const remainingToPay = total - paid; // نحسبها محلياً لخصمها من العميل فقط
    
    let warrantyExpires = null;
    if (warrantyM > 0) { 
        const d = new Date(); d.setMonth(d.getMonth() + warrantyM); 
        warrantyExpires = d.toISOString().split('T')[0]; 
    }

    // 1. إنشاء الفاتورة (بدون إرسال حقل remaining لتجنب خطأ non-DEFAULT)
    const { data: inv, error: e1 } = await _db().from('invoices').insert([{
      invoice_number: 'PENDING',
      client_id: ajelClientId ? parseInt(ajelClientId) : null, // إرسال المعرف كرقم
      client_name: clientName,
      client_phone: clientPhone,
      total,
      paid,
      payment_type: payType,
      warranty_expires: warrantyExpires,
      notes,
      branch_id: user.branch_id || null,
      company_id: user.company_id || null,
      created_by: user.name || user.email || ''
    }]).select().single();
    
    if (e1) throw e1;

    // 2. إضافة الأصناف وتحديث المخزون
    await _db().from('invoice_items').insert(invoiceItems.map(i => ({ 
        invoice_id: inv.id, 
        product_id: i.product.id, 
        product_name: i.product.name, 
        quantity: i.qty, 
        unit_price: i.unit_price 
    })));

    for (const item of invoiceItems) {
      await _db().from('products')
        .update({ quantity: Math.max(0, (item.product.quantity || 0) - item.qty) })
        .eq('id', item.product.id);
    }

    // 3. تحديث الخزنة (للكاش المدفوع فقط)
    if (paid > 0) await _updateVault(paid, 'add', `بيع - استوك | ${clientName}`);

    // 4. 🔥 تحديث رصيد العميل بالمديونية (إذا كان الدفع آجل)
    if (payType === 'ajel' && remainingToPay > 0) {
      const { data: clientData } = await _db().from('clients').select('balance').eq('id', ajelClientId).single();
      const currentBalance = Number(clientData?.balance || 0);
      
      // نخصم المتبقي من الرصيد ليتسجل كمديونية
      await _db().from('clients')
        .update({ balance: currentBalance - remainingToPay })
        .eq('id', ajelClientId);
    }

    showToast('تم إتمام الفاتورة وتحديث المديونية ✅', true);
    
    const snap = [...invoiceItems];
    printInvoice(inv.invoice_number || inv.id, clientName, clientPhone, snap, total, paid, warrantyExpires);
    
    invoiceItems = [];
    closeInvoiceView();
    await loadStock(); 
    await loadInvoicesList();
    if (typeof fetchVaultBalance === 'function') fetchVaultBalance();

  } catch (err) { 
    console.error("Invoice Error:", err);
    showToast('خطأ: ' + err.message, false); 
  } finally { 
    setLoading('btnConfirmInvoice', false); 
  }
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
    /* انتظر Supabase */
    let tries=0;
    while(!window.supa && tries<20){ await new Promise(r=>setTimeout(r,300)); tries++; }
    if(!window.supa) throw new Error('Supabase غير جاهز');
    /* انتظر بيانات المستخدم */
    tries=0;
    while((!window.currentUserData||!window.currentUserData.company_id) && tries<15){
      await new Promise(r=>setTimeout(r,300)); tries++;
    }
    const user=_usr();
    let q=_db().from('invoices').select('*,invoice_items(product_name,quantity)').order('created_at',{ascending:false}).limit(100);
    if(!user.isMaster&&user.branch_id)  q=q.eq('branch_id',user.branch_id);
    if(!user.isMaster&&user.company_id) q=q.eq('company_id',user.company_id);
    const{data,error}=await q; if(error) throw error;
    allInvoices=data||[];
    _renderInvoicesTable(allInvoices); _updateInvStats(allInvoices);
  } catch(err) {
    tbody.innerHTML=`<tr><td colspan="7" class="text-center text-danger p-4"><i class="fa fa-triangle-exclamation me-2"></i>خطأ: ${_esc(err.message)}<br><button class="btn btn-ghost btn-sm mt-2" onclick="loadInvoicesList()"><i class="fa fa-rotate-right"></i> إعادة المحاولة</button></td></tr>`;
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




/* ════════════════════════════════════════
   AJEL SYSTEM — نظام الأجل
════════════════════════════════════════ */
function _setAjelSection(on){
  const sec=document.getElementById('ajelSection'); if(!sec) return;
  sec.style.display=on?'block':'none';
  if(on) _loadClientsForAjel();
}

async function _loadClientsForAjel(){
  const sel=document.getElementById('ajelClientSelect'); if(!sel) return;
  sel.innerHTML='<option value="">جاري التحميل...</option>';
  try{
    await _waitReady();
    const user=_usr();
    let q=_db().from('clients').select('id,name,number,balance').order('name');
    /* استخدام applyBranchFilter من branches.js — بتحط company_id + branch_id صح */
    if(typeof applyBranchFilter === 'function'){
      q = applyBranchFilter(q, user);
    } else {
      /* fallback لو مش موجودة */
      if(user.company_id) q = q.eq('company_id', user.company_id);
      if(!user.isMaster && user.branch_id) q = q.eq('branch_id', user.branch_id);
    }
    const{data,error}=await q; if(error) throw error;
    allClients=data||[];
    if(!allClients.length){
      sel.innerHTML='<option value="">لا يوجد عملاء في هذا الفرع</option>';
      return;
    }
    sel.innerHTML='<option value="">— اختار العميل —</option>'+
      allClients.map(cl=>{
        const bal=Number(cl.balance)||0;
        const balTxt=bal<0?`مديون ${_fmt(Math.abs(bal))}`:`رصيد ${_fmt(bal)}`;
        return `<option value="${cl.id}">${_esc(cl.name)}${cl.number?' | '+_esc(cl.number):''} | ${balTxt} ج.م</option>`;
      }).join('');
  }catch(err){
    sel.innerHTML='<option value="">خطأ في التحميل</option>';
    console.error('_loadClientsForAjel:',err);
  }
}

function onAjelClientChange(sel){
  const client=allClients.find(c=>c.id==sel.value);
  const info=document.getElementById('ajelClientInfo'); if(!info) return;
  if(client){
    const bal=Number(client.balance)||0;
    info.style.display='flex';
    info.innerHTML=`
      <i class="fa fa-user" style="color:var(--s-cyan,#06b6d4);font-size:18px;"></i>
      <div style="flex:1;">
        <div style="font-weight:800;font-size:13px;color:var(--s-text,#f1f5f9);">${_esc(client.name)}</div>
        ${client.number?`<div style="font-size:11px;color:var(--s-text2,#94a3b8);">${_esc(client.number)}</div>`:''}
      </div>
      <div style="font-size:14px;font-weight:900;color:${bal<0?'var(--s-red,#ef4444)':'var(--s-green,#10b981)'};" class="english-num">
        <div style="font-size:9px;font-weight:600;margin-bottom:2px;">${bal<0?'عليه دين':'رصيد له'}</div>
        ${_fmt(Math.abs(bal))} ج.م
      </div>`;
  }else{
    info.style.display='none'; info.innerHTML='';
  }
}
window.onAjelClientChange = onAjelClientChange;

/* ══ 8. INIT ════════════════════════════════════════════════ */
window.initStockView = async function() {
  switchStockTab('stockView');
  stockCategory='all'; stockSearch='';
  document.querySelectorAll('#view-stock .cat-tab').forEach((b,i)=>b.classList.toggle('active',i===0));
  await loadStock();
};