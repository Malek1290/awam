/* ============================================================
   عوام AWAM — PRODUCT PAGE
   جاليري موحّد + ثامبنيل + اختيار مقاس/لون + دليل قياسات + إضافة للسلة
   ============================================================ */
const { CFG, $, $$, ON, util, products, cart, toast, modal, waLink, icons, offer, stock } = window.JL;

const state = { product: null, imgIndex: 0, size: '', sizeValue: '', color: '', qty: 1 };

/* ---------- كارت مشابه ---------- */
function miniCard(p) {
  return `
    <article class="card reveal">
      <a href="product.html?id=${encodeURIComponent(p.id)}" class="card-media">
        <img src="${util.img(p.image_url, true)}" alt="${util.esc(p.title)}" loading="lazy">
      </a>
      <div class="card-body">
        <a class="card-title" href="product.html?id=${encodeURIComponent(p.id)}">${util.esc(p.title)}</a>
        <div class="card-meta"><span class="card-price">${util.money(p.price)}</span></div>
      </div>
    </article>`;
}

document.addEventListener('DOMContentLoaded', async () => {
  const id = new URLSearchParams(location.search).get('id');
  const p = await products.one(id);

  if (!p) {
    $('#pdp').innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <b>المنتج مش موجود</b>
        <span class="tiny">الرابط ده قديم أو القطعة اتشالت.</span>
        <a class="btn btn--ghost btn--sm" href="shop.html">العودة للمتجر</a>
      </div>`;
    return;
  }

  state.product = p;
  /* ⭐ أول مقاس/لون متاح (مش نافد) — لو الكل نافد نسيبها فاضية */
  state.size = stock.firstSize(p);
  state.color = stock.firstColor(p);

  document.title = `${p.title} · ${util.siteName()}`;
  $('#crumbName').textContent = p.title;
  $('#pdpCat').textContent = [p.title_en || '', p.category || ''].filter(Boolean).join(' · ') || util.siteName();
  $('#pdpTitle').textContent = p.title;

  /* السعر + العرض المحدود */
  const st = offer.state(p);
  const off = offer.pct(p);
  $('#pdpPrice').innerHTML = `
    <span>${util.money(p.price)}</span>
    ${st === 'live' ? `<span class="old">${util.money(p.old_price)}</span><span class="save">وفّر ${off}٪</span>` : ''}`;

  /* شريط العرض المحدود */
  const offerHost = document.createElement('div');
  offerHost.style.display = 'grid';
  offerHost.style.gap = '8px';
  if (st === 'live' && offer.endsAt(p)) {
    offerHost.innerHTML = `
      <div class="offer-strip">
        <span class="dot-live"></span>
        <span>عرض لفترة محدودة — كان <b>${util.money(p.old_price)}</b> والآن <b>${util.money(p.price)}</b></span>
        <span class="cd" data-offer-end="${offer.endsAt(p).toISOString()}"></span>
      </div>`;
    setTimeout(() => window.JL.initCountdowns(), 0);
  } else if (st === 'live') {
    offerHost.innerHTML = `
      <div class="offer-strip"><span class="dot-live"></span>
      <span>كان <b>${util.money(p.old_price)}</b> — والآن <b>${util.money(p.price)}</b></span></div>`;
  }
  $('#pdpPrice').after(offerHost);

  /* الوصف */
  $('#pdpDesc').textContent = p.description || `قطعة من ${util.siteName()} بتفصيل متقن وخامة مريحة.`;

  /* ⭐ المنتج كله نافد (أو كل مقاساته نفدت) → بانر واضح + تعطيل الشراء */
  const soldWhole = stock.isSoldOut(p) || !stock.hasSize(p);
  if (soldWhole) {
    const banner = document.createElement('div');
    banner.className = 'pdp-soldout';
    banner.setAttribute('role', 'status');
    banner.innerHTML = `<b>SOLD OUT</b><span>${stock.isSoldOut(p) ? 'القطعة دي نافدة حاليًا.' : 'كل مقاسات القطعة نافدة حاليًا.'} ممكن تكلّمينا على واتساب نتأكد من توفّرها تاني أو نجهّزلك زيها.</span>`;
    $('#pdpDesc').after(banner);
    const addBtn = $('#addToCart');
    const buyBtn = $('#buyNow');
    if (addBtn) { addBtn.disabled = true; addBtn.classList.add('is-disabled'); addBtn.textContent = 'SOLD OUT'; }
    if (buyBtn) { buyBtn.disabled = true; buyBtn.classList.add('is-disabled'); buyBtn.textContent = 'غير متاح حاليًا'; }
  }

  /* الجاليري */
  const stage = $('#stage');
  const images = p.images?.length ? p.images : [p.image_url];
  stage.insertAdjacentHTML('afterbegin', images.map((src, i) =>
    `<img src="${util.img(src)}" alt="${util.esc(p.title)} — صورة ${i + 1}" class="${i === 0 ? 'is-on' : ''}" data-i="${i}" loading="${i === 0 ? 'eager' : 'lazy'}" fetchpriority="${i === 0 ? 'high' : 'auto'}" decoding="async">`).join(''));
  stage.querySelector('.skeleton')?.remove();

  $('#thumbs').innerHTML = images.map((src, i) =>
    `<button class="${i === 0 ? 'is-on' : ''}" data-thumb="${i}" aria-label="صورة ${i + 1}">
       <img src="${util.img(src, true)}" alt="" loading="lazy">
     </button>`).join('');

  const showImg = (i) => {
    const n = images.length;
    state.imgIndex = (i + n) % n;
    $$('#stage img[data-i]').forEach(im => im.classList.toggle('is-on', +im.dataset.i === state.imgIndex));
    $$('#thumbs button').forEach(b => b.classList.toggle('is-on', +b.dataset.thumb === state.imgIndex));
  };
  ON($('#prevImg'), 'click', () => showImg(state.imgIndex - 1));
  ON($('#nextImg'), 'click', () => showImg(state.imgIndex + 1));
  $$('#thumbs button').forEach(b => ON(b, 'click', () => showImg(+b.dataset.thumb)));
  // سحب بالإصبع
  let sx = null;
  ON(stage, 'touchstart', e => sx = e.touches[0].clientX, { passive: true });
  ON(stage, 'touchend', e => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 45) showImg(state.imgIndex + (dx > 0 ? -1 : 1));
    sx = null;
  });

  /* المقاسات — XS → 4XL + مقاس خاص برقم */
  const sizes = p.sizes || [];
  const customWrap = $('#customSizeWrap');
  const customValue = $('#customSizeValue');

  $('#sizeBtns').innerHTML = sizes.map(s => {
    const sold = stock.isSizeSold(p, s);
    const custom = util.isCustomSize(s);
    return `<button type="button" class="opt-btn ${s === state.size && !sold ? 'is-on' : ''} ${sold ? 'is-soldout' : ''}"
      data-size="${util.esc(s)}" ${sold ? 'disabled aria-disabled="true"' : ''} aria-label="${util.esc(s)}${sold ? ' — SOLD OUT' : ''}">
      <span class="opt-name">${util.esc(custom ? (CFG.CUSTOM_SIZE_LABEL || s) : s)}</span>${sold ? '<span class="sold-tag">SOLD OUT</span>' : ''}
    </button>`;
  }).join('');

  function syncSizeHint() {
    if (!state.size) {
      $('#sizeHint').textContent = sizes.length ? (stock.hasSize(p) ? 'اختاري المقاس' : 'كل المقاسات نافدة') : 'اختاري المقاس';
      $('#sizeHint').classList.add('muted');
      return;
    }
    const shown = util.composeSize(state.size, state.sizeValue);
    $('#sizeHint').textContent = shown;
    $('#sizeHint').classList.remove('muted');
  }

  function syncCustomBox() {
    if (!customWrap) return;
    const isCustom = util.isCustomSize(state.size);
    customWrap.hidden = !isCustom;
    if (isCustom) {
      customWrap.classList.add('is-on');
      setTimeout(() => customValue && customValue.focus(), 40);
    } else {
      customWrap.classList.remove('is-on');
    }
    syncSizeHint();
  }

  $$('#sizeBtns .opt-btn').forEach(b => ON(b, 'click', () => {
    if (b.disabled || b.classList.contains('is-soldout')) return toast('المقاس ده نافد.', 'warn');
    state.size = b.dataset.size;
    if (!util.isCustomSize(state.size)) state.sizeValue = '';
    $$('#sizeBtns .opt-btn').forEach(x => x.classList.toggle('is-on', x === b));
    syncCustomBox();
  }));

  if (customValue) {
    ON(customValue, 'input', () => {
      customValue.value = customValue.value.replace(/[^0-9.]/g, '').slice(0, 4);
      state.sizeValue = customValue.value;
      customValue.classList.toggle('is-invalid', !!state.sizeValue && !util.validCustomSize(state.sizeValue));
      syncSizeHint();
    });
  }
  syncCustomBox();
  syncSizeHint();

  /* الألوان */
  const colors = p.colors || [];
  if (colors.length) {
    $('#colorBtns').innerHTML = colors.map(c => {
      const sold = stock.isColorSold(p, c.name);
      return `<button type="button" class="swatch ${c.name === state.color && !sold ? 'is-on' : ''} ${sold ? 'is-soldout' : ''}"
        data-color="${util.esc(c.name)}" title="${util.esc(c.name)}${sold ? ' — SOLD OUT' : ''}" ${sold ? 'disabled aria-disabled="true"' : ''}>
         <i style="background:${util.esc(c.hex || '#EFECE6')}"></i>
         <span class="swatch-name">${util.esc(c.name)}</span>
         ${sold ? '<span class="sold-tag">SOLD OUT</span>' : ''}
       </button>`;
    }).join('');
    $$('#colorBtns .swatch').forEach(b => ON(b, 'click', () => {
      if (b.disabled || b.classList.contains('is-soldout')) return toast('اللون ده نافد.', 'warn');
      state.color = b.dataset.color;
      $$('#colorBtns .swatch').forEach(x => x.classList.toggle('is-on', x === b));
      $('#colorHint').textContent = state.color;
    }));
    $('#colorHint').textContent = state.color;
  } else {
    $('#optColors').remove();
  }

  /* الكمية */
  ON($('#qtyMinus'), 'click', () => { state.qty = Math.max(1, state.qty - 1); $('#qtyVal').textContent = state.qty; });
  ON($('#qtyPlus'), 'click', () => { state.qty = Math.min(99, state.qty + 1); $('#qtyVal').textContent = state.qty; });

  /* تفاصيل */
  $('#accDetails').innerHTML = `
    <ul>
      ${p.fabric ? `<li>الخامة: ${util.esc(p.fabric)}</li>` : ''}
      ${p.category ? `<li>القسم: ${util.esc(p.category)}</li>` : ''}
      ${p.title_en ? `<li>الاسم: ${util.esc(p.title_en)}</li>` : ''}
      <li>القصّة: مريحة ومبطنة بالكامل.</li>
      <li>المقاسات: XS · S · M · L · XL · 2XL · 3XL · 4XL، وكمان مقاس خاص برقم حسب طلبك.</li>
      <li>التغليف: صندوق قماش مع ورق تالك — جاهز للإهداء.</li>
      <li>العربون: ٥٠٪ عبر فودافون كاش، والباقي عند الاستلام.</li>
    </ul>`;

  /* دليل القياسات */
  ON($('#openGuide'), 'click', () => {
    const body = $('#sizeModalBody');
    const url = (p.size_guide_url || '').trim();
    if (url) {
      const isImage = /\.(png|jpe?g|webp|gif|avif|svg)(\?|#|$)/i.test(url);
      body.innerHTML = isImage
        ? `<img src="${util.esc(url)}" alt="دليل مقاسات ${util.esc(p.title)}" style="width:100%;border-radius:14px">`
        : `<p class="tiny muted" style="margin:0 0 10px">الرابط يفتح في تبويب جديد.</p>
           <a class="btn btn--block" href="${util.esc(url)}" target="_blank" rel="noopener">فتح دليل المقاسات</a>`;
    } else {
      body.innerHTML = document.querySelector('#guideModal').innerHTML;
      body.querySelector('.modal-head')?.remove();
    }
    modal.open('sizeModal');
  });
  ON($('[data-close-guide]'), 'click', () => modal.close('sizeModal'));
  ON($('#sizeModal'), 'click', e => { if (e.target.id === 'sizeModal') modal.close('sizeModal'); });

  /* السلة */
  const itemToAdd = () => ({
    id: p.id,
    title: p.title,
    title_en: p.title_en,
    price: p.price,
    qty: state.qty,
    size: util.composeSize(state.size, state.sizeValue),
    color: state.color,
    image: p.image_url
  });

  const blocked = () => {
    if (stock.isSoldOut(p) || !stock.hasSize(p)) { toast('المنتج ده نافد حاليًا.', 'warn'); return true; }
    if (state.size && stock.isSizeSold(p, state.size)) { toast('المقاس ده نافد — اختاري مقاس تاني.', 'warn'); return true; }
    if (state.color && stock.isColorSold(p, state.color)) { toast('اللون ده نافد — اختاري لون تاني.', 'warn'); return true; }
    if (util.isCustomSize(state.size) && !util.validCustomSize(state.sizeValue)) {
      toast(`اكتبي رقم مقاسك (${CFG.CUSTOM_SIZE_MIN || 30}–${CFG.CUSTOM_SIZE_MAX || 70}).`, 'warn');
      customValue && customValue.focus();
      return true;
    }
    return false;
  };

  ON($('#addToCart'), 'click', () => {
    if (!state.size) return toast('اختاري المقاس أولاً.', 'warn');
    if (blocked()) return;
    cart.add(itemToAdd());
    toast('تمت الإضافة إلى سلتك.', 'ok');
    bumpCart();
  });

  ON($('#buyNow'), 'click', () => {
    if (!state.size) return toast('اختاري المقاس أولاً.', 'warn');
    if (blocked()) return;
    cart.add(itemToAdd());
    location.href = 'cart.html';
  });

  /* استفسار على واتساب */
  const ask = `مرحباً بـ ${util.siteName()} ✦\nعندي استفسار عن: ${p.title}${p.title_en ? ' / ' + p.title_en : ''}\n${location.href}`;
  $('#waAsk').href = waLink(ask);

  /* المشابهة */
  const all = await products.all();
  const related = all.filter(x => String(x.id) !== String(p.id))
    .sort((a, b) => (a.category === p.category ? -1 : 0) - (b.category === p.category ? -1 : 0))
    .slice(0, 4);
  $('#relatedGrid').innerHTML = related.map(miniCard).join('');
  window.JL.revealWithin($('#relatedGrid'));

  $('.gallery')?.classList.add('reveal');
  $$('#pdp .pdp-info > *').forEach((element, index) => {
    element.classList.add('reveal');
    element.dataset.delay = String(Math.min(index * .045, .25));
  });
  window.JL.revealWithin($('#pdp'));
});

function bumpCart() {
  const badge = document.querySelector('.cart-count');
  if (!badge || !badge.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  badge.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }],
    { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' }
  );
}
