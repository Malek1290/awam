/* ============================================================
   عوام الدلنجات — اختبارات الموقع بالكامل
   التشغيل:  cd tests && npm install && npm test
   ============================================================ */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { startServer, openPage, makeFetchMock, waitFor, click, type, PRODUCTS, ROOT } from './harness.mjs';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server?.close(); });

const read = rel => readFile(path.join(ROOT, rel), 'utf8');
const exists = async rel => { try { await stat(path.join(ROOT, rel)); return true; } catch { return false; } };

/* ============================================================
   1) الملفات والإعدادات
   ============================================================ */
describe('1) الملفات والإعدادات', () => {
  it('config.js فيه الاسم الجديد «عوام الدلنجات»', async () => {
    const cfg = await read('assets/js/config.js');
    assert.match(cfg, /SITE_NAME:\s*"عوام الدلنجات"/);
    assert.match(cfg, /SITE_SUFFIX:\s*"الدلنجات"/);
  });

  it('المقاسات من XS لـ 4XL + مقاس خاص', async () => {
    const { window } = await openPage(server.base, 'shop.html', { fetchMock: makeFetchMock() });
    await waitFor(() => window.JL);
    const sizes = Array.from(window.JL.CFG.DEFAULT_SIZES);
    assert.deepEqual(sizes, ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'مقاس خاص']);
    assert.equal(window.JL.CFG.CUSTOM_SIZE_MIN, 30);
    assert.equal(window.JL.CFG.CUSTOM_SIZE_MAX, 70);
    window.close();
  });

  it('الأقسام ٤ من غير تكرار', async () => {
    const { window } = await openPage(server.base, 'shop.html', { fetchMock: makeFetchMock() });
    await waitFor(() => window.JL);
    const cats = Array.from(window.JL.CFG.CATEGORIES);
    assert.deepEqual(cats, ['عبايات', 'عبايات سواريه', 'درسات', 'هوم وير']);
    assert.equal(new Set(cats).size, 4);
    window.close();
  });

  it('تحويل الأقسام القديمة (دلنجات → درسات، استقبال → عبايات سواريه)', async () => {
    const { window } = await openPage(server.base, 'shop.html', { fetchMock: makeFetchMock() });
    await waitFor(() => window.JL);
    assert.equal(window.JL.util.category('دلنجات'), 'درسات');
    assert.equal(window.JL.util.category('استقبال'), 'عبايات سواريه');
    assert.equal(window.JL.util.category('عبايات'), 'عبايات');
    assert.equal(window.JL.util.category('هوم وير'), 'هوم وير');
    window.close();
  });

  it('نفس رقم النسخة في كل الصفحات وملف الإعدادات', async () => {
    const cfg = await read('assets/js/config.js');
    const version = cfg.match(/ASSET_VERSION:\s*"([^"]+)"/)[1];
    for (const page of ['index.html', 'shop.html', 'product.html', 'cart.html', 'checkout.html']) {
      const html = await read(page);
      const found = [...html.matchAll(/\?v=(\d{8}v\d+)/g)].map(m => m[1]);
      assert.ok(found.length > 0, `${page} مفيهوش أي نسخة`);
      for (const v of found) assert.equal(v, version, `${page}: نسخة قديمة ${v}`);
    }
  });

  it('كل ملف محلي مذكور في الصفحات موجود فعلًا', async () => {
    const missing = [];
    for (const page of ['index.html', 'shop.html', 'product.html', 'cart.html', 'checkout.html']) {
      const html = await read(page);
      const refs = [
        ...html.matchAll(/(?:src|href)="((?:assets|sw\.js)[^"?#]*)(?:\?[^"]*)?"/g)
      ].map(m => m[1]).filter(Boolean);
      for (const ref of new Set(refs)) {
        if (!(await exists(ref))) missing.push(`${page} → ${ref}`);
      }
    }
    assert.deepEqual(missing, []);
  });

  it('مفيش أسماء أقسام قديمة في فلاتر المتجر', async () => {
    const raw = await read('assets/js/shop.page.js');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!code.includes('دلنجات'), 'لسه فيه دلنجات');
    assert.ok(!code.includes('استقبال'), 'لسه فيه استقبال');
  });

  it('Service Worker موجود وبيمسح النسخ القديمة', async () => {
    const sw = await read('sw.js');
    assert.match(sw, /addEventListener\('fetch'/);
    assert.match(sw, /caches\.delete/);
    assert.match(sw, /stale-while-revalidate|Stale-While-Revalidate/i);
  });

  it('ملف SQL بيحوّل الأقسام ويحدّث كاش PostgREST', async () => {
    const rawSql = await read('supabase-update-4-sizes-categories.sql');
    const sql = rawSql.replace(/--[^\n]*/g, '');
    assert.match(sql, /set category = 'درسات'/);
    assert.match(sql, /set category = 'عبايات سواريه'/);
    assert.match(sql, /notify pgrst, 'reload schema'/);
    assert.ok(!/drop\s+table|truncate|delete\s+from/i.test(sql), 'الملف فيه أمر خطر');
  });
});

/* ============================================================
   2) الصفحة الرئيسية
   ============================================================ */
describe('2) الصفحة الرئيسية', () => {
  let page;
  before(async () => {
    page = await openPage(server.base, 'index.html');
    await waitFor(() => page.document.querySelectorAll('#homeGrid .card').length >= 4);
  });
  after(() => page.window.close());

  it('اللوجو زي ما هو + «الدلنجات» تحته', () => {
    const sub = page.document.querySelector('.brand-sub');
    assert.equal(sub.textContent.trim(), 'الدلنجات');
    const word = page.document.querySelector('.brand-logo--word');
    assert.match(word.getAttribute('src'), /awam-wordmark-brown\.png$/);
    assert.equal(word.getAttribute('alt'), 'عوام الدلنجات');
  });

  it('عنوان الصفحة والهيدر بالاسم الجديد', () => {
    assert.match(page.document.title, /عوام الدلنجات/);
    assert.match(page.document.querySelector('.brand').getAttribute('aria-label'), /عوام الدلنجات/);
  });

  it('الفوتر بيعرض الأقسام الجديدة (ومفيش القديمة)', () => {
    const titles = [...page.document.querySelectorAll('.footer-title')].map(el => el.textContent.trim());
    assert.deepEqual(titles, ['الأقسام', 'خدماتنا', 'تواصل معنا']);
    const links = [...page.document.querySelectorAll('.site-footer a')].map(a => a.textContent.trim());
    for (const cat of ['عبايات', 'عبايات سواريه', 'درسات', 'هوم وير']) {
      assert.ok(links.includes(cat), `القسم ${cat} مش في الفوتر`);
    }
    assert.ok(!links.includes('دلنجات'));
    assert.ok(!links.includes('استقبال'));
  });

  it('الفوتر مكتوب فيه الاسم الجديد', () => {
    const bottom = page.document.querySelector('.footer-bottom').textContent;
    assert.match(bottom, /عوام الدلنجات/);
  });

  it('كروت المنتجات بتظهر', () => {
    const cards = page.document.querySelectorAll('#homeGrid .card');
    assert.equal(cards.length, PRODUCTS.length);
  });

  it('شارة SOLD OUT على المنتج النافد بس', () => {
    const sold = page.document.querySelectorAll('#homeGrid .card .badge--soldout');
    assert.equal(sold.length, 2, 'المفروض منتج نافد + منتج كل مقاساته نفدت');
    const soldCard = page.document.querySelector('#homeGrid .card[data-id="p-sold"]');
    assert.ok(soldCard.classList.contains('is-soldout'));
    const normal = page.document.querySelector('#homeGrid .card[data-id="p-abaya"]');
    assert.ok(!normal.classList.contains('is-soldout'), 'منتج فيه مقاس نافد بس مينفعش يتعلّم كله');
    assert.equal(normal.querySelector('.badge--soldout'), null);
  });

  it('منتج كل مقاساته نفدت بيتعامل كإنه نافد', () => {
    const card = page.document.querySelector('#homeGrid .card[data-id="p-allsold"]');
    assert.ok(card.classList.contains('is-soldout'));
  });

  it('مفيش أخطاء JavaScript', () => {
    assert.deepEqual(page.errors, []);
  });
});

/* ============================================================
   3) المتجر + الفلاتر
   ============================================================ */
describe('3) المتجر والفلاتر', () => {
  let page;
  before(async () => {
    page = await openPage(server.base, 'shop.html');
    await waitFor(() => page.document.querySelectorAll('#shopGrid .card').length >= 5);
  });
  after(() => page.window.close());

  const chips = () => [...page.document.querySelectorAll('#catChips .chip')].map(c => c.textContent.trim());
  const ids = () => [...page.document.querySelectorAll('#shopGrid .card')].map(c => c.dataset.id).sort();

  it('شرائح الأقسام: الكل + ٤ أقسام', () => {
    assert.deepEqual(chips(), ['الكل', 'عبايات', 'عبايات سواريه', 'درسات', 'هوم وير']);
  });

  it('«الكل» بيعرض كل المنتجات', () => {
    assert.equal(ids().length, PRODUCTS.length);
    assert.equal(page.document.querySelector('#resCount').textContent, `${PRODUCTS.length} قطعة`);
  });

  it('فلتر عبايات', () => {
    click(page.window, page.document.querySelector('#catChips [data-filter="category:عبايات"]'));
    assert.deepEqual(ids(), ['p-abaya', 'p-sold']);
  });

  it('فلتر درسات بيجمع الاسم القديم «دلنجات»', () => {
    click(page.window, page.document.querySelector('#catChips [data-filter="category:درسات"]'));
    assert.deepEqual(ids(), ['p-allsold', 'p-dress']);
  });

  it('فلتر عبايات سواريه بيجمع الاسم القديم «استقبال»', () => {
    click(page.window, page.document.querySelector('#catChips [data-filter="category:عبايات سواريه"]'));
    assert.deepEqual(ids(), ['p-soiree']);
  });

  it('فلتر هوم وير', () => {
    click(page.window, page.document.querySelector('#catChips [data-filter="category:هوم وير"]'));
    assert.deepEqual(ids(), ['p-home']);
  });

  it('الترتيب بالسعر من الأقل للأعلى', () => {
    click(page.window, page.document.querySelector('#catChips [data-filter="all"]'));
    const sel = page.document.querySelector('#sortSel');
    sel.value = 'price-asc';
    sel.dispatchEvent(new page.window.Event('change', { bubbles: true }));
    const prices = [...page.document.querySelectorAll('#shopGrid .card-price')].map(el => Number(el.textContent.replace(/[^\d.]/g, '')));
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  });

  it('مفيش أخطاء JavaScript', () => {
    assert.deepEqual(page.errors, []);
  });
});

describe('3.b) رابط قسم قديم (shop.html?cat=دلنجات)', () => {
  let page;
  before(async () => {
    page = await openPage(server.base, 'shop.html', { query: 'cat=' + encodeURIComponent('دلنجات') });
    await waitFor(() => page.document.querySelectorAll('#shopGrid .card').length > 0);
  });
  after(() => page.window.close());

  it('بيفتح على قسم «درسات»', () => {
    const active = page.document.querySelector('#catChips .chip.is-on');
    assert.equal(active.textContent.trim(), 'درسات');
    assert.deepEqual([...page.document.querySelectorAll('#shopGrid .card')].map(c => c.dataset.id).sort(), ['p-allsold', 'p-dress']);
  });
});

/* ============================================================
   4) صفحة المنتج — المقاسات والنفاد
   ============================================================ */
describe('4) صفحة المنتج — مقاسات XS→4XL ومقاس خاص', () => {
  let page;
  before(async () => {
    page = await openPage(server.base, 'product.html', { query: 'id=p-abaya' });
    await waitFor(() => page.document.querySelectorAll('#sizeBtns .opt-btn').length > 0);
  });
  after(() => page.window.close());

  it('٩ مقاسات ظاهرة (XS → 4XL + مقاس خاص)', () => {
    const labels = [...page.document.querySelectorAll('#sizeBtns .opt-name')].map(el => el.textContent.trim());
    assert.deepEqual(labels, ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'مقاس خاص']);
  });

  it('المقاس النافد M معلّم ومتقفل', () => {
    const m = page.document.querySelector('#sizeBtns [data-size="M"]');
    assert.ok(m.classList.contains('is-soldout'));
    assert.equal(m.disabled, true);
    assert.equal(m.querySelector('.sold-tag').textContent, 'SOLD OUT');
  });

  it('الاختيار الافتراضي أول مقاس متاح (XS) مش النافد', () => {
    assert.equal(page.document.querySelector('#sizeBtns .opt-btn.is-on').dataset.size, 'XS');
    assert.equal(page.document.querySelector('#sizeHint').textContent.trim(), 'XS');
  });

  it('خانة المقاس الخاص مخفية لحد ما يختارها', () => {
    assert.equal(page.document.querySelector('#customSizeWrap').hidden, true);
  });

  it('اللون النافد (أسود) معلّم، والافتراضي لون متاح', () => {
    const black = page.document.querySelector('#colorBtns [data-color="أسود"]');
    assert.ok(black.classList.contains('is-soldout'));
    assert.equal(black.disabled, true);
    assert.equal(page.document.querySelector('#colorBtns .swatch.is-on').dataset.color, 'بيج كريمي');
  });

  it('اختيار «مقاس خاص» بيفتح خانة الرقم', () => {
    click(page.window, page.document.querySelector('#sizeBtns [data-size="مقاس خاص"]'));
    assert.equal(page.document.querySelector('#customSizeWrap').hidden, false);
    assert.ok(page.document.querySelector('#customSizeWrap').classList.contains('is-on'));
  });

  it('رقم مقاس غير صالح (20) بيتمنع', () => {
    type(page.window, page.document.querySelector('#customSizeValue'), '20');
    click(page.window, page.document.querySelector('#addToCart'));
    assert.equal(page.window.JL.cart.get().length, 0);
    assert.ok(page.document.querySelector('#customSizeValue').classList.contains('is-invalid'));
  });

  it('رقم صالح (42) بيتحفظ وبيظهر كرقم — من غير كلمة «مقاس خاص»', () => {
    type(page.window, page.document.querySelector('#customSizeValue'), '42');
    assert.equal(page.document.querySelector('#sizeHint').textContent.trim(), '42');
    click(page.window, page.document.querySelector('#addToCart'));
    const items = page.window.JL.cart.get();
    assert.equal(items.length, 1);
    assert.equal(items[0].size, '42');
    assert.ok(!/مقاس خاص/.test(items[0].size), 'كلمة «مقاس خاص» لسه بتتحفظ');
    assert.equal(items[0].color, 'بيج كريمي');
  });

  it('الرقم اللي العميل كتبه هو اللي بيظهر في درج السلة', async () => {
    await waitFor(() => page.document.querySelector('#drawerItems .drawer-item'));
    const text = page.document.querySelector('#drawerItems .drawer-item').textContent;
    assert.match(text, /مقاس 42/);
    assert.ok(!/مقاس خاص/.test(text), 'لسه بيظهر «مقاس خاص»');
  });

  it('مفيش أخطاء JavaScript', () => {
    assert.deepEqual(page.errors, []);
  });
});

describe('4.b) منتج نافد بالكامل', () => {
  let page;
  before(async () => {
    page = await openPage(server.base, 'product.html', { query: 'id=p-sold' });
    await waitFor(() => page.document.querySelector('.pdp-soldout'));
  });
  after(() => page.window.close());

  it('بانر SOLD OUT ظاهر', () => {
    assert.match(page.document.querySelector('.pdp-soldout b').textContent, /SOLD OUT/);
  });

  it('زر الإضافة مقفول ومكتوب عليه SOLD OUT', () => {
    const btn = page.document.querySelector('#addToCart');
    assert.equal(btn.disabled, true);
    assert.equal(btn.textContent.trim(), 'SOLD OUT');
  });

  it('زر «أشري الآن» مقفول كمان', () => {
    assert.equal(page.document.querySelector('#buyNow').disabled, true);
  });
});

describe('4.c) منتج كل مقاساته نفدت (sold_out مقفول)', () => {
  it('بيتعامل كإنه نافد بالكامل', async () => {
    const page = await openPage(server.base, 'product.html', { query: 'id=p-allsold' });
    await waitFor(() => page.document.querySelector('.pdp-soldout'));
    assert.equal(page.document.querySelector('#addToCart').disabled, true);
    assert.equal(page.errors.length, 0);
    page.window.close();
  });
});

describe('4.d) دليل المقاسات', () => {
  it('فيه صف 4XL + ملاحظة المقاس الخاص', async () => {
    const page = await openPage(server.base, 'index.html');
    await waitFor(() => page.window.document.querySelector('#guideModal'));
    const html = page.window.document.querySelector('#guideModal').innerHTML;
    assert.match(html, /4XL/);
    assert.match(html, /XS/);
    assert.match(html, /مقاس خاص/);
    page.window.close();
  });
});

/* ============================================================
   4.e) العرض السريع (Quick view)
   ============================================================ */
describe('4.e) العرض السريع — نفس قواعد النفاد والمقاس الخاص', () => {
  let page;
  before(async () => {
    page = await openPage(server.base, 'shop.html');
    await waitFor(() => page.document.querySelectorAll('#shopGrid .card').length >= 5);
    click(page.window, page.document.querySelector('#shopGrid [data-quick-view="p-abaya"]'));
    await waitFor(() => page.document.querySelector('#quickModal .quick-card'));
  });
  after(() => page.window.close());

  it('بيفتح وفيه المقاسات والألوان', () => {
    assert.equal(page.document.querySelectorAll('#quickModal [data-q-size]').length, 9);
    assert.equal(page.document.querySelectorAll('#quickModal [data-q-color]').length, 2);
  });

  it('المقاس النافد واللون النافد مقفولين', () => {
    assert.equal(page.document.querySelector('#quickModal [data-q-size="M"]').disabled, true);
    assert.equal(page.document.querySelector('#quickModal [data-q-color="أسود"]').disabled, true);
  });

  it('اختيار المقاس الخاص بيفتح خانة الرقم', () => {
    click(page.window, page.document.querySelector('#quickModal [data-q-size="مقاس خاص"]'));
    assert.equal(page.document.querySelector('#quickModal #qCustomWrap').hidden, false);
  });

  it('بيضيف للسلة بالمقاس الخاص والرقم', () => {
    type(page.window, page.document.querySelector('#quickModal #qCustomValue'), '44');
    click(page.window, page.document.querySelector('#quickModal #quickAdd'));
    const items = page.window.JL.cart.get();
    assert.equal(items.length, 1);
    assert.equal(items[0].size, '44');
  });
});

/* ============================================================
   4.f) درج السلة (Cart drawer)
   ============================================================ */
describe('4.f) درج السلة بيعرض الرقم اللي العميل كتبه', () => {
  it('«مقاس 42» — الرقم بس من غير كلمة «مقاس خاص»', async () => {
    const page = await openPage(server.base, 'index.html', {
      storage: { aw_cart_v1: JSON.stringify([{ id: 'p-abaya', title: 'عباية', price: 2200, qty: 1, size: '42', color: 'بيج كريمي', image: 'assets/img/products/abaya-1.jpg' }]) }
    });
    await waitFor(() => page.document.querySelector('#drawerItems .drawer-item'));
    const text = page.document.querySelector('#drawerItems .drawer-item').textContent;
    assert.match(text, /مقاس 42/);
    assert.ok(!/مقاس خاص/.test(text), 'لسه بيظهر «مقاس خاص»');
    assert.ok(!/مقاس مقاس/.test(text), 'فيه تكرار لكلمة مقاس');
    page.window.close();
  });

  it('السلة القديمة («مقاس خاص · 42») بتتعرض برضه كـ «مقاس 42»', async () => {
    const page = await openPage(server.base, 'index.html', {
      storage: { aw_cart_v1: JSON.stringify([{ id: 'p-abaya', title: 'عباية', price: 2200, qty: 1, size: 'مقاس خاص · 42', color: 'بيج كريمي', image: 'assets/img/products/abaya-1.jpg' }]) }
    });
    await waitFor(() => page.document.querySelector('#drawerItems .drawer-item'));
    const text = page.document.querySelector('#drawerItems .drawer-item').textContent;
    assert.match(text, /مقاس 42/);
    assert.ok(!/مقاس خاص/.test(text), 'المقاس القديم لسه بيظهر بكلمة «مقاس خاص»');
    page.window.close();
  });
});

/* ============================================================
   4.g) المقاس الخاص = الرقم اللي العميل كتبه (مش كلمة «مقاس خاص»)
   ============================================================ */
describe('4.g) المقاس الخاص بيتحول لرقم في كل حتة', () => {
  let page;
  before(async () => {
    page = await openPage(server.base, 'index.html');
    await waitFor(() => page.window.JL);
  });
  after(() => page.window.close());

  it('util.composeSize بيرجّع الرقم بس', () => {
    const u = page.window.JL.util;
    assert.equal(u.composeSize('مقاس خاص', '42'), '42');
    assert.equal(u.composeSize('مقاس خاص', ' 56 '), '56');
    assert.equal(u.composeSize('مقاس خاص', ''), 'مقاس خاص');
    assert.equal(u.composeSize('M', '42'), 'M');
  });

  it('util.sizeText / sizeLine بيعرضوا الرقم', () => {
    const u = page.window.JL.util;
    assert.equal(u.sizeText('42'), '42');
    assert.equal(u.sizeText('مقاس خاص · 42'), '42');
    assert.equal(u.sizeText('مقاس خاص'), 'مقاس خاص');
    assert.equal(u.sizeText('M'), 'M');
    assert.equal(u.sizeLine('42'), 'مقاس 42');
    assert.equal(u.sizeLine('مقاس خاص · 42'), 'مقاس 42');
    assert.equal(u.sizeLine('M'), 'مقاس M');
    assert.equal(u.sizeLine('مقاس خاص'), 'مقاس خاص');
  });

  it('الشريحة «مقاس خاص» بتفضل شريحة، والرقم بيتحسب مقاس خاص', () => {
    const u = page.window.JL.util;
    assert.equal(u.isCustomLabel('مقاس خاص'), true);
    assert.equal(u.isCustomLabel('42'), false);
    assert.equal(u.isCustomSize('مقاس خاص'), true);
    assert.equal(u.isCustomSize('42'), true);
    assert.equal(u.isCustomSize('مقاس خاص · 42'), true);
    assert.equal(u.isCustomSize('M'), false);
    assert.equal(u.isCustomSize('FREE SIZE'), false);
  });

  it('رسالة الواتساب فيها «المقاس: 42» من غير كلمة «مقاس خاص»', () => {
    const msg = page.window.JL.buildOrderMessage({
      code: 'AW-T1', name: 'منى', phone: '01000000000',
      items: [{ title: 'عباية', size: '42', color: 'بيج كريمي', qty: 1, price: 2200 }],
      subtotal: 2200, total: 2300, shipping: 100, deposit: 100,
      payment: 'فودافون كاش', ship_option: 'normal'
    });
    assert.match(msg, /المقاس: 42/);
    assert.ok(!/مقاس خاص/.test(msg), 'كلمة «مقاس خاص» لسه بتبان في الواتساب');
  });
});

/* ============================================================
   5) السلة
   ============================================================ */
describe('5) صفحة السلة', () => {
  let page;
  const cart = [
    { id: 'p-abaya', title: 'عباية «ندى»', price: 2200, qty: 1, size: 'مقاس خاص · 42', color: 'بيج كريمي', image: 'assets/img/products/abaya-1.jpg' },
    { id: 'p-home', title: 'طقم هوم وير', price: 900, qty: 2, size: 'L', color: 'بيج كريمي', image: 'assets/img/products/abaya-1.jpg' }
  ];
  before(async () => {
    page = await openPage(server.base, 'cart.html', { storage: { aw_cart_v1: JSON.stringify(cart) } });
    await waitFor(() => page.document.querySelectorAll('.cart-item').length === 2);
  });
  after(() => page.window.close());

  it('صفوف السلة ظاهرة', () => {
    assert.equal(page.document.querySelectorAll('.cart-item').length, 2);
  });

  it('المقاس الخاص بيظهر كرقم — «المقاس: 42»', () => {
    const opts = page.document.querySelector('.cart-item .cart-item-opts').textContent;
    assert.match(opts, /المقاس:\s*42/);
    assert.ok(!/مقاس خاص/.test(opts), 'لسه بيظهر «مقاس خاص»');
  });

  it('المجموع الفرعي = 2200 + (900×2)', () => {
    assert.equal(page.document.querySelector('#sumSub').textContent.trim(), '4,000 ج.م');
  });

  it('الشحن بيظهر (100) والإجمالي 4,100', () => {
    assert.equal(page.document.querySelector('#sumShip').textContent.trim(), '100 ج.م');
    assert.equal(page.document.querySelector('#sumTotal').textContent.trim(), '4,100 ج.م');
  });

  it('زيادة الكمية بتحدّث الإجمالي', () => {
    const row = page.document.querySelector('.cart-item');
    click(page.window, row.querySelector('[data-inc]'));
    assert.equal(page.window.JL.cart.get().reduce((s, i) => s + i.qty, 0), 4);
  });
});

/* ============================================================
   6) الشيك آوت (من غير تغيير طريقة الشحن الموجودة)
   ============================================================ */
const checkoutCart = [
  { id: 'p-abaya', title: 'عباية «ندى»', price: 4200, qty: 1, size: 'M', color: 'بيج كريمي', image: 'assets/img/products/abaya-1.jpg' }
];

describe('6) إتمام الطلب — الشحن كما هو', () => {
  let page;
  before(async () => {
    page = await openPage(server.base, 'checkout.html', { storage: { aw_cart_v1: JSON.stringify(checkoutCart) } });
    await waitFor(() => page.document.querySelector('#cTotal').textContent.includes('ج.م'));
  });
  after(() => page.window.close());

  it('الشحن العادي 100 والإجمالي 4,300', () => {
    assert.equal(page.document.querySelector('#cShip').textContent.trim(), '100 ج.م');
    assert.equal(page.document.querySelector('#cTotal').textContent.trim(), '4,300 ج.م');
  });

  it('العربون = مصاريف الشحن والباقي عند الاستلام', () => {
    const box = page.document.querySelector('#payNote').textContent;
    assert.match(box, /المطلوب الآن \(الشحن\)/);
    assert.match(box, /١٠٠ ج\.م/);
    assert.match(box, /٤,٢٠٠ ج\.م/);
  });

  it('التبديل للمناطق النائية بيغيّر الشحن والإجمالي فورًا', () => {
    click(page.window, page.document.querySelector('.ship-option[data-ship="remote"]'));
    assert.equal(page.document.querySelector('#cShip').textContent.trim(), '150 ج.م');
    assert.equal(page.document.querySelector('#cTotal').textContent.trim(), '4,350 ج.م');
    assert.match(page.document.querySelector('#payNote').textContent, /١٥٠ ج\.م/);
  });

  it('الطلب بيتسجل بـ shipping و ship_option', async () => {
    const d = page.document;
    d.querySelector('#cName').value = 'مالك';
    d.querySelector('#cPhone').value = '01129196650';
    d.querySelector('#cCity').value = 'البحيرة';
    d.querySelector('#cAddress').value = 'دمنهور';
    d.querySelector('#cConfirm').checked = true;
    d.querySelector('#cConfirm').dispatchEvent(new page.window.Event('change', { bubbles: true }));
    click(page.window, d.querySelector('#placeOrder'));
    await waitFor(() => page.fetchMock.state.inserts.length > 0);
    const saved = page.fetchMock.state.inserts[0];
    const order = [].concat(saved.body)[0];
    assert.equal(saved.table, 'awam-data', 'الطلب لازم يتسجل في awam-data');
    assert.equal(order.kind, 'order');
    assert.equal(order.shipping, 150);
    assert.equal(order.ship_option, 'remote');
    assert.equal(order.total, 4350);
    assert.equal(order.deposit, 150);
    assert.equal(order.phone, '01129196650');
  });
});

describe('6.b) الشيك آوت مع أسعار من لوحة التحكم (125 / 175)', () => {
  it('بيقرا الأسعار من إعدادات الشحن', async () => {
    const mock = makeFetchMock({
      settingsRow: { shipping_normal_fee: 125, shipping_remote_fee: 175, shipping_normal_label: 'الشحن العادي', shipping_remote_label: 'الشحن للمناطق النائية' }
    });
    const page = await openPage(server.base, 'checkout.html', {
      storage: { aw_cart_v1: JSON.stringify(checkoutCart) }, fetchMock: mock
    });
    await waitFor(() => page.document.querySelector('#cTotal').textContent.includes('4,325'));
    assert.equal(page.document.querySelector('#cShip').textContent.trim(), '125 ج.م');
    click(page.window, page.document.querySelector('.ship-option[data-ship="remote"]'));
    assert.equal(page.document.querySelector('#cTotal').textContent.trim(), '4,375 ج.م');
    assert.deepEqual(page.errors, []);
    page.window.close();
  });
});

/* ============================================================
   6.c) المقاس الخاص في الشيك آوت والطلب
   ============================================================ */
describe('6.c) المقاس الخاص في إتمام الطلب', () => {
  it('بيتعرض «مقاس 42» وبيتحفظ في الطلب كرقم', async () => {
    const mock = makeFetchMock();
    const cart = [{ id: 'p-abaya', title: 'عباية «ندى»', price: 4200, qty: 1, size: 'مقاس خاص · 42', color: 'بيج كريمي', image: 'assets/img/products/abaya-1.jpg' }];
    const page = await openPage(server.base, 'checkout.html', {
      fetchMock: mock, storage: { aw_cart_v1: JSON.stringify(cart) }
    });
    await waitFor(() => page.document.querySelector('#cTotal').textContent.includes('ج.م'));

    const mini = page.document.querySelector('#miniList').textContent;
    assert.match(mini, /مقاس 42/);
    assert.ok(!/مقاس خاص/.test(mini), 'لسه بيظهر «مقاس خاص» في ملخص الطلب');

    const d = page.document;
    d.querySelector('#cName').value = 'منى';
    d.querySelector('#cPhone').value = '01000000000';
    d.querySelector('#cCity').value = 'البحيرة';
    d.querySelector('#cAddress').value = 'دمنهور';
    d.querySelector('#cConfirm').checked = true;
    d.querySelector('#cConfirm').dispatchEvent(new page.window.Event('change', { bubbles: true }));
    click(page.window, d.querySelector('#placeOrder'));

    await waitFor(() => mock.state.inserts.length > 0);
    const order = [].concat(mock.state.inserts[0].body)[0];
    assert.equal(order.items[0].size, '42');
    assert.ok(!/مقاس خاص/.test(JSON.stringify(order.items[0])), 'الطلب بيتسجل بكلمة «مقاس خاص»');
    await new Promise(r => setTimeout(r, 250));   // نخلّي أي تحميل غير متزامن يخلص
    page.window.close();
  });
});

/* ============================================================
   7) لوحة التحكم
   ============================================================ */
describe('7) لوحة التحكم', () => {
  let page;
  before(async () => {
    page = await openPage(server.base, 'index.html', {
      storage: { aw_admin_v1: 'granted', aw_admin_v1_tok: 'awam_secure_2026' }
    });
    await waitFor(() => page.document.querySelector('#adminSheet'), { timeout: 8000 });
  });
  after(() => page.window.close());

  it('اللوحة بتحمّل باسم الموقع الجديد + ٥ تابات', () => {
    assert.match(page.document.querySelector('.admin-head b').textContent, /عوام الدلنجات/);
    assert.equal(page.document.querySelectorAll('.admin-tab').length, 5);
  });

  it('شرائح المقاسات فيها XS→4XL + مقاس خاص', () => {
    const labels = [...page.document.querySelectorAll('#sizesBox .sz')].map(b => b.textContent.trim());
    assert.deepEqual(labels, ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'مقاس خاص']);
  });

  it('قائمة الأقسام فيها الأربعة الجديدة', () => {
    const opts = [...page.document.querySelectorAll('#fCategory option')].map(o => o.value).filter(Boolean);
    assert.deepEqual(opts, ['عبايات', 'عبايات سواريه', 'درسات', 'هوم وير']);
  });

  it('أدوات SOLD OUT موجودة (المنتج/المقاس/اللون)', () => {
    assert.ok(page.document.querySelector('#fSoldOutAll'));
    assert.ok(page.document.querySelector('#soldSizesBox'));
    assert.ok(page.document.querySelector('#soldColorsBox'));
  });

  it('اختيار مقاس بيفتحه في قائمة «المقاسات النافدة»', () => {
    const xl = page.document.querySelector('#sizesBox .sz[data-size="XL"]');
    click(page.window, xl);
    assert.ok(xl.classList.contains('is-on'));
    assert.ok(page.document.querySelector('#soldSizesBox [data-sold-size="XL"]'));
  });

  it('اختيار لون بيظهر في قائمة «الألوان النافدة»', () => {
    const navy = page.document.querySelector('#colorsBox .sz[data-color="كحلي"]');
    click(page.window, navy);
    assert.ok(navy.classList.contains('is-on'));
    const sold = page.document.querySelector('#soldColorsBox [data-sold-color="كحلي"]');
    assert.ok(sold, 'لون كحلي مش ظاهر في قائمة النفاد');
    click(page.window, sold);
    assert.ok(page.document.querySelector('#soldColorsBox .sz.is-sold'), 'اللون مش اتعلّم كنافد');
  });

  it('زرار تسريع الصور موجود', () => {
    assert.ok(page.document.querySelector('#optimizeImages'));
  });

  it('نشر منتج بيبعت المقاسات والنفاد للداتابيز', async () => {
    const d = page.document;
    d.querySelector('#fTitle').value = 'منتج اختبار';
    d.querySelector('#fPrice').value = '1500';
    /* نضيف صورة وهمية عن طريق الـ drop (من غير رفع حقيقي) */
    const zone = d.querySelector('#dropProducts');
    const file = new page.window.File([new Uint8Array([1, 2, 3])], 'test.png', { type: 'image/png' });
    const drop = new page.window.Event('drop', { bubbles: true, cancelable: true });
    drop.dataTransfer = { files: [file] };
    zone.dispatchEvent(drop);
    await waitFor(() => d.querySelector('#previewProducts img'));

    click(page.window, d.querySelector('#sizesBox .sz[data-size="4XL"]'));
    click(page.window, d.querySelector('#soldSizesBox [data-sold-size="XL"]'));
    click(page.window, d.querySelector('#saveProduct'));

    await waitFor(() => page.fetchMock.state.inserts.some(i => i.table === 'awam-data'), { timeout: 8000 });
    const row = page.fetchMock.state.inserts.find(i => i.table === 'awam-data').body[0];
    assert.ok(row.sizes.includes('4XL'));
    assert.ok(row.sold_sizes.includes('XL'));
    assert.equal(row.sold_out, false);
    assert.equal(row.price, 1500);
  });
});

/* ============================================================
   8) سلوك الأداء
   ============================================================ */
describe('8) الأداء', () => {
  it('اللودر مبقاش فيه انتظار مصطنع (٠ms)', async () => {
    const core = await read('assets/js/core.js');
    assert.match(core, /const MIN_MS = 0;/);
    assert.ok(!/MIN_MS = 500/.test(core));
  });

  it('مفيش preload لصور كبيرة + فيه preconnect لـ Supabase', async () => {
    const html = await read('index.html');
    assert.match(html, /rel="preconnect" href="https:\/\/[a-z0-9]+\.supabase\.co"/);
    assert.match(html, /srcset="assets\/img\/hero-abaya\.webp/);
    /* لوجو الموبايل بيتبني من core.js */
    const core = await read('assets/js/core.js');
    assert.match(core, /srcset="assets\/img\/brand\/awam-crest-brown\.webp/);
  });

  it('صور الويب محسّنة فعلًا (أصغر من الأصل)', async () => {
    const jpg = (await stat(path.join(ROOT, 'assets/img/hero-abaya.jpg'))).size;
    const webp = (await stat(path.join(ROOT, 'assets/img/hero-abaya.webp'))).size;
    assert.ok(webp < jpg, `hero webp ${webp} مش أصغر من ${jpg}`);
    const crestPng = (await stat(path.join(ROOT, 'assets/img/brand/awam-crest-brown.png'))).size;
    const crestWebp = (await stat(path.join(ROOT, 'assets/img/brand/awam-crest-brown.webp'))).size;
    assert.ok(crestWebp * 5 < crestPng, 'لوجو الموبايل لازم يبقى أصغر بكتير');
  });

  it('الرفع من لوحة التحكم بيصغّر الصور قبل الرفع', async () => {
    const admin = await read('assets/js/admin.js');
    assert.match(admin, /util\.downscaleImage/);
    assert.match(admin, /maxW: 1400/);
  });

  it('الأقسام تحت الشاشة بتترسم بكسل (content-visibility)', async () => {
    const css = await read('assets/css/main.css');
    assert.match(css, /content-visibility:auto/);
  });
});

/* ============================================================
   10) فحص شامل لكل صفحات الموقع
   ============================================================ */
const PAGES = ['index.html', 'shop.html', 'product.html?id=p-abaya', 'cart.html', 'checkout.html'];
const CART_FIXTURE = JSON.stringify([
  { id: 'p-abaya', title: 'عباية «ندى»', price: 2200, qty: 1, size: '42', color: 'بيج كريمي', image: 'assets/img/products/abaya-1.jpg' }
]);

describe('10) فحص شامل لكل صفحات الموقع', () => {
  for (const page of PAGES) {
    const file = page.split('?')[0];
    it(`${file} بتفتح من غير أخطاء JS`, async () => {
      const p = await openPage(server.base, page, {
        fetchMock: makeFetchMock(),
        storage: { aw_cart_v1: CART_FIXTURE }
      });
      await waitFor(() => p.window.JL, { timeout: 8000 });
      await new Promise(r => setTimeout(r, 400));
      assert.deepEqual(p.errors, [], `${file}: فيه أخطاء`);
      assert.match(p.document.title, /عوام الدلنجات/, `${file}: العنوان مش بالاسم الجديد`);
      assert.ok(p.document.querySelector('.brand'), `${file}: مفيش لوجو في الهيدر`);
      assert.ok(p.document.querySelector('.footer, footer'), `${file}: مفيش فوتر`);
      await new Promise(r => setTimeout(r, 150));
      p.window.close();
    });
  }

  it('مفيش أي رابط لصفحة مش موجودة في المشروع', async () => {
    const missing = [];
    for (const page of PAGES) {
      const html = await read(page.split('?')[0]);
      const links = [...html.matchAll(/href="([^"#?:]+)(?:\?[^"]*)?(?:#[^"]*)?"/g)]
        .map(m => m[1])
        .filter(href => /\.html$/i.test(href));
      for (const href of new Set(links)) {
        if (!(await exists(href))) missing.push(`${page.split('?')[0]} → ${href}`);
      }
    }
    assert.deepEqual(missing, []);
  });

  it('كل صفحة بتستخدم المسار النسبي — مفيش localhost ولا روابط مكسورة', async () => {
    for (const page of PAGES) {
      const html = await read(page.split('?')[0]);
      assert.ok(!/https?:\/\/(localhost|127\.0\.0\.1)/i.test(html), `${page}: فيه رابط localhost`);
    }
  });

  it('مفيش أخطاء في الكونسول أثناء التنقل بين الصفحات (نفس التبويب)', async () => {
    for (const page of PAGES) {
      const p = await openPage(server.base, page, {
        fetchMock: makeFetchMock(),
        storage: { aw_cart_v1: CART_FIXTURE }
      });
      await waitFor(() => p.window.JL, { timeout: 8000 });
      await new Promise(r => setTimeout(r, 250));
      const bad = p.warnings.filter(w => /TypeError|ReferenceError|is not a function|undefined is not/i.test(w));
      assert.deepEqual(bad, [], `${page}: تحذيرات خطأ`);
      await new Promise(r => setTimeout(r, 100));
      p.window.close();
    }
  });
});

describe('10.b) الموقع بيكمل شغل لو قاعدة البيانات وقعت', () => {
  const deadFetch = async () => new Response(
    JSON.stringify({ code: 'PGRST000', message: 'database is down' }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  );

  it('الرئيسية والمتجر بيعرضوا منتجات العرض من غير ما يقعوا', async () => {
    for (const page of ['index.html', 'shop.html']) {
      const p = await openPage(server.base, page, { fetchMock: deadFetch, storage: {} });
      await waitFor(() => p.window.JL, { timeout: 8000 });
      await waitFor(() => p.document.querySelectorAll('.card').length > 0, { timeout: 8000 });
      assert.ok(p.document.querySelectorAll('.card').length > 0, `${page}: مفيش منتجات`);
      assert.deepEqual(p.errors, [], `${page}: فيه أخطاء مع سقوط الداتابيز`);
      await new Promise(r => setTimeout(r, 150));
      p.window.close();
    }
  });

  it('صفحة السلة والدفع بيفتحوا ويحسبوا الشحن من القيم الافتراضية', async () => {
    for (const page of ['cart.html', 'checkout.html']) {
      const p = await openPage(server.base, page, {
        fetchMock: deadFetch, storage: { aw_cart_v1: CART_FIXTURE }
      });
      await waitFor(() => p.window.JL, { timeout: 8000 });
      await new Promise(r => setTimeout(r, 400));
      assert.deepEqual(p.errors, [], `${page}: فيه أخطاء مع سقوط الداتابيز`);
      const total = p.document.querySelector('#sumShip, #cShip');
      assert.ok(total && /ج\.م|مجاني/.test(total.textContent), `${page}: الشحن مش ظاهر`);
      await new Promise(r => setTimeout(r, 150));
      p.window.close();
    }
  });
});
