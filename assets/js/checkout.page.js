/* ============================================================
   عوام AWAM — CHECKOUT
   بيانات العميل → مقاسات → طريقة الدفع → BUY
   ثم: رسالة واتساب كاملة + حفظ الطلب في Supabase (اختياري)
   ============================================================ */
const { CFG, $, $$, ON, util, cart, sb, toast, modal, buildOrderMessage, waLink, icons, coupons, settings, pendingOrders } = window.JL;

const measures = [];   // صور المقاسات (تُرفع قبل الإرسال)
function readMeasureFields() {
  const v = id => (document.getElementById(id)?.value || '').trim();
  return {
    height: v('mHeight'), bust: v('mBust'), waist: v('mWaist'),
    hips: v('mHips'), shoulder: v('mShoulder'), sleeve: v('mSleeve'),
    notes: v('mNotes')
  };
}
let payMethod = (CFG.PAYMENT_METHODS || [])[0] || null;
let shipOption = 'normal';  // 'normal' or 'remote'
const liveTotal = () => cart.subtotal() - cart.discount() + getShippingFee();
/* ⭐ المقدم = مصاريف الشحن اللي العميل اختارها — والباقي (سعر المنتجات) عند الاستلام */
const depositAmount = () => getShippingFee();
/* المتبقي عند الاستلام = إجمالي المنتجات بعد الخصم */
const remainingAmount = () => Math.max(0, cart.subtotal() - cart.discount());

/* ---------- الشحن (الأسعار بتيجي من إعدادات الآدمن) ---------- */
function getShippingFee() {
  return settings.shippingFee(shipOption, cart.subtotal());
}

/** رسم أسماء وأسعار الشحن من الإعدادات — بتتحدّث فورًا لو الآدمن غيّرها */
function renderShipOptions() {
  $$('[data-ship-label]').forEach(el => { el.textContent = settings.label(el.dataset.shipLabel); });
  $$('[data-ship-price]').forEach(el => {
    const mode = el.dataset.shipPrice;
    const fee = settings.shippingFee(mode, cart.subtotal());
    const freeOver = Number(settings.get('free_shipping_over')) || 0;
    const isRem = mode === 'remote';
    let txt = fee > 0 ? `${util.money(fee)}` : 'مجاني';
    if (freeOver > 0 && settings.get('free_shipping_enabled') && cart.subtotal() >= freeOver) txt += ' (شحن مجاني)';
    el.textContent = `${txt} — ${isRem ? 'مطروح وسيناء فقط' : 'جميع المحافظات'}`;
  });
}

function renderShipping() {
  renderShipOptions();
  const fee = getShippingFee();
  const note = settings.get('shipping_note');
  $('#shipNote').innerHTML =
    `مصاريف الشحن: <b>${fee > 0 ? util.money(fee) : 'مجاني'}</b> ` +
    `${shipOption === 'remote' ? '(مطروح وسيناء فقط)' : '(جميع المحافظات)'}` +
    (note ? `<br><span class="muted">${util.esc(note)}</span>` : '');
  $('#cShip').textContent = fee > 0 ? util.money(fee) : 'مجاني';
  $('#cTotal').textContent = util.money(cart.subtotal() - cart.discount() + fee);
}

/* ---------- رسم ---------- */
function renderSummary() {
  const items = cart.get();
  if (!items.length) { location.replace('cart.html'); return; }
  $('#miniList').innerHTML = items.map(i => `
    <div class="mini">
      <img src="${util.img(i.image || i.image_url, true)}" alt="">
      <div>
        <b>${util.esc(i.title)} <span class="muted">×${i.qty || 1}</span></b>
        <span>${[util.esc(util.sizeLine(i.size)), util.esc(i.color || '')].filter(Boolean).join(' · ')}</span>
      </div>
      <b style="font-size:13px">${util.money((i.price || 0) * (i.qty || 1))}</b>
    </div>`).join('');
  $('#cSub').textContent = util.money(cart.subtotal());
  const ship = getShippingFee();
  $('#cShip').textContent = ship ? util.money(ship) : 'مجاني';

  /* الكوبون */
  /* أي طلب قديم لسه ما اتحفظش → بنحاول نبعته تاني */
  try { pendingOrders.flush(); } catch (_) {}

  $('#cCouponBlock').innerHTML = window.JL.couponBoxHTML();
  const bd = coupons.breakdown(items);
  const row = $('#cDiscountRow');
  if (bd.discount > 0) {
    row.classList.remove('hide');
    $('#cCouponCode').textContent = bd.coupon.code;
    $('#cDiscount').textContent = '− ' + util.money(bd.discount);
  } else {
    row.classList.add('hide');
  }
  $('#cTotal').textContent = util.money(cart.subtotal() - bd.discount + getShippingFee());
  window.JL.bindCouponBox($('#cCouponBlock'), renderSummary);
}

function renderPay() {
  const methods = (CFG.PAYMENT_METHODS || []);   // كل طرق الدفع
  $('#payGrid').innerHTML = methods.map((m, i) => `
    <label class="pay ${i === 0 ? 'is-on' : ''}" data-pay="${util.esc(m.id)}">
      <input type="radio" name="pay" value="${util.esc(m.id)}" ${i === 0 ? 'checked' : ''}>
      <span class="radio"></span>
      <span class="pay-txt"><b>${util.esc(m.title)}</b><span>${util.esc(m.sub || '')}</span></span>
      <span class="pay-logo">${util.esc(m.logo || '')}</span>
    </label>`).join('') + `
    <div class="pay-note" id="payNote"></div>`;
  payMethod = methods[0];
  renderPayNote();
  $$('.pay[data-pay]').forEach(el => ON(el, 'click', () => {
    payMethod = methods.find(m => m.id === el.dataset.pay);
    $$('.pay[data-pay]').forEach(x => x.classList.toggle('is-on', x === el));
    el.querySelector('input').checked = true;
    renderPayNote();
  }));
}

function renderPayNote() {
  const host = $('#payNote');
  if (!host || !payMethod) return;
  const deposit = depositAmount();
  const remaining = remainingAmount();
  const isWallet = payMethod.id === 'instapay';
  const handle = isWallet ? (CFG.INSTAPAY_HANDLE || '') : (CFG.VODAFONE_CASH_NUMBER || '');
  host.innerHTML = `
    <div class="deposit-box">
      <div class="deposit-head">
        <span class="deposit-ico">${icons.cash || ''}</span>
        <b>تدفعي مصاريف الشحن فقط مقدمًا</b>
      </div>
      <p>${util.esc(payMethod.note || '')}</p>
      <div class="vodafone-number">
        <span>${isWallet ? 'عنوان إنستاباي' : 'رقم فودافون كاش'}</span>
        <b class="en" dir="ltr">${util.esc(handle || '—')}</b>
      </div>
      <div class="deposit-split">
        <span>المطلوب الآن (الشحن): <b>${util.moneyAr(deposit)}</b></span>
        <span>المتبقي عند الاستلام: <b>${util.moneyAr(remaining)}</b></span>
      </div>
      <p class="tiny muted" style="margin:0">ابدئي الطلب، وبعدين حوّلي المصاريف على الرقم اللي فوق وابعتيلنا صورة التحويل على واتساب.</p>
    </div>`;
}

function renderMeasures() {
  $('#previewMeasure').innerHTML = measures.map((m, i) =>
    `<img src="${m.local}" alt="مقاس ${i + 1}" data-rm="${i}" title="انقري للإزالة">`).join('');
  $$('#previewMeasure img').forEach(img => ON(img, 'click', () => {
    measures.splice(+img.dataset.rm, 1); renderMeasures();
  }));
}

function addMeasureFiles(files) {
  [...files].filter(f => f.type.startsWith('image/')).forEach(f => {
    measures.push({ file: f, local: URL.createObjectURL(f), url: null });
  });
  renderMeasures();
}

/* ---------- إرسال ---------- */
async function placeOrder() {
  const err = $('#ckErr');
  err.textContent = '';
  const name = $('#cName').value.trim();
  const phone = $('#cPhone').value.trim();
  const city = $('#cCity').value.trim();
  const address = $('#cAddress').value.trim();
  const notes = $('#cNotes').value.trim();
  const confirm = $('#cConfirm').checked;
  const items = cart.get();

  if (!items.length) return (err.textContent = 'سلتك فارغة.');
  if (name.length < 2) return (err.textContent = 'ادخلي اسمك الكامل.');
  if (!/^[0-9+\s-]{8,}$/.test(phone)) return (err.textContent = 'ادخلي رقم جوال صحيح.');
  if (!payMethod) return (err.textContent = 'اختاري طريقة الدفع.');
  if (!confirm) return (err.textContent = 'تأكدي من بيانات الطلب.');

  const btn = $('#placeOrder');
  btn.disabled = true;
  const original = btn.innerHTML;
  btn.innerHTML = 'جارٍ تجهيز طلبك…';

  const code = util.uid();

  /* رفع صور المقاسات (اختياري) */
  const uploaded = [];
  if (measures.length) {
    try {
      for (const m of measures) {
        if (!m.url) m.url = await sb.upload(CFG.BUCKET_MEASUREMENTS, m.file);
        uploaded.push(m.url);
      }
    } catch (e) {
      console.warn('measurements upload skipped:', e.message);
      toast('تعذّر رفع صور المقاسات؛ هنطلبها عبر واتساب.', 'warn');
    }
  }

  /* ⭐ حفظ الطلب في awam-data (kind = order) — نفس جدول المنتجات، ومفيش جدول مشترك */
  const measureData = readMeasureFields();
  const orderRow = {
      kind: (CFG.KINDS && CFG.KINDS.ORDER) || 'order',
      code,
      customer_name: name,
      phone,
      city: city || null,
      address: address || null,
      notes: notes || null,
      payment_method: payMethod ? payMethod.title : null,
      deposit: depositAmount(),
      shipping: getShippingFee(),
      ship_option: shipOption,
      items: items.map(i => ({
        id: i.id, title: i.title, size: util.sizeText(i.size), color: i.color,
        qty: i.qty, price: i.price, image: i.image
      })),
      subtotal: cart.subtotal(),
      discount: coupons.breakdown(items).discount,
      coupon_code: coupons.get()?.code || null,
      total: cart.subtotal() - cart.discount() + getShippingFee(),
      measurement_urls: uploaded
  };
  try {
    await sb.insert(CFG.TABLE_ITEMS, orderRow);
  } catch (e) {
    /* مفيش كتابة في أي جدول تاني: بنحفظ الطلب في المتصفح ونحاول تاني بعدين */
    console.warn('order save (awam-data) failed:', e.message);
    pendingOrders.add(orderRow);
    toast('الطلب اتجهّز — لو النت قطع، ابعته على واتساب وهنأكده لك.', 'warn');
  }

  /* رسالة واتساب */
  const msg = buildOrderMessage({
    code, name, phone, city, address, notes,
    items: items.map(i => ({ ...i, size: util.sizeText(i.size), note: [util.sizeLine(i.size), i.color || ''].filter(Boolean).join(' · ') })),
    total: cart.subtotal() - cart.discount() + getShippingFee(),
    subtotal: cart.subtotal(),
    discount: coupons.breakdown(items).discount,
    couponCode: coupons.get()?.code || null,
    shipping: cart.shipping(),
    ship_option: shipOption,
    payment: payMethod ? payMethod.title : 'غير محدد',
    paymentId: payMethod ? payMethod.id : '',
    deposit: depositAmount(),
    measurements: { ...measureData, images: uploaded }
  });

  const link = waLink(msg);
  $('#orderCodeOut').textContent = code;
  $('#waAgain').href = link;

  modal.open('doneModal');
  setTimeout(() => {
    window.open(link, '_blank', 'noopener');
  }, 500);

  cart.clear();
  coupons.clear();
  btn.disabled = false;
  btn.innerHTML = original;
  setTimeout(() => { location.href = 'shop.html'; }, 20000);
}

/* ---------- تشغيل ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  /* ⭐ أسعار الشحن بتتحمّل من إعدادات الآدمن (Supabase) — لو مش متاح، بترجع للافتراضي */
  try { await settings.load(); } catch (_) {}
  const subtotal = cart.subtotal();
  const fee0 = settings.shippingFee(shipOption, subtotal);
  if (subtotal) cart.setShipFee(fee0);

  renderSummary();
  renderShipping();
  renderPay();

  /* أي تغيير في الإعدادات من الآدمن (نفس التاب) يحدّث الصفحة فورًا */
  ON(document, 'jl:settings', () => { renderShipping(); renderSummary(); renderPayNote(); });

  /* الشحن */
  $$('.ship-option[data-ship]').forEach(el => ON(el, 'click', () => {
    shipOption = el.dataset.ship;
    $$('.ship-option[data-ship]').forEach(x => x.classList.toggle('is-on', x === el));
    el.querySelector('input').checked = true;
    cart.setShipFee(getShippingFee());
    renderShipping();
    renderSummary();
    renderPayNote();   /* ⭐ المقدم = الشحن — لازم يتحدّث فورًا */
  }));
  ON($('#fileMeasure'), 'change', e => addMeasureFiles(e.target.files));

  const zone = $('#dropMeasure');
  ON(zone, 'click', () => $('#fileMeasure').click());
  ['dragenter', 'dragover'].forEach(ev => ON(zone, ev, e => { e.preventDefault(); zone.classList.add('is-drag'); }));
  ['dragleave', 'drop'].forEach(ev => ON(zone, ev, e => { e.preventDefault(); zone.classList.remove('is-drag'); }));
  ON(zone, 'drop', e => addMeasureFiles(e.dataTransfer?.files || []));

  ON($('#placeOrder'), 'click', placeOrder);

  /* ⭐ التشيك بوكس الواحدة اللي بتنوّر */
  const c = $('#cConfirm');
  const box = $('#confirmBox');
  const paint = () => box && box.classList.toggle('is-on', !!c.checked);
  ON(c, 'change', paint);
  paint();
});
