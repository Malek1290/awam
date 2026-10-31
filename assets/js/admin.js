/* ============================================================
   عوام AWAM — ADMIN PANEL (مخفي)
   • إضافة منتج + تعديل منتج موجود
   • عرض لفترة محدودة (كان بكذا والآن كذا)
   • كوبونات / خصومات (نسبة ٪ + اختيار المنتجات)
   • يظهر فقط لو وضع الآدمن مفعّل على المتصفح
   ============================================================ */
(() => {
  'use strict';
  const { CFG, $, $$, ON, util, sb, admin, products, toast, icons, normalize, settings, KINDS: K } = window.JL;

  if (!admin.isAdmin()) {
    document.addEventListener('jl:open-admin', () => {
      location.href = `index.html?admin=${encodeURIComponent(CFG.ADMIN_TOKEN)}`;
    });
    return;
  }

  /* ============================ Status ============================ */
  const state = {
    images: [],       // [{file?, url, existing?}]
    guide: null,
    sizes: new Set(),
    colors: [],
    soldSizes: new Set(),      // ⭐ مقاسات نفدت (بتفضل ظاهرة في الموقع بـ SOLD OUT)
    soldColors: new Set(),     // ⭐ ألوان نفدت
    soldOutAll: false,         // ⭐ المنتج كله نافد
    editingId: null,  // null = منتج جديد
    tab: 'new',
    productsCache: [],
    couponsCache: [],
    editingCouponId: null
  };

  const bootAdmin = () => {
    if (window.__JL_ADMIN_READY) return;
    injectUI();
    document.addEventListener('jl:open-admin', openSheet);
    window.__JL_ADMIN_READY = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootAdmin, { once: true });
  else bootAdmin();

  /* ============================ الواجهة ============================ */
  function injectUI() {
    const fab = document.createElement('button');
    fab.className = 'admin-fab on';
    fab.id = 'adminFab';
    fab.setAttribute('aria-label', 'لوحة التحكم — أدمن');
    fab.innerHTML = `${icons.admin}<span>لوحة التحكم</span>`;
    document.body.appendChild(fab);

    const sheet = document.createElement('aside');
    sheet.className = 'admin-sheet';
    sheet.id = 'adminSheet';
    sheet.innerHTML = `
      <div class="admin-head">
        <b>${util.esc(util.siteName())} أدمن <span class="tag en">ADMIN</span></b>
        <button class="icon-btn" id="adminClose" aria-label="إغلاق">${icons.close}</button>
      </div>
      <div class="admin-tabs" role="tablist" aria-label="لوحة التحكم">
        <button class="admin-tab is-on" role="tab" data-tab="new">منتج جديد</button>
        <button class="admin-tab" role="tab" data-tab="list">المنتجات</button>
        <button class="admin-tab" role="tab" data-tab="coupons">الكوبونات <span class="cnt" id="couponsCnt">0</span></button>
        <button class="admin-tab" role="tab" data-tab="orders">الطلبات</button>
        <button class="admin-tab" role="tab" data-tab="settings">الإعدادات</button>
      </div>

      <div class="admin-body" id="adminBody">

        <!-- ==================== منتج (جديد / تعديل) ==================== -->
        <div data-panel="new" style="display:grid;gap:14px">
          <div class="editing-banner hide" id="editBanner">
            <span>تعديل: <b id="editName">—</b></span>
            <button class="btn-mini" id="cancelEdit">إلغاء التعديل وابدأ منتج جديد</button>
          </div>

          <div class="admin-note">
            صور المنتج بتترفع على Supabase Storage → bucket <b class="en">${util.esc(CFG.BUCKET_PRODUCTS)}</b>${CFG.STORAGE_FOLDER ? ` / الفولدر <b class="en">${util.esc(CFG.STORAGE_FOLDER)}</b>` : ''}، بعدها الروابط وبيانات المنتج بتتحفظ في الجدول <b class="en">${util.esc(CFG.TABLE_ITEMS)}</b>.
          </div>

          <div class="field">
            <label>صور المنتج <span class="muted tiny">(أول صورة هي الرئيسية)</span></label>
            <div class="dropzone" id="dropProducts">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M12 16V4m0 0L8 8m4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>
              <span>اسحب الصور هنا أو انقر للاختيار</span>
              <small>JPG / PNG / WEBP — حتى ٦ صور</small>
            </div>
            <input type="file" id="fileProducts" accept="image/*" multiple hidden>
            <div class="preview-strip" id="previewProducts"></div>
          </div>

          <div class="form-grid">
            <div class="field"><label>اسم المنتج <span class="req">*</span></label><input class="input" id="fTitle" placeholder="مثال: عباية ندى"></div>
            <div class="field"><label>الاسم بالإنجليزي</label><input class="input en" id="fTitleEn" placeholder="NADA" dir="ltr"></div>
            <div class="field"><label>السعر الحالي <span class="req">*</span></label><input class="input" id="fPrice" type="number" min="0" step="50" placeholder="2200"></div>
            <div class="field"><label>السعر قبل الخصم (كان بـ)</label><input class="input" id="fOldPrice" type="number" min="0" step="50" placeholder="2600"></div>
            <div class="field"><label>القسم</label>
              <select class="select-full" id="fCategory">
                <option value="">— اختر —</option>
                ${util.categories().map(c => `<option value="${util.esc(c)}">${util.esc(c)}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>الخامة</label><input class="input" id="fFabric" placeholder="كريب مطفي"></div>
          </div>

          <!-- ============ عرض لفترة محدودة ============ -->
          <div class="field">
            <label>عرض لفترة محدودة</label>
            <div class="offer-toggle">
              <button type="button" class="sz is-on" data-offer="off">بدون عرض</button>
              <button type="button" class="sz" data-offer="on" style="gap:7px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3.1 1.9"/></svg>
                عرض محدود</button>
            </div>
            <div class="offer-fields hide" id="offerFields">
              <div class="admin-note" style="background:#fff">
                بيظهر للعميل: <b>كان بـ <span id="offerPreviewOld">—</span> والآن <span id="offerPreviewNew">—</span></b>
                + عدّاد تنازلي للوقت المتبقي.
              </div>
              <div class="form-grid">
                <div class="field">
                  <label>ينتهي العرض في <span class="req">*</span></label>
                  <input class="input" id="fOfferEnds" type="datetime-local">
                </div>
                <div class="field">
                  <label>وصف العرض (اختياري)</label>
                  <input class="input" id="fOfferLabel" placeholder="عرض موسمية · آخر ٤٨ ساعة">
                </div>
              </div>
              <p class="tiny muted" style="margin:0">السعر الأصلي لازم يكون أعلى من السعر الحالي. بعد انتهاء العرض، العميل بيشوف السعر الحالي بدون عدّاد.</p>
            </div>
          </div>

          <div class="field"><label>الوصف</label><textarea class="textarea" id="fDesc" placeholder="وصف قصير ومتكامل للمنتج…"></textarea></div>

          <div class="field">
            <label>المقاسات المتاحة <span class="muted tiny">(XS → 4XL + مقاس خاص)</span></label>
            <div class="sizes-check" id="sizesBox"></div>
            <p class="tiny muted" style="margin:8px 0 0">
              «${util.esc(CFG.CUSTOM_SIZE_LABEL || 'مقاس خاص')}» معناها إن العميل هيكتب رقم مقاسه بنفسه
              (${CFG.CUSTOM_SIZE_MIN || 30}–${CFG.CUSTOM_SIZE_MAX || 70}).
            </p>
            <input class="input mt-2" id="fCustomSize" placeholder="إضافة مقاس مخصص (Enter)">
          </div>

          <div class="field" id="soldSizesField">
            <label>المقاسات النافدة <span class="muted tiny">(بتفضل ظاهرة في الموقع ومكتوب عليها SOLD OUT)</span></label>
            <div class="sizes-check" id="soldSizesBox"><span class="tiny muted">اختاري المقاسات الأول…</span></div>
          </div>

          <div class="field">
            <label>الألوان</label>
            <div class="sizes-check" id="colorsBox">
              ${(CFG.DEFAULT_COLORS || []).map(c => `
                <button type="button" class="sz" data-color="${util.esc(c.name)}" data-hex="${util.esc(c.hex)}" style="gap:8px">
                  <i style="width:12px;height:12px;border-radius:50%;background:${util.esc(c.hex)};display:inline-block;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)"></i>${util.esc(c.name)}
                </button>`).join('')}
            </div>
            <div class="form-grid mt-2">
              <input class="input" id="fColorName" placeholder="اسم لون مخصص">
              <div style="display:flex;gap:8px">
                <input class="input" id="fColorHex" type="color" value="#C58C73" style="padding:4px;height:48px;width:64px">
                <button class="btn btn--ghost btn--sm" id="addColor" style="height:48px">إضافة</button>
              </div>
            </div>
          </div>

          <div class="field" id="soldColorsField">
            <label>الألوان النافدة <span class="muted tiny">(بتفضل ظاهرة في الموقع ومكتوب عليها SOLD OUT)</span></label>
            <div class="sizes-check" id="soldColorsBox"><span class="tiny muted">اختاري الألوان الأول…</span></div>
          </div>

          <div class="field">
            <label class="switch-line" style="display:flex;align-items:center;gap:10px;cursor:pointer">
              <input type="checkbox" id="fSoldOutAll" style="width:18px;height:18px;accent-color:var(--brand-primary)">
              <span>المنتج كله نافد <b class="tiny muted">(SOLD OUT)</b></span>
            </label>
          </div>

          <div class="field">
            <label>رابط دليل المقاسات <span class="muted tiny">(اختياري — لينك فقط، مفيش رفع صور)</span></label>
            <input class="input en" id="fGuideUrl" dir="ltr" inputmode="url" placeholder="https://…/size-chart.jpg">
            <p class="tiny muted" style="margin:6px 0 0">حط لينك صورة أو PDF لدليل المقاسات. مفيش رفع صور هنا.</p>
          </div>

          <div class="form-grid">
            <div class="field"><label>شارة (اختياري)</label><input class="input" id="fBadge" placeholder="جديد / آخر قطعة"></div>
            <div class="field"><label>ترتيب العرض</label><input class="input" id="fSort" type="number" value="0"></div>
          </div>

          <div class="progress hide" id="upProgress"><i></i></div>
          <button class="btn btn--block" id="saveProduct">نشر المنتج</button>
          <p class="tiny muted" id="adminMsg"></p>
        </div>

        <!-- ==================== المنتجات ==================== -->
        <div data-panel="list" class="hide">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <span class="tiny muted">اختاري «تعديل» على أي منتج لتحديث الصور أو السعر أو العرض</span>
            <button class="btn btn--ghost btn--sm" id="refreshList">تحديث</button>
          </div>
          <div class="field" style="margin-bottom:12px">
            <button class="btn btn--ghost btn--block" id="optimizeImages" type="button">⚡ تسريع الموقع — تحسين صور المنتجات (WebP)</button>
            <p class="tiny muted" style="margin:6px 0 0">بيعمل نسخة مصغّرة (WebP) من كل صورة كبيرة وبيستخدمها في الموقع. الصور الأصلية بتفضل زي ما هي في الـ bucket.</p>
            <p class="tiny muted" id="optMsg" style="margin:4px 0 0"></p>
          </div>
          <div class="admin-list" id="adminList"><div class="skeleton" style="height:56px"></div></div>
        </div>

        <!-- ==================== الكوبونات ==================== -->
        <div data-panel="coupons" class="hide">
          <div class="admin-note">
            العميل بيشوف خانة <b class="en">COUPON / DISCOUNT</b> في صفحتي السلة وإتمام الطلب.
            أعطي نسبة ٪ واختاري المنتجات اللي ينطبق عليها (أو سيبيها فاضية لكل المنتجات).
          </div>

          <div class="form-grid">
            <div class="field">
              <label>كود الخصم <span class="req">*</span></label>
              <input class="input en" id="cpCode" placeholder="EID2026" dir="ltr" style="text-transform:uppercase">
            </div>
            <div class="field">
              <label>نسبة الخصم ٪ <span class="req">*</span></label>
              <input class="input" id="cpPercent" type="number" min="1" max="100" step="1" placeholder="15">
            </div>
            <div class="field">
              <label>ينتهي في (اختياري)</label>
              <input class="input" id="cpEnds" type="datetime-local">
            </div>
            <div class="field">
              <label>الحالة</label>
              <select class="select-full" id="cpActive">
                <option value="1">مفعّل</option>
                <option value="0">متوقف</option>
              </select>
            </div>
          </div>

          <div class="field">
            <label style="display:flex;justify-content:space-between;align-items:center">
              <span>ينطبق على المنتجات دي</span>
              <button class="btn-mini" id="cpSelectAll" type="button">تحديد/إلغاء الكل</button>
            </label>
            <div class="coupon-products" id="cpProducts"><p class="tiny muted">جارٍ تحميل المنتجات…</p></div>
            <p class="tiny muted" id="cpScopeHint">مفيش منتجات محددة = الكوبون ينطبق على كل المنتجات.</p>
          </div>

          <button class="btn btn--block" id="cpSave">حفظ الكوبون</button>
          <button class="btn btn--ghost btn--block hide" id="cpCancelEdit">إلغاء التعديل</button>
          <p class="tiny muted" id="cpMsg"></p>

          <hr class="rule" style="margin-block:6px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span class="tiny muted">الكوبونات الحالية</span>
            <button class="btn btn--ghost btn--sm" id="cpRefresh">تحديث</button>
          </div>
          <div class="coupon-list" id="cpList"><div class="skeleton" style="height:64px"></div></div>
        </div>

        <!-- ==================== الطلبات ==================== -->
        <div data-panel="orders" class="hide">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <span class="tiny muted">آخر الطلبات المحفوظة في القاعدة</span>
            <button class="btn btn--ghost btn--sm" id="refreshOrders">تحديث</button>
          </div>
          <div class="admin-list" id="ordersList"></div>
        </div>

        <!-- ==================== الإعدادات ==================== -->
        <div data-panel="settings" class="hide" style="display:grid;gap:14px">
          <div class="admin-note">
            <b>الحالة:</b> وضع الآدمن مفعّل في هذا المتصفح.<br>
            الحالة محفوظة في <span class="en">localStorage</span> — مش هتحتاجي تكتبي الرمز تاني على الجهاز ده.
          </div>
          <div class="field">
            <label>الرابط السري (متشاركه)</label>
            <div style="display:flex;gap:8px">
              <input class="input en" id="secretLink" readonly dir="ltr">
              <button class="btn btn--ghost btn--sm" id="copySecret" style="height:48px">نسخ</button>
            </div>
          </div>
          <div class="admin-note" style="background:rgba(197,140,115,.12)">
            <b>⭐ أسعار الشحن (تظهر في صفحة إتمام الطلب)</b><br>
            أي تعديل هنا بيتحفظ وبيظهر فورًا للعميل في <span class="en">checkout</span>.
          </div>

          <div class="form-grid">
            <div class="field">
              <label>اسم طريقة الشحن الأولى</label>
              <input class="input" id="setShipLabelNormal" placeholder="الشحن العادي">
            </div>
            <div class="field">
              <label>سعرها (ج.م)</label>
              <input class="input" id="setShipFeeNormal" type="number" min="0" step="5" placeholder="100">
            </div>
            <div class="field">
              <label>اسم طريقة الشحن الثانية</label>
              <input class="input" id="setShipLabelRemote" placeholder="الشحن للمناطق النائية">
            </div>
            <div class="field">
              <label>سعرها (ج.م)</label>
              <input class="input" id="setShipFeeRemote" type="number" min="0" step="5" placeholder="150">
            </div>
            <div class="field">
              <label>شحن مجاني فوق مبلغ (ج.م)</label>
              <input class="input" id="setFreeOver" type="number" min="0" step="50" placeholder="0 = مقفول">
            </div>
            <div class="field">
              <label>&nbsp;</label>
              <label class="switch-line" style="display:flex;align-items:center;gap:10px;height:48px;cursor:pointer">
                <input type="checkbox" id="setFreeEnabled" style="width:18px;height:18px;accent-color:var(--brand-primary)">
                <span class="tiny">تفعيل الشحن المجاني</span>
              </label>
            </div>
          </div>

          <div class="field">
            <label>ملاحظة تظهر تحت الشحن (اختياري)</label>
            <input class="input" id="setShipNote" placeholder="التوصيل خلال ٣–٥ أيام عمل">
          </div>

          <div style="display:flex;gap:8px">
            <button class="btn btn--block" id="saveSettings">حفظ أسعار الشحن</button>
            <button class="btn btn--ghost btn--block" id="resetSettings" style="max-width:150px">الافتراضي</button>
          </div>
          <p class="tiny muted" id="settingsMsg"></p>

          <button class="btn btn--ghost btn--block" id="logoutAdmin">إيقاف وضع الآدمن في هذا المتصفح</button>
          <div class="admin-note">
            <b>كل حاجة في جدول واحد:</b> المنتجات والطلبات والكوبونات والإعدادات كلهم في جدول
            <b class="en">awam-data</b> (العمود <b class="en">kind</b> بيفرّق بينهم) — مفيش أي جدول مشترك مع موقع تاني.
            <br><br>
            <b>ملاحظة تقنية:</b> الحماية ٣ طبقات: رابط الرمز، دالة الآدمن في القاعدة، وسياسات RLS على
            الجدول والـ Storage. Supabase بترفض أي محاولة كتابة من زوار عاديين.
          </div>
        </div>
      </div>`;
    document.body.appendChild(sheet);

    /* ---------- أحداث ---------- */
    ON($('#adminFab'), 'click', openSheet);
    ON($('#adminClose'), 'click', closeSheet);
    $$('.admin-tab', sheet).forEach(t => ON(t, 'click', () => switchTab(t.dataset.tab)));
    switchTab(state.tab);

    ON($('#fileProducts'), 'change', e => addFiles(e.target.files));
    setupDrop($('#dropProducts'), files => addFiles(files), () => $('#fileProducts').click());

    /* مقاسات */
    renderSizeChips();
    ON($('#fCustomSize'), 'keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = e.target.value.trim(); if (!v) return;
      if (![...state.sizes].includes(v)) {
        state.sizes.add(v);
        renderSizeChips();
        const b = $(`#sizesBox .sz[data-size="${v.replace(/"/g, '\\"')}"]`);
        if (b) b.classList.add('is-on');
      }
      e.target.value = '';
    });
    ON($('#optimizeImages'), 'click', optimizeProductImages);

    /* ألوان */
    $$('#colorsBox .sz').forEach(b => ON(b, 'click', () => toggleColor(b)));
    ON($('#addColor'), 'click', () => {
      const name = $('#fColorName').value.trim();
      const hex = $('#fColorHex').value;
      if (!name) return toast('ادخلي اسم اللون.');
      if (state.colors.some(c => c.name === name)) return toast('اللون ده موجود بالفعل.');
      state.colors.push({ name, hex });
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'sz is-on';
      b.style.gap = '8px';
      b.dataset.color = name; b.dataset.hex = hex;
      b.innerHTML = `<i style="width:12px;height:12px;border-radius:50%;background:${util.esc(hex)};display:inline-block;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)"></i>${util.esc(name)}`;
      ON(b, 'click', () => toggleColor(b));
      $('#colorsBox').appendChild(b);
      $('#fColorName').value = '';
    });

    /* عرض محدود */
    $$('[data-offer]').forEach(b => ON(b, 'click', () => setOfferMode(b.dataset.offer === 'on')));
    ON($('#fOldPrice'), 'input', updateOfferPreview);
    ON($('#fPrice'), 'input', updateOfferPreview);

    /* حفظ / تعديل */
    ON($('#saveProduct'), 'click', saveProduct);
    ON($('#cancelEdit'), 'click', () => resetForm(true));
    ON($('#refreshList'), 'click', loadList);
    ON($('#refreshOrders'), 'click', loadOrders);

    /* الكوبونات */
    ON($('#cpSave'), 'click', saveCoupon);
    ON($('#cpRefresh'), 'click', loadCoupons);
    ON($('#cpSelectAll'), 'click', toggleAllCouponProducts);
    ON($('#cpProducts'), 'change', updateScopeHint);
    ON($('#cpCancelEdit'), 'click', resetCouponForm);

    /* ⭐ إعدادات الشحن */
    loadSettingsIntoForm();
    ON($('#saveSettings'), 'click', saveSettings);
    ON($('#resetSettings'), 'click', () => {
      settings.save(settings.defaults()).then(() => {
        loadSettingsIntoForm();
        toast('تم رجوع أسعار الشحن للافتراضي.', 'ok');
      });
    });

    ON($('#copySecret'), 'click', () => {
      const inp = $('#secretLink');
      inp.select();
      navigator.clipboard?.writeText(inp.value).then(() => toast('تم نسخ الرابط.', 'ok')).catch(() => {});
    });
    ON($('#logoutAdmin'), 'click', () => {
      admin.disable();
      toast('تم إيقاف وضع الآدمن.');
      setTimeout(() => location.reload(), 700);
    });

    $('#secretLink').value = `${location.origin}${location.pathname}?admin=${admin.token()}`;
  }

  /* ============================ إعدادات الشحن ============================ */
  async function loadSettingsIntoForm() {
    try { await settings.load(); } catch (_) {}
    const v = settings.all();
    if ($('#setShipLabelNormal')) $('#setShipLabelNormal').value = v.shipping_normal_label || '';
    if ($('#setShipFeeNormal')) $('#setShipFeeNormal').value = v.shipping_normal_fee ?? 0;
    if ($('#setShipLabelRemote')) $('#setShipLabelRemote').value = v.shipping_remote_label || '';
    if ($('#setShipFeeRemote')) $('#setShipFeeRemote').value = v.shipping_remote_fee ?? 0;
    if ($('#setFreeOver')) $('#setFreeOver').value = v.free_shipping_over ?? 0;
    if ($('#setFreeEnabled')) $('#setFreeEnabled').checked = !!v.free_shipping_enabled;
    if ($('#setShipNote')) $('#setShipNote').value = v.shipping_note || '';
  }

  async function saveSettings() {
    const btn = $('#saveSettings');
    const msg = $('#settingsMsg');
    const patch = {
      shipping_normal_label: ($('#setShipLabelNormal').value || '').trim() || 'الشحن العادي',
      shipping_normal_fee: Number($('#setShipFeeNormal').value) || 0,
      shipping_remote_label: ($('#setShipLabelRemote').value || '').trim() || 'الشحن للمناطق النائية',
      shipping_remote_fee: Number($('#setShipFeeRemote').value) || 0,
      free_shipping_over: Number($('#setFreeOver').value) || 0,
      free_shipping_enabled: $('#setFreeEnabled').checked,
      shipping_note: ($('#setShipNote').value || '').trim()
    };
    btn.disabled = true;
    try {
      const res = await settings.save(patch);
      if (res.savedRemote) {
        toast('تم حفظ أسعار الشحن — ظاهرة الآن في صفحة إتمام الطلب.', 'ok');
        if (msg) msg.textContent = '✓ محفوظ في قاعدة البيانات + المتصفح';
      } else {
        toast('تم الحفظ على هذا المتصفح. شغّل supabase-update-3-shop.sql للحفظ لكل الزوار.', 'warn');
        if (msg) msg.textContent = '⚠ محفوظ محليًا فقط — جدول settings مش موجود في Supabase';
      }
    } catch (e) {
      toast('تعذّر الحفظ: ' + e.message, 'warn');
    } finally {
      btn.disabled = false;
    }
  }

  function setupDrop(zone, onFiles, onClick) {
    if (!zone) return;
    ON(zone, 'click', onClick);
    ['dragenter', 'dragover'].forEach(ev => ON(zone, ev, e => { e.preventDefault(); zone.classList.add('is-drag'); }));
    ['dragleave', 'drop'].forEach(ev => ON(zone, ev, e => { e.preventDefault(); zone.classList.remove('is-drag'); }));
    ON(zone, 'drop', e => onFiles([...(e.dataTransfer?.files || [])]));
  }

  function openSheet() {
    $('#adminSheet')?.classList.add('is-open');
    document.body.classList.add('is-locked');
    if (state.tab === 'list') loadList();
    if (state.tab === 'coupons') loadCoupons();
    if (state.tab === 'orders') loadOrders();
  }
  function closeSheet() {
    $('#adminSheet')?.classList.remove('is-open');
    document.body.classList.remove('is-locked');
  }
  function switchTab(tab) {
    state.tab = tab;
    $$('.admin-tab', $('#adminSheet')).forEach(t => {
      const active = t.dataset.tab === tab;
      t.classList.toggle('is-on', active);
      t.setAttribute('aria-selected', String(active));
    });
    $$('#adminBody [data-panel]', $('#adminSheet')).forEach(p => {
      const active = p.dataset.panel === tab;
      p.classList.toggle('hide', !active);
      p.setAttribute('aria-hidden', String(!active));
      p.setAttribute('role', 'tabpanel');
    });
    if (tab === 'list') loadList();
    if (tab === 'coupons') { loadProductsIntoPicker(); loadCoupons(); }
    if (tab === 'orders') loadOrders();
  }

  /* ============================ الصور ============================ */
  function addFiles(files) {
    [...files].filter(f => f.type.startsWith('image/')).slice(0, 6 - state.images.length).forEach(f => {
      state.images.push({ file: f, url: URL.createObjectURL(f) });
    });
    renderPreviews();
  }
  function renderPreviews() {
    $('#previewProducts').innerHTML = state.images.map((im, i) =>
      `<img src="${im.url}" alt="صورة ${i + 1}" title="انقري للإزالة" data-rm="${i}">`).join('');
    $$('#previewProducts img').forEach(img => ON(img, 'click', () => {
      state.images.splice(+img.dataset.rm, 1); renderPreviews();
    }));
  }

  /* ============================ مقاسات/ألوان ============================ */
  /* ⭐ قائمة الشرائح = المقاسات الرسمية + أي مقاس قديم موجود على المنتج */
  function sizeList() {
    const base = (CFG.DEFAULT_SIZES || []).slice();
    const extra = [...state.sizes].filter(s => !base.some(b => b.toLowerCase() === String(s).toLowerCase()));
    return [...base, ...extra];
  }
  function renderSizeChips() {
    const box = $('#sizesBox');
    if (!box) return;
    box.innerHTML = sizeList().map(sz => {
      const on = state.sizes.has(sz);
      const custom = util.isCustomSize(sz);
      return `<button type="button" class="sz ${on ? 'is-on' : ''}" data-size="${util.esc(sz)}">${util.esc(custom ? (CFG.CUSTOM_SIZE_LABEL || sz) : sz)}</button>`;
    }).join('');
    $$('#sizesBox .sz').forEach(b => ON(b, 'click', () => toggleSize(b)));
    renderSoldBoxes();
  }

  /* ⭐ رسم قوائم «نافد» من المقاسات/الألوان المختارة */
  function renderSoldBoxes() {
    const sBox = $('#soldSizesBox');
    const cBox = $('#soldColorsBox');
    if (sBox) {
      const list = [...state.sizes];
      sBox.innerHTML = list.length
        ? list.map(sz => `<button type="button" class="sz ${state.soldSizes.has(sz) ? 'is-sold' : ''}" data-sold-size="${util.esc(sz)}">${util.esc(sz)}${state.soldSizes.has(sz) ? ' · SOLD OUT' : ''}</button>`).join('')
        : '<span class="tiny muted">اختاري المقاسات الأول…</span>';
      $$('#soldSizesBox .sz').forEach(b => ON(b, 'click', () => {
        const v = b.dataset.soldSize;
        if (state.soldSizes.has(v)) state.soldSizes.delete(v); else state.soldSizes.add(v);
        renderSoldBoxes();
      }));
    }
    if (cBox) {
      const list = state.colors.map(c => c.name);
      cBox.innerHTML = list.length
        ? list.map(name => `<button type="button" class="sz ${state.soldColors.has(name) ? 'is-sold' : ''}" data-sold-color="${util.esc(name)}">${util.esc(name)}${state.soldColors.has(name) ? ' · SOLD OUT' : ''}</button>`).join('')
        : '<span class="tiny muted">اختاري الألوان الأول…</span>';
      $$('#soldColorsBox .sz').forEach(b => ON(b, 'click', () => {
        const v = b.dataset.soldColor;
        if (state.soldColors.has(v)) state.soldColors.delete(v); else state.soldColors.add(v);
        renderSoldBoxes();
      }));
    }
  }

  function toggleSize(btn) {
    const s = btn.dataset.size || btn.textContent.trim();
    btn.dataset.size = s;
    if (state.sizes.has(s)) { state.sizes.delete(s); btn.classList.remove('is-on'); state.soldSizes.delete(s); }
    else { state.sizes.add(s); btn.classList.add('is-on'); }
    renderSoldBoxes();
  }
  function toggleColor(btn) {
    const name = btn.dataset.color;
    const i = state.colors.findIndex(c => c.name === name);
    if (i >= 0) { state.colors.splice(i, 1); btn.classList.remove('is-on'); state.soldColors.delete(name); }
    else { state.colors.push({ name, hex: btn.dataset.hex }); btn.classList.add('is-on'); }
    renderSoldBoxes();
  }

  /* ============================ عرض محدود ============================ */
  function setOfferMode(onMode) {
    $$('[data-offer]').forEach(b => b.classList.toggle('is-on', b.dataset.offer === (onMode ? 'on' : 'off')));
    $('#offerFields').classList.toggle('hide', !onMode);
    updateOfferPreview();
  }
  function isOfferOn() { return $('[data-offer="on"]').classList.contains('is-on'); }
  function updateOfferPreview() {
    const cur = Number($('#fPrice').value) || 0;
    const old = Number($('#fOldPrice').value) || 0;
    $('#offerPreviewOld').textContent = old ? util.money(old) : '—';
    $('#offerPreviewNew').textContent = cur ? util.money(cur) : '—';
  }

  /* ============================ حفظ منتج ============================ */
  async function saveProduct() {
    const msg = $('#adminMsg');
    const btn = $('#saveProduct');
    const title = $('#fTitle').value.trim();
    const price = Number($('#fPrice').value);
    const oldPrice = Number($('#fOldPrice').value) || null;
    const offerOn = isOfferOn();

    if (!title) { msg.textContent = 'اسم المنتج مطلوب.'; return toast('ادخلي اسم المنتج.', 'warn'); }
    if (!price) { msg.textContent = 'السعر مطلوب.'; return toast('ادخلي السعر.', 'warn'); }
    if (!state.images.length) { msg.textContent = 'صورة واحدة على الأقل مطلوبة.'; return toast('ارفقي صورة للمنتج.', 'warn'); }
    if (offerOn) {
      if (!oldPrice || oldPrice <= price) { msg.textContent = 'السعر الأصلي لازم يكون أعلى من السعر الحالي.'; return toast('تأكدي من أسعار العرض.', 'warn'); }
      if (!$('#fOfferEnds').value) { msg.textContent = 'حددي وقت انتهاء العرض.'; return toast('حددي وقت انتهاء العرض.', 'warn'); }
    }

    btn.disabled = true;
    msg.textContent = 'جارٍ رفع الصور…';
    $('#upProgress').classList.remove('hide');

    try {
      const urls = [];
      const toUpload = state.images.filter(im => !im.existing);
      let done = 0;
      for (const im of state.images) {
        if (im.existing) { urls.push(im.url); continue; }
        /* ⭐ تصغير الصورة قبل الرفع — أسرع بكثير على الموبايل */
        const small = await util.downscaleImage(im.file, { maxW: 1400, maxH: 1900, quality: 0.82 });
        const u = await sb.upload(CFG.BUCKET_PRODUCTS, small);
        urls.push(u);
        done++;
        $('#upProgress i').style.width = `${Math.round((done / Math.max(1, toUpload.length)) * 80)}%`;
      }

      let guideUrl = ($('#fGuideUrl') ? $('#fGuideUrl').value.trim() : '') || null;
      if (guideUrl && !/^https?:\/\//i.test(guideUrl)) {
        $('#upProgress').classList.add('hide');
        msg.textContent = 'رابط دليل المقاسات لازم يبدأ بـ http:// أو https://';
        return toast('رابط دليل المقاسات لازم يبدأ بـ http:// أو https://', 'warn');
      }

      $('#upProgress i').style.width = '92%';
      msg.textContent = state.editingId ? 'جارٍ حفظ التعديلات…' : 'جارٍ حفظ المنتج…';

      const row = {
        kind: K.PRODUCT,          // ⭐ كل حاجة في awam-data — ده صف منتج
        title,
        title_en: $('#fTitleEn').value.trim() || null,
        description: $('#fDesc').value.trim() || null,
        price,
        old_price: oldPrice,
        image_url: urls[0],
        images: urls,
        category: $('#fCategory').value || null,
        fabric: $('#fFabric').value.trim() || null,
        sizes: [...state.sizes],
        colors: state.colors,
        size_guide_url: guideUrl,
        badge: $('#fBadge').value.trim() || null,
        sort: Number($('#fSort').value) || 0,
        offer_ends_at: offerOn ? new Date($('#fOfferEnds').value).toISOString() : null,
        offer_label: offerOn ? ($('#fOfferLabel').value.trim() || null) : null,
        /* ⭐ نفاد المخزون */
        sold_sizes: [...state.soldSizes],
        sold_colors: [...state.soldColors],
        sold_out: $('#fSoldOutAll') ? $('#fSoldOutAll').checked : false
      };

      const save = async (payload) => state.editingId
        ? sb.items.update(state.editingId, payload)
        : sb.items.insert(payload);

      let saved;
      try {
        saved = await save(row);
      } catch (e1) {
        if (/sold_sizes|sold_colors|sold_out/i.test(e1.message)) {
          const fallback = { ...row };
          delete fallback.sold_sizes; delete fallback.sold_colors; delete fallback.sold_out;
          saved = await save(fallback);
          toast('تم الحفظ. شغّل supabase-update-3-shop.sql لتفعيل ميزة SOLD OUT على المقاسات/الألوان.', 'warn');
        } else if (/offer_ends_at|offer_label/i.test(e1.message)) {
          const fallback = { ...row };
          delete fallback.offer_ends_at; delete fallback.offer_label;
          saved = await save(fallback);
          toast('تم الحفظ. شغّل supabase-update-2.sql لوقع العروض المحدودة.', 'warn');
        } else if (/kind|42703|column .* does not exist/i.test(e1.message)) {
          /* الجدول لسه مفيهوش عمود kind — بنحفظ المنتج زي الأول */
          const fallback = { ...row };
          delete fallback.kind;
          saved = await save(fallback);
          toast('تم الحفظ. شغّل supabase-update-5-all-in-awam-data.sql لتوحيد البيانات في جدول awam-data.', 'warn');
        } else throw e1;
      }

      toast(state.editingId ? 'تم حفظ التعديلات.' : 'تم نشر المنتج.', 'ok');

      $('#upProgress i').style.width = '100%';
      msg.textContent = '✓ تم الحفظ بنجاح';
      products.invalidate();

      resetForm(false);
      loadList();
      setTimeout(() => { $('#upProgress').classList.add('hide'); $('#upProgress i').style.width = '0'; }, 1000);
    } catch (err) {
      console.error(err);
      msg.textContent = '✕ ' + err.message;
      toast('فشل الحفظ: ' + err.message, 'warn');
      $('#upProgress').classList.add('hide');
    } finally {
      btn.disabled = false;
    }
  }

  /* ============================ تعديل منتج ============================ */
  async function editProduct(id) {
    try {
      let row = state.productsCache.find(p => String(p.id) === String(id));
      if (!row) row = (await sb.items.select(`select=*&id=eq.${encodeURIComponent(id)}`))[0];
      if (!row) return toast('المنتج مش موجود.', 'warn');
      row = normalize(row);

      state.editingId = row.id;
      state.images = (row.images && row.images.length ? row.images : [row.image_url])
        .filter(Boolean).map(u => ({ url: u, existing: true }));
      state.guide = row.size_guide_url ? { url: row.size_guide_url } : null;
      if ($('#fGuideUrl')) $('#fGuideUrl').value = row.size_guide_url || '';
      state.colors = Array.isArray(row.colors) ? row.colors.slice() : [];
      state.soldSizes = new Set(Array.isArray(row.sold_sizes) ? row.sold_sizes : []);
      state.soldColors = new Set(Array.isArray(row.sold_colors) ? row.sold_colors : []);
      if ($('#fSoldOutAll')) $('#fSoldOutAll').checked = row.sold_out === true;

      $('#fTitle').value = row.title || '';
      $('#fTitleEn').value = row.title_en || '';
      $('#fPrice').value = row.price || '';
      $('#fOldPrice').value = row.old_price || '';
      /* لو القسم قديم/مش في القائمة، نضيفه كخيار عشان ما يتغيّرش بالغلط */
      const catSel = $('#fCategory');
      if (catSel) {
        const want = row.category || '';
        if (want && ![...catSel.options].some(o => o.value === want)) {
          const opt = document.createElement('option');
          opt.value = want; opt.textContent = want;
          catSel.appendChild(opt);
        }
        catSel.value = want;
      }
      $('#fFabric').value = row.fabric || '';
      $('#fDesc').value = row.description || '';
      $('#fBadge').value = row.badge || '';
      $('#fSort').value = row.sort || 0;

      state.sizes = new Set(row.sizes || []);
      renderSizeChips();

      $$('#colorsBox .sz').forEach(b => {
        b.classList.toggle('is-on', state.colors.some(c => c.name === b.dataset.color));
      });
      state.colors.forEach(c => {
        if (!$(`#colorsBox .sz[data-color="${c.name}"]`)) {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'sz is-on'; b.style.gap = '8px';
          b.dataset.color = c.name; b.dataset.hex = c.hex;
          b.innerHTML = `<i style="width:12px;height:12px;border-radius:50%;background:${util.esc(c.hex || '#EFECE6')};display:inline-block;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)"></i>${util.esc(c.name)}`;
          ON(b, 'click', () => toggleColor(b));
          $('#colorsBox').appendChild(b);
        }
      });

      const hasOffer = !!row.offer_ends_at;
      setOfferMode(hasOffer);
      if (hasOffer) {
        const d = new Date(row.offer_ends_at);
        const pad = n => String(n).padStart(2, '0');
        $('#fOfferEnds').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        $('#fOfferLabel').value = row.offer_label || '';
      } else {
        $('#fOfferEnds').value = '';
        $('#fOfferLabel').value = '';
      }

      $('#editBanner').classList.remove('hide');
      $('#editName').textContent = row.title || '—';
      $('#saveProduct').textContent = 'حفظ التعديلات';
      $('.admin-tab[data-tab="new"]').textContent = 'تعديل منتج';
      renderPreviews();
      renderSoldBoxes();
      updateOfferPreview();
      switchTab('new');
      $('#adminBody').scrollTop = 0;
      toast('تم تحميل المنتج للتعديل.', 'ok');
    } catch (e) {
      toast('تعذّر تحميل المنتج: ' + e.message, 'warn');
    }
  }

  function resetForm(notify) {
    state.editingId = null;
    state.images = []; state.guide = null; state.colors = []; state.sizes.clear();
    state.soldSizes.clear(); state.soldColors.clear();
    if ($('#fSoldOutAll')) $('#fSoldOutAll').checked = false;

    $$('#colorsBox .sz').forEach(b => b.classList.remove('is-on'));
    renderSizeChips();
    ['#fTitle', '#fTitleEn', '#fPrice', '#fOldPrice', '#fFabric', '#fDesc', '#fBadge', '#fOfferEnds', '#fOfferLabel', '#fGuideUrl']
      .forEach(s => { const el = $(s); if (el) el.value = ''; });
    $('#fSort').value = 0;
    $('#fCategory').value = '';
    setOfferMode(false);
    renderPreviews();
    renderSoldBoxes();
    updateOfferPreview();

    $('#editBanner').classList.add('hide');
    $('#saveProduct').textContent = 'نشر المنتج';
    $('.admin-tab[data-tab="new"]').textContent = 'منتج جديد';
    $('#adminMsg').textContent = '';
    if (notify) toast('تم إلغاء التعديل.');
  }

  /* ============================ تسريع صور المنتجات ============================ */
  /* بياخد كل صورة كبيرة على Supabase، يعمل منها نسخة WebP مصغّرة، يرفعها،
     ويحدّث المنتج. الصور الأصلية بتفضل موجودة — مفيش أي حذف. */
  async function optimizeProductImages() {
    const btn = $('#optimizeImages');
    const msg = $('#optMsg');
    const say = t => { if (msg) msg.textContent = t; };
    if (!confirm('هنعمل نسخة مصغّرة (WebP) من صور المنتجات الكبيرة وبنستخدمها في الموقع.\nالصور الأصلية هتفضل في الـ bucket زي ما هي.\n\nنكمل؟')) return;

    btn.disabled = true;
    let saved = 0, skipped = 0, failed = 0, changedProducts = 0;
    try {
      const rows = await sb.kind.select(K.PRODUCT, 'order=created_at.desc');
      const list = (rows || []).map(normalize);
      say(`جارٍ الفحص… 0/${list.length}`);
      for (let idx = 0; idx < list.length; idx++) {
        const p = list[idx];
        const imgs = (p.images && p.images.length ? p.images : [p.image_url]).filter(Boolean);
        const next = [];
        let changed = false;
        for (const src of imgs) {
          if (!/^https?:\/\//i.test(src)) { next.push(src); continue; }       // صور الموقع المحلية — منسّقة أصلًا
          if (/-opt1\.webp(\?|$)/i.test(src)) { next.push(src); continue; }    // متحسّنة قبل كده
          try {
            const res = await fetch(src, { mode: 'cors', cache: 'force-cache' });
            if (!res.ok) throw new Error('fetch');
            const blob = await res.blob();
            if (blob.size < 150 * 1024) { next.push(src); skipped++; continue; }
            const file = new File([blob], 'source.jpg', { type: blob.type || 'image/jpeg' });
            const small = await util.downscaleImage(file, { maxW: 1200, maxH: 1600, quality: 0.8 });
            if (!small || !small.size || small.size >= blob.size * 0.9) { next.push(src); skipped++; continue; }
            const up = await sb.upload(CFG.BUCKET_PRODUCTS, small);
            next.push(up);
            saved += Math.max(0, blob.size - small.size);
            changed = true;
          } catch (e) {
            failed++;
            next.push(src);
          }
        }
        if (changed) {
          try {
            await sb.items.update(p.id, { image_url: next[0], images: next });
            changedProducts++;
          } catch (e) { failed++; }
        }
        if ((idx + 1) % 2 === 0 || idx === list.length - 1) {
          say(`جارٍ التحسين… ${idx + 1}/${list.length} · اتوفّر ${Math.round(saved / 1024)} كيلوبايت`);
        }
      }
      products.invalidate();
      say(`✓ خلصنا: ${changedProducts} منتج اتحدّث · اتوفّر ${Math.round(saved / 1024)} كيلوبايت · اتشال ${skipped} صورة صغيرة أصلًا · ${failed} صورة اتخطّت.`);
      toast('تم تحسين صور المنتجات — الموقع بقى أخف على الموبايل.', 'ok');
      loadList();
    } catch (e) {
      say('✕ ' + e.message);
      toast('تعذّر تحسين الصور: ' + e.message, 'warn');
    } finally {
      btn.disabled = false;
    }
  }

  /* ============================ قائمة المنتجات ============================ */
  async function loadList() {
    const box = $('#adminList');
    box.innerHTML = '<div class="skeleton" style="height:56px"></div>';
    try {
      const rows = await sb.kind.select(K.PRODUCT, 'order=created_at.desc');
      state.productsCache = (rows || []).map(normalize);
      if (!rows?.length) { box.innerHTML = '<p class="tiny muted">مفيش منتجات في القاعدة بعد.</p>'; return; }
      box.innerHTML = rows.map(r => {
        const n = normalize(r);
        return `<div class="admin-row">
          <img src="${util.img(n.image_url, true)}" alt="" loading="lazy" decoding="async" width="44" height="52">
          <div class="meta"><b>${util.esc(n.title)}</b><span>${util.esc(n.category || '')}${n.category && n.fabric ? ' · ' : ''}${util.esc(n.fabric || '')}</span><span>${util.money(n.price)}${n.old_price ? ' · كان ' + util.money(n.old_price) : ''}</span></div>
          <div class="acts">
            <button class="btn-mini" data-edit="${util.esc(n.id)}">تعديل</button>
            <button class="btn-mini" data-del="${util.esc(n.id)}">حذف</button>
          </div>
        </div>`;
      }).join('');
      $$('#adminList [data-edit]').forEach(b => ON(b, 'click', () => editProduct(b.dataset.edit)));
      $$('#adminList [data-del]').forEach(b => ON(b, 'click', async () => {
        if (!confirm('حاولي تحذفي المنتج ده؟')) return;
        try { await sb.items.remove(b.dataset.del); toast('تم حذف المنتج.', 'ok'); products.invalidate(); loadList(); }
        catch (e) { toast('فشل الحذف: ' + e.message, 'warn'); }
      }));
    } catch (e) {
      box.innerHTML = `<p class="tiny muted" style="color:var(--color-sale)">تعذّر تحميل المنتجات: ${util.esc(e.message)}</p>`;
    }
  }

  /* ============================ الطلبات ============================ */
  async function loadOrders() {
    const box = $('#ordersList');
    box.innerHTML = '<div class="skeleton" style="height:56px"></div>';
    try {
      /* ⭐ الطلبات بقت جوه awam-data (kind = order) */
      const rows = await sb.kind.select(K.ORDER, 'order=created_at.desc&limit=50');
      if (!rows?.length) { box.innerHTML = '<p class="tiny muted">مفيش طلبات بعد. (الطلبات بتتحفظ في جدول awam-data — شغّل supabase-update-5-all-in-awam-data.sql لو لسه مش مسغّل)</p>'; return; }
      box.innerHTML = rows.map(o => {
        const items = Array.isArray(o.items) ? o.items : [];
        return `<div class="order-row">
          <div class="o-head"><b>${util.esc(o.code || '—')}</b><span>${util.esc(o.customer_name || '')} · ${util.esc(o.phone || '')}</span></div>
          <div class="o-items">${items.map(i => util.esc((i.title || '') + (i.size ? ' — ' + i.size : '') + (i.color ? ' / ' + i.color : '') + ' ×' + (i.qty || 1))).join('<br>')}</div>
          <div class="o-items">الإجمالي: <b style="color:var(--brand-hover)">${util.money(o.total || 0)}</b> · ${util.esc(o.payment_method || '')}</div>
        </div>`;
      }).join('');
    } catch (e) {
      box.innerHTML = `<p class="tiny muted" style="color:var(--color-sale)">تعذّر تحميل الطلبات: ${util.esc(e.message)}</p>`;
    }
  }

  /* ============================ الكوبونات ============================ */
  async function loadProductsIntoPicker() {
    const box = $('#cpProducts');
    try {
      const rows = await sb.kind.select(K.PRODUCT, 'order=title.asc', { select: 'id,title' });
      state.productsCache = (rows || []).map(normalize);
      if (!rows?.length) { box.innerHTML = '<p class="tiny muted">مفيش منتجات.</p>'; return; }
      box.innerHTML = rows.map(r => `<label><input type="checkbox" data-cp-id="${util.esc(r.id)}"> ${util.esc(r.title)}</label>`).join('');
      updateScopeHint();
    } catch (e) {
      box.innerHTML = '<p class="tiny muted">تعذّر التحميل.</p>';
    }
  }

  function toggleAllCouponProducts() {
    const boxes = $$('[data-cp-id]');
    const allOn = boxes.length && boxes.every(b => b.checked);
    boxes.forEach(b => b.checked = !allOn);
    updateScopeHint();
  }

  function updateScopeHint() {
    const n = $$('[data-cp-id]:checked').length;
    $('#cpScopeHint').textContent = n
      ? `${n} منتج محدد = الكوبون ينطبق على المنتجات دي بس.`
      : 'مفيش منتجات محددة = الكوبون ينطبق على كل المنتجات.';
  }

  async function loadCoupons() {
    const box = $('#cpList');
    const cnt = $('#couponsCnt');
    box.innerHTML = '<div class="skeleton" style="height:64px"></div>';
    try {
      /* ⭐ الكوبونات بقت جوه awam-data (kind = coupon) */
      const rows = await sb.kind.select(K.COUPON, 'order=created_at.desc');
      state.couponsCache = rows || [];
      cnt.textContent = state.couponsCache.length;
      if (!rows?.length) { box.innerHTML = '<p class="tiny muted">مفيش كوبونات بعد. (الكوبونات بتتحفظ في awam-data — شغّل supabase-update-5-all-in-awam-data.sql)</p>'; return; }
      box.innerHTML = rows.map(c => `
        <div class="coupon-row">
          <div>
            <span class="en">${util.esc(c.code)}</span> · خصم ${Number(c.percent)}٪
            ${c.active ? '' : ' · <span style="color:var(--muted)">متوقف</span>'}
          </div>
          <div class="acts">
            <button class="btn-mini" data-cp-edit="${util.esc(c.id)}">تعديل</button>
            <button class="btn-mini" data-cp-del="${util.esc(c.id)}">حذف</button>
          </div>
        </div>`).join('');
      $$('#cpList [data-cp-edit]').forEach(b => ON(b, 'click', () => editCoupon(b.dataset.cpEdit)));
      $$('#cpList [data-cp-del]').forEach(b => ON(b, 'click', async () => {
        if (!confirm('حاولي تحذفي الكوبون ده؟')) return;
        try { await sb.items.remove(b.dataset.cpDel); toast('تم حذف الكوبون.', 'ok'); loadCoupons(); }
        catch (e) { toast('فشل الحذف: ' + e.message, 'warn'); }
      }));
    } catch (e) {
      box.innerHTML = `<p class="tiny muted" style="color:var(--color-sale)">تعذّر تحميل الكوبونات: ${util.esc(e.message)}</p>`;
    }
  }

  function editCoupon(id) {
    const c = state.couponsCache.find(x => String(x.id) === String(id));
    if (!c) return;
    $('#cpCode').value = c.code || '';
    $('#cpPercent').value = c.percent ?? '';
    $('#cpEnds').value = c.ends_at ? new Date(c.ends_at).toISOString().slice(0, 16) : '';
    $('#cpActive').value = c.active ? '1' : '0';
    $('#cpProducts').querySelectorAll('[data-cp-id]').forEach(b => {
      b.checked = Array.isArray(c.product_ids) && c.product_ids.includes(b.dataset.cpId);
    });
    updateScopeHint();
    state.editingCouponId = c.id;
    $('#cpCancelEdit').classList.remove('hide');
    $('#cpMsg').textContent = 'تعديل الكوبون…';
  }

  function resetCouponForm() {
    $('#cpCode').value = '';
    $('#cpPercent').value = '';
    $('#cpEnds').value = '';
    $('#cpActive').value = '1';
    $('#cpProducts').querySelectorAll('[data-cp-id]').forEach(b => b.checked = false);
    updateScopeHint();
    state.editingCouponId = null;
    $('#cpCancelEdit').classList.add('hide');
    $('#cpMsg').textContent = '';
  }

  async function saveCoupon() {
    const msg = $('#cpMsg');
    const code = $('#cpCode').value.trim();
    const percent = Number($('#cpPercent').value);
    if (!code) { msg.textContent = 'كود الخصم مطلوب.'; return; }
    if (!percent || percent < 1 || percent > 100) { msg.textContent = 'نسبة خصم بين ١ و١٠٠ ٪ مطلوبة.'; return; }

    const ids = $$('[data-cp-id]:checked').map(b => b.dataset.cpId);
    const endsAt = $('#cpEnds').value ? new Date($('#cpEnds').value).toISOString() : null;

    try {
      const row = {
        kind: K.COUPON,           // ⭐ صف كوبون جوه awam-data
        code,
        percent,
        active: $('#cpActive').value === '1',
        product_ids: ids,
        starts_at: new Date().toISOString(),
        ends_at: endsAt
      };
      /* حفظ جديد أو تعديل حسب الكود الموجود */
      const existing = state.couponsCache.find(x => String(x.code).toUpperCase() === code.toUpperCase());
      const editId = state.editingCouponId || (existing ? existing.id : '');
      if (editId) {
        await sb.items.update(editId, row);
      } else {
        await sb.items.insert(row);
      }
      toast('تم حفظ الكوبون.', 'ok');
      $('#cpMsg').textContent = '✓ تم الحفظ';
      $('#cpCancelEdit').classList.add('hide');
      loadCoupons();
    } catch (e) {
      const hint = /kind|42703|column .* does not exist/i.test(e.message)
        ? 'شغّل supabase-update-5-all-in-awam-data.sql في Supabase الأول عشان الكوبونات تتحفظ في awam-data.'
        : e.message;
      msg.textContent = '✕ ' + hint;
      toast('فشل الحفظ: ' + hint, 'warn');
    }
  }
})();
