/* ============================================================
   عوام الدلنجات — supabase-update-5-all-in-awam-data.sql
   ------------------------------------------------------------
   ⭐ الهدف: كل حاجة في جدول واحد اسمه "awam-data"
      منتجات + طلبات + كوبونات + إعدادات الشحن
      ومفيش أي جدول مشترك مع أي موقع/مشروع تاني.

   العمود الجديد kind هو اللي بيفرّق بين الصفوف:
      product  = منتج
      order    = طلب
      coupon   = كوبون خصم
      setting  = إعدادات المتجر (أسعار الشحن)

   الملف آمن:
      • بيتشغّل أكتر من مرة من غير مشاكل (if not exists / create or replace)
      • مفيش فيه DROP TABLE ولا DELETE ولا TRUNCATE
      • مش بيلمس بياناتك القديمة — بس بيضيف أعمدة ويعلّم الصفوف الموجودة kind = product

   طريقة التشغيل:
      Supabase → SQL Editor → New query → الصق الملف كله → Run
   ============================================================ */

begin;

/* ------------------------------------------------------------
   ١) الأعمدة الجديدة على awam-data
   ------------------------------------------------------------ */
alter table public."awam-data" add column if not exists kind text;

/* الكوبونات */
alter table public."awam-data" add column if not exists code         text;
alter table public."awam-data" add column if not exists percent      numeric;
alter table public."awam-data" add column if not exists active       boolean default true;
alter table public."awam-data" add column if not exists starts_at    timestamptz;
alter table public."awam-data" add column if not exists ends_at      timestamptz;
alter table public."awam-data" add column if not exists product_ids  jsonb   default '[]'::jsonb;

/* الطلبات */
alter table public."awam-data" add column if not exists customer_name      text;
alter table public."awam-data" add column if not exists phone             text;
alter table public."awam-data" add column if not exists city              text;
alter table public."awam-data" add column if not exists address           text;
alter table public."awam-data" add column if not exists notes             text;
alter table public."awam-data" add column if not exists payment_method    text;
alter table public."awam-data" add column if not exists deposit           numeric;
alter table public."awam-data" add column if not exists shipping          numeric;
alter table public."awam-data" add column if not exists ship_option       text;
alter table public."awam-data" add column if not exists subtotal          numeric;
alter table public."awam-data" add column if not exists discount          numeric;
alter table public."awam-data" add column if not exists coupon_code       text;
alter table public."awam-data" add column if not exists total             numeric;
alter table public."awam-data" add column if not exists items             jsonb default '[]'::jsonb;
alter table public."awam-data" add column if not exists measurement_urls  jsonb default '[]'::jsonb;

/* الإعدادات */
alter table public."awam-data" add column if not exists key   text;
alter table public."awam-data" add column if not exists value jsonb;

/* كل الصفوف الموجودة حاليًا منتجات */
update public."awam-data" set kind = 'product' where kind is null;
alter table public."awam-data" alter column kind set default 'product';

/* صفوف الطلبات مش هيكون فيها عنوان/سعر منتج — فبنفكّ أي NOT NULL
   قديم على أعمدة المنتجات (من غير ما نلمس أي بيانات) */
do $$
declare col text;
begin
  for col in
    select column_name
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'awam-data'
       and is_nullable = 'NO'
       and column_default is null
       and column_name not in ('id', 'kind')
  loop
    execute format('alter table public.%I alter column %I drop not null', 'awam-data', col);
  end loop;
end $$;

/* ------------------------------------------------------------
   ٢) الفهارس
   ------------------------------------------------------------ */
create index if not exists awam_data_kind_idx
  on public."awam-data" (kind);

create index if not exists awam_data_orders_created_idx
  on public."awam-data" (created_at desc)
  where kind = 'order';

/* كود الكوبون ميتكررش (بحروف كبيرة/صغيرة) */
create unique index if not exists awam_data_coupon_code_uniq
  on public."awam-data" (lower(code))
  where kind = 'coupon' and code is not null;

/* مفتاح الإعدادات ميتكررش (shipping) */
create unique index if not exists awam_data_setting_key_uniq
  on public."awam-data" (kind, key);

/* ------------------------------------------------------------
   ٣) دالة الآدمن الخاصة بعوام (مستقلة تمامًا عن أي مشروع تاني)
      بتقرا الهيدر x-jl-admin اللي الموقع بيبعته مع رمز الآدمن
   ------------------------------------------------------------ */
create or replace function public.awam_is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  tok text;
begin
  begin
    tok := (current_setting('request.headers', true)::json ->> 'x-jl-admin');
  exception when others then
    tok := null;
  end;
  return coalesce(tok, '') in ('awam_secure_2026', 'malik_secure_2026');
end;
$$;

/* ------------------------------------------------------------
   ٤) Row Level Security
      - القراءة العامة: المنتجات + الإعدادات + الكوبونات المفعّلة
        (مش الطلبات — بيانات عملاء)
      - إضافة طلب: مسموحة لأي زائر (ده اللي بيحصل وقت الشراء)
      - التعديل والحذف: الآدمن بس
   ------------------------------------------------------------ */
alter table public."awam-data" enable row level security;

/* بنقفل أي بوليسي قديم على الجدول قبل ما نكتب الجديد
   (مفيش حذف بيانات — بوليسي = صلاحية قراءة/كتابة بس) */
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'awam-data'
  loop
    execute format('drop policy %I on public.%I', p.policyname, 'awam-data');
  end loop;
end $$;

create policy "awam read catalog"
  on public."awam-data"
  for select
  to anon, authenticated
  using (
    public.awam_is_admin()
    or kind is null
    or kind = 'product'
    or kind = 'setting'
    or (kind = 'coupon' and coalesce(active, true) = true)
  );

create policy "awam insert orders"
  on public."awam-data"
  for insert
  to anon, authenticated
  with check (kind = 'order' or public.awam_is_admin());

create policy "awam admin update"
  on public."awam-data"
  for update
  to anon, authenticated
  using (public.awam_is_admin())
  with check (public.awam_is_admin());

create policy "awam admin delete"
  on public."awam-data"
  for delete
  to anon, authenticated
  using (public.awam_is_admin());

grant select, insert, update, delete on public."awam-data" to anon, authenticated;

/* ------------------------------------------------------------
   ٥) التحقق من الكوبون — من جوه awam-data
      الموقع بينادي: POST /rest/v1/rpc/awam_validate_coupon
   ------------------------------------------------------------ */
create or replace function public.awam_validate_coupon(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  c public."awam-data"%rowtype;
begin
  select * into c
    from public."awam-data"
   where kind = 'coupon'
     and lower(code) = lower(trim(p_code))
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'الكود غير صحيح أو منتهي الصلاحية.');
  end if;

  if coalesce(c.active, true) is false then
    return jsonb_build_object('ok', false, 'message', 'الكود ده متوقف.');
  end if;

  if c.starts_at is not null and now() < c.starts_at then
    return jsonb_build_object('ok', false, 'message', 'الكود لسه مش مفعّل.');
  end if;

  if c.ends_at is not null and now() > c.ends_at then
    return jsonb_build_object('ok', false, 'message', 'الكود منتهي الصلاحية.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', c.code,
    'percent', coalesce(c.percent, 0),
    'product_ids', coalesce(c.product_ids, '[]'::jsonb),
    'ends_at', c.ends_at
  );
end;
$$;

grant execute on function public.awam_validate_coupon(text) to anon, authenticated;

/* ------------------------------------------------------------
   ٦) فيوهات للراحة في لوحة Supabase (اختيارية)
      بتخليك تشوف المنتجات/الطلبات/الكوبونات كل واحد لوحده
      مع إنهم كلهم في نفس الجدول
   ------------------------------------------------------------ */
create or replace view public.awam_products
  with (security_invoker = true) as
  select * from public."awam-data" where kind = 'product' or kind is null;

create or replace view public.awam_orders
  with (security_invoker = true) as
  select * from public."awam-data" where kind = 'order';

create or replace view public.awam_coupons
  with (security_invoker = true) as
  select * from public."awam-data" where kind = 'coupon';

grant select on public.awam_products, public.awam_orders, public.awam_coupons to anon, authenticated;

/* لو فيه فيو قديم اسمه awam_data (البديل اللي الموقع بيجرّبه) — بنخليه
   security_invoker عشان يورّث صلاحيات RLS، ومايبقاش باب خلفي يبان منه
   الطلبات من غير تسجيل دخول */
do $$
begin
  if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'awam_data') then
    execute 'create or replace view public.awam_data with (security_invoker = true) as select * from public."awam-data"';
  end if;
end $$;

/* ------------------------------------------------------------
   ٧) تحديث كاش PostgREST عشان الأعمدة الجديدة تظهر فورًا
   ------------------------------------------------------------ */
notify pgrst, 'reload schema';

commit;

/* ------------------------------------------------------------
   ٨) تأكيد النتيجة (شغّل ده لوحده بعد الـ commit لو حبيت)
   ------------------------------------------------------------ */
select kind,
       count(*) as rows,
       count(*) filter (where is_active is false) as inactive
  from public."awam-data"
 group by kind
 order by kind;

/* ------------------------------------------------------------
   (اختياري) نقل الطلبات القديمة من جدول orders المشترك
   ------------------------------------------------------------
   ⚠️ جدول orders ممكن يكون فيه طلبات موقع تاني — عشان كده
      السكربت مش بينقل حاجة تلقائيًا. لو الجدول بتاعك بس،
      شيل التعليق عن البلوك ده وشغّله.

   insert into public."awam-data"
     (kind, code, customer_name, phone, city, address, notes,
      payment_method, deposit, shipping, ship_option, subtotal,
      discount, coupon_code, total, items, created_at)
   select 'order', code, customer_name, phone, city, address, notes,
          payment_method, deposit, shipping, ship_option, subtotal,
          discount, coupon_code, total, items, created_at
     from public.orders
   on conflict do nothing;
   ------------------------------------------------------------ */
