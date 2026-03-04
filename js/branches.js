// ============================================================
// branches.js — النسخة النهائية
//
// منطق الرولات (بدون رول جديد في DB):
//   is_master = true              → مدير عام  (يشوف كل الفروع)
//   role = ADMIN + branch_id      → مدير فرع  (يشوف فرعه بس)
//   role = USER  + branch_id      → موظف      (يشوف فرعه بس)
//
// الفرق بين مدير الفرع والمدير العام:
//   isMaster = true  → لا branch_id
//   isAdmin  = true  → branch_id موجود → مدير فرع
// ============================================================


// ══════════════════════════════════════════════════════════
// 1. تحميل بيانات المستخدم الحالي مع الفرع
// ══════════════════════════════════════════════════════════
window.currentUserData = null;

async function loadCurrentUserWithBranch() {
    try {
        const { data: { user } } = await window.supa.auth.getUser();
        if (!user) return null;

        const { data } = await window.supa
            .from('users')
            .select('*, branches(name, location)')
            .eq('email', user.email)
            .maybeSingle();

        if (data) {
            const isMaster = data.is_master || false;
            const role     = (data.role || '').toUpperCase();
            window.currentUserData = {
                ...data,
                email:      user.email,
                isMaster,
                // مدير فرع = ADMIN + مش master + عنده branch_id
                isAdmin:    !isMaster && role === 'ADMIN' && !!data.branch_id,
                // موظف = USER أو ADMIN بدون branch_id
                isUser:     !isMaster && role === 'USER',
                branchName: data.branches?.name || ''
            };
        }
        return window.currentUserData;
    } catch (e) {
        return null;
    }
}


// ══════════════════════════════════════════════════════════
// 2. شارة الفرع في الهيدر
// ══════════════════════════════════════════════════════════
function renderCurrentBranchBadge() {
    const el = document.getElementById('current-branch-badge');
    if (!el || !window.currentUserData) return;
    const u = window.currentUserData;
    if (u.isMaster) {
        el.innerHTML = '<span class="badge bg-warning text-dark ms-2"><i class="fa fa-crown me-1"></i>MASTER</span>';
    } else if (u.isAdmin) {
        el.innerHTML = `<span class="badge bg-primary ms-2"><i class="fa fa-building me-1"></i>مدير ${u.branchName}</span>`;
    } else {
        el.innerHTML = u.branchName
            ? `<span class="badge bg-secondary ms-2"><i class="fa fa-building me-1"></i>${u.branchName}</span>`
            : '';
    }
}


// ══════════════════════════════════════════════════════════
// 3. فلتر الفرع التلقائي على أي Supabase query
// ══════════════════════════════════════════════════════════
function applyBranchFilter(query, user) {
    // مدير عام → بلا فلتر
    if (!user || user.isMaster) return query;
    // مدير فرع أو موظف → فرعهم فقط
    if (user.branch_id) return query.eq('branch_id', user.branch_id);
    // مش معينله فرع → لا يشوف أي بيانات
    return query.eq('branch_id', '00000000-0000-0000-0000-000000000000');
}


// ══════════════════════════════════════════════════════════
// 4. صلاحيات الواجهة — يُستدعى في initUserAccess
// ══════════════════════════════════════════════════════════
function applyBranchPermissions() {
    const u = window.currentUserData;
    if (!u) return;

    // عناصر المدير العام فقط
    document.querySelectorAll('.master-only').forEach(el => {
        el.style.display = u.isMaster ? '' : 'none';
    });

    // عناصر مدير الفرع + المدير العام
    document.querySelectorAll('.admin-or-master').forEach(el => {
        el.style.display = (u.isMaster || u.isAdmin) ? '' : 'none';
    });

    // عناصر الموظف فقط (user)
    document.querySelectorAll('.user-only').forEach(el => {
        el.style.display = u.isUser ? '' : 'none';
    });
}


// ══════════════════════════════════════════════════════════
// 5. CRUD الفروع
// ══════════════════════════════════════════════════════════
async function getAllBranches() {
    const { data, error } = await window.supa
        .from('branches').select('*').order('created_at', { ascending: true });
    if (error) { return []; }
    return data || [];
}

async function addBranch(name, location = '') {
    if (!name?.trim()) { showToast('يرجى إدخال اسم الفرع', false); return false; }

    // 1. إضافة الفرع وجلب الـ id الجديد
    const { data: branch, error } = await window.supa
        .from('branches')
        .insert({ name: name.trim(), location: location.trim() })
        .select('id, name')
        .single();

    if (error) { showToast('خطأ: ' + error.message, false); return false; }

    // 2. إنشاء خزنة (الكاش) تلقائياً للفرع الجديد
    const { error: vaultError } = await window.supa
        .from('accounts')
        .insert({
            name:              'الخزنة (الكاش)',
            balance:           0,
            branch_id:         branch.id,
            daily_out_limit:   9999999999,
            daily_in_limit:    9999999999,
            monthly_limit:     9999999999,
            daily_out_usage:   0,
            daily_in_usage:    0,
            monthly_usage_out: 0,
            monthly_usage_in:  0,
            profit:            0,
            color:             '#6c757d'
        });

    if (vaultError) {
        showToast(`⚠️ تم إضافة الفرع لكن فشل إنشاء الخزنة: ${vaultError.message}`, false);
        return false;
    }

    showToast(`✅ تم إضافة فرع "${branch.name}" وإنشاء خزنته تلقائياً`);
    return true;
}

async function updateBranch(id, name, location = '') {
    if (!name?.trim()) { showToast('يرجى إدخال اسم الفرع', false); return false; }
    const { error } = await window.supa.from('branches')
        .update({ name: name.trim(), location: location.trim() }).eq('id', id);
    if (error) { showToast('خطأ: ' + error.message, false); return false; }
    showToast('✅ تم التعديل');
    return true;
}

async function deleteBranch(id) {
    const r = await Swal.fire({
        title: 'حذف الفرع؟', icon: 'warning',
        text: 'البيانات المرتبطة بالفرع لن تُحذف.',
        showCancelButton: true, confirmButtonColor: '#d33',
        confirmButtonText: 'احذف', cancelButtonText: 'إلغاء', width: '340px'
    });
    if (!r.isConfirmed) return;
    const { error } = await window.supa.from('branches').delete().eq('id', id);
    if (error) { showToast('خطأ: ' + error.message, false); return; }
    showToast('✅ تم الحذف');
    loadBranchesTable();
}


// ══════════════════════════════════════════════════════════
// 6. تعيين موظف لفرع
// ══════════════════════════════════════════════════════════
async function assignUserToBranch(userId, branchId) {
    const { error } = await window.supa.from('users')
        .update({ branch_id: branchId }).eq('id', userId);
    if (error) { showToast('خطأ: ' + error.message, false); return false; }
    showToast('✅ تم تعيين الفرع');
    return true;
}

async function handleAssignUserToBranch() {
    const userId   = document.getElementById('assignUserSelect')?.value;
    const branchId = document.getElementById('assignBranchSelect')?.value;
    if (!userId || !branchId) { showToast('اختر الموظف والفرع', false); return; }
    if (await assignUserToBranch(userId, branchId)) {
        await loadUsersForAssign();
        if (typeof loadUsersTable === 'function') loadUsersTable();
    }
}


// ══════════════════════════════════════════════════════════
// 7. ملء قوائم الاختيار
// ══════════════════════════════════════════════════════════
async function populateBranchSelect(selectId, withAll = false) {
    const el = document.getElementById(selectId);
    if (!el) return;
    const branches = await getAllBranches();
    el.innerHTML = withAll
        ? '<option value="">كل الفروع</option>'
        : '<option value="">-- اختر فرع --</option>';
    branches.forEach(b => {
        el.innerHTML += `<option value="${esc(b.id)}">${esc(b.name)}</option>`;
    });
}

async function loadUsersForAssign() {
    const sel = document.getElementById('assignUserSelect');
    if (!sel) return;

    const u = window.currentUserData;
    sel.innerHTML = '<option value="">جاري التحميل...</option>';

    try {
        let query = window.supa
            .from('users')
            .select('id, name, email, branch_id, branches(name)')
            .order('name');

        // مدير الفرع يشوف موظفي فرعه بس
        if (u?.isAdmin && u?.branch_id) {
            query = query.eq('branch_id', u.branch_id);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (!data?.length) {
            sel.innerHTML = '<option value="">لا يوجد موظفين</option>';
            return;
        }

        sel.innerHTML = '<option value="">-- اختر موظف --</option>';
        data.forEach(user => {
            const branch = user.branches?.name ? ` — ${user.branches.name}` : ' — بدون فرع';
            const roleLabel = user.is_master ? '👑' : user.role === 'ADMIN' ? '🔑' : '👤';
            sel.innerHTML += `<option value="${user.id}">${roleLabel} ${user.name || user.email}${branch}</option>`;
        });
    } catch (e) {
        sel.innerHTML = '<option value="">خطأ في التحميل</option>';
    }
}


// ══════════════════════════════════════════════════════════
// 8. واجهة إدارة الفروع (بتنسيق متطابق مع باقي الأقسام)
// ══════════════════════════════════════════════════════════

// فتح/إغلاق قائمة أعضاء الفرع
window.toggleBranchMembers = function(divId, headerEl) {
    const div = document.getElementById(divId);
    if (!div) return;
    const isOpen = div.style.display !== 'none';
    div.style.display = isOpen ? 'none' : 'block';
    // تدوير السهم
    const arrow = headerEl.querySelector('.fa-chevron-down');
    if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
};

window.loadBranchesTable = async function () {
    const container = document.getElementById('branchesList');
    if (!container) return;

    container.innerHTML = `
        <div class="text-center p-4 text-muted small">
            <i class="fa fa-circle-notch fa-spin me-1"></i> جاري التحميل...
        </div>`;

    const u        = window.currentUserData;
    const isMaster = u?.isMaster === true;
    const isAdmin  = u?.isAdmin  === true;

    // إظهار/إخفاء الأقسام حسب الصلاحية
    const addBtn         = document.getElementById('addBranchBtn');
    const assignSection  = document.getElementById('assignSection');
    const summarySection = document.getElementById('branchesSummarySection');

    if (addBtn)         addBtn.style.display         = isMaster ? '' : 'none';
    if (assignSection)  assignSection.style.display  = isMaster ? '' : 'none';
    if (summarySection) summarySection.style.display = isMaster ? '' : 'none';

    // مدير الفرع يشوف فرعه بس
    let branches = await getAllBranches();
    if (!isMaster && isAdmin && u?.branch_id) {
        branches = branches.filter(b => b.id === u.branch_id);
    }

    if (!branches.length) {
        container.innerHTML = `
            <div class="text-center py-4 text-muted">
                <i class="fa fa-building fa-2x mb-2 opacity-25 d-block"></i>
                <span class="small">لا توجد فروع بعد</span>
            </div>`;
        return;
    }

    // جلب أعضاء الفرع
    const { data: usersData } = await window.supa.from('users').select('id, name, email, branch_id');
    const countMap = {};
    (usersData || []).forEach(row => {
        if (row.branch_id) countMap[row.branch_id] = (countMap[row.branch_id] || 0) + 1;
    });

    const palette = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4'];

    container.innerHTML = branches.map((b, i) => {
        const color = palette[i % palette.length];
        const count = countMap[b.id] || 0;

        // أزرار الفرع: مدير عام = تعديل + حذف، مدير فرع = لا شيء
        const actionBtns = isMaster ? `
            <div class="d-flex gap-1 flex-shrink-0">
                <button class="btn btn-sm btn-light border p-1"
                    onclick="openEditBranchModal('${esc(b.id)}','${safeAttr(b.name)}','${safeAttr(b.location||'')}')" title="تعديل">
                    <i class="fa fa-pen" style="color:${color};font-size:11px;"></i>
                </button>
                <button class="btn btn-sm btn-light border p-1"
                    onclick="deleteBranch('${esc(b.id)}')" title="حذف">
                    <i class="fa fa-trash-alt text-danger" style="font-size:11px;"></i>
                </button>
            </div>` : '';

        // أعضاء الفرع — مدير الفرع: إزالة | مدير عام: إزالة + حذف نهائي
        const branchMembers = (usersData || []).filter(u => u.branch_id === b.id);
        const showMembers = isMaster || (isAdmin && !isMaster);
        const membersHTML = showMembers ? `
            <div class="mt-2 pt-2" style="border-top:1px solid rgba(255,255,255,0.08);">
                <div style="font-size:10px;color:#94a3b8;margin-bottom:6px;">
                    <i class="fa fa-users me-1" style="color:${color};"></i> الأعضاء (${branchMembers.length})
                </div>
                ${branchMembers.length === 0
                    ? '<div style="font-size:11px;color:#64748b;text-align:center;padding:6px;">لا يوجد أعضاء</div>'
                    : branchMembers.map(m => `
                        <div class="d-flex align-items-center justify-content-between px-2 py-1 mb-1 rounded-2"
                             style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);">
                            <div class="d-flex align-items-center gap-2">
                                <div class="rounded-circle d-flex align-items-center justify-content-center"
                                     style="width:24px;height:24px;min-width:24px;background:${color}20;color:${color};font-size:10px;">
                                    <i class="fa fa-user"></i>
                                </div>
                                <span style="font-size:12px;color:var(--card-text, #1e293b);">${esc(m.name || m.email)}</span>
                            </div>
                            <div class="d-flex gap-1">
                                <button style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:6px;padding:3px 7px;cursor:pointer;"
                                    title="إزالة من الفرع" onclick="removeMemberFromBranch('${esc(m.id)}','${safeAttr(m.name || m.email)}')">
                                    <i class="fa fa-user-minus" style="color:#f59e0b;font-size:10px;"></i>
                                </button>
                                ${isMaster ? `
                                <button style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:3px 7px;cursor:pointer;"
                                    title="حذف نهائي" onclick="deleteMemberPermanently('${esc(m.id)}','${safeAttr(m.name || m.email)}')">
                                    <i class="fa fa-trash-alt" style="color:#ef4444;font-size:10px;"></i>
                                </button>` : ''}
                            </div>
                        </div>`).join('')
                }
            </div>` : '';

        return `
        <div class="mb-2 rounded-3 shadow-sm"
             style="background:var(--card-bg);border:1px solid var(--card-border);border-right:4px solid ${color} !important;direction:rtl;overflow:hidden;">

            <!-- هيدر الكارت -->
            <div class="d-flex align-items-center p-2" style="cursor:pointer;"
                 onclick="toggleBranchMembers('branch-members-${b.id}', this)">

                <div class="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                     style="width:38px;height:38px;min-width:38px;background:${color}15;color:${color};">
                    <i class="fa fa-building" style="font-size:15px;"></i>
                </div>

                <div class="flex-grow-1 px-2">
                    <div class="fw-bold" style="font-size:13px;color:var(--card-text);">${esc(b.name)}</div>
                    <div class="d-flex align-items-center gap-2 mt-1">
                        <small class="text-muted" style="font-size:10px;">
                            <i class="fa fa-location-dot me-1"></i>${esc(b.location) || 'لم يُحدد الموقع'}
                        </small>
                        <span class="badge rounded-pill" style="background:${color}15;color:${color};border:1px solid ${color}35;font-size:9px;">
                            <i class="fa fa-users me-1"></i>${count}
                        </span>
                    </div>
                </div>

                <div class="d-flex align-items-center gap-1">
                    ${actionBtns}
                    ${showMembers ? `
                    <div style="width:28px;height:28px;border-radius:50%;background:${color}15;border:1px solid ${color}30;
                                display:flex;align-items:center;justify-content:center;margin-right:4px;transition:transform 0.3s;">
                        <i class="fa fa-chevron-down" style="color:${color};font-size:10px;transition:transform 0.3s;"></i>
                    </div>` : ''}
                </div>
            </div>

            <!-- قائمة الأعضاء (مخفية افتراضياً) -->
            <div id="branch-members-${b.id}" style="display:none; padding:0 8px 8px 8px;">
                ${membersHTML}
            </div>
        </div>`;
    }).join('');
};

// إزالة عضو من الفرع
window.removeMemberFromBranch = async function(userId, userName) {
    const res = await Swal.fire({
        title: 'إزالة من الفرع؟',
        text: `سيتم إزالة "${userName}" من الفرع`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، أزل',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#f59e0b',
        width: '340px'
    });

    if (res.isConfirmed) {
        const { error } = await window.supa.from('users').update({ branch_id: null }).eq('id', userId);
        if (error) {
            showToast('❌ خطأ: ' + error.message, false);
        } else {
            showToast('✅ تم الإزالة بنجاح');
            loadBranchesTable();
        }
    }
};

// حذف عضو نهائياً (للمدير العام فقط)
window.deleteMemberPermanently = async function(userId, userName) {
    const res = await Swal.fire({
        title: 'حذف نهائي؟',
        text: `سيتم حذف "${userName}" نهائياً من النظام`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#d33',
        width: '340px'
    });

    if (res.isConfirmed) {
        const { error } = await window.supa.from('users').delete().eq('id', userId);
        if (error) {
            showToast('❌ خطأ: ' + error.message, false);
        } else {
            showToast('✅ تم الحذف نهائياً');
            loadBranchesTable();
        }
    }
};



// ══════════════════════════════════════════════════════════
// 9. نوافذ الإضافة والتعديل
// ══════════════════════════════════════════════════════════
window.openAddBranchModal = async function () {
    const { value, isConfirmed } = await Swal.fire({
        title: 'إضافة فرع جديد',
        html: `
            <div style="direction:rtl;text-align:right;">
                <div class="mb-3">
                    <label class="swal2-input">اسم الفرع *</label>
                    <input id="sb-name" class="form-control" placeholder="مثال: فرع القاهرة">
                </div>
                <div>
                    <label class="swal2-input">الموقع</label>
                    <input id="sb-loc" class="form-control" placeholder="مثال: شارع التحرير">
                </div>
            </div>`,
        showCancelButton: true,
        confirmButtonText: 'إضافة', cancelButtonText: 'إلغاء',
        confirmButtonColor: '#2563eb', width: '380px',
        focusConfirm: false,
        preConfirm: () => ({
            name:     document.getElementById('sb-name').value,
            location: document.getElementById('sb-loc').value
        })
    });
    if (isConfirmed && value && await addBranch(value.name, value.location))
        loadBranchesTable();
};

window.openEditBranchModal = async function (id, name, location) {
    const { value, isConfirmed } = await Swal.fire({
        title: 'تعديل الفرع',
        html: `
            <div style="direction:rtl;text-align:right;">
                <div class="mb-3">
                    <label class="swal2-input">اسم الفرع *</label>
                    <input id="sb-name" class="form-control" value="${name}">
                </div>
                <div>
                    <label class="swal2-input">الموقع</label>
                    <input id="sb-loc" class="form-control" value="${location}">
                </div>
            </div>`,
        showCancelButton: true,
        confirmButtonText: 'حفظ', cancelButtonText: 'إلغاء',
        confirmButtonColor: '#2563eb', width: '380px',
        focusConfirm: false,
        preConfirm: () => ({
            name:     document.getElementById('sb-name').value,
            location: document.getElementById('sb-loc').value
        })
    });
    if (isConfirmed && value && await updateBranch(id, value.name, value.location))
        loadBranchesTable();
};


// ══════════════════════════════════════════════════════════
// 10. ملخص الفروع للمدير العام
// ══════════════════════════════════════════════════════════
window.renderBranchesSummary = async function () {
    const container = document.getElementById('branches-summary-container');
    // لا تشتغل لو الـ tab مش ظاهر
    if (!container) return;
    const tab = document.getElementById('branches-tab');
    if (!tab || tab.style.display === 'none') return;

    container.innerHTML = '<div class="text-center p-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>';

    const branches = await getAllBranches();
    if (!branches.length) {
        container.innerHTML = '<div class="text-center p-4 text-muted small">لا توجد فروع</div>';
        return;
    }

    const f = n => Number(n||0).toLocaleString();
    const palette = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4'];

    const [{ data: allTx }, { data: allAcc }, { data: allUsers }] = await Promise.all([
        window.supa.from('transactions').select('amount, type, branch_id'),
        window.supa.from('accounts').select('balance, branch_id'),
        window.supa.from('users').select('branch_id, role, is_master')
    ]);

    container.innerHTML = branches.map((b, i) => {
        const color   = palette[i % palette.length];
        const bTx     = (allTx    || []).filter(t => t.branch_id === b.id);
        const bAcc    = (allAcc   || []).filter(a => a.branch_id === b.id);
        const bUsers  = (allUsers || []).filter(u => u.branch_id === b.id);
        const bAdmins = bUsers.filter(u => (u.role||'').toUpperCase() === 'ADMIN').length;
        const totalBal = bAcc.reduce((s,a) => s+(Number(a.balance)||0), 0);
        const totalIn  = bTx.filter(t => !/سحب|صادر/.test(t.type||'')).reduce((s,t) => s+(Number(t.amount)||0), 0);
        const totalOut = bTx.filter(t =>  /سحب|صادر/.test(t.type||'')).reduce((s,t) => s+(Number(t.amount)||0), 0);

        return `
        <div class="d-flex align-items-center p-2 mb-2 rounded-3 shadow-sm"
             style="background:var(--card-bg);border:1px solid var(--card-border);border-right:4px solid ${color} !important;direction:rtl;">

            <div class="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                 style="width:36px;height:36px;min-width:36px;background:${color}15;color:${color};">
                <i class="fa fa-building"></i>
            </div>

            <div class="flex-grow-1 px-2">
                <div class="fw-bold" style="font-size:12px;color:${color};">${esc(b.name)}</div>
                <div style="font-size:10px;" class="text-muted">
                    <i class="fa fa-users me-1"></i>${bUsers.length} موظف
                    · <i class="fa fa-user-tie me-1"></i>${bAdmins} مدير
                </div>
            </div>

            <div class="d-flex gap-1 text-center">
                <div class="px-2 border-start">
                    <div style="font-size:9px;" class="text-muted">رصيد</div>
                    <div class="fw-bold english-num" style="font-size:11px;color:${color};">${f(totalBal)}</div>
                </div>
                <div class="px-2 border-start">
                    <div style="font-size:9px;" class="text-muted">وارد</div>
                    <div class="fw-bold text-success english-num" style="font-size:11px;">${f(totalIn)}</div>
                </div>
                <div class="px-2 border-start">
                    <div style="font-size:9px;" class="text-muted">صادر</div>
                    <div class="fw-bold text-danger english-num" style="font-size:11px;">${f(totalOut)}</div>
                </div>
            </div>
        </div>`;
    }).join('');
};


// ══════════════════════════════════════════════════════════
// 11. داشبورد الفرع + فلتر اختيار الفرع للمدير العام
// يغطي مشكلتين: مدير الفرع يشوف فرعه بس، والمدير العام يفلتر
// ══════════════════════════════════════════════════════════

// فلتر اختيار الفرع في الداشبورد (للمدير العام)
async function renderDashBranchFilter() {
    const filterDiv = document.getElementById('dashBranchFilter');
    
    if (!filterDiv) {
        return;
    }

    const u = window.currentUserData;

    // تأكد من أن الشرط يطابق طريقة تخزينك للبيانات (boolean أو number)
    if (!u || (u.isMaster !== true && u.isMaster !== 1)) { 
        filterDiv.style.display = 'none'; 
        return; 
    }

    filterDiv.style.display = 'block'; // اجعله ظاهراً أثناء التحميل
    filterDiv.innerHTML = '<span class="text-muted small">جاري تحميل الفروع...</span>';

    try {
        const branches = await getAllBranches();

        if (!branches || branches.length === 0) {
            filterDiv.innerHTML = '<span class="text-danger small">لا توجد فروع متاحة</span>';
            return;
        }

        filterDiv.innerHTML = `
            <div class="d-flex align-items-center gap-2 mb-3 flex-wrap" style="direction:rtl;">
                <span class="small fw-bold text-muted"><i class="fa fa-building me-1"></i>عرض:</span>
                <button class="btn btn-sm btn-primary rounded-pill px-3 dash-branch-btn active"
                        data-branch="" onclick="filterDashboardByBranch(this)">
                    كل الفروع
                </button>
                ${branches.map(b => `
                    <button class="btn btn-sm btn-outline-primary rounded-pill px-3 dash-branch-btn"
                            data-branch="${esc(b.id)}" onclick="filterDashboardByBranch(this)">
                        ${esc(b.name)}
                    </button>`).join('')}
            </div>`;
    } catch (err) {
        filterDiv.innerHTML = '<span class="text-danger small">فشل تحميل فلتر الفروع</span>';
    }
}

async function filterDashboardByBranch(btn) {
    // تحديث الأزرار
    document.querySelectorAll('.dash-branch-btn').forEach(b => {
        b.className = b.className.replace('btn-primary', 'btn-outline-primary').replace(' active','');
    });
    btn.className = btn.className.replace('btn-outline-primary','btn-primary') + ' active';

    window._currentDashBranch = btn.dataset.branch || null;

    // إعادة تحميل الداشبورد
    if (typeof loadDashboard === 'function') loadDashboard();
}

// Override على getDashboardStats
document.addEventListener('DOMContentLoaded', () => {
    const _orig = window.getDashboardStats;

    window.getDashboardStats = async function () {
        const user     = window.currentUserData;
        const isMaster = user?.isMaster;

        // تحديد الفرع المطلوب
        // مدير عام + اختار فرع معين → فلتر
        // مدير عام + كل الفروع → لا فلتر (orig)
        // مدير فرع أو موظف → فرعهم دايماً
        let branchId = null;

        if (isMaster) {
            branchId = window._currentDashBranch || null; // null = كل الفروع
        } else {
            branchId = user?.branch_id || null;
        }

        // لو مدير عام وما اختارش فرع → الداشبورد الأصلي
        if (isMaster && !branchId) {
            return typeof _orig === 'function' ? _orig() : { success: false };
        }

        // لو مش معاه فرع أصلاً → الداشبورد الأصلي
        if (!branchId) {
            return typeof _orig === 'function' ? _orig() : { success: false };
        }

        // داشبورد الفرع المحدد
        try {
            const now      = new Date();
            const m        = String(now.getMonth()+1).padStart(2,'0');
            const y        = now.getFullYear();
            const d        = String(now.getDate()).padStart(2,'0');
            const monthStr = `/${m}/${y}`;
            const todayStr = `${d}/${m}/${y}`;

            // الشهر السابق
            const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const pm = String(prevDate.getMonth() + 1).padStart(2, '0');
            const py = prevDate.getFullYear();
            const prevMonthStr = `/${pm}/${py}`;

            const [
                { data: accountsRaw },
                { data: clients },
                { data: monthTxs },
                { data: lastFive },
                { data: prevMonthTxs }
            ] = await Promise.all([
                window.supa.from('accounts').select('*').eq('branch_id', branchId),
                window.supa.from('clients').select('name, balance').eq('branch_id', branchId),
                window.supa.from('transactions')
                    .select('commission, amount, type, date')
                    .eq('branch_id', branchId)
                    .ilike('date', `%${monthStr}`).limit(2000),
                window.supa.from('transactions')
                    .select('type, amount, date, time, added_by, notes')
                    .eq('branch_id', branchId)
                    .order('id', { ascending: false }).limit(5),
                window.supa.from('transactions')
                    .select('commission, amount, type')
                    .eq('branch_id', branchId)
                    .ilike('date', `%${prevMonthStr}`).limit(2000)
            ]);

            const accounts = accountsRaw || [];
            let cashBal=0, walletBal=0, compBal=0, breakdown={};
            accounts.forEach(acc => {
                const name  = (acc.name||'').trim();
                const bal   = Number(acc.balance)||0;
                const limit = Number(acc.daily_out_limit)||0;
                if (name.includes('الخزنة')||name.includes('كاش')) cashBal+=bal;
                else if (limit>=9000000) { compBal+=bal; breakdown[name]={balance:bal,color:acc.color||'#4f46e5'}; }
                else walletBal+=bal;
            });

            let oweMe=0, have=0, clientsCards=[];
            (clients||[]).forEach(c => {
                const b=Number(c.balance)||0;
                if(b>0) oweMe+=b; else if(b<0) have+=Math.abs(b);
                if(b!==0) clientsCards.push({name:c.name,balance:b});
            });

            let dP=0,mP=0,ex=0,todayCount=0,todayIn=0,todayOut=0;
            let mCount=0,mIn=0,mOut=0;
            (monthTxs||[]).forEach(tx => {
                const txDate=(tx.date||'').trim();
                const type=(tx.type||'').toLowerCase();
                const comm=parseFloat(tx.commission)||0;
                const amt=parseFloat(tx.amount)||0;
                const isExp=/مصروف|مصاريف|خارج|عجز/.test(type);
                const isOutTx=/سحب|صادر/.test(type)||isExp;
                if(comm){if(txDate===todayStr)dP+=comm; mP+=comm;}
                if(isExp) ex+=amt;
                mCount++; if(isOutTx) mOut+=amt; else mIn+=amt;
                if(txDate===todayStr){
                    todayCount++;
                    if(isOutTx) todayOut+=amt; else todayIn+=amt;
                }
            });
            // حساب إحصائيات الشهر السابق فعلياً
            let prevMP=0, prevEx=0, prevMCount=0, prevMIn=0, prevMOut=0;
            (prevMonthTxs||[]).forEach(tx => {
                const type=(tx.type||'').toLowerCase();
                const comm=parseFloat(tx.commission)||0;
                const amt=parseFloat(tx.amount)||0;
                const isExp=/مصروف|مصاريف|خارج|عجز/.test(type);
                const isOutTx=/سحب|صادر/.test(type)||isExp;
                prevMP+=comm;
                if(isExp) prevEx+=amt;
                prevMCount++;
                if(isOutTx) prevMOut+=amt; else prevMIn+=amt;
            });

            return {
                success:true,
                cash:cashBal, walletsTotal:walletBal, compTotal:compBal,
                totalAvailable:cashBal+walletBal+compBal,
                grandTotal:(cashBal+walletBal+compBal+oweMe)-have,
                oweMe,have,dP,mP,ex,breakdown,clientsCards,
                todayCount,todayIn,todayOut,
                lastFive: lastFive||[],
                accounts: accounts,
                mCount,mIn,mOut,
                prevMP,prevEx,prevMCount,prevMIn,prevMOut
            };
        } catch(err) {
            return { success: false };
        }
    };

    // تحميل فلتر الفروع في الداشبورد بعد init
});
function initBranchFilterWithRetry() {
    if (window.currentUserData) {
        renderDashBranchFilter();
    } else {
        // إذا لم تتوفر البيانات، حاول مرة أخرى بعد 100 ملي ثانية
        setTimeout(initBranchFilterWithRetry, 100);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // ... الكود الخاص بـ Override getDashboardStats ...
    
    // ابدأ محاولات الرندر
    initBranchFilterWithRetry();
});