/* ============================================================
   عوام AWAM — CONFIG  (ملف الإعدادات الوحيد اللي تعدّل فيه)
   ============================================================
   ملاحظة أمنية مهمة:
   الـ Public / Publishable key من Supabase آمن إنه يظهر في الـ Frontend
   (ده الغرض منه)، لأنه محكوم بـ Row Level Security.
   اللي مش آمن أبداً هو الـ service_role key — متحطهوش هنا.
   الحماية الحقيقية للآدمن معمولة على 3 طبقات:
     1) ADMIN_TOKEN في الرابط → localStorage (إخفاء الواجهة).
     2) دالة is_admin() في قاعدة البيانات بتتحقق من نفس الرمز قبل أي كتابة.
     3) RLS على الجداول والـ Storage: القراءة عامة، الكتابة للآدمن فقط.

   ⭐ قبل التشغيل: افتح Supabase project جديد (أو existing) وغيّر
   SUPABASE_URL و SUPABASE_KEY بالقيم من مشروعك.
   ============================================================ */

window.JL_CONFIG = {
  /* -------- Supabase (غيّرهم من لوحة Supabase) -------- */
  SUPABASE_URL: "https://ymsrfxmwwpwjgzzaytsh.supabase.co",
  SUPABASE_KEY: "sb_publishable_7F9pDlnAtMvMOilzmkBXCw_G3CsiFr5",

  /* -------- كسر الكاش -------- */
  // كل ما تعدّلي أي ملف JS/CSS، غيّري الرقم ده + غيّري ?v= في ملفات HTML
  ASSET_VERSION: "20261102v1",

  /* -------- الأسرار (لا تشاركها) -------- */
  ADMIN_TOKEN: "awam_secure_2026",      // الرابط السري:  index.html?admin=awam_secure_2026
  // ⭐ كل الرموز المقبولة (نفس قاعدة البيانات المشتركة مع Clothina)
  //    أي رمز من دول بيفعّل لوحة التحكم + بيتبعت في هيدر x-jl-admin
  ADMIN_TOKENS: [
    "awam_secure_2026",
    "malik_secure_2026"
  ],
  ADMIN_STORAGE_KEY: "aw_admin_v1",     // مفتاح حفظ حالة الآدمن في المتصفح

  /* -------- التخزين في Supabase Storage -------- */
  BUCKET_PRODUCTS: "awam",              // ⭐ الـ bucket الوحيد لصور المنتجات
  STORAGE_FOLDER: "",                   // مفيش فولدر جوه الـ bucket — الصور بتروح على الجذر
  STORAGE_MONTH_FOLDERS: false,         // false = مفيش فولدر شهر
  STORAGE_FALLBACK_BUCKET: "",          // فاضي = مفيش أي bucket بديل. الرفع على awam وبس
  BUCKET_SIZES: "size-guides",         // (قديم) دليل المقاسات بقى لينك يدوي
  BUCKET_MEASUREMENTS: "measurements",  // صور مقاسات العملاء

  /* -------- جداول قاعدة البيانات -------- */
  TABLE_ITEMS: "awam-data",              // ⭐ جدول المنتجات (اسمه فيه شرطة — فيه بديل آمن)
  TABLE_ITEMS_FALLBACK: "awam_data",     // فيو/جدول بديل بنفس البيانات — بيتجرّب تلقائيًا لو
                                         // الاسم اللي فيه شرطة اترفض من PostgREST
  TABLE_LEGACY_ITEMS: "items",           // الجدول القديم — مقروء فقط
  TABLE_ORDERS: "orders",
  TABLE_SETTINGS: "awam_settings",      // ⭐ إعدادات المتجر (أسعار الشحن) — اسم مخصص لعوام عشان ميتعارضش مع أي موقع تاني على نفس المشروع
  TABLE_COUPONS: "coupons",           // كوبونات/خصومات (شغّل supabase-update-2.sql)

  /* -------- الهوية والتواصل -------- */
  CITY: "البحيرة — مصر",
  INSTAGRAM: "",
  TIKTOK: "https://www.tiktok.com/@awamfashion1",
  INSTAGRAM_HANDLE: "",
  TIKTOK_HANDLE: "@awamfashion1",

  /* ⭐ المقدم = مصاريف الشحن اللي العميل اختارها (مش نسبة من الإجمالي) */
  VODAFONE_CASH_NUMBER: "01129196650",
  INSTAPAY_HANDLE: "01129196650",        // عنوان إنستاباي (نفس رقم الموبايل)

  /* -------- المتجر -------- */
  WHATSAPP_NUMBER: "201129196650",      // واتساب مصر: 01129196650
  CURRENCY: "ج.م",                      // الجنيه المصري
  SHIPPING: 0,                          // مصاريف شحن ثابتة (0 = مجاني)
  FREE_SHIPPING_NOTE: "توصيل مجّاني داخل البحيرة",
  /* ⭐ أسعار الشحن — قابلة للتعديل من لوحة التحكم (تبويب الإعدادات)
     القيم دي هي الافتراضية، وأي تعديل من الآدمن بيتحفظ في Supabase (جدول settings)
     وبيظهر فورًا في صفحة الـ checkout. */
  SHIPPING_OPTIONS: [
    { id: "normal",  label: "الشحن العادي",  fee: 100, governorates: "all" },
    { id: "remote",  label: "الشحن للمناطق النائية", fee: 150, governorates: ["مطروح", "سيناء", "شمال سيناء", "جنوب سيناء"] }
  ],
  EXCLUDED_GOVERNORATES: ["مطروح", "سيناء", "شمال سيناء", "جنوب سيناء"],  // مسموح فيها 150
  SHIPPING_NORMAL_FEE: 100,
  SHIPPING_REMOTE_FEE: 150,

  /* الاختيارات الافتراضية (تظهر للعميل في صفحة المنتج) */
  DEFAULT_SIZES: ["FREE SIZE", "S", "M", "L", "XL", "مقاس خاص"],
  DEFAULT_COLORS: [
    { name: "أسود", hex: "#1A1A1A" },
    { name: "بيج كريمي", hex: "#E8DCC8" },
    { name: "وردي نبيتي", hex: "#8C4A42" },
    { name: "ذهبي", hex: "#C58C73" },
    { name: "كحلي", hex: "#2C3A57" }
  ],
  CATEGORIES: ["عبايات", "دلنجات", "استقبال", "إطلالات"],
  /* ⭐ طريقتين بس: فودافون كاش أو إنستاباي — والمقدم في الاتنين = مصاريف الشحن */
  PAYMENT_METHODS: [
    {
      id: "vodafone_cash",
      title: "فودافون كاش",
      sub: "تدفعي مصاريف الشحن فقط مقدمًا",
      logo: "VC",
      note: "تدفعي مصاريف الشحن فقط مقدمًا على رقم فودافون كاش، والباقي (سعر المنتجات) عند الاستلام."
    },
    {
      id: "instapay",
      title: "إنستاباي",
      sub: "تدفعي مصاريف الشحن فقط مقدمًا",
      logo: "IP",
      note: "تدفعي مصاريف الشحن فقط مقدمًا عبر إنستاباي، والباقي (سعر المنتجات) عند الاستلام."
    }
  ]
};
