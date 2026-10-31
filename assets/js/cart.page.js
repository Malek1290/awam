/* ============================================================
   عوام AWAM — CART PAGE
   ============================================================ */
const { $, $$, ON, util, cart, toast, icons, coupons, settings } = window.JL;

function rowHTML(i) {
  const key = `${i.id}__${i.size || ''}__${i.color || ''}`;
  return `
    <div class="cart-item" data-key="${util.esc(key)}">
      <a class="cart-item-media" href="product.html?id=${encodeURIComponent(i.id)}">
        <img src="${util.img(i.image || i.image_url, true)}" alt="${util.esc(i.title)}" width="480" height="600" loading="lazy" decoding="async">
      </a>
      <div class="cart-item-body">
        <a class="cart-item-title" href="product.html?id=${encodeURIComponent(i.id)}">${util.esc(i.title)}
          ${i.title_en ? `<span class="en muted" style="font-size:11.5px;letter-spacing:.16em">${util.esc(i.title_en)}</span>` : ''}
        </a>
        <div class="cart-item-opts">
          ${i.size ? `<span>المقاس: ${util.esc(i.size)}</span>` : ''}
          ${i.color ? `<span>اللون: ${util.esc(i.color)}</span>` : ''}
        </div>
        <div class="cart-item-opts"><span style="background:none;padding:0;color:var(--text-main);font-weight:500">${util.money(i.price)}</span></div>
      </div>
      <div class="cart-item-end">
        <div class="qty" style="height:40px">
          <button data-dec aria-label="تقليل الكمية">−</button>
          <span class="val">${i.qty || 1}</span>
          <button data-inc aria-label="زيادة الكمية">+</button>
        </div>
        <button class="remove-btn" data-remove>حذف</button>
      </div>
    </div>`;
}

function render() {
  const items = cart.get();
  const list = $('#cartList');
  list.innerHTML = items.map(rowHTML).join('');
  $('#cartEmpty').classList.toggle('hide', items.length > 0);
  $('#summaryBox').style.display = items.length ? '' : 'none';

  $('#sumSub').textContent = util.money(cart.subtotal());
  const ship = cart.shipping();
  $('#sumShip').textContent = ship ? util.money(ship) : 'مجاني';

  /* الكوبون */
  $('#couponBlock').innerHTML = window.JL.couponBoxHTML();
  const bd = coupons.breakdown(items);
  const dRow = $('#discountRow');
  if (bd.discount > 0) {
    dRow.classList.remove('hide');
    $('#sumCouponCode').textContent = bd.coupon.code;
    $('#sumDiscount').textContent = '− ' + util.money(bd.discount);
  } else {
    dRow.classList.add('hide');
  }
  $('#sumTotal').textContent = util.money(cart.total());

  window.JL.bindCouponBox($('#couponBlock'), render);

  $$('.cart-item', list).forEach((row, idx) => {
    const it = items[idx];
    const key = `${it.id}__${it.size || ''}__${it.color || ''}`;
    ON(row.querySelector('[data-inc]'), 'click', () => { cart.setQty(key, (it.qty || 1) + 1); render(); });
    ON(row.querySelector('[data-dec]'), 'click', () => { cart.setQty(key, (it.qty || 1) - 1); render(); });
    ON(row.querySelector('[data-remove]'), 'click', () => {
      cart.remove(key);
      toast('تم حذف القطعة من سلتك.');
      render();
    });
  });

  window.JL.revealWithin(list);
}

document.addEventListener('DOMContentLoaded', async () => {
  /* ⭐ نفس أسعار الشحن اللي في صفحة إتمام الطلب (من إعدادات الآدمن) */
  try { await settings.load(); } catch (_) {}
  const syncShip = () => cart.setShipFee(settings.shippingFee('normal', cart.subtotal()));
  syncShip();
  render();

  ON($('#goCheckout'), 'click', () => {
    if (!cart.get().length) return toast('سلتك فارغة', 'warn');
    location.href = 'checkout.html';
  });
  ON(document, 'jl:cart', () => { syncShip(); render(); });
  ON(document, 'jl:settings', () => { syncShip(); render(); });
});
