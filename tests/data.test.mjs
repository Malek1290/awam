/* ============================================================
   ٩) كل البيانات في جدول واحد: awam-data
   ------------------------------------------------------------
   بيمتحن إن المنتجات + الطلبات + الكوبونات + الإعدادات كلهم
   في نفس الجدول (العمود kind)، وإن مفيش أي جدول مشترك مع
   مشروع تاني بيتكتب فيه، وإن الشكل القديم (من غير العمود)
   الموقع بيكمل شغل عليه.
   ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startServer, openPage, makeFetchMock, waitFor, click, type, PRODUCTS } from './harness.mjs';

const read = rel => readFile(new URL(`../${rel}`, import.meta.url), 'utf8');

/* نقفل الصفحة بعد ما أي تحميل غير متزامن يخلص — من غير unhandled rejections */
async function closePage(page) {
  await new Promise(r => setTimeout(r, 200));
  try { page.window.close(); } catch (_) {}
}

let server;
test.before(async () => { server = await startServer(); });
test.after(() => server.close());

/* ============================================================
   9.a) ملفات المشروع
   ============================================================ */
test.describe('9.a) الإعدادات بتوجّه كل حاجة على awam-data', () => {
  test.it('المنتجات والطلبات والكوبونات والإعدادات كلهم في awam-data', async () => {
    const cfg = await read('assets/js/config.js');
    for (const key of ['TABLE_ITEMS', 'TABLE_ORDERS', 'TABLE_COUPONS', 'TABLE_SETTINGS']) {
      const m = cfg.match(new RegExp(`${key}:\\s*"([^"]+)"`));
      assert.ok(m, `${key} مش موجود في config.js`);
      assert.equal(m[1], 'awam-data', `${key} لازم يكون awam-data`);
    }
  });

  test.it('أنواع الصفوف معرّفة (product / order / coupon / setting)', async () => {
    const cfg = await read('assets/js/config.js');
    for (const kind of ['product', 'order', 'coupon', 'setting']) {
      assert.match(cfg, new RegExp(`${kind.toUpperCase()}:\\s*"${kind}"`), `النوع ${kind} ناقص`);
    }
  });

  test.it('مفيش كتابة في جدول الطلبات أو الكوبونات المشترك', async () => {
    for (const file of ['assets/js/checkout.page.js', 'assets/js/admin.js', 'assets/js/core.js']) {
      const code = (await read(file)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      assert.ok(!/insert\(\s*CFG\.TABLE_ORDERS/.test(code), `${file} لسه بيكتب في CFG.TABLE_ORDERS`);
      assert.ok(!/insert\(\s*CFG\.TABLE_COUPONS/.test(code), `${file} لسه بيكتب في CFG.TABLE_COUPONS`);
      assert.ok(!/select\(\s*CFG\.TABLE_COUPONS/.test(code), `${file} لسه بيقرا من CFG.TABLE_COUPONS`);
    }
  });

  test.it('الطلب بيتحفظ بـ kind = order', async () => {
    const js = await read('assets/js/checkout.page.js');
    assert.match(js, /kind:\s*\(CFG\.KINDS && CFG\.KINDS\.ORDER\)\s*\|\|\s*'order'/);
    assert.match(js, /sb\.insert\(CFG\.TABLE_ITEMS, orderRow\)/);
  });

  test.it('ملف SQL بيزوّد العمود والبوليسي والدالة', async () => {
    const raw = await read('supabase-update-5-all-in-awam-data.sql');
    const sql = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
    assert.match(sql, /alter table public\."awam-data" add column if not exists kind text/i);
    assert.match(sql, /create policy "awam insert orders"/i);
    assert.match(sql, /create or replace function public\.awam_validate_coupon/i);
    assert.match(sql, /awam_is_admin/i);
    assert.match(sql, /security_invoker = true/i, 'الفيوهات لازم تورّث RLS');
    assert.ok(!/drop\s+table|truncate\s+table|delete\s+from/i.test(sql), 'الملف فيه أمر خطر');
  });

  test.it('ملف SQL ما بيلمسش أي كائن برّه عوام', async () => {
    const raw = await read('supabase-update-5-all-in-awam-data.sql');
    const sql = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

    /* كل اسم بيبدأ بـ public. لازم يكون من كائنات عوام بس */
    const allowed = new Set([
      '"awam-data"', 'awam_data', 'awam_products', 'awam_orders', 'awam_coupons',
      'awam_is_admin', 'awam_validate_coupon', '%I', 'pg_temp'
    ]);
    const refs = [...sql.matchAll(/public\.("[^"]+"|[A-Za-z_][\w-]*)/g)].map(m => m[1]);
    const foreign = [...new Set(refs.filter(r => !allowed.has(r)))];
    assert.deepEqual(foreign, [], `الملف بيلامس كائنات مش بتاعة عوام: ${foreign.join(', ')}`);
  });

  test.it('مفيش أمر كتابة أو مسح على أي جدول تاني', async () => {
    const raw = await read('supabase-update-5-all-in-awam-data.sql');
    const sql = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

    const targets = [
      /* ملاحظة: "for update" في سياسات RLS مش أمر تعديل — مستثنى */
      ...sql.matchAll(/(?:insert\s+into|(?<!for\s)update|delete\s+from|alter\s+table|create\s+(?:unique\s+)?index\s+\w*\s*on|drop\s+table)\s+(?:if\s+exists\s+)?(?:only\s+)?([^\s(]+)/gi)
    ].map(m => m[1].replace(/^public\./, ''));

    for (const t of targets) {
      assert.equal(t, '"awam-data"', `الملف بيكتب/يعدّل في ${t}`);
    }
  });

  test.it('مفيش أي ذكر لجدول من مواقع تانية (حتى في التعليقات)', async () => {
    const raw = await read('supabase-update-5-all-in-awam-data.sql');
    assert.ok(!/\bpublic\.(orders|coupons|items|clothina\w*)\b/i.test(raw), 'الملف فيه ذكر لجدول مشترك');
    assert.ok(!/\bfrom\s+public\.(orders|coupons)\b/i.test(raw));
  });

  test.it('الموقع مش بيقرا أي جدول قديم حتى لو موجود', async () => {
    const cfg = await read('assets/js/config.js');
    assert.match(cfg, /ALLOW_LEGACY_TABLES:\s*false/);

    const core = (await read('assets/js/core.js')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    /* كل استخدام لجدول قديم لازم يكون محكوم بالفلاج */
    const legacyUses = [...core.matchAll(/CFG\.LEGACY_\w+_TABLE/g)];
    assert.ok(legacyUses.length > 0, 'مفيش استخدام خالص (المفروض يبقى محكوم بالفلاج)');
    for (const m of legacyUses) {
      const line = core.slice(Math.max(0, m.index - 400), m.index);
      assert.ok(/ALLOW_LEGACY_TABLES/.test(line), 'استخدام جدول قديم من غير فلاج الأمان');
    }
  });
});

/* ============================================================
   9.b) المنتجات بس هي اللي بتتعرض
   ============================================================ */
test.describe('9.b) المنتجات بتتقري لوحدها من وسط بيانات الجدول', () => {
  test.it('الطلبات والكوبونات مش بتظهر كمنتجات', async () => {
    const mock = makeFetchMock({
      orders: [{ id: 'ord-1', code: 'AW-100', customer_name: 'منى', phone: '01000000000', total: 4300, items: [], created_at: '2026-01-01T00:00:00Z' }],
      coupons: [{ id: 'cp-1', code: 'EID20', percent: 20, active: true, product_ids: [] }],
      settingsRow: { shipping_normal_fee: 100, shipping_remote_fee: 150 }
    });
    const page = await openPage(server.base, 'shop.html', { fetchMock: mock });
    await waitFor(() => page.document.querySelectorAll('#shopGrid .card').length >= PRODUCTS.length);
    await new Promise(r => setTimeout(r, 300));

    const titles = [...page.document.querySelectorAll('#shopGrid .card')].map(c => c.textContent);
    assert.equal(titles.length, PRODUCTS.length, 'فيه صف مش منتج ظهر في المتجر');
    assert.ok(!titles.some(t => /AW-100|EID20/.test(t)));
    await closePage(page);
  });

  test.it('الفلتر بيتبعت للسيرفر بـ kind = product', async () => {
    const mock = makeFetchMock();
    const page = await openPage(server.base, 'index.html', { fetchMock: mock });
    await waitFor(() => page.document.querySelectorAll('#homeGrid .card').length > 0);
    const urls = mock.state.requests.map(r => r.url).join('\n');
    assert.match(urls, /awam-data\?select=\*&kind=eq\.product/);
    await closePage(page);
  });

  test.it('قبل تشغيل الـ SQL (من غير عمود kind) الموقع بيكمل شغل', async () => {
    const page = await openPage(server.base, 'index.html', { fetchMock: makeFetchMock({ withKind: false }) });
    await waitFor(() => page.document.querySelectorAll('#homeGrid .card').length > 0);
    assert.ok(page.document.querySelectorAll('#homeGrid .card').length > 0);
    await closePage(page);
  });
});

/* ============================================================
   9.c) لوحة التحكم: الطلبات والكوبونات في awam-data
   ============================================================ */
test.describe('9.c) لوحة التحكم بتقرا وتكتب في awam-data', () => {
  const ADMIN_STORAGE = { aw_admin_v1: 'granted', aw_admin_v1_tok: 'awam_secure_2026' };

  test.it('تاب الطلبات بيعرض طلب محفوظ في awam-data', async () => {
    const mock = makeFetchMock({
      orders: [{
        id: 'ord-9', code: 'AW-900', customer_name: 'هدى', phone: '01011112222',
        total: 2450, payment_method: 'فودافون كاش', created_at: '2026-02-01T10:00:00Z',
        items: [{ title: 'عباية «ندى»', size: 'مقاس خاص · 42', color: 'بيج كريمي', qty: 1 }]
      }],
      coupons: []
    });
    const page = await openPage(server.base, 'index.html', { fetchMock: mock, storage: ADMIN_STORAGE });
    await waitFor(() => page.document.querySelector('#adminSheet'));
    click(page.window, page.document.querySelector('.admin-tab[data-tab="orders"]'));
    await waitFor(() => /AW-900/.test(page.document.querySelector('#ordersList').textContent));
    assert.match(page.document.querySelector('#ordersList').textContent, /هدى/);
    /* ⭐ المقاس الخاص بيظهر كرقم في الطلبات كمان (حتى لو محفوظ بالشكل القديم) */
    const orders = page.document.querySelector('#ordersList').textContent;
    assert.match(orders, /مقاس 42/);
    assert.ok(!/مقاس خاص/.test(orders), 'الطلبات لسه بتعرض «مقاس خاص»');
    assert.match(mock.state.requests.map(r => r.url).join('\n'), /kind=eq\.order/);
    await closePage(page);
  });

  test.it('إضافة كوبون من اللوحة بتتحفظ في awam-data بـ kind = coupon', async () => {
    const mock = makeFetchMock({ coupons: [] });
    const page = await openPage(server.base, 'index.html', { fetchMock: mock, storage: ADMIN_STORAGE });
    await waitFor(() => page.document.querySelector('#adminSheet'));
    click(page.window, page.document.querySelector('.admin-tab[data-tab="coupons"]'));
    await waitFor(() => page.document.querySelector('#cpCode'));

    type(page.window, page.document.querySelector('#cpCode'), 'EID20');
    type(page.window, page.document.querySelector('#cpPercent'), '20');
    click(page.window, page.document.querySelector('#cpSave'));

    await waitFor(() => mock.state.inserts.length > 0);
    const saved = mock.state.inserts[0];
    assert.equal(saved.table, 'awam-data');
    assert.equal([].concat(saved.body)[0].kind, 'coupon');
    assert.equal([].concat(saved.body)[0].code, 'EID20');
    await closePage(page);
  });

  test.it('حفظ أسعار الشحن بيكتب صف إعدادات في awam-data', async () => {
    const mock = makeFetchMock();
    const page = await openPage(server.base, 'index.html', { fetchMock: mock, storage: ADMIN_STORAGE });
    await waitFor(() => page.document.querySelector('#adminSheet'));
    click(page.window, page.document.querySelector('.admin-tab[data-tab="settings"]'));
    await waitFor(() => page.document.querySelector('#setShipFeeNormal'));

    type(page.window, page.document.querySelector('#setShipFeeNormal'), '120');
    click(page.window, page.document.querySelector('#saveSettings'));

    await waitFor(() => mock.state.rows.some(r => r.kind === 'setting' && Number(r.value?.shipping_normal_fee) === 120));
    const row = mock.state.rows.find(r => r.kind === 'setting');
    assert.equal(row.key, 'shipping');
    await closePage(page);
  });
});

/* ============================================================
   9.d) الطلب لما الحفظ يفشل: طابور في المتصفح (مفيش جدول تاني)
   ============================================================ */
test.describe('9.d) فشل حفظ الطلب — مفيش كتابة برّه awam-data', () => {
  const cart = [{ id: 'p-abaya', title: 'عباية', price: 2200, qty: 1, size: 'M', color: 'بيج كريمي', image: 'assets/img/products/abaya-1.jpg' }];

  test.it('الطلب بيتخزن في المتصفح بدل الجدول القديم', async () => {
    const mock = makeFetchMock({ failOrderInsert: true, noRpc: true });
    const page = await openPage(server.base, 'checkout.html', {
      fetchMock: mock, storage: { aw_cart_v1: JSON.stringify(cart) }
    });
    await waitFor(() => page.document.querySelector('#cTotal').textContent.includes('ج.م'));
    const d = page.document;
    d.querySelector('#cName').value = 'منى';
    d.querySelector('#cPhone').value = '01000000000';
    d.querySelector('#cCity').value = 'البحيرة';
    d.querySelector('#cAddress').value = 'دمنهور';
    d.querySelector('#cConfirm').checked = true;
    d.querySelector('#cConfirm').dispatchEvent(new page.window.Event('change', { bubbles: true }));
    click(page.window, d.querySelector('#placeOrder'));

    await waitFor(() => {
      const list = JSON.parse(page.window.localStorage.getItem('aw_pending_orders_v1') || '[]');
      return list.length === 1;
    }, { timeout: 8000 });
    const queued = JSON.parse(page.window.localStorage.getItem('aw_pending_orders_v1'))[0];
    assert.equal(queued.kind, 'order');

    const wroteLegacy = mock.state.requests.some(r =>
      r.method === 'POST' && /\/rest\/v1\/orders(\?|$)/.test(r.url));
    assert.ok(!wroteLegacy, 'الطلب لازم ما يتكتبش في جدول orders المشترك');
    await closePage(page);
  });

  test.it('أول زيارة بعد كده بتحاول تحفظه في awam-data تلقائيًا', async () => {
    const mock = makeFetchMock({ noRpc: true });
    const pending = JSON.stringify([{ kind: 'order', code: 'AW-Q1', customer_name: 'سارة', total: 1000, items: [] }]);
    const page = await openPage(server.base, 'checkout.html', {
      fetchMock: mock, storage: { aw_cart_v1: JSON.stringify(cart), aw_pending_orders_v1: pending }
    });
    await waitFor(() => mock.state.rows.some(r => r.kind === 'order' && r.code === 'AW-Q1'), { timeout: 8000 });
    assert.deepEqual(JSON.parse(page.window.localStorage.getItem('aw_pending_orders_v1') || '[]'), []);
    await closePage(page);
  });
});

/* ============================================================
   9.e) الموقع مش بيبعت ولا طلب لجدول برّه awam-data
   ------------------------------------------------------------
   ده المهم: لو عندك مواقع تانية على نفس مشروع Supabase،
   الموقع ده ميعملش أي request على جداولهم — لا قراءة ولا كتابة.
   ============================================================ */
test.describe('9.e) صفر طلبات على أي جدول تاني', () => {
  const cart = [{ id: 'p-abaya', title: 'عباية', price: 2200, qty: 1, size: 'M', color: 'بيج كريمي', image: 'assets/img/products/abaya-1.jpg' }];
  const ADMIN = { aw_admin_v1: 'granted', aw_admin_v1_tok: 'awam_secure_2026' };
  const FOREIGN = /\/rest\/v1\/(orders|coupons|awam_settings|awam_data_settings|items|clothina[^/?]*)(\?|$)/i;

  const scan = (mock, label) => {
    const hits = mock.state.requests.filter(r => FOREIGN.test(r.url));
    assert.deepEqual(hits.map(h => `${h.method} ${h.url}`), [], `${label}: الموقع لمس جدول برّه عوام`);
  };

  test.it('الصفحة الرئيسية والمتجر', async () => {
    for (const pageName of ['index.html', 'shop.html']) {
      const mock = makeFetchMock({ noRpc: true });
      const page = await openPage(server.base, pageName, { fetchMock: mock });
      await waitFor(() => page.document.querySelectorAll('.card').length > 0);
      await new Promise(r => setTimeout(r, 250));
      scan(mock, pageName);
      await closePage(page);
    }
  });

  test.it('السلة والدفع — حتى لو الجدول لسه مش متظبط', async () => {
    for (const pageName of ['cart.html', 'checkout.html']) {
      const mock = makeFetchMock({ noRpc: true, failOrderInsert: true });
      const page = await openPage(server.base, pageName, {
        fetchMock: mock, storage: { aw_cart_v1: JSON.stringify(cart) }
      });
      await waitFor(() => page.document.querySelector('#goCheckout, #placeOrder'));
      await new Promise(r => setTimeout(r, 350));
      scan(mock, pageName);
      await closePage(page);
    }
  });

  test.it('لوحة التحكم بكل تاباتها', async () => {
    const mock = makeFetchMock({ noRpc: true });
    const page = await openPage(server.base, 'index.html', { fetchMock: mock, storage: ADMIN });
    await waitFor(() => page.document.querySelector('#adminSheet'));
    for (const tab of ['list', 'coupons', 'orders', 'settings']) {
      const btn = page.document.querySelector(`.admin-tab[data-tab="${tab}"]`);
      if (btn) click(page.window, btn);
      await new Promise(r => setTimeout(r, 200));
    }
    scan(mock, 'admin');
    await closePage(page);
  });

  test.it('كوبون غلط — بيدوّر في awam-data بس', async () => {
    const mock = makeFetchMock({ noRpc: true, coupons: [] });
    const page = await openPage(server.base, 'checkout.html', {
      fetchMock: mock, storage: { aw_cart_v1: JSON.stringify(cart) }
    });
    await waitFor(() => page.document.querySelector('#couponInput'));
    type(page.window, page.document.querySelector('#couponInput'), 'NOPE99');
    click(page.window, page.document.querySelector('#couponApply'));
    await waitFor(() => /الكود غير صحيح/.test(page.document.querySelector('#couponMsg').textContent), { timeout: 8000 });
    scan(mock, 'coupon-miss');
    await closePage(page);
  });
});

/* ============================================================
   9.e) الكوبون في الشيك آوت — من نفس الجدول
   ============================================================ */
test.describe('9.f) الكوبون بيتحقق من awam-data', () => {
  const cart = [{ id: 'p-abaya', title: 'عباية', price: 2200, qty: 1, size: 'M', color: 'بيج كريمي', image: 'assets/img/products/abaya-1.jpg' }];
  const coupon = { id: 'cp-1', code: 'EID20', percent: 20, active: true, product_ids: [] };

  test.it('كوبون من awam-data بيدّي خصم في صفحة إتمام الطلب', async () => {
    const mock = makeFetchMock({ coupons: [coupon] });
    const page = await openPage(server.base, 'checkout.html', {
      fetchMock: mock, storage: { aw_cart_v1: JSON.stringify(cart) }
    });
    await waitFor(() => page.document.querySelector('#couponInput'));
    type(page.window, page.document.querySelector('#couponInput'), 'EID20');
    click(page.window, page.document.querySelector('#couponApply'));
    await waitFor(() => page.window.JL?.coupons?.get()?.code === 'EID20');
    assert.equal(page.window.JL.cart.discount(), 440);
    assert.match(mock.state.requests.map(r => r.url).join('\n'), /rpc\/awam_validate_coupon/);
    await closePage(page);
  });

  test.it('لو الدالة لسه مش متعملة، بيتحقق من صفوف awam-data نفسها', async () => {
    const mock = makeFetchMock({ coupons: [coupon], noRpc: true });
    const page = await openPage(server.base, 'checkout.html', {
      fetchMock: mock, storage: { aw_cart_v1: JSON.stringify(cart) }
    });
    await waitFor(() => page.document.querySelector('#couponInput'));
    type(page.window, page.document.querySelector('#couponInput'), 'eid20');
    click(page.window, page.document.querySelector('#couponApply'));
    await waitFor(() => page.window.JL?.coupons?.get()?.code === 'EID20', { timeout: 8000 });
    assert.equal(page.window.JL.cart.discount(), 440);
    await closePage(page);
  });

  test.it('الكوبون المتوقف بيترفض', async () => {
    const mock = makeFetchMock({ coupons: [{ ...coupon, active: false }], noRpc: true });
    const page = await openPage(server.base, 'checkout.html', {
      fetchMock: mock, storage: { aw_cart_v1: JSON.stringify(cart) }
    });
    await waitFor(() => page.document.querySelector('#couponInput'));
    type(page.window, page.document.querySelector('#couponInput'), 'EID20');
    click(page.window, page.document.querySelector('#couponApply'));
    await waitFor(() => /متوقف/.test(page.document.querySelector('#couponMsg').textContent), { timeout: 8000 });
    assert.equal(page.window.JL.coupons.get(), null);
    await closePage(page);
  });
});
