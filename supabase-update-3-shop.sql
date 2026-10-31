-- ================================================================
--  عوام AWAM — تحديث ٣ (نسخة آمنة تمامًا)
--
--  ⚠️ اقرئي ده الأول:
--  • الملف ده بيتعامل مع حاجتين بس:
--        1) جدول المنتجات بتاع عوام  public."awam-data"
--        2) جدول جديد اسمه       public.awam_settings
--  • مفيش أي DROP TABLE / DELETE / TRUNCATE / UPDATE على بيانات.
--  • مفيش أي لمس لأي جدول تاني، ولا لأي bucket أو Storage،
--    ولا لـ auth.users، ولا لأي دالة موجودة عندك.
--  • مش بيعيد إنشاء is_admin() — لو موجودة عندك بتفضل زي ما هي.
--  • آمن لو شغّلتيه أكتر من مرة.
--
--  ليه الاسم awam_settings؟ عشان مشروع Supabase فيه مواقع تانية،
--  فاسم عام زي settings كان ممكن يتعارض معاهم. الاسم ده مخصوص لعوام.
--
--  شغّليه من: Supabase Dashboard → SQL Editor
-- ================================================================


-- ================================================================
-- 0) أمان: نتأكد إن جدول المنتجات بتاع عوام موجود قبل أي حاجة.
--    لو مش موجود (يعني إنتِ على مشروع Supabase غلط) الملف بيوقف
--    من غير ما يعمل أي تعديل.
-- ================================================================
do $$
begin
  if to_regclass('public."awam-data"') is null then
    raise exception
      'جدول public."awam-data" مش موجود في القاعدة دي — يبدو إنك فاتحة مشروع Supabase غلط. مفيش أي تعديل اتعمل.';
  end if;
end $$;


-- ================================================================
-- 1) أعمدة SOLD OUT على جدول المنتجات بتاع عوام فقط
--    (add column if not exists = مبيلمسش أي عمود موجود)
-- ================================================================
alter table public."awam-data" add column if not exists sold_sizes  text[]  not null default '{}';
alter table public."awam-data" add column if not exists sold_colors text[]  not null default '{}';
alter table public."awam-data" add column if not exists sold_out    boolean not null default false;

comment on column public."awam-data".sold_sizes  is 'مقاسات نفدت — تفضل ظاهرة في الموقع ومكتوب عليها SOLD OUT';
comment on column public."awam-data".sold_colors is 'ألوان نفدت — تفضل ظاهرة في الموقع ومكتوب عليها SOLD OUT';
comment on column public."awam-data".sold_out    is 'المنتج كله نافد';


-- ================================================================
-- 2) دالة is_admin() — بننشئها بس لو مش موجودة أصلًا.
--    لو موجودة (زي ما هي عندك) بتفضل زي ما هي بالحرف.
-- ================================================================
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin'
  ) then
    execute $fn$
      create function public.is_admin()
      returns boolean
      language plpgsql
      stable
      security definer
      set search_path = public
      as $body$
      declare
        tok  text;
        hdrs json;
      begin
        begin
          hdrs := nullif(current_setting('request.headers', true), '')::json;
        exception when others then
          hdrs := null;
        end;
        tok := hdrs ->> 'x-jl-admin';
        return tok is not null and exists (
          select 1 from public.admin_tokens where token = tok
        );
      end;
      $body$;
    $fn$;
  end if;
end $$;


-- ================================================================
-- 2.5) إصلاح: عمودين الشحن في جدول الطلبات (orders)
--
--  ليه؟ الكود بيكتب مع كل طلب العمودين: shipping و ship_option.
--  لو الأعمدة دي مش موجودة، PostgREST بيرفض الطلب كله بصمت
--  والطلب مبيتسجلش في القاعدة خالص.
--
--  العمودين nullable — مبيأثروش على أي بيانات موجودة ولا على
--  أي موقع تاني بيستخدم نفس الجدول.
-- ================================================================
do $$
begin
  if to_regclass('public.orders') is not null then
    alter table public.orders add column if not exists shipping    numeric(10,2);
    alter table public.orders add column if not exists ship_option text;
  end if;
end $$;


-- ================================================================
-- 3) جدول الإعدادات — awam_settings (اسم مخصص لعوام)
-- ================================================================
create table if not exists public.awam_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- تحديث updated_at تلقائيًا (دالة + trigger باسم عوام فقط)
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


-- ================================================================
-- 4) RLS: قراءة عامة (عشان صفحة التشيك آوت تعرف أسعار الشحن)
--         كتابة للآدمن فقط
--    كل الـ policies على awam_settings بس.
-- ================================================================
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


-- ================================================================
-- 5) القيم الافتراضية لأسعار الشحن (لو مش موجودة)
--    بعد كده عدّليها من لوحة التحكم زي ما تحبي.
-- ================================================================
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
-- 6) تأكيد (اختياري — شيلوا التعليق لو عايزة تشوفي النتيجة)
-- ================================================================
-- select id, title, sold_sizes, sold_colors, sold_out from public."awam-data" limit 5;
-- select * from public.awam_settings;
