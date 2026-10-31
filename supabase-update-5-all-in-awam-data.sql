/* ============================================================
   عوام الدلنجات — supabase-update-5-all-in-awam-data.sql
   ============================================================
   ⚠️ الملف ده بيلامس كائن واحد بس:  public."awam-data"
      + دوال/فيوهات اسمها بيبدأ بـ awam_ (وبس).

   مفيش أي جدول تاني في الملف ده — لا قراءة، لا كتابة، لا تعديل.
   مفيش orders، مفيش coupons، مفيش awam_settings، مفيش أي جدول
   ممكن يكون فيه بيانات موقع تاني.

   لو عندك أكتر من موقع على نفس مشروع Supabase:
      ده ملف عوام وبس، وبيشتغل جوه جدول عوام وبس.
      بيانات المواقع التانية مش هتتلمس ولا هتتقرا.

   ------------------------------------------------------------
   إيه اللي بيتغيّر جوه awam-data؟
      • عمود kind يفرّق: product / order / coupon / setting
      • أعمدة الطلبات (اسم، تليفون، عنوان…)
      • أعمدة الكوبونات (كود، نسبة، تاريخ انتهاء…)
      • أعمدة الإعدادات (key / value)
      • فهارس + سياسات RLS + دالتين (awam_is_admin / awam_validate_coupon)
      • ٣ فيوهات للعرض بس: awam_products / awam_orders / awam_coupons

   مفيش أي صف موجود بيتشال:
      • المنتجات الحالية بتتعلّم kind = 'product'
      • مفيش DELETE ولا TRUNCATE ولا DROP TABLE

   طريقة التشغيل:
      Supabase → SQL Editor → New query → الصق الملف كله → Run
   ============================================================ */

begin;

/* ------------------------------------------------------------
   ٠) فحص أمان — لو الجدول مش موجود أو مش جدول عادي، الملف بيوقف
      قبل ما يعمل أي تغيير
   ------------------------------------------------------------ */
do $$
declare
  kind_of_object "char";
begin
  if to_regclass('public."awam-data"') is null then
    raise exception 'الجدول public."awam-data" مش موجود — مفيش أي تغيير اتعمل.';
  end if;

  select c.relkind into kind_of_object
    from pg_class c
   where c.oid = to_regclass('public."awam-data"');

  if kind_of_object not in ('r', 'p') then
    raise exception 'public."awam-data" مش جدول بيانات (relkind=%). الملف اتوقف من غير أي تغيير.', kind_of_object;
  end if;
end $$;

/* ------------------------------------------------------------
   ١) الأعمدة الجديدة — على awam-data وبس
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

/* كل الصفوف الموجودة حاليًا منتجات عوام */
update public."awam-data" set kind = 'product' where kind is null;
alter table public."awam-data" alter column kind set default 'product';

/* صفوف الطلبات مش هيكون فيها عنوان/سعر منتج — فبنفكّ أي NOT NULL
   قديم على أعمدة المنتجات (على awam-data وبس، ومن غير ما نلمس بيانات) */
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
    execute format('alter table public."awam-data" alter column %I drop not null', col);
  end loop;
end $$;

/* ------------------------------------------------------------
   ٢) الفهارس — كلها على awam-data
   ------------------------------------------------------------ */
create index if not exists awam_data_kind_idx
  on public."awam-data" (kind);

create index if not exists awam_data_orders_created_idx
  on public."awam-data" (created_at desc)
  where kind = 'order';

create unique index if not exists awam_data_coupon_code_uniq
  on public."awam-data" (lower(code))
  where kind = 'coupon' and code is not null;

create unique index if not exists awam_data_setting_key_uniq
  on public."awam-data" (kind, key);

/* ------------------------------------------------------------
   ٣) دالة الآدمن — بتقرا هيدر x-jl-admin اللي الموقع بيبعته
      (مش بتعتمد على دالة أي مشروع تاني)
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
   ٤) Row Level Security — على awam-data وبس
      • الزائر يقرا: المنتجات + الكوبونات المفعّلة + الإعدادات
      • الزائر يشوف الطلبات؟ ❌ (بيانات عملاء)
      • الزائر يضيف طلب؟ ✅
      • تعديل/حذف: الآدمن بس
   ------------------------------------------------------------ */
alter table public."awam-data" enable row level security;

/* بنشيل السياسات القديمة من awam-data عشان نضمن إن مفيش سياسة قديمة
   بتفتح الطلبات للزوار. (سياسات = صلاحيات، مش بيانات) */
do $$
declare p record;
begin
  for p in
    select policyname
      from pg_policies
     where schemaname = 'public'
       and tablename = 'awam-data'
  loop
    execute format('drop policy if exists %I on public."awam-data"', p.policyname);
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
   ٥) التحقق من الكوبون — بيقرا من awam-data بس
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
   ٦) فيوهات للعرض في لوحة Supabase — بتتعمل بس لو مش موجودة
      (لو فيه كائن بالاسم ده من قبل، الملف ما بيلمسوش)
   ------------------------------------------------------------ */
do $$
begin
  if to_regclass('public.awam_products') is null then
    execute $v$ create view public.awam_products with (security_invoker = true) as
      select * from public."awam-data" where kind = 'product' or kind is null $v$;
  end if;

  if to_regclass('public.awam_orders') is null then
    execute $v$ create view public.awam_orders with (security_invoker = true) as
      select * from public."awam-data" where kind = 'order' $v$;
  end if;

  if to_regclass('public.awam_coupons') is null then
    execute $v$ create view public.awam_coupons with (security_invoker = true) as
      select * from public."awam-data" where kind = 'coupon' $v$;
  end if;

  grant select on public.awam_products, public.awam_orders, public.awam_coupons to anon, authenticated;
exception when others then
  raise notice 'الفيوهات: %', sqlerrm;
end $$;

/* ------------------------------------------------------------
   ٧) فيو قديم باسم awam_data (لو موجود) — بنخليه يورّث RLS
      عشان الطلبات ما تبانش منه. لو الكائن مش view → بنسيبه زي ما هو.
   ------------------------------------------------------------ */
do $$
begin
  if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'awam_data') then
    begin
      execute $v$ create or replace view public.awam_data with (security_invoker = true) as
        select * from public."awam-data" $v$;
      raise notice 'تم تأمين الفيو القديم awam_data (security_invoker).';
    exception when others then
      raise notice 'الفيو القديم awam_data اتساب زي ما هو (%).', sqlerrm;
    end;
  elsif to_regclass('public.awam_data') is not null then
    raise notice 'فيه كائن اسمه awam_data مش view — اتساب زي ما هو من غير أي لمس.';
  end if;
end $$;

/* ------------------------------------------------------------
   ٨) تحديث كاش PostgREST (مش بيلمس بيانات — بس بيقرا شكل الجدول)
   ------------------------------------------------------------ */
notify pgrst, 'reload schema';

commit;

/* ============================================================
   ٩) تأكيد النتيجة — بعد ما الـ commit يخلص
   ============================================================ */

/* أ) إيه اللي جوه awam-data دلوقتي */
select kind,
       count(*)                                  as rows,
       count(*) filter (where is_active is false) as inactive
  from public."awam-data"
 group by kind
 order by kind;

/* ب) إثبات إن كل التغييرات على awam-data وبس:
      الكائنات اللي الملف عملها كلها بتبدأ بـ awam_ */
select 'table'   as object_type, c.relname as name
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in ('awam_products','awam_orders','awam_coupons')
union all
select 'function', p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('awam_is_admin','awam_validate_coupon')
order by 1, 2;

/* ج) سياسات RLS — لازم كلها تكون على awam-data بس */
select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and tablename = 'awam-data'
 order by policyname;
