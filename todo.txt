📝 SaaS Platform To-Do List
1️⃣ Platform Level Setup

 إنشاء جدول platform_admins (user_id, role: SUPER_ADMIN/SUPPORT, created_at)

 تحديد صلاحيات PLATFORM_ADMIN عبر RLS

 SUPER_ADMIN: كامل التحكم في كل الشركات والاشتراكات

 SUPPORT: رؤية الشركات فقط، بدون تعديل الاشتراكات

 تعديل RLS في الجداول التشغيلية للسماح لموظفي المنصة بتجاوز القيود على مستوى الشركة والفروع

2️⃣ Company Sign-Up (صفحة إنشاء حساب عامة)

 إنشاء صفحة Sign-Up خاصة بأصحاب الشركات فقط

حقول: اسم الشركة، البريد الإلكتروني، اسم المستخدم، كلمة المرور

 عند التسجيل:

 إنشاء User في Supabase Auth

 إنشاء سجل في جدول companies (name, owner_id)

 إنشاء اشتراك تلقائي FREE Trial في جدول subscriptions

plan_code = FREE

status = trial

trial_ends_at = now() + 7 أيام

نسخ limits من جدول plans إلى subscription

 إنشاء أول Branch افتراضي مرتبط بـ company_id

 إنشاء سجل OWNER في جدول users مرتبط بالشركة والفرع

3️⃣ Tables & Structure

 جدول plans يحتوي على:

code, name, max_branches, max_employees, max_transactions, duration_days, price

 جدول subscriptions يحتوي على:

company_id, plan_code, status, started_at, expires_at, trial_ends_at, max_branches, max_employees, max_transactions

 جدول branches يحتوي على:

id, company_id, name, created_at

 جدول users يحتوي على:

id, company_id, branch_id, role (OWNER, ADMIN, BRANCH_MANAGER, EMPLOYEE), created_at

4️⃣ User & Branch Management

 منع الموظفين ومديري الفروع من استخدام صفحة Sign-Up العامة

 إنشاء نظام دعوات (Invitation System) للموظفين:

 جدول invitations (company_id, email, role, branch_id, token, expires_at, status)

 إرسال رابط دعوة للموظف

 الموظف يقوم بتعيين كلمة المرور عند قبول الدعوة

 إنشاء User في Supabase Auth وربطه بالشركة، الدور، الفرع

 RLS للتحقق من أن كل عملية مرتبطة بالشركة الصحيحة فقط

5️⃣ Permissions & Roles

 تحديد Roles على مستوى الشركة:

OWNER: إدارة كل الفروع، الموظفين، الاشتراك، التقارير

ADMIN: إدارة الفروع والموظفين، رؤية تقارير الشركة، لا يمكنه تغيير الاشتراك

BRANCH_MANAGER: إدارة فرع محدد فقط، رؤية تقارير الفرع

EMPLOYEE: تسجيل العمليات، رؤية بيانات الفرع فقط

 RLS لكل جدول اعتمادًا على auth.uid() وcompany_id وbranch_id

 التأكد من أن الفرونت لا يتحكم في role أو branch_id

6️⃣ Subscription Limits & Enforcement

 منع تجاوز الحدود:

 إضافة فرع جديد < subscription.max_branches

 إضافة موظف جديد < subscription.max_employees

 تسجيل عمليات < subscription.max_transactions

 تنفيذ القواعد في قاعدة البيانات (DB Functions / Triggers) وليس في الواجهة فقط

 عند انتهاء الاشتراك:

 تغيير status إلى expired

 منع إنشاء بيانات جديدة

 السماح بمشاهدة البيانات القديمة

7️⃣ Upgrade / Downgrade Flow

 Owner Dashboard → Subscription

 اختيار Plan جديد

 تأكيد الدفع عبر Payment Gateway

 تحديث subscription:

plan_code

status = active

started_at = now()

expires_at = now() + duration_days

تحديث limits داخل subscription

 منع تعديل جدول plans مباشرة بعد إنشاء الاشتراك

8️⃣ Operational Tables (Transactions, Customers, Accounts)

 ربط جميع البيانات بـ branch_id

 التأكد أن كل branch مرتبط بـ company_id

 جميع العمليات والتحقق عبر RLS لضمان عزلة البيانات بين الشركات

9️⃣ Platform Admin Controls

 SUPER_ADMIN: رؤية كل الشركات والفروع، تعديل الاشتراكات، تفعيل/إيقاف الشركات

 SUPPORT: رؤية البيانات فقط بدون تعديل

 RLS يسمح فقط لمسؤولي المنصة بتجاوز قيود الشركة

🔟 Optional / Future Enhancements

 كوبونات خصم

 Add-ons (زيادة معاملات بدون ترقية)

 نظام Commissions

 Reseller Model

 White Label

 Multi-role per user (مدير على أكثر من فرع)

 Permission-based fine-grained access (CRUD لكل جدول)