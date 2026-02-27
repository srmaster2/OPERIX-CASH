async function loadCurrentUserWithBranch(){try{let{data:{user:e}}=await window.supa.auth.getUser();if(!e)return null;let{data:t}=await window.supa.from("users").select("*, branches(name, location)").eq("email",e.email).maybeSingle();if(t){let a=t.is_master||!1,n=(t.role||"").toUpperCase();window.currentUserData={...t,email:e.email,isMaster:a,isAdmin:!a&&"ADMIN"===n&&!!t.branch_id,isUser:!a&&"USER"===n,branchName:t.branches?.name||""}}return window.currentUserData}catch(i){return null}}function renderCurrentBranchBadge(){let e=document.getElementById("current-branch-badge");if(!e||!window.currentUserData)return;let t=window.currentUserData;t.isMaster?e.innerHTML='<span class="badge bg-warning text-dark ms-2"><i class="fa fa-crown me-1"></i>MASTER</span>':t.isAdmin?e.innerHTML=`<span class="badge bg-primary ms-2"><i class="fa fa-building me-1"></i>مدير ${t.branchName}</span>`:e.innerHTML=t.branchName?`<span class="badge bg-secondary ms-2"><i class="fa fa-building me-1"></i>${t.branchName}</span>`:""}function applyBranchFilter(e,t){return!t||t.isMaster?e:t.branch_id?e.eq("branch_id",t.branch_id):e.eq("branch_id","00000000-0000-0000-0000-000000000000")}function applyBranchPermissions(){let e=window.currentUserData;e&&(document.querySelectorAll(".master-only").forEach(t=>{t.style.display=e.isMaster?"":"none"}),document.querySelectorAll(".admin-or-master").forEach(t=>{t.style.display=e.isMaster||e.isAdmin?"":"none"}),document.querySelectorAll(".user-only").forEach(t=>{t.style.display=e.isUser?"":"none"}))}async function getAllBranches(){let{data:e,error:t}=await window.supa.from("branches").select("*").order("created_at",{ascending:!0});return t?[]:e||[]}async function addBranch(e,t=""){if(!e?.trim())return showToast("يرجى إدخال اسم الفرع",!1),!1;let{error:a}=await window.supa.from("branches").insert({name:e.trim(),location:t.trim()});return a?(showToast("خطأ: "+a.message,!1),!1):(showToast("✅ تم إضافة الفرع"),!0)}async function updateBranch(e,t,a=""){if(!t?.trim())return showToast("يرجى إدخال اسم الفرع",!1),!1;let{error:n}=await window.supa.from("branches").update({name:t.trim(),location:a.trim()}).eq("id",e);return n?(showToast("خطأ: "+n.message,!1),!1):(showToast("✅ تم التعديل"),!0)}async function deleteBranch(e){let t=await Swal.fire({title:"حذف الفرع؟",icon:"warning",text:"البيانات المرتبطة بالفرع لن تُحذف.",showCancelButton:!0,confirmButtonColor:"#d33",confirmButtonText:"احذف",cancelButtonText:"إلغاء",width:"340px"});if(!t.isConfirmed)return;let{error:a}=await window.supa.from("branches").delete().eq("id",e);if(a){showToast("خطأ: "+a.message,!1);return}showToast("✅ تم الحذف"),loadBranchesTable()}async function assignUserToBranch(e,t){let{error:a}=await window.supa.from("users").update({branch_id:t}).eq("id",e);return a?(showToast("خطأ: "+a.message,!1),!1):(showToast("✅ تم تعيين الفرع"),!0)}async function handleAssignUserToBranch(){let e=document.getElementById("assignUserSelect")?.value,t=document.getElementById("assignBranchSelect")?.value;if(!e||!t){showToast("اختر الموظف والفرع",!1);return}await assignUserToBranch(e,t)&&(await loadUsersForAssign(),"function"==typeof loadUsersTable&&loadUsersTable())}async function populateBranchSelect(e,t=!1){let a=document.getElementById(e);if(!a)return;let n=await getAllBranches();a.innerHTML=t?'<option value="">كل الفروع</option>':'<option value="">-- اختر فرع --</option>',n.forEach(e=>{a.innerHTML+=`<option value="${esc(e.id)}">${esc(e.name)}</option>`})}async function loadUsersForAssign(){let e=document.getElementById("assignUserSelect");if(!e)return;let t=window.currentUserData;e.innerHTML='<option value="">جاري التحميل...</option>';try{let a=window.supa.from("users").select("id, name, email, branch_id, branches(name)").order("name");t?.isAdmin&&t?.branch_id&&(a=a.eq("branch_id",t.branch_id));let{data:n,error:i}=await a;if(i)throw i;if(!n?.length){e.innerHTML='<option value="">لا يوجد موظفين</option>';return}e.innerHTML='<option value="">-- اختر موظف --</option>',n.forEach(t=>{let a=t.branches?.name?` — ${t.branches.name}`:" — بدون فرع",n=t.is_master?"\uD83D\uDC51":"ADMIN"===t.role?"\uD83D\uDD11":"\uD83D\uDC64";e.innerHTML+=`<option value="${t.id}">${n} ${t.name||t.email}${a}</option>`})}catch(r){e.innerHTML='<option value="">خطأ في التحميل</option>'}}async function renderDashBranchFilter(){let e=document.getElementById("dashBranchFilter");if(!e)return;let t=window.currentUserData;if(!t||!0!==t.isMaster&&1!==t.isMaster){e.style.display="none";return}e.style.display="block",e.innerHTML='<span class="text-muted small">جاري تحميل الفروع...</span>';try{let a=await getAllBranches();if(!a||0===a.length){e.innerHTML='<span class="text-danger small">لا توجد فروع متاحة</span>';return}e.innerHTML=`
            <div class="d-flex align-items-center gap-2 mb-3 flex-wrap" style="direction:rtl;">
                <span class="small fw-bold text-muted"><i class="fa fa-building me-1"></i>عرض:</span>
                <button class="btn btn-sm btn-primary rounded-pill px-3 dash-branch-btn active"
                        data-branch="" onclick="filterDashboardByBranch(this)">
                    كل الفروع
                </button>
                ${a.map(e=>`
                    <button class="btn btn-sm btn-outline-primary rounded-pill px-3 dash-branch-btn"
                            data-branch="${esc(e.id)}" onclick="filterDashboardByBranch(this)">
                        ${esc(e.name)}
                    </button>`).join("")}
            </div>`}catch(n){e.innerHTML='<span class="text-danger small">فشل تحميل فلتر الفروع</span>'}}async function filterDashboardByBranch(e){document.querySelectorAll(".dash-branch-btn").forEach(e=>{e.className=e.className.replace("btn-primary","btn-outline-primary").replace(" active","")}),e.className=e.className.replace("btn-outline-primary","btn-primary")+" active",window._currentDashBranch=e.dataset.branch||null,"function"==typeof loadDashboard&&loadDashboard()}function initBranchFilterWithRetry(){window.currentUserData?renderDashBranchFilter():setTimeout(initBranchFilterWithRetry,100)}window.currentUserData=null,window.toggleBranchMembers=function(e,t){let a=document.getElementById(e);if(!a)return;let n="none"!==a.style.display;a.style.display=n?"none":"block";let i=t.querySelector(".fa-chevron-down");i&&(i.style.transform=n?"":"rotate(180deg)")},window.loadBranchesTable=async function(){let e=document.getElementById("branchesList");if(!e)return;e.innerHTML=`
        <div class="text-center p-4 text-muted small">
            <i class="fa fa-circle-notch fa-spin me-1"></i> جاري التحميل...
        </div>`;let t=window.currentUserData,a=t?.isMaster===!0,n=t?.isAdmin===!0,i=document.getElementById("addBranchBtn"),r=document.getElementById("assignSection"),s=document.getElementById("branchesSummarySection");i&&(i.style.display=a?"":"none"),r&&(r.style.display=a?"":"none"),s&&(s.style.display=a?"":"none");let l=await getAllBranches();if(!a&&n&&t?.branch_id&&(l=l.filter(e=>e.id===t.branch_id)),!l.length){e.innerHTML=`
            <div class="text-center py-4 text-muted">
                <i class="fa fa-building fa-2x mb-2 opacity-25 d-block"></i>
                <span class="small">لا توجد فروع بعد</span>
            </div>`;return}let{data:c}=await window.supa.from("users").select("id, name, email, branch_id"),o={};(c||[]).forEach(e=>{e.branch_id&&(o[e.branch_id]=(o[e.branch_id]||0)+1)});let d=["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4"];e.innerHTML=l.map((e,t)=>{let i=d[t%d.length],r=o[e.id]||0,s=a?`
            <div class="d-flex gap-1 flex-shrink-0">
                <button class="btn btn-sm btn-light border p-1"
                    onclick="openEditBranchModal('${esc(e.id)}','${safeAttr(e.name)}','${safeAttr(e.location||"")}')" title="تعديل">
                    <i class="fa fa-pen" style="color:${i};font-size:11px;"></i>
                </button>
                <button class="btn btn-sm btn-light border p-1"
                    onclick="deleteBranch('${esc(e.id)}')" title="حذف">
                    <i class="fa fa-trash-alt text-danger" style="font-size:11px;"></i>
                </button>
            </div>`:"",l=(c||[]).filter(t=>t.branch_id===e.id),u=a||n&&!a,m=u?`
            <div class="mt-2 pt-2" style="border-top:1px solid rgba(255,255,255,0.08);">
                <div style="font-size:10px;color:#94a3b8;margin-bottom:6px;">
                    <i class="fa fa-users me-1" style="color:${i};"></i> الأعضاء (${l.length})
                </div>
                ${0===l.length?'<div style="font-size:11px;color:#64748b;text-align:center;padding:6px;">لا يوجد أعضاء</div>':l.map(e=>`
                        <div class="d-flex align-items-center justify-content-between px-2 py-1 mb-1 rounded-2"
                             style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);">
                            <div class="d-flex align-items-center gap-2">
                                <div class="rounded-circle d-flex align-items-center justify-content-center"
                                     style="width:24px;height:24px;min-width:24px;background:${i}20;color:${i};font-size:10px;">
                                    <i class="fa fa-user"></i>
                                </div>
                                <span style="font-size:12px;color:var(--card-text, #1e293b);">${esc(e.name||e.email)}</span>
                            </div>
                            <div class="d-flex gap-1">
                                <button style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:6px;padding:3px 7px;cursor:pointer;"
                                    title="إزالة من الفرع" onclick="removeMemberFromBranch('${esc(e.id)}','${safeAttr(e.name||e.email)}')">
                                    <i class="fa fa-user-minus" style="color:#f59e0b;font-size:10px;"></i>
                                </button>
                                ${a?`
                                <button style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:3px 7px;cursor:pointer;"
                                    title="حذف نهائي" onclick="deleteMemberPermanently('${esc(e.id)}','${safeAttr(e.name||e.email)}')">
                                    <i class="fa fa-trash-alt" style="color:#ef4444;font-size:10px;"></i>
                                </button>`:""}
                            </div>
                        </div>`).join("")}
            </div>`:"";return`
        <div class="mb-2 rounded-3 shadow-sm"
             style="background:var(--card-bg);border:1px solid var(--card-border);border-right:4px solid ${i} !important;direction:rtl;overflow:hidden;">

            <!-- هيدر الكارت -->
            <div class="d-flex align-items-center p-2" style="cursor:pointer;"
                 onclick="toggleBranchMembers('branch-members-${e.id}', this)">

                <div class="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                     style="width:38px;height:38px;min-width:38px;background:${i}15;color:${i};">
                    <i class="fa fa-building" style="font-size:15px;"></i>
                </div>

                <div class="flex-grow-1 px-2">
                    <div class="fw-bold" style="font-size:13px;color:var(--card-text);">${esc(e.name)}</div>
                    <div class="d-flex align-items-center gap-2 mt-1">
                        <small class="text-muted" style="font-size:10px;">
                            <i class="fa fa-location-dot me-1"></i>${esc(e.location)||"لم يُحدد الموقع"}
                        </small>
                        <span class="badge rounded-pill" style="background:${i}15;color:${i};border:1px solid ${i}35;font-size:9px;">
                            <i class="fa fa-users me-1"></i>${r}
                        </span>
                    </div>
                </div>

                <div class="d-flex align-items-center gap-1">
                    ${s}
                    ${u?`
                    <div style="width:28px;height:28px;border-radius:50%;background:${i}15;border:1px solid ${i}30;
                                display:flex;align-items:center;justify-content:center;margin-right:4px;transition:transform 0.3s;">
                        <i class="fa fa-chevron-down" style="color:${i};font-size:10px;transition:transform 0.3s;"></i>
                    </div>`:""}
                </div>
            </div>

            <!-- قائمة الأعضاء (مخفية افتراضياً) -->
            <div id="branch-members-${e.id}" style="display:none; padding:0 8px 8px 8px;">
                ${m}
            </div>
        </div>`}).join("")},window.removeMemberFromBranch=async function(e,t){let a=await Swal.fire({title:"إزالة من الفرع؟",text:`سيتم إزالة "${t}" من الفرع`,icon:"warning",showCancelButton:!0,confirmButtonText:"نعم، أزل",cancelButtonText:"إلغاء",confirmButtonColor:"#f59e0b",width:"340px"});if(a.isConfirmed){let{error:n}=await window.supa.from("users").update({branch_id:null}).eq("id",e);n?showToast("❌ خطأ: "+n.message,!1):(showToast("✅ تم الإزالة بنجاح"),loadBranchesTable())}},window.deleteMemberPermanently=async function(e,t){let a=await Swal.fire({title:"حذف نهائي؟",text:`سيتم حذف "${t}" نهائياً من النظام`,icon:"warning",showCancelButton:!0,confirmButtonText:"نعم، احذف",cancelButtonText:"إلغاء",confirmButtonColor:"#d33",width:"340px"});if(a.isConfirmed){let{error:n}=await window.supa.from("users").delete().eq("id",e);n?showToast("❌ خطأ: "+n.message,!1):(showToast("✅ تم الحذف نهائياً"),loadBranchesTable())}},window.openAddBranchModal=async function(){let{value:e,isConfirmed:t}=await Swal.fire({title:"إضافة فرع جديد",html:`
            <div style="direction:rtl;text-align:right;">
                <div class="mb-3">
                    <label class="swal2-input">اسم الفرع *</label>
                    <input id="sb-name" class="form-control" placeholder="مثال: فرع القاهرة">
                </div>
                <div>
                    <label class="swal2-input">الموقع</label>
                    <input id="sb-loc" class="form-control" placeholder="مثال: شارع التحرير">
                </div>
            </div>`,showCancelButton:!0,confirmButtonText:"إضافة",cancelButtonText:"إلغاء",confirmButtonColor:"#2563eb",width:"380px",focusConfirm:!1,preConfirm:()=>({name:document.getElementById("sb-name").value,location:document.getElementById("sb-loc").value})});t&&e&&await addBranch(e.name,e.location)&&loadBranchesTable()},window.openEditBranchModal=async function(e,t,a){let{value:n,isConfirmed:i}=await Swal.fire({title:"تعديل الفرع",html:`
            <div style="direction:rtl;text-align:right;">
                <div class="mb-3">
                    <label class="swal2-input">اسم الفرع *</label>
                    <input id="sb-name" class="form-control" value="${t}">
                </div>
                <div>
                    <label class="swal2-input">الموقع</label>
                    <input id="sb-loc" class="form-control" value="${a}">
                </div>
            </div>`,showCancelButton:!0,confirmButtonText:"حفظ",cancelButtonText:"إلغاء",confirmButtonColor:"#2563eb",width:"380px",focusConfirm:!1,preConfirm:()=>({name:document.getElementById("sb-name").value,location:document.getElementById("sb-loc").value})});i&&n&&await updateBranch(e,n.name,n.location)&&loadBranchesTable()},window.renderBranchesSummary=async function(){let e=document.getElementById("branches-summary-container");if(!e)return;let t=document.getElementById("branches-tab");if(!t||"none"===t.style.display)return;e.innerHTML='<div class="text-center p-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>';let a=await getAllBranches();if(!a.length){e.innerHTML='<div class="text-center p-4 text-muted small">لا توجد فروع</div>';return}let n=e=>Number(e||0).toLocaleString(),i=["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4"],[{data:r},{data:s},{data:l}]=await Promise.all([window.supa.from("transactions").select("amount, type, branch_id"),window.supa.from("accounts").select("balance, branch_id"),window.supa.from("users").select("branch_id, role, is_master")]);e.innerHTML=a.map((e,t)=>{let a=i[t%i.length],c=(r||[]).filter(t=>t.branch_id===e.id),o=(s||[]).filter(t=>t.branch_id===e.id),d=(l||[]).filter(t=>t.branch_id===e.id),u=d.filter(e=>"ADMIN"===(e.role||"").toUpperCase()).length,m=o.reduce((e,t)=>e+(Number(t.balance)||0),0),f=c.filter(e=>!/سحب|صادر/.test(e.type||"")).reduce((e,t)=>e+(Number(t.amount)||0),0),p=c.filter(e=>/سحب|صادر/.test(e.type||"")).reduce((e,t)=>e+(Number(t.amount)||0),0);return`
        <div class="d-flex align-items-center p-2 mb-2 rounded-3 shadow-sm"
             style="background:var(--card-bg);border:1px solid var(--card-border);border-right:4px solid ${a} !important;direction:rtl;">

            <div class="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                 style="width:36px;height:36px;min-width:36px;background:${a}15;color:${a};">
                <i class="fa fa-building"></i>
            </div>

            <div class="flex-grow-1 px-2">
                <div class="fw-bold" style="font-size:12px;color:${a};">${esc(e.name)}</div>
                <div style="font-size:10px;" class="text-muted">
                    <i class="fa fa-users me-1"></i>${d.length} موظف
                    \xb7 <i class="fa fa-user-tie me-1"></i>${u} مدير
                </div>
            </div>

            <div class="d-flex gap-1 text-center">
                <div class="px-2 border-start">
                    <div style="font-size:9px;" class="text-muted">رصيد</div>
                    <div class="fw-bold english-num" style="font-size:11px;color:${a};">${n(m)}</div>
                </div>
                <div class="px-2 border-start">
                    <div style="font-size:9px;" class="text-muted">وارد</div>
                    <div class="fw-bold text-success english-num" style="font-size:11px;">${n(f)}</div>
                </div>
                <div class="px-2 border-start">
                    <div style="font-size:9px;" class="text-muted">صادر</div>
                    <div class="fw-bold text-danger english-num" style="font-size:11px;">${n(p)}</div>
                </div>
            </div>
        </div>`}).join("")},document.addEventListener("DOMContentLoaded",()=>{let e=window.getDashboardStats;window.getDashboardStats=async function(){let t=window.currentUserData,a=t?.isMaster,n=null;if(n=a?window._currentDashBranch||null:t?.branch_id||null,a&&!n||!n)return"function"==typeof e?e():{success:!1};try{let i=new Date,r=String(i.getMonth()+1).padStart(2,"0"),s=i.getFullYear(),l=String(i.getDate()).padStart(2,"0"),c=`/${r}/${s}`,o=`${l}/${r}/${s}`,[{data:d},{data:u},{data:m},{data:f}]=await Promise.all([window.supa.from("accounts").select("*").eq("branch_id",n),window.supa.from("clients").select("name, balance").eq("branch_id",n),window.supa.from("transactions").select("commission, amount, type, date").eq("branch_id",n).ilike("date",`%${c}`).limit(1e3),window.supa.from("transactions").select("type, amount, date, time, added_by, notes").eq("branch_id",n).order("id",{ascending:!1}).limit(5)]),p=0,b=0,h=0,y={};(d||[]).forEach(e=>{let t=(e.name||"").trim(),a=Number(e.balance)||0,n=Number(e.daily_out_limit)||0;t.includes("الخزنة")||t.includes("كاش")?p+=a:n>=9e6?(h+=a,y[t]={balance:a,color:e.color||"#4f46e5"}):b+=a});let g=0,x=0,$=[];(u||[]).forEach(e=>{let t=Number(e.balance)||0;t>0?g+=t:t<0&&(x+=Math.abs(t)),0!==t&&$.push({name:e.name,balance:t})});let v=0,_=0,B=0,w=0,M=0,T=0;return(m||[]).forEach(e=>{let t=(e.date||"").trim(),a=(e.type||"").toLowerCase(),n=parseFloat(e.commission)||0,i=parseFloat(e.amount)||0;n&&(t===o&&(v+=n),_+=n),/مصروف|مصاريف|خارج|عجز/.test(a)&&(B+=i),t===o&&(w++,/سحب|صادر|مصروف/.test(a)?T+=i:M+=i)}),{success:!0,cash:p,walletsTotal:b,compTotal:h,totalAvailable:p+b+h,grandTotal:p+b+h+g-x,oweMe:g,have:x,dP:v,mP:_,ex:B,breakdown:y,clientsCards:$,todayCount:w,todayIn:M,todayOut:T,lastFive:f||[]}}catch(E){return{success:!1}}}}),document.addEventListener("DOMContentLoaded",()=>{initBranchFilterWithRetry()});
