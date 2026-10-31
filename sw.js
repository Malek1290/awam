/* ============================================================
   عوام الدلنجات — SERVICE WORKER
   ------------------------------------------------------------
   الهدف: الموقع يبقى سريع على الموبايل في الزيارات المتكررة.

   الاستراتيجية:
   1) صفحات HTML  → Network-First (بترجع من النت، ولو النت قطع بتيجي من الكاش)
   2) CSS / JS / خطوط / صور الموقع (نفس الدومين)
                   → Cache-First (أسماؤهم فيها ?v= فمستحيل تبقى قديمة)
   3) صور المنتجات من Supabase Storage
                   → Stale-While-Revalidate (بتظهر فورًا وبتتحدّث في الخلفية)
   4) أي دومين تاني (Google Fonts, WhatsApp…) → مفيش أي تدخّل

   • مفيش precache كبير: الكاش بيتبني من الاستخدام الفعلي.
   • فيه سقف للعدد (180 عنصر) مع حذف الأقدم، عشان ماياكلش مساحة الموبايل.
   • تغيير ASSET_VERSION في config.js بيعمل كاش جديد ويمسح القديم.
   ============================================================ */

const VERSION = new URL(self.location.href).searchParams.get('v') || '1';
const STATIC_CACHE = `awam-static-${VERSION}`;
const IMAGE_CACHE = `awam-img-${VERSION}`;
const PAGE_CACHE = `awam-page-${VERSION}`;
const KEEP = [STATIC_CACHE, IMAGE_CACHE, PAGE_CACHE];
const IMAGE_LIMIT = 180;

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.disable(); } catch (_) {}
    }
    await self.clients.claim();
  })());
});

/** نقصّ الكاش لو زاد عن السقف (الأقدم بيتشال) */
async function trim(cacheName, limit) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= limit) return;
    await Promise.all(keys.slice(0, keys.length - limit).map(k => cache.delete(k)));
  } catch (_) {}
}

const isSupabaseImage = url =>
  /supabase\.co$/i.test(url.hostname) && url.pathname.startsWith('/storage/v1/object/public/');

const isStatic = url =>
  /\.(css|js|mjs|woff2?|ttf|otf|png|jpe?g|webp|avif|gif|svg|ico)$/i.test(url.pathname);

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  /* ---- 1) الصفحات ---- */
  const wantsHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');
  if (wantsHTML) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const cache = await caches.open(PAGE_CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (err) {
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        throw err;
      }
    })());
    return;
  }

  /* ---- 2) صور المنتجات من Supabase ---- */
  if (isSupabaseImage(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(IMAGE_CACHE);
      const cached = await cache.match(req);
      const network = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          cache.put(req, res.clone()).then(() => trim(IMAGE_CACHE, IMAGE_LIMIT));
        }
        return res;
      }).catch(() => null);
      return cached || (await network) || Response.error();
    })());
    return;
  }

  /* ---- 3) ملفات الموقع الثابتة (نفس الدومين) ---- */
  if (url.origin === self.location.origin && isStatic(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        if (cached) return cached;
        throw err;
      }
    })());
    return;
  }

  /* ---- 4) أي حاجة تانية: سيبها للشبكة زي ما هي ---- */
});
