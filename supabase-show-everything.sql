-- ================================================================
--  عوام AWAM — «شوف كل حاجة في الداتابيز»
--
--  🔒 الملف ده قراءة فقط 100%.
--  مفيش فيه CREATE / ALTER / DROP / INSERT / UPDATE / DELETE.
--  عرض بس — مش بيغيّر أي حاجة.
--
--  ازاي تستخدمه:
--    Supabase → SQL Editor → الصق الملف كله → Run
--
--  هيطلعلك جدول واحد باسم (القسم / العنصر / التفاصيل) فيه:
--    معلومات القاعدة · الـ Schemas · الجداول + عدد صفوفها وحجمها
--    كل الأعمدة · الصلاحيات · الـ Triggers · الدوال · الـ Views
--    الـ Indexes · القيود · الـ Storage Buckets وملفاتها
--    المستخدمين · الإضافات
--
--  ⬇️ في آخر الملف بلوك (تحت التعليق) بيعرض *بيانات* كل جدول
--     (أول ٥ صفوف) — شيل التعليق عنه وشغّله لوحده.
-- ================================================================

with

-- ١) معلومات القاعدة ------------------------------------------------
info as (
  select 1 as grp, 1 as rn, 'معلومات القاعدة'::text as section, 'قاعدة البيانات'::text as item,
         current_database()::text as details
  union all select 1, 2, 'معلومات القاعدة', 'المستخدم المتصل', current_user::text
  union all select 1, 3, 'معلومات القاعدة', 'إصدار Postgres', split_part(version(), ' on ', 1)::text
  union all select 1, 4, 'معلومات القاعدة', 'الوقت',
         to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI') || ' UTC'
  union all select 1, 5, 'معلومات القاعدة', 'عدد جداول public',
         (select count(*)::text from information_schema.tables
           where table_schema = 'public' and table_type = 'BASE TABLE')
),

-- ٢) الـ Schemas ----------------------------------------------------
schemas as (
  select 2 as grp,
         row_number() over (order by schema_name) as rn,
         'الـ Schemas'::text as section,
         schema_name::text as item,
         'schema'::text as details
  from information_schema.schemata
  where schema_name not in ('pg_catalog', 'information_schema', 'pg_toast')
),

-- ٣) الجداول + عدد الصفوف + الحجم + RLS ------------------------------
tabl as (
  select 3 as grp,
         row_number() over (order by c.relname) as rn,
         'الجداول'::text as section,
         c.relname::text as item,
         concat_ws(' · ',
            ((select count(*) from information_schema.columns col
               where col.table_schema = 'public' and col.table_name = c.relname)::text || ' عمود'),
            ('RLS: ' || case when c.relrowsecurity then 'مفعّل' else 'مقفول' end),
            ((select count(*) from pg_policies p
               where p.schemaname = 'public' and p.tablename = c.relname)::text || ' policy'),
            (((xpath('/row/c/text()',
                query_to_xml(format('select count(*) as c from public.%I', c.relname),
                             false, true, '')))[1])::text || ' صف'),
            pg_size_pretty(pg_total_relation_size(c.oid))
         ) as details
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
),

-- ٤) كل الأعمدة (الجداول فقط، مش الـ Views) -------------------------
cols as (
  select 4 as grp,
         row_number() over (order by col.table_name, col.ordinal_position) as rn,
         'الأعمدة'::text as section,
         (col.table_name || '.' || col.column_name)::text as item,
         concat_ws(' · ',
            col.data_type,
            case when col.is_nullable = 'NO' then 'NOT NULL' else 'null' end,
            left(coalesce(col.column_default, ''), 120)
         ) as details
  from information_schema.columns col
  join information_schema.tables t
    on t.table_schema = col.table_schema
   and t.table_name   = col.table_name
   and t.table_type   = 'BASE TABLE'
  where col.table_schema = 'public'
),

-- ٥) الصلاحيات ------------------------------------------------------
pol as (
  select 5 as grp,
         row_number() over (order by tablename, policyname) as rn,
         'الصلاحيات (Policies)'::text as section,
         (tablename || ' ← ' || policyname)::text as item,
         concat_ws(' · ', cmd, array_to_string(roles, ', '),
                   left(coalesce(qual, '(بدون شرط)'), 160)) as details
  from pg_policies
  where schemaname = 'public'
),

-- ٦) الـ Triggers ----------------------------------------------------
trg as (
  select 6 as grp,
         row_number() over (order by t.relname, tg.tgname) as rn,
         'الـ Triggers'::text as section,
         (t.relname || ' ← ' || tg.tgname)::text as item,
         (case when tg.tgtype::int & 2 = 2 then 'BEFORE' else 'AFTER' end
          || ' ' || case
               when tg.tgtype::int & 4 = 4 then 'INSERT'
               when tg.tgtype::int & 8 = 8 then 'DELETE'
               when tg.tgtype::int & 16 = 16 then 'UPDATE'
               else 'OTHER' end) as details
  from pg_trigger tg
  join pg_class t on t.oid = tg.tgrelid
  join pg_namespace n on n.oid = t.relnamespace
  where not tg.tgisinternal and n.nspname = 'public'
),

-- ٧) الدوال ---------------------------------------------------------
fn as (
  select 7 as grp,
         row_number() over (order by p.proname) as rn,
         'الدوال (Functions)'::text as section,
         (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')')::text as item,
         concat_ws(' · ',
            case p.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end,
            case when p.prosecdef then 'security definer' else 'security invoker' end,
            pg_get_function_result(p.oid)) as details
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),

-- ٨) الـ Views -------------------------------------------------------
vw as (
  select 8 as grp,
         row_number() over (order by c.relname) as rn,
         'الـ Views'::text as section,
         c.relname::text as item,
         (case c.relkind when 'v' then 'view' when 'm' then 'materialized view'
                         else c.relkind::text end) as details
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v', 'm')
),

-- ٩) الـ Indexes -----------------------------------------------------
idx as (
  select 9 as grp,
         row_number() over (order by tablename, indexname) as rn,
         'الـ Indexes'::text as section,
         (tablename || ' ← ' || indexname)::text as item,
         indexdef::text as details
  from pg_indexes
  where schemaname = 'public'
),

-- ١٠) القيود ---------------------------------------------------------
cons as (
  select 10 as grp,
         row_number() over (order by c.conrelid::regclass::text, c.conname) as rn,
         'القيود (Constraints)'::text as section,
         (c.conrelid::regclass::text || ' ← ' || c.conname)::text as item,
         (case c.contype when 'p' then 'PRIMARY KEY' when 'u' then 'UNIQUE'
                         when 'f' then 'FOREIGN KEY' when 'c' then 'CHECK'
                         else c.contype::text end
          || ' · ' || left(pg_get_constraintdef(c.oid), 160)) as details
  from pg_constraint c
  join pg_namespace n on n.oid = c.connamespace
  where n.nspname = 'public' and c.contype in ('p', 'u', 'f', 'c')
),

-- ١١) الـ Storage Buckets --------------------------------------------
buck as (
  select 11 as grp,
         row_number() over (order by b.name) as rn,
         'Storage — الـ Buckets'::text as section,
         b.name::text as item,
         concat_ws(' · ',
            case when b.public then 'عام (public)' else 'خاص (private)' end,
            ((select count(*) from storage.objects o where o.bucket_id = b.id)::text || ' ملف'),
            pg_size_pretty(coalesce((
              select sum(coalesce((o.metadata ->> 'size')::bigint, 0))
              from storage.objects o where o.bucket_id = b.id), 0)),
            ('حد الحجم: ' || coalesce(pg_size_pretty(b.file_size_limit), 'بدون حد'))
         ) as details
  from storage.buckets b
),

-- ١٢) مجلدات الـ Storage ---------------------------------------------
folders as (
  select 12 as grp,
         row_number() over (order by bucket_id, folder) as rn,
         'Storage — المجلدات'::text as section,
         (bucket_id || ' / ' || folder)::text as item,
         (count(*)::text || ' ملف') as details
  from (
    select o.bucket_id,
           case when position('/' in o.name) > 0
                then split_part(o.name, '/', 1)
                else '(الملفات في الجذر)' end as folder
    from storage.objects o
  ) x
  group by bucket_id, folder
),

-- ١٣) المستخدمين -----------------------------------------------------
usr as (
  select 13 as grp, 1 as rn, 'المستخدمين'::text as section, 'عدد المستخدمين'::text as item,
         (select count(*)::text from auth.users) as details
),

-- ١٤) الإضافات -------------------------------------------------------
ext as (
  select 14 as grp,
         row_number() over (order by extname) as rn,
         'الإضافات (Extensions)'::text as section,
         extname::text as item,
         ('الإصدار ' || extversion)::text as details
  from pg_extension
)

select section, item, details
from (
  select grp, rn, section, item, details from info
  union all select grp, rn, section, item, details from schemas
  union all select grp, rn, section, item, details from tabl
  union all select grp, rn, section, item, details from cols
  union all select grp, rn, section, item, details from pol
  union all select grp, rn, section, item, details from trg
  union all select grp, rn, section, item, details from fn
  union all select grp, rn, section, item, details from vw
  union all select grp, rn, section, item, details from idx
  union all select grp, rn, section, item, details from cons
  union all select grp, rn, section, item, details from buck
  union all select grp, rn, section, item, details from folders
  union all select grp, rn, section, item, details from usr
  union all select grp, rn, section, item, details from ext
) z
order by grp, rn;


-- ================================================================
--  ⬇️⬇️  بلوك اختياري: «بيانات» كل جدول (أول ٥ صفوف)
--
--  ده مش بيتشغّل مع الملف (لأنه بعد الاستعلام الأول).
--  عايز تشوفه؟ ظلّل الكلام اللي جوه علامتي التعليق اللي تحت،
--  امسح أول سطر (اللي فيه /*) وآخر سطر (اللي فيه */)، واضغط Run.
-- ================================================================

/*
select t.table_name,
       ((xpath('/row/sample/text()',
          query_to_xml(
            format('select coalesce(jsonb_agg(x), ''[]''::jsonb)::text as sample
                    from (select * from public.%I limit 5) x', t.table_name),
            false, true, '')))[1])::text as sample_rows
from information_schema.tables t
where t.table_schema = 'public'
  and t.table_type   = 'BASE TABLE'
order by t.table_name;
*/
