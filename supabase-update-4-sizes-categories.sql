-- ================================================================
--  عوام الدلنجات — تحديث المقاسات + الأقسام (آمن تمامًا)
--  التاريخ: 31 أكتوبر 2026 · الملف: supabase-update-4-sizes-categories.sql
-- ================================================================
--
--  الملف ده بيعمل ٣ حاجات بس:
--    1) يغيّر أسماء الأقسام القديمة في جدول المنتجات:
--         دلنجات   → درسات
--         استقبال  → عبايات سواريه
--    2) يتأكد إن أعمدة SOLD OUT موجودة (لو مش موجودة يضيفها)
--    3) يبلّغ PostgREST يحدّث الكاش فورًا
--
--  ✅  مفيش DROP TABLE · مفيش DELETE · مفيش TRUNCATE
--  ✅  مفيش لمس لأي جدول تاني غير "awam-data"
--  ✅  آمن لو شغّلته أكتر من مرة (idempotent)
--
--  الخطوات: Supabase → SQL Editor → الصق الملف كله → Run
-- ================================================================


-- ================================================================
-- 0) أمان: نتأكد إن جدول المنتجات بتاع عوام موجود قبل أي تعديل.
--    لو مش موجود، الملف بيوقف من غير ما يلمس أي حاجة.
-- ================================================================
do $$
begin
  if to_regclass('public."awam-data"') is null then
    raise exception
      'جدول public."awam-data" مش موجود في القاعدة دي — يبدو إنك فاتحة مشروع Supabase غلط. مفيش أي تعديل اتعمل.';
  end if;
end $$;


-- ================================================================
-- 1) أعمدة SOLD OUT (للموثوقية — لو اتعملت قبل كده مش هتتكرر)
-- ================================================================
alter table public."awam-data" add column if not exists sold_sizes  text[]  not null default '{}';
alter table public."awam-data" add column if not exists sold_colors text[]  not null default '{}';
alter table public."awam-data" add column if not exists sold_out    boolean not null default false;


-- ================================================================
-- 2) تحديث أسماء الأقسام
--    • بيلمس عمود category بس
--    • بيراعي المسافات والحروف الكبيرة/الصغيرة
--    • أي اسم تاني (عبايات · عبايات سواريه · درسات · هوم وير) مش بيتغير
-- ================================================================
do $$
declare
  n1 int := 0;
  n2 int := 0;
begin
  update public."awam-data"
     set category = 'درسات'
   where lower(trim(category)) in ('دلنجات', 'دلنجه', 'دلنجة', 'dallangat', 'dalangat');
  get diagnostics n1 = row_count;

  update public."awam-data"
     set category = 'عبايات سواريه'
   where lower(trim(category)) in ('استقبال', 'سواريه', 'soiree', 'soirée');
  get diagnostics n2 = row_count;

  raise notice 'تم تحديث الأقسام: % منتج → درسات · % منتج → عبايات سواريه', n1, n2;
end $$;


-- ================================================================
-- 3) (اختياري) توسيع المقاسات لكل المنتجات: XS → 4XL + مقاس خاص
--
--    ⚠️ ده اختياري ومقفول بالافتراضي — لأنه بيعدّل بيانات كل منتج.
--    شغّله بس لو عايزة كل منتجاتك تظهر فيها المقاسات التسعة كاملة.
--    بضيف المقاسات الناقصة بس، ومش بيلمس المقاسات النافدة (sold_sizes).
--
--    عشان تشغّله: شيل علامتي التعليق -- من السطرين اللي تحت do $$ … end $$;
-- ================================================================
-- do $$
-- declare
--   wanted text[] := array['XS','S','M','L','XL','2XL','3XL','4XL','مقاس خاص'];
--   r record;
--   merged text[];
--   n int := 0;
-- begin
--   for r in select id, coalesce(sizes, '{}'::text[]) as sizes from public."awam-data" loop
--     select array_agg(x order by ord)
--       into merged
--       from (
--         select coalesce(nullif(trim(s), ''), null) as x, min(ord) as ord
--           from unnest(wanted || r.sizes) with ordinality as t(s, ord)
--          group by 1
--       ) q
--      where x is not null;
--     if merged is distinct from r.sizes then
--       update public."awam-data" set sizes = merged where id = r.id;
--       n := n + 1;
--     end if;
--   end loop;
--   raise notice 'تم توسيع المقاسات في % منتج', n;
-- end $$;


-- ================================================================
-- 4) تحديث كاش PostgREST — عشان التغييرات تظهر فورًا
-- ================================================================
notify pgrst, 'reload schema';


-- ================================================================
-- 5) تحقق سريع — شوف النتيجة قبل ما تقفل الصفحة
-- ================================================================
select category, count(*) as "عدد المنتجات"
  from public."awam-data"
 group by category
 order by 2 desc;

-- شوف كل منتج ومقاساته ونفادها:
-- select title, category, sizes, sold_sizes, sold_colors, sold_out
--   from public."awam-data"
--  order by created_at desc;
