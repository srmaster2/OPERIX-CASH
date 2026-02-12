// إدارة العمليات

// جلب العمليات
async function getTransactionLogs(filters = {}) {
    try {
        let query = supabase.from('transactions').select('*');

        // تطبيق فلاتر البحث لو موجودة
        if (filters.type && !filters.type.includes("كل العمليات")) {
            query = query.eq('type', filters.type);
        }
        if (filters.dateFrom) query = query.gte('date', filters.dateFrom);
        if (filters.dateTo) query = query.lte('date', filters.dateTo);

        // تحديد الكمية: لو بحث يجيب 1000، لو عادي يجيب آخر 50
        const limitCount = (filters.type || filters.dateFrom || filters.dateTo) ? 1000 : 50;

        const { data, error } = await query
            .order('id', { ascending: false })
            .limit(limitCount);

        if (error) throw error;
        return data;
    } catch (err) {
        console.error("Error fetching logs:", err.message);
        return null;
    }
}
function renderTransactionsTable(data) {
    const container = document.getElementById('timelineContainer');
    if (!container) return;

    // تجهيز الجدول بالكامل في الذاكرة أولاً
    const htmlRows = data.map(tx => {
        const isOut = tx.type.includes("سحب") || tx.type.includes("صادر");
        return `
        <tr>
            <td>${tx.id}</td>
            <td class="english-num">${tx.date}</td>
            <td class="${isOut ? 'text-danger' : 'text-success'} fw-bold">${tx.type}</td>
            <td class="english-num fw-bold">${Number(tx.amount).toLocaleString()}</td>
            <td>${tx.wallet_name || '-'}</td>
            <td class="english-num text-primary">${Number(tx.balance_after || 0).toLocaleString()}</td>
            <td class="small">${tx.notes || '-'}</td>
            <td><button class="btn btn-sm" onclick="showDetails('${tx.id}')"><i class="fa fa-eye"></i></button></td>
        </tr>`;
    }).join(''); // تحويل المصفوفة لنص واحد

    container.innerHTML = htmlRows; // تحديث الـ DOM مرة واحدة فقط
}
function executeAdvancedSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
        const filters = {
            text: document.getElementById('advSearchText')?.value.trim().toLowerCase() || "",
            type: document.getElementById('advSearchType')?.value || "",
            dateFrom: document.getElementById('advDateFrom')?.value || "",
            dateTo: document.getElementById('advDateTo')?.value || ""
        };

        const container = document.getElementById('timelineContainer');
        container.innerHTML = '<tr><td colspan="8" class="py-4"><i class="fa fa-sync fa-spin"></i> جاري البحث...</td></tr>';

        const data = await getTransactionLogs(filters);
        
        if (data) {
            // فلترة نصية إضافية (للإسم أو الملاحظات)
            const filtered = data.filter(tx => 
                (tx.wallet_name?.toLowerCase() || "").includes(filters.text) ||
                (tx.notes?.toLowerCase() || "").includes(filters.text) ||
                tx.amount.toString().includes(filters.text)
            );
            renderTransactionsTable(filtered);
            document.getElementById('rowsCountDisplay').innerText = `تم العثور على ${filtered.length} عملية`;
        }
    }, 500);
}
function applySecurityUI(role) {
    if (role === 'ADMIN') {
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.setProperty('display', 'block', 'important');
            if(el.tagName === 'TD' || el.tagName === 'TH') el.style.display = 'table-cell';
        });
    } else {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    }
}
// إضافة عملية جديدة
async function addTransaction(type, amount, commission = 0, walletId = '', clientId = '', notes = '') {
  if (!type || !amount) return false;
  const user = await getCurrentUser();
  const { error } = await supabase.from('transactions').insert([{
    type,
    amount: Number(amount),
    commission: Number(commission),
    account_name: walletId,
    client_name: clientId,
    user_email: user.email,
    user_name: user.name || user.email,
    note: notes,
    is_out: type.includes('سحب') || type.includes('صادر')
  }]);
  return !error;
}

// حساب الإحصائيات
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