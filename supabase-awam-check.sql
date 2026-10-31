-- ================================================================
--  عوام AWAM — فحص أمان (قراءة فقط)
--
--  الملف ده مبيعملش أي تعديل خالص — كله SELECT.
--  شغّليه قبل ملف التحديث لو حابة تتطمني، وهو هيوريكي:
--    1) إنتِ جوه أنهي مشروع/قاعدة بيانات
--    2) جدول عوام موجود ولا لأ
--    3) هل فيه جدول/دالة بنفس الاسم هيتعارض مع عوام
--    4) كل الجداول اللي في public (عشان تتأكدي إن مشروعك التاني سليم)
-- ================================================================

-- 1) القاعدة والمشروع
select current_database() as database_name,
       current_user       as connected_as,
       version()          as postgres_version;

-- 2) جدول المنتجات بتاع عوام (لازم يظهر — لو ظهر NULL يبقى المشروع غلط)
select to_regclass('public."awam-data"') as awam_products_table;

-- 3) هل فيه تعارض في الأسماء اللي عوام محتاجها؟
select 'awam_settings'        as object,
       (select count(*) from information_schema.tables
         where table_schema = 'public' and table_name = 'awam_settings') as exists_count
union all
select 'is_admin()',
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'is_admin');

-- 4) كل جداول public (للمراجعة بس — مفيش أي تعديل)
select table_name
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;

-- 5) الأعمدة الجديدة موجودة ولا لأ
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'awam-data'
  and column_name in ('sold_sizes', 'sold_colors', 'sold_out');

-- 6) أعمدة جدول الطلبات — نتأكد إن اللي الكود بيكتبه موجود
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'orders'
order by ordinal_position;
