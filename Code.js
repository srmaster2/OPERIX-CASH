const COL = { 
  NAME:0, BAL:1, LO:2, LI:3, UDO:4, UDI:5, LM:6, PROF:7, UMO:8, LD:9, LM_D:10, PIN:11, 
  UMI:12, // الاستخدام الشهري الوارد (M)
  TAG: 13 // 👈 العمود الجديد للوسم (N)
};

function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    const menu = ui.createMenu('⚡ Sadek Cash')
        .addItem('📱 فتح السيستم', 'showSidebar')
        .addSeparator()
        .addItem('📊 تحديث رسومات الشيت', 'drawDashboard');

    // خيارات متقدمة تظهر للأدمن (الماستر والمساعد)
    if (getUserRole() === 'ADMIN') {
       menu.addSeparator()
           .addItem('🔓 فتح الحماية (للتعديل اليدوي)', 'disableProtection')
           .addItem('🔒 تفعيل الحماية (إغلاق التعديل)', 'enableProtection')
           .addSeparator()
           .addItem('⚙️ ضبط المصنع', 'factoryReset')
           .addSeparator()
           .addItem('🚨 تشغيل إصلاح الطوارئ (EMERGENCY FIX)', 'runEmergencyFix'); // زر تشغيل التنظيف القسري
    }
    
    menu.addToUi();
  } catch (e) {}
}
// دالة للتحقق مما إذا كان المستخدم الحالي هو المالك/الأدمن
function checkIfAdmin() {
  const role = getUserRole(); // تعتمد على الكود الموجود لديك الذي يفحص الإيميل 
  return role === 'ADMIN';
}
function showSidebar() {
  // خطوة جديدة: فحص وتصفير اللييمتات (Lazy Reset) عند فتح السيستم
  resetLimitsIfNeeded(); 
    
  const html = HtmlService.createHtmlOutputFromFile('Page')
      .setTitle('Sadek Cash | Control Center')
      .setWidth(750)
      .setHeight(1600);
  SpreadsheetApp.getUi().showModelessDialog(html, 'Sadek Cash | Control Center');
}

// =====================================================================
// 🔐 دوال التحقق والصلاحيات
// =====================================================================

function isMasterUser() {
  return Session.getActiveUser().getEmail().toLowerCase() === MASTER_EMAIL.toLowerCase();
}

function getUserRole() {
  const userEmail = Session.getActiveUser().getEmail().toLowerCase();
  if (userEmail === MASTER_EMAIL.toLowerCase()) return 'ADMIN';
  
  try {
    const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("الصلاحيات");
    if (!ws || ws.getLastRow() < 2) return 'GUEST';
    const data = ws.getRange(2, 1, ws.getLastRow() - 1, 3).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim().toLowerCase() === userEmail) {
        return String(data[i][2]).trim().toUpperCase() === 'ADMIN' ? 'ADMIN' : 'USER';
      }
    }
  } catch (e) { return 'GUEST'; }
  return 'GUEST';
}

function getUserSessionData() {
  return {
    role: getUserRole(),
    isMaster: isMasterUser()
  };
}

function getCurrentUserName() {
  const email = Session.getActiveUser().getEmail().toLowerCase();
  
  // 1. البحث أولاً في شيت الصلاحيات لجلب الاسم المخصص (سواء للمالك أو الموظف)
  try {
    const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("الصلاحيات");
    if (ws && ws.getLastRow() >= 2) {
      const data = ws.getRange(2, 1, ws.getLastRow()-1, 2).getValues();
      for(let row of data) {
        if(String(row[0]).trim().toLowerCase() === email) {
          return row[1]; // إرجاع الاسم المسجل في الشيت (مثلاً: صادق)
        }
      }
    }
  } catch (e) {}

  // 2. إذا لم يكن الاسم مسجلاً في الشيت، نستخدم الافتراضي
  if (email === MASTER_EMAIL.toLowerCase()) return "Master Admin";
  
  return email;
}
// =====================================================================
// 📊 دوال لوحة التحكم
// =====================================================================
function getDashboardStats() {
  try {
    const role = getUserRole();
    if (role !== 'ADMIN' && role !== 'USER') return { success: false, error: "⛔ لا يوجد صلاحية" };
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const wsAcc = ss.getSheetByName("الحسابات");
    const wsLedger = ss.getSheetByName("الدفتر");
    const wsClients = ss.getSheetByName("العملاء");

    if(!wsAcc || !wsLedger || !wsClients) return { success: false, error: "ملفات النظام مفقودة" };

    const COL = { NAME:0, BAL:1, LO:2, LI:3, UDO:4, UDI:5, LM:6, PROF:7, UMO:8, LD:9, LM_D:10 };

    // 1. الحسابات والمحافظ
    const accData = wsAcc.getDataRange().getValues();
    let cashBal = 0, walletBal = 0, compBal = 0;
    let walletsList = [], compList = [];

    if (accData.length > 1) {
      for(let i=1; i<accData.length; i++) {
        let name = String(accData[i][COL.NAME]);
        let bal = Number(accData[i][COL.BAL]) || 0;
        let limitOut = Number(accData[i][COL.LO]) || 0; 
        let usedOutDay = Number(accData[i][COL.UDO]) || 0;  
        let limitMon = Number(accData[i][COL.LM]) || 0;
        let usedMonTotal = Number(accData[i][COL.UMO]) || 0;

        if(name.includes("الخزنة") || name.includes("الكاش")) {
          cashBal = bal;
        } else if (limitOut > 10000000) {
          compBal += bal;
          compList.push({name: name, bal: bal});
        } else {
          walletBal += bal;
          walletsList.push({
            name: name, 
            bal: bal,
            limDay: limitOut, 
            usedDay: usedOutDay, 
            remDay: Math.max(0, limitOut - usedOutDay),
            limMon: limitMon, 
            usedMon: usedMonTotal, 
            remMon: Math.max(0, limitMon - usedMonTotal) 
          });
        }
      }
    }

    // 2. العملاء والمديونيات
    let clientsOweMe = 0;
    let clientsHave = 0;
    let clientsCardList = []; 

    if(wsClients.getLastRow() > 1){
      const clData = wsClients.getDataRange().getValues();
      for(let i=1; i<clData.length; i++){
        let name = String(clData[i][0]);
        let bal = Number(clData[i][2]) || 0;
        
        if(name) clientsCardList.push({name: name, bal: bal});
        if(bal < 0) clientsOweMe += Math.abs(bal); 
        else clientsHave += bal;
      }
    }

    // --- 🟢 الإضافة الجديدة: حساب السيولة المتاحة فقط ---
    let totalAvailable = cashBal + walletBal + compBal;

    // حساب الإجمالي الكلي (الصافي مع الديون)
    let grandTotal = (totalAvailable + clientsOweMe) - clientsHave;

    // 3. الأرباح والمصروفات
    const ledgerData = wsLedger.getDataRange().getValues();
    let todayProfit = 0, monthProfit = 0, totalExp = 0;
    const now = new Date();
    const timeZone = ss.getSpreadsheetTimeZone();
    const todayStr = Utilities.formatDate(now, timeZone, "yyyy-MM-dd");
    const monthStr = Utilities.formatDate(now, timeZone, "yyyy-MM");

    if (ledgerData.length > 1) {
      for(let i=1; i<ledgerData.length; i++) {
        let rowDate = ledgerData[i][0];
        if(!(rowDate instanceof Date)) continue;
        
        let dStr = Utilities.formatDate(rowDate, timeZone, "yyyy-MM-dd");
        let mStr = Utilities.formatDate(rowDate, timeZone, "yyyy-MM");
        let comm = Number(ledgerData[i][4]) || 0; 
        let type = String(ledgerData[i][2]); 
        let amt = Number(ledgerData[i][3]) || 0; 

        if(dStr === todayStr) todayProfit += comm;
        if(mStr === monthStr) monthProfit += comm;
        if(type.includes("مصروف")) totalExp += amt;
      }
    }
    
    return {
      success: true,
      cash: cashBal,
      walletsTotal: walletBal,
      compTotal: compBal,
      totalAvailable: totalAvailable, // 👈 تم إرسال الرقم الجديد هنا
      grandTotal: grandTotal,
      clientsOweMe: clientsOweMe,
      clientsHave: clientsHave,
      companies: compList,
      clientsCards: clientsCardList,
      dayProf: todayProfit,
      monProf: monthProfit,
      exp: totalExp,
      wallets: walletsList 
    };
    
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// =====================================================================
// 📊 رسم الداشبورد (مقتصرة على الماستر للتحديث)
// =====================================================================
function drawDashboard() {
  // التحديث اليدوي والتلقائي مقتصران على الماستر فقط
  if (!isMasterUser()) {
     return;
  } 
  
const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName("الرئيسية");
  const wsAcc = ss.getSheetByName("الحسابات");
  const wsClients = ss.getSheetByName("العملاء");

  if (!ws || !wsAcc || !wsClients) return;

  ws.getRange("E:Z").breakApart(); // 💡 أضف هذا السطر // تنظيف
  ws.getRange("E:Z").clearContent(); 
  ws.getRange("E:Z").clearFormat();
  ws.setHiddenGridlines(true);

  // دالة المساعدة للرسم
  const drawCard = (row, col, title, formula, color, icon) => {
    try {
      ws.getRange(row, col, 1, 2).merge().setValue(`${icon} ${title}`)
        .setBackground(color).setFontColor("white").setFontWeight("bold")
        .setHorizontalAlignment("center").setVerticalAlignment("middle")
        .setBorder(true, true, false, true, true, true, color, null);

      ws.getRange(row + 1, col, 1, 2).merge().setFormula(formula)
        .setNumberFormat("#,##0").setFontSize(13).setFontWeight("bold")
        .setHorizontalAlignment("center").setVerticalAlignment("middle")
        .setBackground("#ffffff").setFontColor("#000000")
        .setBorder(false, true, true, true, true, true, color, null);
    } catch(e) {}
  };

  let r = 2; 

  // 1. الملخص المالي
  drawCard(r, 6, "الخزنة", `=IFERROR(VLOOKUP("الخزنة (الكاش)", 'الحسابات'!A:K, 2, 0), 0)`, "#10b981", "💵");
  drawCard(r, 8, "المحافظ", `=SUMIFS('الحسابات'!B:B, 'الحسابات'!C:C, "<10000000", 'الحسابات'!A:A, "<>الخزنة (الكاش)")`, "#3b82f6", "📱");
  drawCard(r, 10, "الشركات", `=SUMIFS('الحسابات'!B:B, 'الحسابات'!C:C, ">10000000", 'الحسابات'!A:A, "<>الخزنة (الكاش)")`, "#f59e0b", "🏢");
  drawCard(r, 12, "لينا (مديونيات)", `=ABS(SUMIF('العملاء'!C:C, "<0"))`, "#ef4444", "📉");
  drawCard(r, 14, "علينا (للعملاء)", `=SUMIF('العملاء'!C:C, ">0")`, "#8b5cf6", "🛒"); 

  r += 3;
  // 2. الإجمالي
  ws.getRange(r, 6, 1, 10).merge().setValue("الإجمالي الكلي (كاش + محافظ + شركات + لينا - علينا)").setBackground("#5b21b6").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");
  r += 1;
  ws.getRange(r, 6, 1, 10).merge().setFormula(`=SUM('الحسابات'!B:B) - SUMIF('العملاء'!C:C, "<>0")`).setBackground("#7c3aed").setFontColor("white").setFontSize(18).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle").setNumberFormat("#,##0");
  r += 2;

  // 3. كروت الشركات
  ws.getRange(r, 6, 1, 10).merge().setValue("⚡ شركات الدفع").setBackground("#b45309").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
  r += 2;
  const accData = wsAcc.getDataRange().getValues();
  let compCol = 6, compRow = r;
  for(let i=1; i<accData.length; i++) {
    let limit = Number(accData[i][2]);
    let name = String(accData[i][0]);
    if(limit > 10000000 && !name.includes("الخزنة")) {
        drawCard(compRow, compCol, name, `=IFERROR(VLOOKUP("${name}", 'الحسابات'!A:K, 2, 0), 0)`, "#d97706", "⚡");
        compCol += 2; 
        if(compCol >= 16) { compCol = 6; compRow += 3; } 
    }
  }
  if(compCol > 6) compRow += 3;
  r = compRow;

  // 4. كروت العملاء
  ws.getRange(r, 6, 1, 10).merge().setValue("👥 أرصدة العملاء").setBackground("#4b5563").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
  r += 2;
  const clData = wsClients.getDataRange().getValues();
  let clCol = 6, clRow = r;
  for(let i=1; i<clData.length; i++) {
    let bal = Number(clData[i][2]);
    let name = String(clData[i][0]);
    if(name) {
       let color = bal < 0 ? "#ef4444" : (bal > 0 ? "#10b981" : "#9ca3af");
       let form = `=IFERROR(VLOOKUP("${name}", 'العملاء'!A:C, 3, 0), 0)`;
       drawCard(clRow, clCol, name, form, color, "👤");
       clCol += 2;
       if(clCol >= 16) { clCol = 6; clRow += 3; }
    }
  }
  if(clCol > 6) clRow += 3; 
  r = clRow;

  // 5. مراقبة المحافظ
  ws.getRange(r, 6, 1, 10).merge().setValue("📊 مراقبة المحافظ (Live Monitor)").setBackground("#1f2937").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
  r++;
  const headers = ["اسم المحفظة","الرصيد","متبقي يومي","متبقي شهري","مؤشر الاستهلاك"];
  ws.getRange(r, 6, 1, 2).merge().setValue(headers[0]); 
  ws.getRange(r, 8, 1, 2).setValue(headers[1]);
  ws.getRange(r, 10, 1, 2).merge().setValue(headers[2]); 
  ws.getRange(r, 12, 1, 2).setValue(headers[3]);
  ws.getRange(r, 14, 1, 2).merge().setValue(headers[4]);
  ws.getRange(r, 6, 1, 10).setBackground("#cfd8dc").setFontWeight("bold").setHorizontalAlignment("center").setBorder(true,true,true,true,true,true,"#90a4ae",null);

  const dataRow = r + 1;
  ws.getRange(dataRow, 6).setFormula(`=IFERROR(FILTER('الحسابات'!A2:A, 'الحسابات'!A2:A<>"", 'الحسابات'!A2:A<>"الخزنة (الكاش)", 'الحسابات'!C2:C < 10000000), "")`);
  ws.getRange(dataRow, 8).setFormula(`=ARRAYFORMULA(IF(F${dataRow}:F="", "", IFERROR(VLOOKUP(F${dataRow}:F, 'الحسابات'!A:K, 2, 0),0)))`);
  ws.getRange(dataRow, 10).setFormula(`=ARRAYFORMULA(IF(F${dataRow}:F="", "", IFERROR(VLOOKUP(F${dataRow}:F,'الحسابات'!A:K,3,0)-VLOOKUP(F${dataRow}:F,'الحسابات'!A:K,5,0),0)))`);
  ws.getRange(dataRow, 12).setFormula(`=ARRAYFORMULA(IF(F${dataRow}:F="", "", IFERROR(VLOOKUP(F${dataRow}:F,'الحسابات'!A:K,7,0)-VLOOKUP(F${dataRow}:F,'الحسابات'!A:K,9,0),0)))`);
  ws.getRange(dataRow, 14).setFormula(`=MAP(J${dataRow}:J, F${dataRow}:F, LAMBDA(val, name, IF(OR(name="", val=""), "", IFERROR(SPARKLINE(MAX(0, val), {"charttype","bar";"max",VLOOKUP(name, 'الحسابات'!A:K, 3, 0); "color1", IF(val<2000, "#c62828", "#2e7d32")}), ""))))`);
  
  const tableRows = 50;
  ws.getRange(dataRow, 6, tableRows, 2).mergeAcross(); // الاسم
  ws.getRange(dataRow, 8, tableRows, 2).mergeAcross(); // الرصيد
  ws.getRange(dataRow, 10, tableRows, 2).mergeAcross(); // متبقي يومي
  ws.getRange(dataRow, 12, tableRows, 2).mergeAcross(); // متبقي شهري
  ws.getRange(dataRow, 14, tableRows, 2).mergeAcross(); // مؤشر
  
  ws.getRange(dataRow, 6, tableRows, 10).setHorizontalAlignment("center").setVerticalAlignment("middle").setBorder(true,true,true,true,true,true,"#eceff1",null);
  ws.getRange(dataRow, 8, tableRows, 6).setNumberFormat("#,##0");
}

// 💡 دالة جديدة لتشغيل رسم الداشبورد يدوياً من الواجهة
function drawDashboardManual() {
  const role = getUserRole();
  if (role !== 'ADMIN') {
    return { success: false, msg: "⛔ غير مصرح لك بتحديث الداشبورد" };
  }
  
  try {
    drawDashboard(); 
    return { success: true, msg: "✅ تم تحديث رسومات الداشبورد" };
  } catch (e) {
    return { success: false, msg: `❌ خطأ: ${e.message}` };
  }
}


function processTransaction(data) {
  const lock = LockService.getScriptLock();
  try {
    // تأمين العملية (30 ثانية)
    lock.waitLock(30000); 
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const wsAcc = ss.getSheetByName("الحسابات");
    const wsLog = ss.getSheetByName("الدفتر");
    const wsClients = ss.getSheetByName("العملاء");

    if (!wsAcc || !wsLog || !wsClients) return { success: false, msg: "❌ خطأ: ملفات النظام مفقودة" };

    let { wallet, type, provider, amount, comm, client, note, commDest } = data;
    const val = Number(amount);
    const fee = Number(comm) || 0;
    const userName = getCurrentUserName();
    
    // متغير لتخزين الرصيد النهائي لتسجيله في الدفتر
    let finalBalAfter = 0; 

    // التحقق من اسم العميل في عمليات الديون
    const isDebtOp = type.includes("مديونية") || type.includes("دين");
    if (isDebtOp && (!client || client.trim() === "")) {
      return { success: false, msg: "❌ خطأ: يجب تحديد اسم العميل لإتمام العملية" };
    }

    // 1. تحديد صفوف الحسابات (محفظة، خزنة، شركة)
    const accData = wsAcc.getDataRange().getValues();
    let wRow = -1, cRow = -1, pRow = -1;

    for (let i = 1; i < accData.length; i++) {
      let accName = String(accData[i][COL.NAME]).trim();
      if (/الخزنة|الكاش/.test(accName)) cRow = i + 1;
      if (wallet && accName === wallet.trim()) wRow = i + 1;
      if (provider && (accName === provider || accName.includes(provider))) {
         if (Number(accData[i][COL.LO]) > 10000000) pRow = i + 1;
      }
    }

    if (cRow === -1) return { success: false, msg: "❌ خطأ: حساب الخزنة غير موجود" };

    // 2. فحص الليميت
    if (wRow !== -1 && !type.includes("مصروف")) {
      const info = getWalletInfo(wallet);
      const isOutReq = (/إيداع|صادر|تحويل|شحن|دين|سحب كاش|تجديد|باقة/.test(type)) && !type.includes("سداد");
      const isInReq = (/سحب من محفظة|وارد|استلام|سداد/.test(type));

      if (isOutReq && val > info.availableOut) {
        return { success: false, msg: `⚠️ خطأ: المبلغ يتخطى الليميت المتاح للصادر (${info.availableOut.toLocaleString()})` };
      }
      if (isInReq && val > info.availableInc) {
        return { success: false, msg: `⚠️ خطأ: المبلغ يتخطى الليميت المتاح للوارد (${info.availableInc.toLocaleString()})` };
      }
    }

    // 3. جلب الأرصدة الحالية
    let cashBal = Number(wsAcc.getRange(cRow, COL.BAL + 1).getValue());
    let walletBal = wRow !== -1 ? Number(wsAcc.getRange(wRow, COL.BAL + 1).getValue()) : 0;
    let provBal = pRow !== -1 ? Number(wsAcc.getRange(pRow, COL.BAL + 1).getValue()) : 0;

    // =========================================================
    // 4. تنفيذ العمليات
    // =========================================================

    // --- (أ) سحب كاش شركات (مكسب/فوري) ---
    if (type.includes("سحب كاش") && (provider.includes("مكسب") || provider.includes("فوري"))) {
      if (wRow === -1 || pRow === -1) return { success: false, msg: "❌ المحفظة أو الشركة غير محددة" };

      wsAcc.getRange(pRow, COL.BAL + 1).setValue(provBal + val);
      
      let walletEffect = (-val) + fee; 
      wsAcc.getRange(wRow, COL.BAL + 1).setValue(walletBal + walletEffect);
      
      updateAccountProfit(wsAcc, wRow, fee);
      updateWalletLimits(wsAcc, wRow, val, "OUT");

      finalBalAfter = walletBal + walletEffect;
    } 
    
    // --- (ب) سحب كاش عامة (شركات أخرى) ---
    else if (type.includes("سحب كاش") && pRow !== -1) {
      wsAcc.getRange(wRow, COL.BAL + 1).setValue(walletBal - val);
      
      if (commDest === 'CASH') {
        wsAcc.getRange(pRow, COL.BAL + 1).setValue(provBal + val);
        wsAcc.getRange(cRow, COL.BAL + 1).setValue(cashBal + fee);
        updateAccountProfit(wsAcc, cRow, fee);
      } else {
        wsAcc.getRange(pRow, COL.BAL + 1).setValue(provBal + val + fee);
        updateAccountProfit(wsAcc, pRow, fee);
      }
      
      updateWalletLimits(wsAcc, wRow, val, "OUT");
      finalBalAfter = walletBal - val;
    }

    // --- (ج) سحب من عميل / سحب فيزا (تغذية شركة من الكاش) ---
    // تم التعديل هنا لقبول "سحب فيزا"
    else if (type.includes("سحب من عميل") || type.includes("سحب فيزا")) {
      if (pRow === -1) return { success: false, msg: `❌ حساب شركة ${provider} غير موجود` };
      if (cashBal < val) return { success: false, msg: "❌ رصيد الخزنة لا يكفي" };

      if (commDest === 'CASH') {
        wsAcc.getRange(cRow, COL.BAL + 1).setValue(cashBal - val + fee); 
        wsAcc.getRange(pRow, COL.BAL + 1).setValue(provBal + val);
        updateAccountProfit(wsAcc, cRow, fee);
      } else {
        wsAcc.getRange(cRow, COL.BAL + 1).setValue(cashBal - val);
        wsAcc.getRange(pRow, COL.BAL + 1).setValue(provBal + val + fee);
        updateAccountProfit(wsAcc, pRow, fee);
      }
      finalBalAfter = provBal + val; // الرصيد المعروض هو رصيد الشركة
    }

    // --- (د) دفع فاتورة ---
    else if (type.includes("دفع فاتورة")) {
      if (pRow === -1) return { success: false, msg: `❌ حساب شركة ${provider} غير موجود` };
      
      // الشركة تنقص (دفعنا للفاتورة) والكاش يزيد (العميل دفع لنا)
      wsAcc.getRange(pRow, COL.BAL + 1).setValue(provBal - val);
      wsAcc.getRange(cRow, COL.BAL + 1).setValue(cashBal + val + fee);
      updateAccountProfit(wsAcc, cRow, fee);
      
      finalBalAfter = provBal - val; 
    }

    // --- (هـ) المصروفات ---
    else if (type.includes("مصروف")) {
      if (cashBal < val) return { success: false, msg: "❌ رصيد الخزنة لا يكفي" };
      wsAcc.getRange(cRow, COL.BAL + 1).setValue(cashBal - val);
      finalBalAfter = cashBal - val;
    }

    // --- (و) الخدمات العامة (شحن، تحويل، إيداع، باقات، دفع فيزا) ---
    else if (/إيداع|شحن|تحويل|باقة|تجديد|رصيد|دفع فيزا/.test(type) && !type.includes("سحب من")) {
      if (wRow === -1) return { success: false, msg: "❌ يجب تحديد المحفظة لهذه العملية" };
      
      const SERVICE_FEE = 1; 
      let amt = Number(val);
      
      // حساب الخصم من المحفظة
      let finalW = walletBal - amt - SERVICE_FEE; 
      
      if (commDest === 'WALLET') {
        finalW += fee;
        updateAccountProfit(wsAcc, wRow, fee);
      }

      if (finalW < 0) throw `❌ الرصيد لا يكفي — المتاح ${walletBal}`;

      // 1. خصم من المحفظة
      wsAcc.getRange(wRow, COL.BAL + 1).setValue(finalW);

      // 2. إضافة للكاش
      let finalC = cashBal + amt;
      if (commDest === 'CASH') {
        finalC += fee;
        updateAccountProfit(wsAcc, cRow, fee);
      }
      wsAcc.getRange(cRow, COL.BAL + 1).setValue(finalC);

      // 3. تحديث الليميت
      updateWalletLimits(wsAcc, wRow, amt, "OUT");
      
      finalBalAfter = finalW; 
    }

    // --- (ز) سحب من محفظة (استلام كاش من المحفظة/العميل) ---
    else if (type.includes("سحب من محفظة")) {
      let amt = Number(val);       
      let isInternalComm = data.deductComm; 

      let cashEffect;
      if (isInternalComm) {
        cashEffect = amt; 
      } else {
        cashEffect = amt - fee;
      }

      if (cashBal < cashEffect) throw `❌ رصيد الخزنة لا يكفي — المتاح ${cashBal}`;

      wsAcc.getRange(wRow, COL.BAL + 1).setValue(walletBal + amt);
      wsAcc.getRange(cRow, COL.BAL + 1).setValue(cashBal - cashEffect);

      if (fee > 0) {
        let destRow = (commDest === 'WALLET') ? wRow : cRow;
        updateAccountProfit(wsAcc, destRow, fee);
      }

      updateWalletLimits(wsAcc, wRow, amt, "IN");
      finalBalAfter = walletBal + amt;
    }

    // --- (ح) ديون الخزنة ---
    else if (isDebtOp && wRow === -1) {
      if (type.includes("سحب") || type.includes("صادر")) { 
         if (cashBal < val) return { success: false, msg: "❌ رصيد الخزنة لا يكفي" };
         wsAcc.getRange(cRow, COL.BAL + 1).setValue(cashBal - val + fee);
         if (fee > 0) updateAccountProfit(wsAcc, cRow, fee);
         updateClientBalance(client, val, "OUT");
         finalBalAfter = cashBal - val + fee;
      } else { 
         wsAcc.getRange(cRow, COL.BAL + 1).setValue(cashBal + val + fee);
         updateClientBalance(client, val, "IN");
         updateAccountProfit(wsAcc, cRow, fee);
         finalBalAfter = cashBal + val + fee;
      }
    }

    // --- (ط) ديون المحافظ ---
    else if (isDebtOp && wRow !== -1) {
      if (type.includes("سحب") || type.includes("صادر")) {
         wsAcc.getRange(wRow, COL.BAL + 1).setValue(walletBal - val);
         updateWalletLimits(wsAcc, wRow, val, "OUT");
         
         if (fee > 0) {
             wsAcc.getRange(cRow, COL.BAL + 1).setValue(cashBal + fee);
             updateAccountProfit(wsAcc, cRow, fee);
         }
         updateClientBalance(client, val, "OUT");
         finalBalAfter = walletBal - val;
      } else {
         wsAcc.getRange(wRow, COL.BAL + 1).setValue(walletBal + val + fee);
         updateWalletLimits(wsAcc, wRow, val, "IN");
         updateClientBalance(client, val, "IN");
         updateAccountProfit(wsAcc, wRow, fee);
         finalBalAfter = walletBal + val + fee;
      }
    } 
    
    // --- حالة غير معروفة ---
    else {
        return { success: false, msg: `❌ خطأ: نوع العملية '${type}' غير معرّف في النظام` };
    }

    // 5. تسجيل العملية في الدفتر
    const now = new Date();
    const timeZone = ss.getSpreadsheetTimeZone();
    const formattedDate = Utilities.formatDate(now, timeZone, "yyyy-MM-dd");
    const formattedTime = Utilities.formatDate(now, timeZone, "hh:mm a");

    wsLog.appendRow([
      formattedDate,
      formattedTime,
      type,
      val,
      fee,
      (wRow !== -1 ? wallet : (pRow !== -1 ? provider : "الخزنة")),
      (client || provider || "---"),
      finalBalAfter, 
      note,
      userName
    ]);
    
    return { success: true, msg: "✅ تمت العملية بنجاح" };

  } catch (e) {
    return { success: false, msg: "❌ خطأ في النظام: " + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function getClientBalanceByName(clientName) {
  const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("العملاء");
  if (!ws || ws.getLastRow() < 2) return { status: "⚠️ العميل غير مسجل", bal: 0 };
  const data = ws.getRange(2, 1, ws.getLastRow() - 1, 3).getValues(); 
  for(let row of data) {
    if(String(row[0]).trim() === clientName.trim()) {
      const bal = Number(row[2]) || 0;
      let statusText = `الرصيد: ${bal.toLocaleString()} `;
      if (bal < 0) statusText += `(عليه: ${Math.abs(bal).toLocaleString()})`;
      else if (bal > 0) statusText += `(له: ${bal.toLocaleString()})`;
      else statusText = `الرصيد صفر (مُسجّل)`;
      return { status: statusText, bal: bal };
    }
  }
  return { status: "⚠️ العميل غير مسجل", bal: 0 };
}

function getUsersData() {
  if (getUserRole() !== 'ADMIN') return [];
  const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("الصلاحيات");
  
  let users = (ws && ws.getLastRow() >= 2) ? ws.getRange(2, 1, ws.getLastRow() - 1, 3).getValues() : [];
  
  // 💡 إضافة الماستر يدوياً إذا لم يكن موجوداً
  if (users.filter(u => String(u[0]).toLowerCase() === MASTER_EMAIL.toLowerCase()).length === 0) {
    users.unshift([MASTER_EMAIL, "Master Admin", "ADMIN"]);
  }
  
  return users;
}

// تعديل إضافة مستخدم (لتقييد المساعد)
function addNewUser(email, name, role) {
  const currentRole = getUserRole();
  const amIMaster = isMasterUser();

  if (currentRole !== 'ADMIN') return {success: false, msg: "⛔ غير مصرح"};
  
  if (email.toLowerCase() === MASTER_EMAIL.toLowerCase()) {
      return {success: false, msg: "⛔ هذا الإيميل هو مالك النظام"};
  }
  
  // حماية: المساعد يضيف فقط كاشير
  if (!amIMaster && role === 'ADMIN') {
    return {success: false, msg: "⛔ صلاحياتك تسمح بإضافة موظف فقط"};
  }

  const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("الصلاحيات");
  ws.appendRow([email.trim(), name.trim(), role]);
  
  logAdminOperation("إضافة موظف", `تم إضافة: ${name} (${email}) - الصلاحية: ${role}`);
  return {success: true, msg: "✅ تــــــم الاضافة"};
}

// تعديل حذف مستخدم (لحماية المديرين)
function removeUser(targetEmail) {
  const currentRole = getUserRole();
  const amIMaster = isMasterUser();
  
  if (currentRole !== 'ADMIN') return {success: false, msg: "⛔"};

  if (targetEmail.toLowerCase() === MASTER_EMAIL.toLowerCase()) {
      return {success: false, msg: "⛔ لا يمكن حذف مالك النظام!"};
  }

  const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("الصلاحيات");
  const data = ws.getRange(2, 1, ws.getLastRow()-1, 3).getValues(); 
  
  let rowToDelete = -1;
  let targetRole = "";

  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === targetEmail.toLowerCase().trim()) {
      rowToDelete = i + 2;
      targetRole = String(data[i][2]);
      break;
    }
  }

  if (rowToDelete > 0) {
    // حماية: المساعد لا يحذف مدير آخر
    if (!amIMaster && targetRole === 'ADMIN') {
       return {success: false, msg: "⛔ لا تملك صلاحية حذف مدير آخر"};
    }

    ws.deleteRow(rowToDelete); 
    logAdminOperation("حذف موظف", `تم حذف الموظف: ${targetEmail}`);
    return {success: true, msg: "🗑️ تم الحذف"};
  }
  return {success: false, msg: "❌ المستخدم غير موجود"};
}

// =====================================================================
// ⚙️ تعديل الصلاحيات (MASTER ONLY)
// =====================================================================
function editUserRole(targetEmail, newRole) {
  // 1. التحقق: يجب أن يكون الماستر حصراً
  if (!isMasterUser()) {
    return { success: false, msg: "⛔ هذه الصلاحية خاصة بالمالك فقط" };
  }
  
  // 2. حماية: لا يمكن تعديل دور الماستر نفسه
  if (targetEmail.toLowerCase() === MASTER_EMAIL.toLowerCase()) {
      return { success: false, msg: "⛔ لا يمكن تعديل صلاحية مالك النظام" };
  }

  const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("الصلاحيات");
  const data = ws.getRange(2, 1, ws.getLastRow()-1, 3).getValues(); 
  
  let targetRow = -1;
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === targetEmail.toLowerCase().trim()) {
      targetRow = i + 2; // +2 لأننا بدأنا من الصف الثاني
      break;
    }
  }

  if (targetRow > 0) {
    // تحديث العمود الخاص بالصلاحية (العمود الثالث: index 2)
    ws.getRange(targetRow, 3).setValue(newRole); 
    
    logAdminOperation("تعديل صلاحية", `تم تعديل صلاحية المستخدم: ${targetEmail} إلى: ${newRole}`);
    return { success: true, msg: `✅ تم تعديل الصلاحية إلى ${newRole}` };
  }
  
  return { success: false, msg: "❌ المستخدم غير موجود" };
}

// =====================================================================
// 🔄 دالة التصفير عند فتح الواجهة (Lazy Reset) + التصفير الليلي
// =====================================================================
function resetLimitsIfNeeded() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName("الحسابات");
  if (!ws || ws.getLastRow() < 2) return;

  const timeZone = ss.getSpreadsheetTimeZone();
  const now = new Date();
  const todayStr = Utilities.formatDate(now, timeZone, "yyyy-MM-dd");
  const monthStr = Utilities.formatDate(now, timeZone, "yyyy-MM");

  const data = ws.getDataRange().getValues();
  let updatesNeeded = false;

  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][COL.NAME]).trim();
    const limitOut = Number(data[i][COL.LO]) || 0;

    if (name.includes("الخزنة") || limitOut >= 10000000) continue;

    // تصفير يومي
    let lastD = data[i][COL.LD] instanceof Date ? Utilities.formatDate(data[i][COL.LD], timeZone, "yyyy-MM-dd") : "";
    if (lastD !== todayStr) {
      data[i][COL.UDO] = 0; data[i][COL.UDI] = 0; data[i][COL.LD] = now;
      updatesNeeded = true;
    }

    // تصفير شهري (صادر ووارد)
    let lastM = data[i][COL.LM_D] instanceof Date ? Utilities.formatDate(data[i][COL.LM_D], timeZone, "yyyy-MM") : "";
    if (lastM !== monthStr) {
      data[i][COL.UMO] = 0; // صادر شهري
      data[i][COL.UMI] = 0; // وارد شهري (العمود M)
      data[i][COL.PROF] = 0; 
      data[i][COL.LM_D] = now;
      updatesNeeded = true;
    }
  }

  if (updatesNeeded) ws.getRange(1, 1, data.length, data[0].length).setValues(data);
}
// =====================================================================
// 📝 نظام سجل العمليات الإدارية (Logs)
// =====================================================================

// دالة جديدة لجلب سجل الإدارة
function getAdminLogs() {
  if (getUserRole() !== 'ADMIN') return [];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName("سجل_الادارة");
  
  if (!ws || ws.getLastRow() < 2) return [];
  
  // جلب البيانات مع استثناء الصف الأول (العناوين)
  const data = ws.getRange(2, 1, ws.getLastRow() - 1, 5).getValues();
  
  // تهيئة البيانات وإرسالها بترتيب عكسي (الأحدث أولاً)
  return data.reverse().map(row => ({
    date: Utilities.formatDate(row[0], ss.getSpreadsheetTimeZone(), "yyyy-MM-dd"),
    time: Utilities.formatDate(row[0], ss.getSpreadsheetTimeZone(), "hh:mm a"),
    action: row[2],
    details: row[3],
    user: row[4]
  }));
}

function logAdminOperation(action, details) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let ws = ss.getSheetByName("سجل_الادارة");
    if (!ws) {
      ws = ss.insertSheet("سجل_الادارة");
      ws.setRightToLeft(true);
      ws.appendRow(["التاريخ والوقت", "الوقـت", "نوع العملية", "التفاصيل", "القائم بالعملية"]);
      ws.getRange("A1:E1").setBackground("#374151").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
      ws.deleteColumn(2); // حذف عمود الوقت القديم
    }
    const user = getCurrentUserName(); 
    const now = new Date();
    ws.appendRow([now, "", action, details, user]); // يتم حساب الوقت والتاريخ في getAdminLogs
  } catch (e) {}
}


// =====================================================================
// 🛡️ الحماية ومنع التعديل اليدوي
// =====================================================================
function onEdit(e) {
  const sheet = e.source.getActiveSheet();
  const protectedSheets = ["الرئيسية", "الحسابات", "الدفتر", "الصلاحيات", "العملاء", "سجل_الادارة"];
  
  if (!protectedSheets.includes(sheet.getName())) return;

  const scriptProps = PropertiesService.getScriptProperties();
  const isMaintenanceMode = scriptProps.getProperty('MAINTENANCE_MODE') === 'TRUE';

  // السماح للأدمن فقط في وضع الصيانة
  if (isMaintenanceMode) {
    if (getUserRole() === 'ADMIN') return;
  }

  try {
      if (e.oldValue !== undefined) e.range.setValue(e.oldValue);
      else e.range.clearContent();
  } catch(err) {}

  SpreadsheetApp.getUi().alert("⛔ تنبيه!\n\nممنوع التعديل اليدوي لضمان سلامة الحسابات.");
}

function disableProtection() {
  if (!isMasterUser()) {
    SpreadsheetApp.getUi().alert("⛔ خاص بمالك النظام فقط");
    return;
  }
  PropertiesService.getScriptProperties().setProperty('MAINTENANCE_MODE', 'TRUE');
  SpreadsheetApp.getUi().alert("🔓 تم فتح الحماية.\n⚠️ لا تنسَ إعادة تفعيلها!");
}

function enableProtection() {
  if (!isMasterUser()) {
     SpreadsheetApp.getUi().alert("⛔ خاص بمالك النظام فقط");
     return;
  }
  PropertiesService.getScriptProperties().setProperty('MAINTENANCE_MODE', 'FALSE');
  SpreadsheetApp.getUi().alert("🔒 تم تفعيل الحماية.");
}

// ----------------------------------------------------
// دوال إدارة الحسابات والعملاء (ADMIN ONLY)
// ----------------------------------------------------
function getClientsList() {
  const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("العملاء");
  if(!ws || ws.getLastRow() < 2) return [];
  return ws.getRange(2, 1, ws.getLastRow()-1, 1).getValues().flat().filter(n => n);
}

function getAllAccountsData() {
  const role = getUserRole();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName("الحسابات");
  const lastRow = ws.getLastRow();
  if (lastRow < 2) return [];

  // 👇 التغيير الجذري: بنقرأ 15 عمود (من A لـ O) صراحة
  // العمود 15 هو الـ Index رقم 14 في المصفوفة
  const data = ws.getRange(2, 1, lastRow - 1, 15).getValues();
  
  return data.map((r, i) => {
    return {
      row: i + 2,
      name: r[0],
      balance: r[1],
      lo: r[2],
      li: r[3],
      lm: r[6],
      isPinned: String(r[11]).toLowerCase().trim() === 'yes',
      tag: r[13] ? String(r[13]) : "",   // الوسم (العمود N - رقم 14)
      color: r[14] ? String(r[14]) : ""  // 👈 اللون (العمود O - رقم 15)
    };
  }).filter(r => r.name && !r.name.includes("الخزنة"));
}

function getWalletsList(){
  const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("الحسابات");
  if(!ws || ws.getLastRow()<2) return [];
  return ws.getRange(2, 1, ws.getLastRow()-1, 2).getValues().filter(r => r[0] !== "").map(r => `${r[0]} (${Number(r[1]).toLocaleString()})`);
}

function getWalletInfo(walletName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName("الحسابات");
  // نحصل على الداتا لنقرأ ونعدل عليها
  const data = ws.getDataRange().getValues();
  
  const COL = { 
    NAME: 0, BAL: 1, LO: 2, LI: 3, UDO: 4, 
    UDI: 5, LM: 6, PROF: 7, UMO: 8, LD: 9, LM_D: 10,
    UMI: 12 // تأكد من رقم عمود الوارد الشهري إذا كان موجوداً لديك
  };

  const timeZone = ss.getSpreadsheetTimeZone();
  const now = new Date();
  const todayStr = Utilities.formatDate(now, timeZone, "yyyy-MM-dd");
  const monthStr = Utilities.formatDate(now, timeZone, "yyyy-MM");

  let targetRow = -1;
  let rowData = null;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][COL.NAME]).trim() === walletName.trim()) {
      targetRow = i + 1; 
      rowData = data[i]; // نأخذ نسخة من الصف
      
      // ============================================================
      // 🚀 بداية التصفير الذكي (Lazy Reset Logic)
      // ============================================================
      
      let lastD = rowData[COL.LD] instanceof Date ? Utilities.formatDate(rowData[COL.LD], timeZone, "yyyy-MM-dd") : "";
      let lastM = rowData[COL.LM_D] instanceof Date ? Utilities.formatDate(rowData[COL.LM_D], timeZone, "yyyy-MM") : "";
      
      let needsSave = false;

      // 1. فحص وتصفير اليوم
      if (lastD !== todayStr) {
        // تصفير القيم في المصفوفة (للحساب الحالي)
        rowData[COL.UDO] = 0; // استهلاك صادر
        rowData[COL.UDI] = 0; // استهلاك وارد
        rowData[COL.LD] = now; // تحديث التاريخ
        
        // تجهيز التصفير للشيت (للحفظ)
        ws.getRange(targetRow, COL.UDO + 1).setValue(0);
        ws.getRange(targetRow, COL.UDI + 1).setValue(0);
        ws.getRange(targetRow, COL.LD + 1).setValue(now);
        
        needsSave = true;
      }

      // 2. فحص وتصفير الشهر
      if (lastM !== monthStr) {
        rowData[COL.UMO] = 0; // استهلاك شهري صادر
        // rowData[COL.UMI] = 0; // استهلاك شهري وارد (فعل هذا السطر لو عندك عمود له)
        rowData[COL.LM_D] = now;
        
        ws.getRange(targetRow, COL.UMO + 1).setValue(0);
        ws.getRange(targetRow, COL.LM_D + 1).setValue(now);
        // ws.getRange(targetRow, COL.UMI + 1).setValue(0); // فعل هذا لو عندك عمود له
        
        needsSave = true;
      }

      if (needsSave) {
        console.log(`♻️ تم التصفير الذكي للمحفظة: ${walletName}`);
        SpreadsheetApp.flush(); // تطبيق التغييرات فوراً
      }
      
      // ============================================================
      // نهاية التصفير - الآن نكمل الحسابات على نظافة
      // ============================================================
      
      break;
    }
  }
  
  if (targetRow === -1) {
    return { exists: false };
  }

  // الآن نستخدم rowData المحدثة (التي تم تصفيرها لو كان التاريخ قديم)
  
  // 1. القراءة القسرية
  const limitOutDay = parseInt(String(rowData[COL.LO])) || 0;
  const limitIncDay = parseInt(String(rowData[COL.LI])) || 0;
  const limitMonth  = parseInt(String(rowData[COL.LM])) || 0;
  
  const usedOutDay  = parseInt(String(rowData[COL.UDO])) || 0;
  const usedIncDay  = parseInt(String(rowData[COL.UDI])) || 0;
  const usedMonth   = parseInt(String(rowData[COL.UMO])) || 0; 

  // 2. حساب المتبقي
  const remDayOut = limitOutDay - usedOutDay;
  const remDayInc = limitIncDay - usedIncDay;
  const remMonth  = limitMonth - usedMonth;

  // 3. حل تعارض "اليومي والشهري"
  const finalAvailableInc = Math.max(0, Math.min(remDayInc, remMonth));
  const finalAvailableOut = Math.max(0, Math.min(remDayOut, remMonth));

  return { 
    exists: true, 
    balance: Number(rowData[COL.BAL]) || 0,
    
    availableInc: finalAvailableInc,
    availableOut: finalAvailableOut,
    
    limitOut: limitOutDay,
    limitInc: limitIncDay,
    
    isMonthRestricted: remMonth < remDayInc || remMonth < remDayOut,
    remainingMonth: remMonth
  };
}
function editAccountDetails(row, name, lo, li, lm) {
   if (getUserRole() !== 'ADMIN') return {success: false, msg: "⛔"};
   const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("الحسابات");
   
   // ⚠️ هذا الكود لا يقوم بأي تصفير قسري، فقط يعدل الحدود والاسم
   
   ws.getRange(row, 1).setNumberFormat("@").setValue(name);
   ws.getRange(row, 3).setValue(lo); 
   ws.getRange(row, 4).setValue(li); 
   ws.getRange(row, 7).setValue(lm);

   // لضمان استمرار عمل التصفير الليلي، نحدث التواريخ فقط (خطوة وقائية)
   ws.getRange(row, COL.LD + 1).setValue(new Date()); 
   ws.getRange(row, COL.LM_D + 1).setValue(new Date());
   
   logAdminOperation("تعديل حساب", `تم تعديل حدود الحساب (${name})`);
   
   try { if(isMasterUser()) drawDashboard(); } catch(e){}
   return {success: true, msg: "✅ تم التعديل"};
}

function deleteAccount(row) {
  if (getUserRole() !== 'ADMIN') return {success: false, msg: "⛔"};
  const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("الحسابات");
  const name = ws.getRange(row, 1).getValue();
  ws.deleteRow(row);
  logAdminOperation("حذف حساب", `تم حذف: ${name}`);
  // التحديث التلقائي للداش بورد مقتصر على الماستر فقط
  try { if(isMasterUser()) drawDashboard(); } catch(e){}
  return {success: true, msg: "🗑️ تم الحذف"};
}

function addNewClient(name, phone) {
  if (getUserRole() !== 'ADMIN') return {success: false, msg: "⛔"};
  const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("العملاء");
  ws.appendRow([name, phone, 0]);
  logAdminOperation("إضافة عميل", `تم إضافة: ${name}`);
  // التحديث التلقائي للداش بورد مقتصر على الماستر فقط
  try { if(isMasterUser()) drawDashboard(); } catch(e){}
  return {success: true, msg: "✅ تم"};
}

function getClientsData() {
  if (getUserRole() !== 'ADMIN') return [];
  const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("العملاء");
  if(!ws || ws.getLastRow() < 2) return [];
  return ws.getRange(2, 1, ws.getLastRow() - 1, 3).getValues().map((r, i) => ({ row: i + 2, name: r[0], phone: r[1], bal: r[2] }));
}

function editClientData(row, newName, newPhone, newBal) {
  if (getUserRole() !== 'ADMIN') return {success: false, msg: "⛔"};
  const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("العملاء");
  ws.getRange(row, 1, 1, 3).setValues([[newName, newPhone, newBal]]);
  // التحديث التلقائي للداش بورد مقتصر على الماستر فقط
  try { if(isMasterUser()) drawDashboard(); } catch(e){}
  return {success: true, msg: "✅ تم تعديل العميل"};
}

function deleteClientData(row) {
  if (getUserRole() !== 'ADMIN') return {success: false, msg: "⛔"};
  const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("العملاء");
  const name = ws.getRange(row, 1).getValue();
  ws.deleteRow(row);
  logAdminOperation("حذف عميل", `تم حذف عميل: ${name}`);
  // التحديث التلقائي للداش بورد مقتصر على الماستر فقط
  try { if(isMasterUser()) drawDashboard(); } catch(e){}
  return {success: true, msg: "🗑️ تم الحذف"};
}

// =====================================================================
// ⚙️ دالة ضبط المصنع (حذف جميع البيانات) - MASTER ONLY
// =====================================================================
function factoryReset() {
  if (!isMasterUser()) {
    SpreadsheetApp.getUi().alert("⛔ ليس لديك صلاحية للقيام بهذا الإجراء (Master Only)");
    return;
  }

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('⚠️ تحذير خطير جداً', 
    'هل أنت متأكد أنك تريد حذف كافة البيانات؟\n(سيتم حذف جميع العملاء، المحافظ، السجلات، والعمليات)\n\nلا يمكن التراجع عن هذه الخطوة!', 
    ui.ButtonSet.YES_NO);

  if (response == ui.Button.YES) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // حذف بيانات الجداول
    ["الدفتر", "العملاء", "سجل_الادارة"].forEach(sheetName => {
        const ws = ss.getSheetByName(sheetName);
        if (ws && ws.getLastRow() > 1) ws.deleteRows(2, ws.getLastRow() - 1);
    });

    const wsAcc = ss.getSheetByName("الحسابات");
    if (wsAcc && wsAcc.getLastRow() > 1) {
        wsAcc.deleteRows(2, wsAcc.getLastRow() - 1);
        wsAcc.appendRow(["الخزنة (الكاش)", 0, 900000000, 900000000, 0, 0, 900000000, 0, 0, new Date(), new Date()]);
        wsAcc.getRange(2, 1).setNumberFormat("@"); 
    }
    
    logAdminOperation("ضبط المصنع", "تم حذف جميع البيانات وتصفير النظام بالكامل");
    
    // التحديث التلقائي للداش بورد مقتصر على الماستر فقط
    try { if(isMasterUser()) drawDashboard(); } catch(e){}
    ui.alert("✅ تم إعادة ضبط المصنع بنجاح.");
  }
}

// =====================================================================
// 🕒 دالة التصفير الليلي (تعمل بواسطة Trigger)
// =====================================================================
function resetLimitsMidnight() {
    resetLimitsIfNeeded();
    Logger.log("تم تنفيذ التصفير الليلي (Trigger) بنجاح.");
}

function INSTALL_AUTO_RESET() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'resetLimitsMidnight') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('resetLimitsMidnight')
      .timeBased()
      .everyDays(1)
      .atHour(0) // الساعة 12:00 منتصف الليل
      .create();

  Logger.log("تم تثبيت المشغل التلقائي بنجاح.");
}

// =====================================================================
// 🚨 دالة التنظيف القسري (EMERGENCY FIX) - ضرورية للتخلص من التلف الحالي
// =====================================================================

function runEmergencyFix() {
  if (getUserRole() !== 'ADMIN') {
    SpreadsheetApp.getUi().alert("⛔ هذه الصلاحية خاصة بالمديرين.");
    return;
  }
  
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('🚨 تنظيف قسري للعدادات', 
    'هل أنت متأكد من رغبتك في مسح وتصفير كافة عدادات الاستخدام والأرباح لجميع المحافظ الآن؟ (لا يؤثر على الرصيد الأساسي)', 
    ui.ButtonSet.YES_NO);

  if (response == ui.Button.YES) {
    EMERGENCY_FIX_DAILY_LIMITS();
  }
}

function EMERGENCY_FIX_DAILY_LIMITS() {
  const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("الحسابات");
  const data = ws.getDataRange().getValues();
  const now = new Date();
  
  for (let i = 1; i < data.length; i++) {
    let row = i + 1;
    let name = String(data[i][0]);
    let limitOut = Number(data[i][2]); 

    if (!name.includes("الخزنة") && limitOut < 10000000) {
       // 1. مسح المحتوى القديم (لضمان إزالة أي بيانات تالفة)
       ws.getRange(row, COL.UDO + 1).clearContent(); 
       ws.getRange(row, COL.UDI + 1).clearContent();
       ws.getRange(row, COL.PROF + 1).clearContent(); 
       ws.getRange(row, COL.UMO + 1).clearContent(); 
       
       // 2. كتابة صفر وتاريخ اليوم
       ws.getRange(row, COL.UDO + 1).setValue(0); 
       ws.getRange(row, COL.UDI + 1).setValue(0); 
       ws.getRange(row, COL.PROF + 1).setValue(0); 
       ws.getRange(row, COL.UMO + 1).setValue(0); 
       ws.getRange(row, COL.LD + 1).setValue(now); 
       ws.getRange(row, COL.LM_D + 1).setValue(now); 
       
       Logger.log("تم إصلاح وتصفير المحفظة: " + name);
    }
  }
  SpreadsheetApp.getUi().alert("✅ تم إصلاح وتصفير جميع عدادات المحافظ بنجاح!");
}
// ----------------------------------------------------
// ... (بقية الدوال الغير حاسمة)
// ----------------------------------------------------
/**
 * دالة جلب سجل العمليات
 * الأعمدة في الدفتر: [التاريخ, النوع, المبلغ, العمولة, المحفظة, العميل, رصيد المحفظة بعد, ملاحظة, المستخدم]
 */
// 1. جلب السجل بالترتيب الصحيح (9 أعمدة)
// 1. جلب السجل بالترتيب الصحيح (9 أعمدة)
/**
 * دالة جلب سجل العمليات للتايم لاين
 * تجلب آخر 100 عملية فقط لتسريع التحميل
 */
function getTransactionLogs() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ws = ss.getSheetByName("الدفتر");
    if (!ws) return [];

    const lastRow = ws.getLastRow();
    if (lastRow < 2) return [];

    // جلب آخر 50 عملية (أو يمكنك زيادتها)
    const numRows = Math.min(lastRow - 1, 50);
    const startRow = lastRow - numRows + 1;
    
    // جلب البيانات (من العمود A إلى K)
    const data = ws.getRange(startRow, 1, numRows, 11).getValues();
    const timeZone = ss.getSpreadsheetTimeZone();

    let logs = [];
    
    for (let i = data.length - 1; i >= 0; i--) {
      let row = data[i];
      let rowDate = new Date(row[0]);
      let type = String(row[2]);

      // تخطي الصفوف الفارغة أو التواريخ غير الصالحة
      if (!row[0] || isNaN(rowDate.getTime())) continue; 

      // --- [بداية التصحيح] ---
      // معالجة الوقت بشكل صحيح سواء كان نصاً أو كائن وقت
      let rawTime = row[1]; 
      let displayTime = "";
      
      if (rawTime instanceof Date) {
        // لو الشيت حوله لتاريخ ووقت، ننسقه
        displayTime = Utilities.formatDate(rawTime, timeZone, "hh:mm a");
      } else {
        // لو هو نص عادي ناخده زي ما هو
        displayTime = String(rawTime).trim();
      }
      // --- [نهاية التصحيح] ---

      logs.push({
        rowId: startRow + i,
        isoDate: Utilities.formatDate(rowDate, timeZone, "yyyy-MM-dd"),
        date: Utilities.formatDate(rowDate, timeZone, "yyyy-MM-dd"), 
        time: displayTime, // <--- هنا كان الخطأ، تم استخدام المتغير الصحيح
        type: type,
        amount: Number(row[3]) || 0,
        comm: Number(row[4]) || 0,
        wallet: String(row[5]).trim(),
        client: String(row[6]).trim(),
        user: String(row[9]).trim(),
        note: String(row[8]).trim(),
        balanceAfter: Number(row[7]) || 0,
        isOut: (type.includes("سحب") || type.includes("دفع") || type.includes("مصروف") || type.includes("صادر"))
      });
    }
    return logs;

  } catch (e) {
    Logger.log("Error: " + e.toString());
    return [];
  }
}
function searchAllLogsServer(query, type, dateFrom, dateTo) {
  // جلب كل البيانات (بدون ليميت 50) للبحث فيها
  let allData = getLogsFromSheet(null); 
  
  return allData.filter(log => {
    let match = true;
    
    // البحث النصي الشامل
    if (query) {
      const searchPool = `${log.client} ${log.wallet} ${log.note} ${log.user} ${log.amount}`.toLowerCase();
      if (!searchPool.includes(query.toLowerCase())) match = false;
    }
    
    // البحث بالنوع (وارد / صادر / نوع محدد)
    if (match && type) {
      if (type === "وارد") { if (log.isOut) match = false; }
      else if (type === "صادر") { if (!log.isOut) match = false; }
      else if (!log.type.includes(type)) match = false;
    }
    
    // البحث بالتاريخ
    if (match && dateFrom && log.date < dateFrom) match = false;
    if (match && dateTo && log.date > dateTo) match = false;
    
    return match;
  });
}

// دالة مساعدة مركزية لجلب البيانات (لتجنب تكرار الكود)
function getLogsFromSheet(limit) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ws = ss.getSheetByName("الدفتر");
    if (!ws) return [];
    const lastRow = ws.getLastRow();
    if (lastRow < 2) return [];

    const numRows = limit ? Math.min(lastRow - 1, limit) : (lastRow - 1);
    const startRow = lastRow - numRows + 1;
    const data = ws.getRange(startRow, 1, numRows, 11).getValues();
    const timeZone = ss.getSpreadsheetTimeZone();

    return data.reverse().map((row, i) => ({
      rowId: startRow + (numRows - 1 - i),
      date: Utilities.formatDate(new Date(row[0]), timeZone, "yyyy-MM-dd"),
      time: (row[1] instanceof Date) ? Utilities.formatDate(row[1], timeZone, "hh:mm a") : String(row[1]),
      type: String(row[2]),
      amount: Number(row[3]) || 0,
      comm: Number(row[4]) || 0,
      wallet: String(row[5]),
      client: String(row[6]),
      balanceAfter: Number(row[7]) || 0,
      note: String(row[8]),
      user: String(row[9]),
      isOut: /سحب|دفع|مصروف|صادر/.test(String(row[2]))
    }));
  } catch (e) { return []; }
}
// دالة لجلب قائمة المحافظ والموظفين لملء الفلاتر
function getFilterOptions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // نفترض أن المحافظ في شيت "المحافظ" والعمود A
  // والموظفين من شيت "الأعضاء" أو يمكن استخراجهم من الدفتر مباشرة
  // هنا سنستخرج القيم الفريدة من الدفتر لتسهيل الأمر
  
  const ws = ss.getSheetByName("الدفتر");
  const lastRow = ws.getLastRow();
  if (lastRow < 2) return { wallets: [], users: [] };
  
  // العمود F (المحافظ) والعمود J (الموظفين)
  const data = ws.getRange(2, 6, lastRow - 1, 5).getValues(); 
  
  let wallets = new Set();
  let users = new Set();
  
  data.forEach(r => {
    if(r[0]) wallets.add(String(r[0]).trim()); // المحفظة
    if(r[4]) users.add(String(r[4]).trim());   // الموظف
  });
  
  return {
    wallets: Array.from(wallets).sort(),
    users: Array.from(users).sort()
  };
}
// دالة مساعدة للتأكد من صحة التاريخ
function isValidDate(d) {
  if (Object.prototype.toString.call(d) === "[object Date]") {
    return !isNaN(d.getTime());
  }
  return false;
}

function doGet(e) {
  const htmlTemplate = HtmlService.createTemplateFromFile('Page');
  const output = htmlTemplate.evaluate();
  output.addMetaTag('viewport', 'width=device-width, initial-scale=1');
  output.setTitle('Sadek Cash App');

  return output;
}

/**
 * دالة تفحص وتُنشئ الجداول الأساسية المفقودة (Sheets) وتضبط الأعمدة الرئيسية.
 * يجب أن تكون هذه الدالة مقصورة على الماستر أو الأدمن.
 */
function initializeMissingSheets() {
  if (getUserRole() !== 'ADMIN') {
    SpreadsheetApp.getUi().alert("⛔ هذه الصلاحية خاصة بالمديرين.");
    return { success: false, msg: "⛔ غير مصرح لك بتشغيل الإعدادات الأساسية." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const now = new Date();
  
  let changesMade = false;
  
  const requiredSheets = {
    "الحسابات": [
      ["الاسم", "الرصيد", "حد الصادر اليومي", "حد الوارد اليومي", "الاستخدام اليومي (صادر)", "الاستخدام اليومي (وارد)", "حد الشهري", "الأرباح", "الاستخدام الشهري", "آخر تحديث يومي", "آخر تحديث شهري"],
      ["الخزنة (الكاش)", 0, 900000000, 900000000, 0, 0, 900000000, 0, 0, now, now]
    ],
    "الدفتر": [
      ["التاريخ", "الوقت", "النوع", "المبلغ", "العمولة", "المحفظة", "الجهة", "الرصيد بعد", "ملاحظات", "القائم بالعملية"]    ],
    "العملاء": [
      ["الاسم", "الموبايل", "الرصيد"]
    ],
    "الصلاحيات": [
      ["الإيميل", "الاسم", "الدور"]
    ],
    "الرئيسية": [
      ["**جدول التقارير (Dashboard) يتم رسمه بواسطة الدالة drawDashboard**"]
    ],
    "سجل_الادارة": [
      ["التاريخ والوقت", "نوع العملية", "التفاصيل", "القائم بالعملية"]
    ]
  };

  for (const sheetName in requiredSheets) {
    let sheet = ss.getSheetByName(sheetName);
    const headers = requiredSheets[sheetName][0];
    const initialData = requiredSheets[sheetName][1];
    
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.setRightToLeft(true);
      changesMade = true;

      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setBackground("#374151").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
      
      if (initialData) {
        sheet.appendRow(initialData);
        if (sheetName === "الحسابات") {
          sheet.getRange(2, 1).setNumberFormat("@"); 
        }
      }
      
      if (sheetName === "سجل_الادارة" && sheet.getMaxColumns() > headers.length) {
          sheet.deleteColumn(2); 
      }
      
      Logger.log(`تم إنشاء جدول: ${sheetName}`);
    
    } else {
      const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String).map(s => s.trim());
      
      let needsHeaderUpdate = false;
      if (currentHeaders.length !== headers.length) {
         needsHeaderUpdate = true;
      } else {
         for(let i=0; i<headers.length; i++){
           if(currentHeaders[i] !== headers[i]){
             needsHeaderUpdate = true;
             break;
           }
         }
      }
      
      if (needsHeaderUpdate) {
         sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
         sheet.getRange(1, 1, 1, headers.length).setBackground("#374151").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
         changesMade = true;
         Logger.log(`تم تحديث أعمدة جدول: ${sheetName}`);
      }
    }
  }

  if (changesMade) {
    try { 
      if(isMasterUser()) drawDashboard(); 
    } catch(e){}
    
    return { success: true, msg: "✅ تم فحص وتحديث جداول النظام بنجاح!" };
  } else {
    return { success: true, msg: "✅ جميع جداول النظام موجودة وكاملة." };
  }
}
/**
 * دالة لتعديل أرباح محفظة معينة يدوياً (إضافة أو خصم)
 * @param {string} walletName اسم المحفظة
 * @param {number} adjustmentAmount المبلغ المراد إضافته (موجب) أو خصمه (سالب)
 */
/**
 * دالة لتعديل أرباح محفظة معينة يدوياً (إضافة أو خصم)
 */
function adjustWalletProfit(walletName, adjustmentAmount) {
  const role = getUserRole();
  if (role !== 'ADMIN') return { success: false, msg: "⛔ صلاحية المدير مطلوبة" };
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName("الحسابات");
  const data = ws.getDataRange().getValues();
  const COL_NAME = 0; 
  const COL_PROF = 7; // عمود الأرباح في جدول الحسابات

  let targetRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][COL_NAME]).trim() === walletName.trim()) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow === -1) return { success: false, msg: "❌ المحفظة غير موجودة" };

  const currentProfit = Number(ws.getRange(targetRow, COL_PROF + 1).getValue()) || 0;
  const newProfit = currentProfit + Number(adjustmentAmount);
  
  // تحديث القيمة في الشيت
  ws.getRange(targetRow, COL_PROF + 1).setValue(newProfit);
  
  // تسجيل العملية في سجل الإدارة لضمان الشفافية
  logAdminOperation("تسوية أرباح", `المحفظة: ${walletName} | التعديل: ${adjustmentAmount} | الأرباح بعد التسوية: ${newProfit}`);
  
  return { success: true, msg: "✅ تم تسوية الأرباح بنجاح" };
}
function toggleWalletPin(row, currentState) {
  if (getUserRole() !== 'ADMIN') return {success: false, msg: "⛔"};
  const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("الحسابات");
  const newState = currentState ? "" : "yes";
  ws.getRange(row, 12).setValue(newState); // تحديث العمود L
  return {success: true, msg: newState ? "📌 تم التثبيت" : "📍 تم إلغاء التثبيت"};
}
/**
 * دالة مساعدة لتحديث حدود الاستهلاك اليومي والشهري للمحافظ
 */
function updateWalletLimits(ws, row, amount, mode) {
  if (mode === "OUT") {
    let currentUDO = Number(ws.getRange(row, COL.UDO + 1).getValue()) || 0;
    let currentUMO = Number(ws.getRange(row, COL.UMO + 1).getValue()) || 0;
    ws.getRange(row, COL.UDO + 1).setValue(currentUDO + amount); 
    ws.getRange(row, COL.UMO + 1).setValue(currentUMO + amount); 
  } else {
    let currentUDI = Number(ws.getRange(row, COL.UDI + 1).getValue()) || 0;
    let currentUMI = Number(ws.getRange(row, COL.UMI + 1).getValue()) || 0;
    ws.getRange(row, COL.UDI + 1).setValue(currentUDI + amount); 
    ws.getRange(row, COL.UMI + 1).setValue(currentUMI + amount); 
  }
}

/**
 * دالة لتسجيل نتيجة جرد الخزنة في سجل الإدارة
 */
function logCashInventory(data) {
  const role = getUserRole(); //
  if (role !== 'ADMIN' && role !== 'USER') return { success: false }; //

  const { systemBal, actualBal, diff, details } = data;
  let status = "✅ مطابق";
  if (diff < 0) status = `⚠️ عجز (${Math.abs(diff)})`;
  if (diff > 0) status = `💰 زيادة (${diff})`;

  // تجميع التفاصيل النهائية للسجل
  const finalDetails = `الجرد: ${actualBal.toLocaleString()} (سيستم: ${systemBal.toLocaleString()}) | الحالة: ${status} | تفاصيل العملة: [${details}]`;
  
  logAdminOperation("جرد خزنة", finalDetails); //
  return { success: true, msg: "✅ تم تسجيل الجرد وتفصيل الفئات بنجاح" };
}
function updateAccountProfit(ws, row, fee) {
  let currentProf = Number(ws.getRange(row, COL.PROF + 1).getValue()) || 0;
  ws.getRange(row, COL.PROF + 1).setValue(currentProf + fee);
}
function updateClientBalance(clientName, amount, mode) {
  if (!clientName) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName("العملاء");
  if (!ws) {
    console.error("شيت العملاء غير موجود");
    return;
  }

  const data = ws.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    // البحث عن العميل في العمود الأول (A)
    if (String(data[i][0]).trim() === clientName.trim()) {
      let currentBal = Number(data[i][2]) || 0; // الرصيد الحالي في العمود الثالث (C)
      
      // منطق الحساب:
      // سداد دين (وارد) -> يزود الرصيد (يقلل المديونية لو كانت بالسالب)
      // تسجيل دين (سحب/صادر) -> ينقص الرصيد
      let newBal = (mode === "IN") ? (currentBal + amount) : (currentBal - amount);
      
      ws.getRange(i + 1, 3).setValue(newBal); // تحديث القيمة في العمود C
      console.log(`تم تحديث رصيد ${clientName} إلى ${newBal}`);
      return;
    }
  }
} 
/**
 * الدالة النهائية: رول باك "سحب من عميل"
 * الأصل: (محفظة + / خزنة -) 
 * الرول باك: (محفظة - / خزنة +)
 */
/**
 * الدالة النهائية والمستقرة:
 * 1. الحفاظ على المعادلات المالية الأصلية.
 * 2. تحديث الليميت في الأعمدة (E, F, I) بالإضافة للعمود الشهري الجديد (M).
 * 3. سجل الإدارة: تاريخ ووقت إنجليزي، تفاصيل عربي، واسم الموظف من الدفتر.
 */
/**
 * الدالة المطورة والشاملة للتراجع عن العمليات (Rollback) بناءً على منطق الشركة
 */
function autoRollback(rowId, type, amount, wallet, comm, client) {
  if (getUserRole() !== 'ADMIN') return {success: false, msg: "⛔ صلاحية المدير مطلوبة"};
  
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const wsLog = ss.getSheetByName("الدفتر");
    const wsAcc = ss.getSheetByName("الحسابات");
    const wsAdmin = ss.getSheetByName("سجل_الادارة");
    
    // 1. تجهيز الأرقام
    const val = Number(amount); 
    const fee = Number(comm) || 0;
    
    if (isNaN(val)) return {success: false, msg: "❌ خطأ في قراءة المبلغ"};

    const accData = wsAcc.getDataRange().getValues();
    
    // =========================================================
    // 📌 خريطة الأعمدة (التركيز على المحافظ فقط)
    // =========================================================
    const COL = { 
        BAL: 1,      // الرصيد (B)
        UDO: 4,      // يومي صادر (E)
        UDI: 5,      // يومي وارد (F)
        PROF: 7,     // الأرباح (H)
        
        // أعمدة الليميت الشهري للمحافظ
        MONTH_OUT: 8,    // العمود I (رقم 9) -> Index 8 (لأي فلوس بتخرج من المحفظة)
        MONTH_IN: 12     // العمود M (رقم 13) -> Index 12 (لأي فلوس بتدخل المحفظة)
    };

    // دالة تنظيف النصوص
    const normalize = (str) => String(str).replace(/\s+/g, '').replace(/^0+/, '').toLowerCase();
    
    const searchWallet = normalize(wallet);
    const searchClient = normalize(client);

    let walletRow = -1; 
    let cashRow = -1;   
    let providerRow = -1; 

    // 🔍 البحث عن الصفوف
    for (let i = 1; i < accData.length; i++) {
      let rawName = String(accData[i][0]);
      let cleanName = normalize(rawName);
      
      if (rawName.includes("الخزنة") || rawName.includes("الكاش")) cashRow = i + 1;
      
      // المحفظة (بحث دقيق)
      if (cleanName === searchWallet || (searchWallet.length > 5 && cleanName.includes(searchWallet))) walletRow = i + 1;
      
      // الشركة (لضبط الرصيد فقط دون الليميت)
      if (client) {
          if (cleanName === searchClient || cleanName.includes(searchClient) || searchClient.includes(cleanName)) providerRow = i + 1;
      }
    }

    if (cashRow === -1) return {success: false, msg: "❌ خطأ: لم يتم العثور على صف الخزنة!"};

    const updateCell = (row, colIndex, changeVal) => {
      if (row < 1 || isNaN(changeVal) || changeVal === 0) return;
      let cell = wsAcc.getRange(row, colIndex + 1);
      let currentVal = Number(cell.getValue());
      if (isNaN(currentVal)) currentVal = 0;
      cell.setValue(currentVal + changeVal);
    };

    // =========================================================
    // 🚀 التنفيذ (مع ضبط دقيق لليميت المحافظ)
    // =========================================================

    // 1️⃣ دفع فاتورة (من شركة)
    // مفيش محفظة هنا -> نرجع فلوس الشركة والخزنة بس
    if (type.includes("دفع فاتورة")) {
        if (providerRow !== -1) updateCell(providerRow, COL.BAL, val);
        updateCell(cashRow, COL.BAL, -(val + fee));
        updateCell(cashRow, COL.PROF, -fee);
    }

    // 2️⃣ سحب من عميل (تزويد شركة)
    // مفيش محفظة هنا -> نخصم من الشركة ونرجع للكاش
    else if (type.includes("سحب من عميل") || type.includes("تزويد شركة")) {
        if (providerRow !== -1) updateCell(providerRow, COL.BAL, -val);
        updateCell(cashRow, COL.BAL, (val - fee));
        updateCell(cashRow, COL.PROF, -fee);
    }

    // 3️⃣ إيداع لمحفظة (فلوس خرجت من المحفظة للعميل)
    // النوع: OUTBOUND
    else if (type.includes("إيداع لمحفظة")) {
        if (walletRow === -1) return {success: false, msg: `❌ المحفظة (${wallet}) غير موجودة`};

        updateCell(walletRow, COL.BAL, val);           // نرجع الرصيد للمحفظة
        updateCell(cashRow, COL.BAL, -(val + fee)); 
        updateCell(cashRow, COL.PROF, -fee); 
        
        // 🔥 تصحيح الليميت (صادر)
        updateCell(walletRow, COL.UDO, -val);          // نخصم من اليومي الصادر
        updateCell(walletRow, COL.MONTH_OUT, -val);    // نخصم من الشهري الصادر (العمود I)
    }

    // 4️⃣ سحب من محفظة (فلوس دخلت المحفظة من العميل)
    // النوع: INBOUND
    else if (type.includes("سحب من محفظة")) {
        if (walletRow === -1) return {success: false, msg: `❌ المحفظة (${wallet}) غير موجودة`};

        updateCell(walletRow, COL.BAL, -val);          // نخصم الرصيد من المحفظة
        updateCell(cashRow, COL.BAL, (val - fee)); 
        updateCell(cashRow, COL.PROF, -fee);

        // 🔥 تصحيح الليميت (وارد)
        updateCell(walletRow, COL.UDI, -val);          // نخصم من اليومي الوارد
        updateCell(walletRow, COL.MONTH_IN, -val);     // نخصم من الشهري الوارد (العمود M)
    }

    // 5️⃣ سحب كاش (تزويد شركة من رصيد محفظة)
    // المحفظة دفعت -> يبقى OUTBOUND
// 5️⃣ سحب كاش - (أ) حالة خاصة: مكسب وفوري (نظام التسوية)
    // لازم يتحط الأول عشان يتنفذ قبل الشرط العام
    else if (type.includes("سحب كاش") && (String(wallet).includes("مكسب") || String(wallet).includes("فوري") || type.includes("مكسب") || type.includes("فوري"))) {
         
         if (walletRow !== -1) {
             // 1. عكس رصيد المحفظة: (المبلغ - العمولة)
             // لأننا في التنفيذ عملنا: (الرصيد - المبلغ + العمولة)
             // يبقى في التراجع نعمل: (الرصيد + المبلغ - العمولة)
             updateCell(walletRow, COL.BAL, val - fee); 
             
             // 2. إلغاء الأرباح (عكس إشارة العمولة)
             updateCell(walletRow, COL.PROF, -fee);

             // 3. تصحيح الليميت (نخصم المبلغ من استهلاك الصادر)
             updateCell(walletRow, COL.UDO, -val); 
             updateCell(walletRow, COL.MONTH_OUT, -val); 
         }

         // 4. عكس رصيد الشركة (نخصم المبلغ اللي وصلها)
         if (providerRow !== -1) updateCell(providerRow, COL.BAL, -val);
    }

    // 5️⃣ سحب كاش - (ب) حالة عامة: لأي شركة تانية (بدون تسوية)
    // ده هيتنفذ بس لو الشرط اللي فوق متحققش (يعني مش مكسب ولا فوري)
    else if (type.includes("سحب كاش") || (type.includes("تزويد") && walletRow !== -1)) {
         if (walletRow !== -1) {
             // هنا بنرجع المبلغ بس (لأن العمولة مكنتش مأثرة في المحفظة في النظام القديم)
             updateCell(walletRow, COL.BAL, val); 
             
             // تصحيح الليميت
             updateCell(walletRow, COL.UDO, -val); 
             updateCell(walletRow, COL.MONTH_OUT, -val); 
         }
         if (providerRow !== -1) updateCell(providerRow, COL.BAL, -val);
    }    
    // 6️⃣ الديون (لو مربوطة بمحفظة)
    if (client && (type.includes("دين") || type.includes("مديونية"))) {
         let reverseMode = (type.includes("سحب") || type.includes("صادر")) ? "IN" : "OUT";
         updateClientBalance(client, val, reverseMode);
         
         let targetRow = (walletRow !== -1) ? walletRow : cashRow;
         let isWallet = (walletRow !== -1);

         // سحب دين (فلوس خرجت من المحفظة) -> OUTBOUND
         if (type.includes("سحب دين")) {
             updateCell(targetRow, COL.BAL, val);
             if (isWallet) {
                 updateCell(walletRow, COL.UDO, -val);
                 updateCell(walletRow, COL.MONTH_OUT, -val); // (العمود I)
             }
         } 
         // سداد دين (فلوس دخلت المحفظة) -> INBOUND
         else if (type.includes("سداد")) {
             updateCell(targetRow, COL.BAL, -(val + fee));
             if(targetRow === cashRow) updateCell(cashRow, COL.PROF, -fee);
             if (isWallet) {
                 updateCell(walletRow, COL.UDI, -val);
                 updateCell(walletRow, COL.MONTH_IN, -val);  // (العمود M)
             }
         }
    }

    // التسجيل
    if (wsAdmin) wsAdmin.appendRow([new Date(), "ROLLBACK", `تراجع: ${type} (${val})`, wallet, getCurrentUserName()]);
    wsLog.deleteRow(rowId);
    if(isMasterUser()) drawDashboard();
    
    return {success: true, msg: "✅ تم التراجع وتصحيح ليميت المحافظ"};

  } catch (e) {
    return {success: false, msg: "❌ خطأ: " + e.toString()};
  } finally {
    lock.releaseLock();
  }
}/**
 * دالة النسخ الاحتياطي للملف الخارجي
 * مصممة لتعمل أول كل شهر لتؤرشف بيانات الشهر الماضي
 */
function monthlyBackupToExternalSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName("الدفتر");
  
  // 🔴 ضع هنا الـ ID الخاص بملف الباك أب الخارجي (بين علامتي التنصيص)
  const EXTERNAL_FILE_ID = "125MjDd-rh6dHM6xVMeet1lRjvmFdWfpIFXJO3lgcOcM"; 
  
  if (!sourceSheet || sourceSheet.getLastRow() < 2) {
    Logger.log("الدفتر فارغ حالياً، لا توجد بيانات لنقلها.");
    return;
  }

  try {
    const externalSS = SpreadsheetApp.openById(EXTERNAL_FILE_ID);
    const now = new Date();
    
    // الحصول على تاريخ الشهر الماضي (شهر 12 إذا كنا في شهر 1)
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    
    // تسمية الشيت (ستكون النتيجة مثلاً: Backup_2024_12)
    const backupName = "Backup_" + Utilities.formatDate(lastMonthDate, ss.getSpreadsheetTimeZone(), "yyyy_MM");

    let backupSheet = externalSS.getSheetByName(backupName);
    
    // إذا لم يكن شيت الشهر الماضي موجوداً في الملف الخارجي، نقوم بإنشائه
    if (!backupSheet) {
      backupSheet = externalSS.insertSheet(backupName);
      backupSheet.setRightToLeft(true);
      // نسخ العناوين (Headers)
      const headers = sourceSheet.getRange(1, 1, 1, sourceSheet.getLastColumn()).getValues();
      backupSheet.getRange(1, 1, 1, headers[0].length).setValues(headers)
                 .setBackground("#374151").setFontColor("white").setFontWeight("bold");
    }

    // نقل كافة البيانات
    const lastRow = sourceSheet.getLastRow();
    const dataRange = sourceSheet.getRange(2, 1, lastRow - 1, sourceSheet.getLastColumn());
    const data = dataRange.getValues();
    
    // إضافة البيانات للملف الخارجي
    backupSheet.getRange(backupSheet.getLastRow() + 1, 1, data.length, data[0].length).setValues(data);
    
    // ⚠️ تصفير الدفتر في الملف الأصلي بعد نجاح النقل
    sourceSheet.deleteRows(2, lastRow - 1); 
    
    // تسجيل العملية في سجل الإدارة
    logAdminOperation("نسخ احتياطي شهري", "تم ترحيل بيانات شهر " + (lastMonthDate.getMonth() + 1) + " إلى الملف الخارجي.");
    
    Logger.log("تمت العملية بنجاح: " + backupName);
  } catch (e) {
    Logger.log("فشل النسخ الاحتياطي: " + e.message);
  }
}

/**
 * تشغيل هذه الدالة لمرة واحدة لضبط التوقيت التلقائي
 */
function setupAutoBackupTrigger() {
  // مسح أي مشغلات قديمة لنفس الدالة
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'monthlyBackupToExternalSheet') ScriptApp.deleteTrigger(t);
  });

  // ضبط المشغل ليعمل في اليوم الأول من كل شهر الساعة 1 صباحاً
  ScriptApp.newTrigger('monthlyBackupToExternalSheet')
      .timeBased()
      .onMonthDay(1)
      .atHour(1)
      .create();
}
function forceFixLedgerHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let ws = ss.getSheetByName("الدفتر");
  
  if (!ws) {
    ws = ss.insertSheet("الدفتر");
    ws.setRightToLeft(true);
  }
  
  // الترتيب المعتمد لـ 10 أعمدة
  const headers = [
    "التاريخ", "الوقت", "النوع", "المبلغ", "العمولة", 
    "المحفظة", "الجهة", "الرصيد بعد", "ملاحظات", "القائم بالعملية"
  ];
  
  ws.getRange(1, 1, 1, headers.length).setValues([headers])
    .setBackground("#374151")
    .setFontColor("white")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
    
  return "تم إصلاح رؤوس أعمدة الدفتر بنجاح";
}
/**
 * دالة جلب تقرير مفصل بناءً على فلتر التاريخ والنوع
 */
// =====================================================================
// 📈 دوال التقارير المتقدمة (Reports Center)
// =====================================================================

/**
 * 1. تقرير الإغلاق اليومي (Z-Report)
 * يجمع حركة اليوم لكل موظف (كم عملية، إجمالي الوارد/الصادر، الأرباح)
 */
// =====================================================================
// 📈 دوال التقارير المتقدمة (Reports Center) - نسخة محدثة
// =====================================================================

/**
 * 1. تقرير الإغلاق اليومي + أهم العمليات
 */
/**
 * 1. تقرير الإغلاق اليومي + أهم العمليات (محدث)
 */
function getDailyClosingReport(fromDateStr, toDateStr) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const wsLog = ss.getSheetByName("الدفتر");
  const data = wsLog.getDataRange().getValues();
  const timeZone = ss.getSpreadsheetTimeZone();
  
  // ضبط تواريخ البداية والنهاية
  // إذا لم يحدد المستخدم تاريخ "إلى"، نعتبره نفس يوم "من"
  let start = new Date(fromDateStr); start.setHours(0,0,0,0);
  let end = toDateStr ? new Date(toDateStr) : new Date(fromDateStr); end.setHours(23,59,59,999);
  
  let report = {
    totalIn: 0, totalOut: 0, totalProfit: 0,
    usersStats: {},
    topTransactions: []
  };

  let dailyOps = [];

  for (let i = 1; i < data.length; i++) {
    let rowDate = data[i][0];
    if (!(rowDate instanceof Date)) continue;

    // الشرط: التاريخ يقع داخل المدى المحدد
    if (rowDate >= start && rowDate <= end) {
      let type = String(data[i][2]);
      let amount = Number(data[i][3]) || 0;
      let comm = Number(data[i][4]) || 0;
      let user = String(data[i][9]).trim();
      
      // تنسيق التاريخ للعرض (يوم-شهر)
      let fullDateStr = Utilities.formatDate(rowDate, timeZone, "MM-dd");

      let isOut = (type.includes("سحب") || type.includes("دفع") || type.includes("مصروف") || type.includes("صادر"));
      
      if (isOut) report.totalOut += amount; else report.totalIn += amount;
      report.totalProfit += comm;

      // إحصائيات الموظف
      if (!report.usersStats[user]) report.usersStats[user] = { opsCount: 0, profit: 0 };
      report.usersStats[user].opsCount++;
      report.usersStats[user].profit += comm;

      // تجميع العمليات
      dailyOps.push({ 
        type: type, amount: amount, user: user, 
        fullDate: fullDateStr // إضافة التاريخ للعرض
      });
    }
  }
  
  // ترتيب العمليات حسب المبلغ (الأكبر أولاً) وأخذ أهم 10
  report.topTransactions = dailyOps.sort((a, b) => b.amount - a.amount).slice(0, 10);
  
  return report;
}

function getWalletIntelligence(period) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const wsLog = ss.getSheetByName("الدفتر");
  const data = wsLog.getDataRange().getValues();
  
  let walletStats = {};

  for (let i = 1; i < data.length; i++) {
    let wallet = String(data[i][5]).trim();
    // استبعاد الخزنة والفراغات
    if (!wallet || wallet === "" || wallet === "---" || wallet.includes("الخزنة")) continue;

    let amount = Number(data[i][3]) || 0;
    let comm = Number(data[i][4]) || 0;

    if (!walletStats[wallet]) {
      walletStats[wallet] = { name: wallet, txCount: 0, totalVol: 0, totalProfit: 0 };
    }
    
    walletStats[wallet].txCount++;
    walletStats[wallet].totalVol += amount;
    walletStats[wallet].totalProfit += comm;
  }

  // إرجاع المصفوفة مرتبة حسب الربح
  return Object.values(walletStats).sort((a, b) => b.totalProfit - a.totalProfit);
}
/**
 * 3. تقرير تحليل الأرباح (P&L Chart)
 */
function getPnLChartData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const wsLog = ss.getSheetByName("الدفتر");
  if (!wsLog) return { success: false };

  const data = wsLog.getDataRange().getValues();
  const timeZone = ss.getSpreadsheetTimeZone();
  let dailyMap = {}, expenseMap = {}, hasData = false;

  for (let i = 1; i < data.length; i++) {
    let rowDate = data[i][0];
    
    // 🛠️ الإصلاح: تحويل النص إلى تاريخ
    if (!(rowDate instanceof Date)) rowDate = new Date(rowDate);
    if (isNaN(rowDate.getTime())) continue;

    let dateStr = Utilities.formatDate(rowDate, timeZone, "yyyy-MM-dd");
    let type = String(data[i][2]);
    let amount = Number(data[i][3]) || 0;
    let comm = Number(data[i][4]) || 0;

    if (!dailyMap[dateStr]) dailyMap[dateStr] = 0;
    dailyMap[dateStr] += comm;
    hasData = true;

    if (type.includes("مصروف")) {
      let note = String(data[i][8]).trim() || "عام";
      if (!expenseMap[note]) expenseMap[note] = 0;
      expenseMap[note] += amount;
    }
  }

  const sortedDates = Object.keys(dailyMap).sort().slice(-30);
  const profits = sortedDates.map(d => dailyMap[d]);

  return {
    success: hasData,
    dates: sortedDates,
    profits: profits,
    expensesLabels: Object.keys(expenseMap),
    expensesValues: Object.values(expenseMap)
  };
}

function getPeakHoursData(dateStr) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const wsLog = ss.getSheetByName("الدفتر");
  if (!wsLog) return { success: false, labels: [], values: [] };

  const data = wsLog.getDataRange().getValues();
  const timeZone = ss.getSpreadsheetTimeZone();
  
  let hoursCount = new Array(24).fill(0);
  let hasData = false;
  
  // تجهيز فلتر التاريخ
  let targetDate = null;
  if (dateStr) targetDate = Utilities.formatDate(new Date(dateStr), timeZone, "yyyy-MM-dd");

  for (let i = 1; i < data.length; i++) {
    let rowDate = data[i][0];
    
    // 🛠️ الإصلاح: تحويل النص إلى تاريخ
    if (!(rowDate instanceof Date)) rowDate = new Date(rowDate);
    if (isNaN(rowDate.getTime())) continue;

    // تطبيق الفلتر
    if (targetDate) {
        let rowDateStr = Utilities.formatDate(rowDate, timeZone, "yyyy-MM-dd");
        if (rowDateStr !== targetDate) continue;
    }

    let h = -1;
    let timeVal = data[i][1]; 

    // محاولة قراءة الوقت من العمود الثاني
    if (timeVal instanceof Date) {
      h = parseInt(Utilities.formatDate(timeVal, timeZone, "H"), 10);
    } else {
      let timeStr = String(timeVal).trim();
      let match = timeStr.match(/(\d+):(\d+)\s*(AM|PM|am|pm)?/i);
      if (match) {
        h = parseInt(match[1], 10);
        let period = match[3] ? match[3].toUpperCase() : "";
        if (period === "PM" && h !== 12) h += 12;
        if (period === "AM" && h === 12) h = 0;
      }
    }

    // محاولة قراءة الساعة من عمود التاريخ (خطة بديلة)
    if (h === -1) {
       let checkH = parseInt(Utilities.formatDate(rowDate, timeZone, "H"), 10);
       if (!isNaN(checkH) && checkH !== 0) h = checkH;
    }
    
    if (h >= 0 && h < 24) {
      hoursCount[h]++;
      hasData = true;
    }
  }

  let labels = [], values = [];
  let showAll = !!targetDate; 
  for (let h = 0; h < 24; h++) {
    if (showAll || hoursCount[h] > 0) {
       let suffix = h >= 12 ? "PM" : "AM";
       let displayHour = ((h + 11) % 12 + 1) + " " + suffix;
       labels.push(displayHour);
       values.push(hoursCount[h]);
    }
  }
  return { success: hasData, labels: labels, values: values };
}
function getBusyDaysData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const wsLog = ss.getSheetByName("الدفتر");
  if (!wsLog) return { labels: [], counts: [], profits: [], amounts: [] };

  const data = wsLog.getDataRange().getValues();
  let daysCount = [0,0,0,0,0,0,0], daysProfit = [0,0,0,0,0,0,0], daysAmount = [0,0,0,0,0,0,0];

  for (let i = 1; i < data.length; i++) {
    let rowDate = data[i][0];
    
    // 🛠️ الإصلاح: تحويل النص إلى تاريخ
    if (!(rowDate instanceof Date)) rowDate = new Date(rowDate);
    
    if (!isNaN(rowDate.getTime())) {
        let dayIndex = rowDate.getDay(); 
        let amt = Number(data[i][3]) || 0;
        let prof = Number(data[i][4]) || 0;

        daysCount[dayIndex]++;
        daysProfit[dayIndex] += prof;
        daysAmount[dayIndex] += amt;
    }
  }

  const reorder = (arr) => [arr[6], arr[0], arr[1], arr[2], arr[3], arr[4], arr[5]];
  const orderedNames = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

  return { labels: orderedNames, counts: reorder(daysCount), profits: reorder(daysProfit), amounts: reorder(daysAmount) };
}

// 3. تحليل الأرباح (PnL Chart) - مصحح
function getTopDatesLeaderboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = ss.getSheetByName("الدفتر").getDataRange().getValues();
  const timeZone = ss.getSpreadsheetTimeZone();
  let dateStats = {};

  for (let i = 1; i < data.length; i++) {
    if (!(data[i][0] instanceof Date)) continue;
    let dStr = Utilities.formatDate(data[i][0], timeZone, "yyyy-MM-dd");
    let prof = Number(data[i][4]) || 0;
    
    if (!dateStats[dStr]) dateStats[dStr] = 0;
    dateStats[dStr] += prof;
  }

  // ترتيب تنازلي للأرباح وأخذ أعلى 5
  let sortedDates = Object.entries(dateStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return sortedDates;
}
function saveWalletTag(row, tagText) {
  if (getUserRole() !== 'ADMIN') return {success: false, msg: "⛔ صلاحية المدير مطلوبة"};
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName("الحسابات");
  
  // التأكد من أن الصف موجود
if (row < 2 || row > ws.getLastRow()) return {success: false, msg: "❌ الصف غير موجود"};

  // الحفظ في العمود رقم 14 (الوسم) و 15 (اللون)
  ws.getRange(row, 14).setValue(tag || "");
  ws.getRange(row, 15).setValue(color || "");
  
  return {success: true, msg: "✅ تم تحديث المظهر"};
}
// ----------------------------------------------------
// دالة حفظ المظهر (الوسم واللون) - العمود 14 و 15
// ----------------------------------------------------
function updateWalletAppearance(row, tag, color) {
  if (getUserRole() !== 'ADMIN') return {success: false, msg: "⛔ غير مصرح"};
  const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("الحسابات");
  ws.getRange(row, 14).setValue(tag || "");   // عمود N
  ws.getRange(row, 15).setValue(color || ""); // عمود O
  return {success: true, msg: "✅ تم تحديث مظهر المحفظة"};
}
function setUpdateSignal() {
  // تخزين وقت التعديل في ذاكرة النظام المؤقتة
  PropertiesService.getScriptProperties().setProperty('LAST_CHANGE', new Date().getTime());
}

function checkUpdateSignal(clientTime) {
  const lastChange = PropertiesService.getScriptProperties().getProperty('LAST_CHANGE');
  // إذا كان وقت السيرفر أحدث، نطلب من المتصفح التحديث
  return lastChange && lastChange !== clientTime ? lastChange : null;
}
// دالة بتجيب رقم التحديث الحالي (رقم واحد صغير جداً)
function getGlobalSyncKey() {
  const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("الحسابات");
  return ws.getRange("Z1").getValue().toString(); // بنقرأ خلية واحدة بس بعيدة
}

// دالة بتغير الرقم ده (بنناديها لما بنعمل حفظ)
function triggerSyncUpdate() {
  const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("الحسابات");
  ws.getRange("Z1").setValue(new Date().getTime()); // بيحط وقت اللحظة الحالية كإشارة
}
/**
 * دالة إضافة محفظة أو شركة جديدة (المفقودة)
 */
function createNewWallet(name, type) {
  if (getUserRole() !== 'ADMIN') return {success: false, msg: "⛔ صلاحية المدير مطلوبة"};
  
  // تحديد حدود افتراضية: الشركات (مفتوحة) والمحافظ (60 ألف)
  let dailyLimit = (type === 'Company') ? 900000000 : 60000;
  let monthlyLimit = (type === 'Company') ? 900000000 : 200000;

  // استدعاء الدالة اللي أضفناها فوق
  return addNewAccount(name, dailyLimit, dailyLimit, monthlyLimit, "#6c757d");
}
/**
 * الدالة الأساسية لبناء صف الحساب الجديد بـ 15 عمود
 */
function addNewAccount(name, lo, li, lm, color) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName("الحسابات");
  
  try {
    const now = new Date();
    // بناء الصف الجديد ليتوافق مع نظامك (15 عمود من A إلى O)
    const newRow = [
      name,             // A: الاسم
      0,                // B: الرصيد الابتدائي
      Number(lo),       // C: حد الصادر
      Number(li),       // D: حد الوارد
      0, 0,             // E, F: استهلاك يومي
      Number(lm),       // G: حد شهري
      0, 0,             // H, I: أرباح واستهلاك شهري
      now, now,         // J, K: تواريخ التحديث
      "", 0,            // L, M: تثبيت واستهلاك وارد
      "",               // N: الوسم (TAG)
      color || "#6c757d"// O: اللون المخصص
    ];

    ws.appendRow(newRow);
    ws.getRange(ws.getLastRow(), 1).setNumberFormat("@"); // تنسيق الاسم كنص

    // تحديث الداشبورد لو الماستر هو اللي شغال
    if (isMasterUser()) {
      try { drawDashboard(); } catch(e) {}
    }

    return { success: true, msg: "✅ تم إضافة الحساب بنجاح" };
  } catch (err) {
    return { success: false, msg: "❌ فشل في الإضافة: " + err.toString() };
  }
}

// الدالة اللي بتنفذ الكتابة الفعلية في الشيت (دي اللي ناقصة وموقفة التحميل)
