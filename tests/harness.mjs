/* ============================================================
   عوام الدلنجات — TEST HARNESS
   ------------------------------------------------------------
   بيشغّل الموقع على سيرفر محلي (زي GitHub Pages) ويفتح الصفحات
   في DOM حقيقي (jsdom) — السكربتات بتتنفّذ فعلًا، والـ fetch
   بيتبدّل بـ mock بيرجّع نفس شكل بيانات Supabase.
   ============================================================ */

import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.sql': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

export async function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/' || rel.endsWith('/')) rel += 'index.html';
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT)) { res.writeHead(403).end('no'); return; }
      const info = await stat(file);
      if (info.isDirectory()) { res.writeHead(404).end('dir'); return; }
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise(resolve => server.close(resolve))
  };
}

/* ============================================================
   بيانات اختبار شبيهة بالداتابيز الحقيقية:
   - منتج عادي بمقاسات XS→4XL + مقاس خاص + مقاس ولون نافد
   - منتجات بأقسام قديمة (دلنجات / استقبال) لاختبار التحويل
   - منتج نافد بالكامل
   - منتج كل مقاساته نفدت (مفتاح sold_out مقفول)
   ============================================================ */
const img = 'assets/img/products/abaya-1.jpg';
const common = {
  price: 2200, old_price: null, image_url: img, images: [img],
  description: 'قطعة تجريبية بخامة كريب.', fabric: 'كريب', badge: '',
  sort: 0, is_active: true, sold_out: false, sold_sizes: [], sold_colors: []
};

export const PRODUCTS = [
  {
    ...common, id: 'p-abaya', title: 'عباية «ندى»', title_en: 'NADA', price: 2200, old_price: 2600,
    category: 'عبايات', badge: 'جديد',
    sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'مقاس خاص'],
    colors: [{ name: 'أسود', hex: '#1A1A1A' }, { name: 'بيج كريمي', hex: '#E8DCC8' }],
    sold_sizes: ['M'], sold_colors: ['أسود']
  },
  { ...common, id: 'p-dress', title: 'درست «ليالي»', category: 'دلنجات', sizes: ['FREE SIZE', 'مقاس خاص'], colors: [{ name: 'كحلي', hex: '#2C3A57' }] },
  { ...common, id: 'p-soiree', title: 'عباية سواريه «ملك»', category: 'استقبال', sizes: ['S', 'M', 'L'], colors: [{ name: 'ذهبي', hex: '#C58C73' }] },
  { ...common, id: 'p-home', title: 'طقم هوم وير', category: 'هوم وير', sizes: ['M', 'L', 'XL'], colors: [{ name: 'بيج كريمي', hex: '#E8DCC8' }] },
  { ...common, id: 'p-sold', title: 'قطعة نافدة', category: 'عبايات', sizes: ['S', 'M'], sold_out: true },
  { ...common, id: 'p-allsold', title: 'كل المقاسات نافدة', category: 'درسات', sizes: ['S', 'M'], sold_sizes: ['S', 'M'] }
];

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

/**
 * mock لـ fetch بيحاكي Supabase.
 * الحالة الجديدة: كل حاجة في جدول "awam-data" والعمود kind بيفرّق بينها.
 *   withKind:false = شكل الجدول القديم (من غير عمود kind) لاختبار الاحتياطي
 *   settingsRow    = صف إعدادات الشحن (جدول awam_settings القديم)
 *   orders/coupons = صفوف جاهزة في awam-data
 */
export function makeFetchMock({
  products = PRODUCTS,
  settingsRow = null,
  orders = [],
  coupons = [],
  withKind = true,
  noRpc = false,
  failOrderInsert = false,
  onRequest = () => {}
} = {}) {
  const state = {
    rows: [],          // كل صفوف awam-data
    requests: [],
    inserts: [],       // [{ table, body: array }]
    withKind,
    get products() { return this.rows.filter(r => !r.kind || r.kind === 'product'); },
    get orders() { return this.rows.filter(r => r.kind === 'order'); },
    get coupons() { return this.rows.filter(r => r.kind === 'coupon'); }
  };

  const withK = (row, kind) => (withKind ? { kind, ...row } : { ...row });
  state.rows = [
    ...products.map(p => withK(p, 'product')),
    ...orders.map(o => withK(o, 'order')),
    ...coupons.map(c => withK(c, 'coupon'))
  ];
  if (settingsRow) {
    state.rows.push(withKind
      ? { id: 'set-shipping', kind: 'setting', key: 'shipping', value: settingsRow }
      : { id: 'set-shipping', key: 'shipping', value: settingsRow });
  }

  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' }
  });
  const arr = body => {
    const parsed = typeof body === 'string' ? JSON.parse(body || '[]') : (body || []);
    return Array.isArray(parsed) ? parsed : [parsed];
  };

  const mock = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init.method || 'GET').toUpperCase();
    state.requests.push({ url, method, headers: init.headers || {}, body: init.body });

    if (url.includes('/rest/v1/')) {
      const [tablePart, queryPart = ''] = url.split('/rest/v1/')[1].split('?');
      const table = decodeURIComponent(tablePart);
      const q = new URLSearchParams(queryPart);

      /* ---- RPC ---- */
      if (table.startsWith('rpc/')) {
        const fn = table.slice(4);
        if (noRpc) return json({ code: 'PGRST202', message: `Could not find the function public.${fn}` }, 404);
        if (fn === 'awam_validate_coupon' || fn === 'validate_coupon') {
          if (fn === 'validate_coupon') return json({ code: 'PGRST202', message: 'Could not find the function public.validate_coupon' }, 404);
          const body = typeof init.body === 'string' ? JSON.parse(init.body || '{}') : (init.body || {});
          const row = state.coupons.find(c => String(c.code || '').toUpperCase() === String(body.p_code || '').toUpperCase());
          if (!row) return json({ ok: false, message: 'الكود غير صحيح أو منتهي الصلاحية.' });
          if (row.active === false) return json({ ok: false, message: 'الكود ده متوقف.' });
          return json({ ok: true, code: row.code, percent: row.percent, product_ids: row.product_ids || [], ends_at: row.ends_at || null });
        }
        return json({ code: 'PGRST202', message: `missing function ${fn}` }, 404);
      }

      /* ---- جدول الإعدادات القديم ---- */
      if (table === 'awam_settings' || table === 'awam_data_settings') {
        if (!settingsRow) {
          return json({ code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` }, 404);
        }
        return json([{ key: 'shipping', value: settingsRow }]);
      }

      /* ---- الجدول القديم للطلبات (fallback بس) ---- */
      if (table === 'orders') {
        const rows = arr(init.body);
        state.inserts.push({ table, body: rows });
        return json(rows.map((r, i) => ({ id: `legacy-${i}`, ...r })), 201);
      }

      if (table === 'awam-data' || table === 'awam_data') {
        /* الجدول القديم: مفيش عمود kind */
        if (!withKind && (q.has('kind') || /kind=/.test(queryPart))) {
          return json({ code: '42703', message: 'column awam-data.kind does not exist' }, 400);
        }

        if (method === 'GET') {
          const kindRaw = q.get('kind') || '';
          const wantKind = kindRaw.startsWith('eq.') ? decodeURIComponent(kindRaw.slice(3)) : null;
          let rows = state.rows;
          if (wantKind) rows = rows.filter(r => String(r.kind || '') === wantKind);
          else rows = rows.filter(r => !r.kind || r.kind === 'product');
          if (q.get('active') === 'eq.true') rows = rows.filter(r => r.active !== false);
          if (q.get('is_active') === 'neq.false') rows = rows.filter(r => r.is_active !== false);
          if (q.get('id') && q.get('id').startsWith('eq.')) {
            const id = decodeURIComponent(q.get('id').slice(3));
            rows = rows.filter(r => String(r.id) === id);
          }
          const sel = q.get('select') || '*';
          if (sel === 'key,value') rows = rows.map(r => ({ key: r.key, value: r.value }));
          if (sel === 'id,title') rows = rows.map(r => ({ id: r.id, title: r.title }));
          return json(rows);
        }

        if (method === 'POST') {
          const rows = arr(init.body);
          if (failOrderInsert && rows.some(r => r.kind === 'order')) {
            return json({ code: 'PGRST000', message: 'mock: order insert failed' }, 503);
          }
          const saved = rows.map((r, i) => ({ id: r.id || `new-${Date.now()}-${i}`, ...r }));
          for (const r of saved) {
            const idx = state.rows.findIndex(x => String(x.id) === String(r.id));
            const keyMatch = state.rows.findIndex(x => r.key && x.key === r.key && (x.kind || '') === (r.kind || ''));
            if (idx >= 0) state.rows[idx] = { ...state.rows[idx], ...r };
            else if (keyMatch >= 0) state.rows[keyMatch] = { ...state.rows[keyMatch], ...r };
            else state.rows.push(r);
          }
          if (!withKind) {
            return json(saved.map(({ kind, ...rest }) => rest), 201);
          }
          state.inserts.push({ table, body: saved });
          return json(saved, 201);
        }

        if (method === 'PATCH') {
          const id = decodeURIComponent((queryPart.split('id=eq.')[1] || '').split('&')[0] || '');
          const patch = JSON.parse(init.body || '{}');
          state.rows = state.rows.map(r => (String(r.id) === String(id) ? { ...r, ...patch } : r));
          return json([{ id, ...patch }]);
        }

        if (method === 'DELETE') {
          const id = decodeURIComponent((queryPart.split('id=eq.')[1] || '').split('&')[0] || '');
          state.rows = state.rows.filter(r => String(r.id) !== String(id));
          return json([], 200);
        }
      }

      if (table === 'coupons') return json({ code: 'PGRST205', message: 'nope' }, 404);
      return json({ code: 'PGRST205', message: 'unknown table' }, 404);
    }

    if (url.includes('/storage/v1/object/')) return json({ Key: 'mock/upload.webp' });

    onRequest(url, init);
    return json({ ok: true });
  };

  mock.state = state;
  return mock;
}

/* ============================================================
   فتح صفحة في DOM حقيقي
   ============================================================ */
export async function openPage(base, page, {
  fetchMock = makeFetchMock(),
  storage = {},
  query = ''
} = {}) {
  const errors = [];
  const warnings = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', err => {
    const msg = String(err.message || '');
    /* موارد خارجية (خطوط Google) مش متاحة في بيئة الاختبار — مش خطأ في الموقع */
    if (/Could not load (link|script|img)/i.test(msg) && /googleapis|gstatic|fonts/i.test(msg)) return;
    errors.push(`jsdom: ${msg}`);
  });
  virtualConsole.on('error', (...args) => errors.push(args.join(' ')));
  virtualConsole.on('warn', (...args) => warnings.push(args.join(' ')));
  virtualConsole.on('log', () => {});
  virtualConsole.on('info', () => {});

  const dom = await JSDOM.fromURL(`${base}/${page}${query ? '?' + query : ''}`, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.fetch = fetchMock;
      window.matchMedia = q => ({
        matches: false, media: q,
        addEventListener() {}, removeEventListener() {},
        addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => true
      });
      window.URL.createObjectURL = () => 'blob:mock';
      window.URL.revokeObjectURL = () => {};
      window.scrollTo = () => {};
      window.confirm = () => true;
      window.open = () => null;
      window.navigator.clipboard = { writeText: () => Promise.resolve() };
      try {
        for (const [k, v] of Object.entries(storage)) window.localStorage.setItem(k, v);
      } catch (_) {}
      window.addEventListener('error', e => errors.push('window.error: ' + (e.message || e.error)));
    }
  });

  return { dom, window: dom.window, document: dom.window.document, errors, warnings, fetchMock };
}

/* ⏳ استنى لحد ما شرط يتحقق */
export async function waitFor(fn, { timeout = 6000, interval = 30 } = {}) {
  const started = Date.now();
  for (;;) {
    let value;
    try { value = fn(); } catch (_) { value = false; }
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error('waitFor timed out');
    await new Promise(r => setTimeout(r, interval));
  }
}

/* 🖱️ ضغطة ماوس حقيقية على عنصر */
export function click(window, el) {
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
}

export function type(window, el, value) {
  el.value = value;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
}
