-- ================================================================
--  عوام + كلوثينا — تنظيف وإضافة أعمدة
--  تاريخ: 2026-10-31
--
--  الملف ده بيعمل ٤ حاجات:
--    ١) نسخة احتياطية كاملة من  items  و  orders
--    ٢) مسح جدول  items  (القديم — مش مستخدم في أي كود)
--    ٣) إضافة أعمدة SOLD OUT + الشحن على  "Clothina-Items"  و  "awam-data"
--    ٤) إضافة عمودي الشحن لجدول  orders  (إصلاح حفظ الطلبات)
--
--  ✅ "Awam" و "Clothina" نفسهم: مفيش أي صف بيتشال منهم.
--     كل اللي بيحصل عليهم: أعمدة جديدة فاضية (add column if not exists).
--
--  ⚠️ ملاحظة مهمة عن جدول orders:
--     جدول orders بيستخدمه موقع عوام وموقع كلوثينا الاتنين —
--     مسحه هيوقف حفظ الطلبات في الموقعين. عشان كده الملف
--     بيعمل نسخة احتياطية كاملة منه وبيسيبه شغال.
--     لو مصممة تمسحيه: في آخر الملف سطر جاهز (معلّق) شيل التعليق عنه.
--
--  آمن للتشغيل أكثر من مرة.
-- ================================================================


-- ================================================================
-- 0) تأكيد إنك على المشروع الصح
-- ================================================================
do $$
begin
  if to_regclass('public."awam-data"') is null
     or to_regclass('public."Clothina-Items"') is null then
    raise exception 'مش لاقي جدولي المنتجات (awam-data / Clothina-Items). متأكد إنك على المشروع الصح؟ مفيش أي تعديل اتعمل.';
  end if;
end $$;


-- ================================================================
-- 1) نسخة احتياطية (بيانات كاملة — بتتنشأ مرة واحدة بس)
-- ================================================================
do $$
begin
  if to_regclass('public.items') is not null then
    execute 'create table if not exists public.backup_items_20261031 as table public.items';
    raise notice 'backup_items_20261031: اتعملت';
  end if;

  if to_regclass('public.orders') is not null then
    execute 'create table if not exists public.backup_orders_20261031 as table public.orders';
    raise notice 'backup_orders_20261031: اتعملت';
  end if;
end $$;


-- ================================================================
-- 2) مسح جدول items القديم
--    (النسخة الاحتياطية اتعملت فوق — البيانات مش ضايعة)
-- ================================================================
drop table if exists public.items;


-- ================================================================
-- 3) أعمدة SOLD OUT + الشحن على جدولي المنتجات
--    add column if not exists = مبيلمسش أي عمود أو صف موجود
-- ================================================================

-- 3-أ) كلوثينا
alter table public."Clothina-Items" add column if not exists sold_sizes  text[]  not null default '{}';
alter table public."Clothina-Items" add column if not exists sold_colors text[]  not null default '{}';
alter table public."Clothina-Items" add column if not exists sold_out    boolean not null default false;
alter table public."Clothina-Items" add column if not exists shipping    numeric(10,2);
alter table public."Clothina-Items" add column if not exists ship_option text;

comment on column public."Clothina-Items".sold_sizes  is 'مقاسات نفدت — تفضل ظاهرة ومكتوب عليها SOLD OUT';
comment on column public."Clothina-Items".sold_colors is 'ألوان نفدت — تفضل ظاهرة ومكتوب عليها SOLD OUT';
comment on column public."Clothina-Items".sold_out    is 'المنتج كله نافد';

-- 3-ب) عوام
alter table public."awam-data" add column if not exists sold_sizes  text[]  not null default '{}';
alter table public."awam-data" add column if not exists sold_colors text[]  not null default '{}';
alter table public."awam-data" add column if not exists sold_out    boolean not null default false;
alter table public."awam-data" add column if not exists shipping    numeric(10,2);
alter table public."awam-data" add column if not exists ship_option text;

comment on column public."awam-data".sold_sizes  is 'مقاسات نفدت — تفضل ظاهرة ومكتوب عليها SOLD OUT';
comment on column public."awam-data".sold_colors is 'ألوان نفدت — تفضل ظاهرة ومكتوب عليها SOLD OUT';
comment on column public."awam-data".sold_out    is 'المنتج كله نافد';


-- ================================================================
-- 4) عمودي الشحن في جدول الطلبات
--    (من غيرهم Supabase بيرفض حفظ الطلب كله بصمت)
-- ================================================================
do $$
begin
  if to_regclass('public.orders') is not null then
    alter table public.orders add column if not exists shipping    numeric(10,2);
    alter table public.orders add column if not exists ship_option text;
  end if;
end $$;


-- ================================================================
-- 4.5) إعدادات الشحن القابلة للتعديل من لوحة التحكم
--      (نفس اللي في supabase-update-3-shop.sql — آمن لو اشتغل مرتين)
--      اسم الجدول awam_settings مخصوص لعوام عشان ميتعارضش مع حاجة تانية.
-- ================================================================
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin'
  ) then
    execute $fn$
      create function public.is_admin()
      returns boolean language plpgsql stable security definer set search_path = public
      as $body$
      declare tok text; hdrs json;
      begin
        begin hdrs := nullif(current_setting('request.headers', true), '')::json;
        exception when others then hdrs := null; end;
        tok := hdrs ->> 'x-jl-admin';
        return tok is not null and exists (select 1 from public.admin_tokens where token = tok);
      end;
      $body$;
    $fn$;
  end if;
end $$;

create table if not exists public.awam_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.awam_settings_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists awam_settings_touch on public.awam_settings;
create trigger awam_settings_touch
before update on public.awam_settings
for each row execute function public.awam_settings_touch();

alter table public.awam_settings enable row level security;

drop policy if exists "awam_settings_public_read"  on public.awam_settings;
drop policy if exists "awam_settings_admin_insert" on public.awam_settings;
drop policy if exists "awam_settings_admin_update" on public.awam_settings;
drop policy if exists "awam_settings_admin_delete" on public.awam_settings;

create policy "awam_settings_public_read"  on public.awam_settings for select using (true);
create policy "awam_settings_admin_insert" on public.awam_settings for insert with check (public.is_admin());
create policy "awam_settings_admin_update" on public.awam_settings for update using (public.is_admin()) with check (public.is_admin());
create policy "awam_settings_admin_delete" on public.awam_settings for delete using (public.is_admin());

grant select on public.awam_settings to anon, authenticated;
grant insert, update, delete on public.awam_settings to anon, authenticated;

insert into public.awam_settings (key, value) values
  ('shipping', jsonb_build_object(
     'shipping_normal_label', 'الشحن العادي',
     'shipping_normal_fee',   100,
     'shipping_remote_label', 'الشحن للمناطق النائية',
     'shipping_remote_fee',   150,
     'free_shipping_enabled', false,
     'free_shipping_over',    0,
     'shipping_note',         ''
  ))
on conflict (key) do nothing;


-- ================================================================
-- 5) تأكيد — بيتنفّذ تلقائيًا وبيوريك النتيجة
-- ================================================================
select 'Clothina-Items' as "الجدول", count(*) as "عدد الصفوف",
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'Clothina-Items') as "عدد الأعمدة"
from public."Clothina-Items"
union all
select 'awam-data', count(*),
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'awam-data')
from public."awam-data"
union all
select 'orders', count(*),
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'orders')
from public.orders
union all
select 'awam_settings', count(*),
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'awam_settings')
from public.awam_settings
union all
select 'backup_items_20261031', count(*), null from public.backup_items_20261031
union all
select 'backup_orders_20261031', count(*), null from public.backup_orders_20261031;


-- ================================================================
--  ⬇️ اختياري — بس لو مصممة تمسحي orders
--
--  تحذير: ده هيوقف حفظ الطلبات في عوام وكلوثينا الاتنين،
--  إلا لو هتغيّري اسم الجدول في كود الموقعين كمان.
--  النسخة الاحتياطية موجودة (backup_orders_20261031) فمفيش داتا هتضيع.
--
--  شيل علامتي التعليق عن السطرين اللي تحت لو عايزة تكمل:
--
--  drop table public.orders;
--  drop table public.backup_orders_20261031;
-- ================================================================
