/* ============================================================
   عوام AWAM — CORE (ES6+)
   Supabase · Admin · Cart · Products · UI helpers
   لا حاجة لتعديل أي شيء هنا — كل الإعدادات في config.js
   ============================================================ */
(() => {
  'use strict';

  const CFG = window.JL_CONFIG || {};
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ON = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);

  /* ==========================================================
     0) أدوات عامة
     ========================================================== */
  const util = {
    esc(str = '') {
      return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    money(n) {
      const v = Number(n) || 0;
      const str = v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
      return str + ' ' + (CFG.CURRENCY || 'ج.م');
    },
    moneyAr(n) {
      const v = Number(n) || 0;
      const str = v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
      return str.replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[+d]) + ' ' + (CFG.CURRENCY || 'ج.م');
    },
    uid() {
      return 'ORD-' + Date.now().toString().slice(-6) + '-' + Math.random().toString(36).slice(2, 5).toUpperCase();
    },
    debounce(fn, t = 180) {
      let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), t); };
    },
    params() { return new URLSearchParams(location.search); },

    /* ---------- هوية الموقع ---------- */
    siteName() { return CFG.SITE_NAME || 'عوام الدلنجات'; },
    siteShort() { return CFG.SITE_NAME_SHORT || 'عوام'; },
    siteSuffix() { return CFG.SITE_SUFFIX || 'الدلنجات'; },

    /* ---------- الأقسام ---------- */
    /** اسم القسم النهائي — بيمرّ على خريطة الأسماء القديمة (دلنجات → درسات …) */
    category(name) {
      const raw = String(name == null ? '' : name).trim();
      if (!raw) return '';
      const map = CFG.CATEGORY_ALIASES || {};
      return map[raw] || map[raw.toLowerCase()] || raw;
    },
    /** قائمة الأقسام الرسمية (من غير تكرار) */
    categories() {
      const list = (CFG.CATEGORIES || []).map(c => String(c).trim()).filter(Boolean);
      return [...new Set(list)];
    },

    /* ---------- المقاس الخاص ---------- */
    isCustomSize(size) {
      const s = String(size == null ? '' : size).trim().toLowerCase();
      if (!s) return false;
      const list = (CFG.CUSTOM_SIZE_ALIASES || ['مقاس خاص']).map(x => String(x).toLowerCase());
      return list.includes(s) || s.startsWith('مقاس خاص') || s.startsWith('مقاس مخصص');
    },
    /** «مقاس خاص» + 42 → «مقاس خاص · 42» */
    composeSize(size, value) {
      const base = String(size == null ? '' : size).trim();
      if (!this.isCustomSize(base)) return base;
      const v = String(value == null ? '' : value).trim();
      const label = CFG.CUSTOM_SIZE_LABEL || 'مقاس خاص';
      return v ? `${label} · ${v}` : label;
    },
    /** رقم مقاس صالح؟ (30 – 70 افتراضيًا) */
    validCustomSize(value) {
      const v = String(value == null ? '' : value).trim();
      if (!/^\d{2,3}(\.\d)?$/.test(v)) return false;
      const n = Number(v);
      return n >= Number(CFG.CUSTOM_SIZE_MIN || 30) && n <= Number(CFG.CUSTOM_SIZE_MAX || 70);
    },
    /** نص المقاس كما يظهر للعميل */
    sizeText(size) {
      const s = String(size == null ? '' : size).trim();
      if (!s) return '';
      return this.isCustomSize(s) ? s : s;
    },

    /**
     * ⭐ تصغير صورة قبل الرفع (أداء الموبايل)
     * بيرجّع File/Blob جديد بـ WebP بعرض أقصى maxW، ولو المتصفح مش داعم بيرجّع الأصل.
     */
    async downscaleImage(file, { maxW = 1400, maxH = 1900, quality = 0.82 } = {}) {
      try {
        if (!file || !/^image\//i.test(file.type) || /image\/gif|image\/svg/i.test(file.type)) return file;
        if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') {
          return await this._canvasDownscale(file, { maxW, maxH, quality });
        }
        const bmp = await createImageBitmap(file);
        const scale = Math.min(1, maxW / bmp.width, maxH / bmp.height);
        if (scale >= 0.999 && file.size <= 240 * 1024) { bmp.close && bmp.close(); return file; }
        const w = Math.max(1, Math.round(bmp.width * scale));
        const h = Math.max(1, Math.round(bmp.height * scale));
        const canvas = new OffscreenCanvas(w, h);
        canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
        bmp.close && bmp.close();
        const blob = await canvas.convertToBlob({ type: 'image/webp', quality });
        if (!blob || blob.size >= file.size) return file;
        const name = String(file.name || 'image').replace(/\.[^.]+$/, '') + '.webp';
        return new File([blob], name, { type: 'image/webp', lastModified: Date.now() });
      } catch (_) { return file; }
    },
    async _canvasDownscale(file, { maxW, maxH, quality }) {
      /* لو المتصفح اتأخر في فك الصورة، بنرفع الأصل — مفيش انتظار لانهائي */
      const guard = new Promise(res => setTimeout(() => res(file), 2500));
      const work = await Promise.race([this._decodeAndScale(file, { maxW, maxH, quality }), guard]);
      return work || file;
    },
    async _decodeAndScale(file, { maxW, maxH, quality }) {
      return await new Promise(resolve => {
        try {
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.onload = () => {
            try {
              const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
              const w = Math.max(1, Math.round(img.naturalWidth * scale));
              const h = Math.max(1, Math.round(img.naturalHeight * scale));
              const c = document.createElement('canvas');
              c.width = w; c.height = h;
              c.getContext('2d').drawImage(img, 0, 0, w, h);
              c.toBlob(blob => {
                URL.revokeObjectURL(url);
                if (!blob || blob.size >= file.size) return resolve(file);
                resolve(new File([blob], String(file.name || 'image').replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' }));
              }, 'image/webp', quality);
            } catch (_) { URL.revokeObjectURL(url); resolve(file); }
          };
          img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
          img.src = url;
        } catch (_) { resolve(file); }
      });
    },
    img(url, small) {
      if (!url) url = 'assets/img/products/abaya-1.jpg';
      if (!/^assets\/img\/[^/]+/i.test(url)) return url;
      // Local catalog images: thumbnails serve WebP derivatives when available.
      if (small && /assets\/img\/products\//i.test(url)) {
        const base = url.replace(/^assets\/img\/products\//i, 'assets/img/thumbs/').replace(/\.(jpg|jpeg|png|webp)$/i, '.webp');
        // thumbs only exist for the demo catalog — fall back to the original if missing
        return base;
      }
      return url;
    }
  };

  /* ==========================================================
     1) Supabase — عميل خفيف مبني على fetch
     ========================================================== */
  const sb = {
    url: (CFG.SUPABASE_URL || '').replace(/\/$/, ''),
    key: CFG.SUPABASE_KEY || '',

    headers(extra = {}) {
      const h = {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
        ...extra
      };
      // رمز الآدمن يتبعت فقط لو الوضع أدمن مفعّل في المتصفح
      if (admin.isAdmin()) h['x-jl-admin'] = admin.token();
      return h;
    },

    async req(path, { method = 'GET', body, headers, raw = false } = {}) {
      if (!this.url || !this.key) throw new Error('Supabase configuration is missing');
      const res = await fetch(`${this.url}${path}`, {
        method,
        headers: this.headers(headers),
        body: body ? JSON.stringify(body) : undefined
      });
      if (!res.ok) {
        let msg = res.status + ' ' + res.statusText;
        try { const j = await res.json(); msg = j.message || j.error || msg; } catch (_) {}
        throw new Error(msg);
      }
      if (raw) return res;
      const txt = await res.text();
      return txt ? JSON.parse(txt) : null;
    },

    select(table, query = 'select=*') {
      return this.req(`/rest/v1/${table}?${query}`);
    },
    insert(table, rows) {
      return this.req(`/rest/v1/${table}`, { method: 'POST', body: rows, headers: { Prefer: 'return=representation' } });
    },
    update(table, id, patch) {
      return this.req(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', body: patch, headers: { Prefer: 'return=representation' }
      });
    },
    /* ⭐ إعدادات المتجر — صف واحد في awam-data (kind = setting, key = shipping) */
    async settingsUpsert(patch) {
      if (!patch || !Object.keys(patch).length) return true;
      const table = CFG.TABLE_ITEMS || 'awam-data';
      try {
        return await this.req(`/rest/v1/${table}?on_conflict=kind,key`, {
          method: 'POST',
          body: [{ kind: (CFG.KINDS && CFG.KINDS.SETTING) || 'setting', key: 'shipping', value: patch }],
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }
        });
      } catch (e) {
        /* ⛔ مفيش كتابة في أي جدول تاني — الإعدادات بتتحفظ محليًا وتتبعت
           لـ awam-data في أول مرة يشتغل فيها */
        if (CFG.ALLOW_LEGACY_TABLES !== true || !CFG.LEGACY_SETTINGS_TABLE) throw e;
        return await this.req(`/rest/v1/${CFG.LEGACY_SETTINGS_TABLE}?on_conflict=key`, {
          method: 'POST',
          body: [{ key: 'shipping', value: patch }],
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }
        });
      }
    },

    remove(table, id) {
      return this.req(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    },

    /* رفع ملف واحد على مسار محدد داخل bucket */
    async putObject(bucket, path, file) {
      const res = await fetch(`${this.url}/storage/v1/object/${bucket}/${path}`, {
        method: 'POST',
        headers: {
          apikey: this.key,
          Authorization: `Bearer ${this.key}`,
          'Content-Type': file.type || 'image/jpeg',
          'x-upsert': 'false',
          ...(admin.isAdmin() ? { 'x-jl-admin': admin.token() } : {})
        },
        body: file
      });
      if (res.ok) return { ok: true, status: res.status };
      let msg = 'Image upload failed';
      try { const j = await res.json(); msg = j.message || j.error || msg; } catch (_) {}
      return { ok: false, status: res.status, msg };
    },

    /* ⭐ رفع صورة → الـ bucket المحدد (افتراضيًا CFG.BUCKET_PRODUCTS = awam) */
    async upload(bucket, file, onProgress = null, folder = CFG.STORAGE_FOLDER) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const name = CFG.STORAGE_MONTH_FOLDERS === false ? stamp : `${new Date().toISOString().slice(0, 7)}/${stamp}`;
      const clean = String(folder || '').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
      const withFolder = clean ? `${clean}/${name}` : name;

      const targets = [{ bucket, path: withFolder }];
      const alt = CFG.STORAGE_FALLBACK_BUCKET;
      if (clean && alt && alt !== bucket) targets.push({ bucket: alt, path: name });

      let last = null;
      for (const t of targets) {
        const r = await this.putObject(t.bucket, t.path, file);
        if (r.ok) {
          if (onProgress) onProgress(100);
          return this.publicUrl(t.bucket, t.path);
        }
        last = r;
        if (r.status === 401 || r.status === 403) break;
      }
      throw new Error((last && last.msg) || 'Image upload failed');
    },
    publicUrl(bucket, path) {
      return `${this.url}/storage/v1/object/public/${bucket}/${path}`;
    }
  };

  /* ==========================================================
     ١.ب) جدول المنتجات — awam-data (مع اسم بديل آمن awam_data)
     ========================================================== */
  const itemsTable = {
    _ok: null,
    names() {
      return [CFG.TABLE_ITEMS, CFG.TABLE_ITEMS_FALLBACK].filter(Boolean);
    },
    isNotFound(err) {
      return /PGRST205|42P01|does not exist|could not find the table|relation .* does not exist|schema cache|404/i
        .test(String(err && err.message || ''));
    },
    async run(fn) {
      if (this._ok) { try { return await fn(this._ok); } catch (e) { if (!this.isNotFound(e)) throw e; this._ok = null; } }
      let lastErr;
      for (const name of this.names()) {
        try {
          const res = await fn(name);
          this._ok = name;
          return res;
        } catch (e) {
          lastErr = e;
          if (!this.isNotFound(e)) throw e;
        }
      }
      throw lastErr;
    },
    table() { return this._ok || CFG.TABLE_ITEMS; }
  };

  sb.items = {
    select: (query = 'select=*') => itemsTable.run(t => sb.select(t, query)),
    insert: rows => itemsTable.run(t => sb.insert(t, rows)),
    update: (id, patch) => itemsTable.run(t => sb.update(t, id, patch)),
    remove: id => itemsTable.run(t => sb.remove(t, id))
  };
  sb.itemsTable = itemsTable;

  /* ==========================================================
     ⭐ كل البيانات في جدول واحد (awam-data)
     ----------------------------------------------------------
     العمود kind بيفرّق بين:
        product | order | coupon | setting
     قبل تشغيل supabase-update-5-all-in-awam-data.sql العمود مش
     موجود — في الحالة دي بنقرا الجدول كله ونفلتر على العميل
     (والمنتجات القديمة kind = null فبتتحسب منتجات).
     ========================================================== */
  const K = CFG.KINDS || { PRODUCT: 'product', ORDER: 'order', COUPON: 'coupon', SETTING: 'setting' };

  const kindStore = {
    _noKind: false,        // true = الجدول لسه مفيهوش عمود kind
    isMissingKind(err) {
      const m = String((err && err.message) || '');
      return /42703|PGRST204|column .*kind.* does not exist|'kind' column|schema cache/i.test(m);
    },
    /** قراءة صفوف نوع معيّن من awam-data */
    async select(kind, params = '', { select = '*' } = {}) {
      if (!this._noKind) {
        try {
          const q = `select=${select}&kind=eq.${encodeURIComponent(kind)}${params ? '&' + params : ''}`;
          const rows = (await sb.items.select(q)) || [];
          /* لو الطلب طلب أعمدة معيّنة (من غير kind) الفلترة حصلت على السيرفر */
          const hasKind = rows.some(r => r && Object.prototype.hasOwnProperty.call(r, 'kind'));
          return hasKind ? rows.filter(r => String(r.kind || '') === String(kind)) : rows;
        } catch (e) {
          if (!this.isMissingKind(e)) throw e;
          this._noKind = true;
        }
      }
      /* وضع ما قبل الـ SQL: الجدول كله من غير kind — وكل صفوفه منتجات */
      const rows = (await sb.items.select(`select=${select}${params ? '&' + params : ''}`)) || [];
      if (kind === K.PRODUCT) return rows.filter(r => !r.kind || String(r.kind) === String(K.PRODUCT));
      return rows.filter(r => String(r.kind || '') === String(kind));
    },
    /** إضافة صف */
    insert(kind, row) { return sb.items.insert({ ...row, kind }); },
    update(id, patch) { return sb.items.update(id, patch); },
    remove(id) { return sb.items.remove(id); }
  };
  sb.kind = kindStore;
  sb.KINDS = K;

  /* ==========================================================
     2) نظام حماية الآدمن (Token + localStorage)
     ========================================================== */
  const admin = {
    /** كل الرموز المقبولة (ADMIN_TOKENS + ADMIN_TOKEN للتوافق القديم) */
    tokens() {
      const list = Array.isArray(CFG.ADMIN_TOKENS) ? CFG.ADMIN_TOKENS.slice() : [];
      if (CFG.ADMIN_TOKEN && !list.includes(CFG.ADMIN_TOKEN)) list.push(CFG.ADMIN_TOKEN);
      return list.filter(Boolean);
    },
    isAdmin() {
      try { return localStorage.getItem(CFG.ADMIN_STORAGE_KEY) === 'granted'; }
      catch (_) { return false; }
    },
    /** الرمز الفعّال اللي اتحفظ — بيتبعت في هيدر x-jl-admin */
    token() {
      try { return localStorage.getItem(CFG.ADMIN_STORAGE_KEY + '_tok') || CFG.ADMIN_TOKEN || ''; }
      catch (_) { return CFG.ADMIN_TOKEN || ''; }
    },
    enable(token) {
      const ok = token && this.tokens().includes(token);
      if (ok) {
        try {
          localStorage.setItem(CFG.ADMIN_STORAGE_KEY, 'granted');
          localStorage.setItem(CFG.ADMIN_STORAGE_KEY + '_tok', token);
        } catch (_) {}
        return true;
      }
      return false;
    },
    disable() {
      try {
        localStorage.removeItem(CFG.ADMIN_STORAGE_KEY);
        localStorage.removeItem(CFG.ADMIN_STORAGE_KEY + '_tok');
      } catch (_) {}
    },
    handleUrl() {
      const p = util.params();
      const tok = p.get('admin');
      if (!tok) return;
      if (tok === 'off' || tok === 'logout') {
        this.disable();
      } else if (this.enable(tok)) {
        util.toast('تم تفعيل وضع الآدمن في هذا المتصفح.', 'ok');
      } else {
        util.toast('رمز الآدمن غير صحيح.', 'warn');
        console.warn('[AWAM] رمز آدمن غير معروف. الرموز المقبولة:', this.tokens().join(' · '));
      }
      p.delete('admin');
      const q = p.toString();
      history.replaceState({}, '', location.pathname + (q ? '?' + q : '') + location.hash);
    }
  };

  /* ==========================================================
     3) السلة (localStorage)
     ========================================================== */
  const cart = {
    key: 'aw_cart_v1',
    get() {
      try { return (JSON.parse(localStorage.getItem(this.key)) || []).map(i => ({ ...i })); }
      catch (_) { return []; }
    },
    save(items) {
      try { localStorage.setItem(this.key, JSON.stringify(items)); } catch (_) {}
      document.dispatchEvent(new CustomEvent('jl:cart', { detail: items }));
      this.badge();
    },
    keyOf(i) { return `${i.id}__${i.size || ''}__${i.color || ''}`; },
    add(item) {
      const items = this.get();
      const k = this.keyOf(item);
      const found = items.find(x => this.keyOf(x) === k);
      if (found) found.qty = Math.min(99, (found.qty || 1) + (item.qty || 1));
      else items.push({ ...item, qty: item.qty || 1 });
      this.save(items);
      return items;
    },
    remove(key) { this.save(this.get().filter(i => this.keyOf(i) !== key)); },
    setQty(key, qty) {
      const items = this.get();
      const it = items.find(i => this.keyOf(i) === key);
      if (!it) return;
      it.qty = Math.max(1, Math.min(99, qty));
      this.save(items);
    },
    clear() { this.save([]); },
    count() { return this.get().reduce((s, i) => s + (i.qty || 1), 0); },
    subtotal() { return this.get().reduce((s, i) => s + (Number(i.price) || 0) * (i.qty || 1), 0); },
    shipping() { return Number(this._shipFee != null ? this._shipFee : (CFG.SHIPPING || 0)); },
    setShipFee(v) { this._shipFee = Number(v) || 0; this.badge(); },
    discount() { return coupons.breakdown(this.get()).discount; },
    total() { return Math.max(0, this.subtotal() - this.discount() + this.shipping()); },
    badge() {
      const n = this.count();
      $$('.cart-count').forEach(el => {
        el.textContent = n > 99 ? '99+' : n;
        el.classList.toggle('on', n > 0);
      });
    }
  };

  /* ==========================================================
     3.b) محرّك الأسعار: عرض الفترة المحدودة
     ========================================================== */
  const offer = {
    isPriceOffer(p)  { return !!(p.old_price && Number(p.old_price) > Number(p.price)); },
    isTimed(p)       { return !!(offer.isPriceOffer(p) && p.offer_ends_at); },
    endsAt(p)        { return p.offer_ends_at ? new Date(p.offer_ends_at) : null; },
    isLive(p) {
      if (!offer.isTimed(p)) return offer.isPriceOffer(p);
      const end = offer.endsAt(p);
      return end && end.getTime() > Date.now();
    },
    pct(p) {
      if (!offer.isPriceOffer(p)) return 0;
      return Math.round((1 - Number(p.price) / Number(p.old_price)) * 100);
    },
    state(p) {
      if (!offer.isPriceOffer(p)) return 'none';
      if (!offer.isTimed(p)) return 'live';
      const end = offer.endsAt(p);
      if (end && end.getTime() <= Date.now()) return 'expired';
      return 'live';
    },
    price(p) {
      return Number(p.price);
    },
    countdown(endDate) {
      const end = endDate instanceof Date ? endDate : new Date(endDate);
      let diff = Math.max(0, end.getTime() - Date.now());
      if (!diff) return '';
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (d > 1) return `${d} يوم ${h} ساعة`;
      if (d === 1) return `${h} ساعة ${m} دقيقة`;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
  };

  /* ==========================================================
     3.c) الكوبونات
     ========================================================== */
  const COUPON_KEY = 'aw_coupon_v1';

  const coupons = {
    get() {
      try {
        const c = JSON.parse(localStorage.getItem(COUPON_KEY));
        if (!c || !c.code) return null;
        if (c.ends_at && new Date(c.ends_at).getTime() <= Date.now()) { this.clear(); return null; }
        return c;
      } catch (_) { return null; }
    },
    save(c) { try { localStorage.setItem(COUPON_KEY, JSON.stringify(c)); } catch (_) {} },
    clear() {
      try { localStorage.removeItem(COUPON_KEY); } catch (_) {}
      document.dispatchEvent(new CustomEvent('jl:coupon', { detail: null }));
    },

    async validate(code) {
      const c = String(code || '').trim().toUpperCase();
      if (!c) throw new Error('أدخل كود الخصم.');

      // وضع العرض التجريبي (بدون قاعدة بيانات)
      if (coupons.demoMode()) {
        const demo = { AWAM10: 10, WELCOME15: 15, EID20: 20 };
        if (!demo[c]) throw new Error('الكود غير صحيح أو منتهي الصلاحية.');
        const res = { ok: true, code: c, percent: demo[c], product_ids: [], ends_at: null, demo: true };
        this.save(res);
        document.dispatchEvent(new CustomEvent('jl:coupon', { detail: res }));
        return res;
      }

      /* ⭐ الكوبونات بقت جوه awam-data — بنسأل الدالة awam_validate_coupon
         (أو نقرا الصفوف نفسها لو الدالة لسه مش متعملة) */
      let data;
      try {
        data = await sb.req(`/rest/v1/rpc/${CFG.COUPON_RPC || 'awam_validate_coupon'}`, { method: 'POST', body: { p_code: c } });
      } catch (e) {
        const offline = /schema cache|does not exist|not find the function|failed to fetch|network|offline|timed out|load failed|404/i.test(e.message);
        if (!offline) throw new Error('تعذّر التحقق من الكود. حاول مرة أخرى.');
        try {
          data = await this._checkInTable(c);
        } catch (e2) {
          if (window.__JL_DEMO__) {
            const demo = { AWAM10: 10, WELCOME15: 15, EID20: 20 };
            if (!demo[c]) throw new Error('الكود غير صحيح. كود تجريبي: AWAM10');
            const res = { ok: true, code: c, percent: demo[c], product_ids: [], ends_at: null, demo: true };
            this.save(res);
            document.dispatchEvent(new CustomEvent('jl:coupon', { detail: res }));
            return res;
          }
          throw new Error(e2.message || 'تعذّر التحقق من الكود. حاول مرة أخرى.');
        }
      }
      if (!data || !data.ok) throw new Error(data?.message || 'الكود غير صحيح أو منتهي الصلاحية.');

      const res = { ...data, product_ids: data.product_ids || [] };
      this.save(res);
      document.dispatchEvent(new CustomEvent('jl:coupon', { detail: res }));
      return res;
    },

    /** ⭐ التحقق من الكوبون مباشرة من صفوف awam-data (kind = coupon) */
    async _checkInTable(code) {
      let rows = [];
      try { rows = await sb.kind.select(K.COUPON, 'order=created_at.desc'); } catch (_) { rows = []; }
      /* ⛔ مفيش قراءة من جدول كوبونات تاني (ممكن يكون بتاع موقع تاني) */
      if (!rows.length && CFG.ALLOW_LEGACY_TABLES === true && CFG.LEGACY_COUPONS_TABLE) {
        try { rows = await sb.select(CFG.LEGACY_COUPONS_TABLE, 'select=*'); } catch (_) { rows = []; }
      }
      const row = (rows || []).find(r => String(r.code || '').trim().toUpperCase() === String(code).toUpperCase());
      if (!row) throw new Error('الكود غير صحيح أو منتهي الصلاحية.');
      if (row.active === false) throw new Error('الكود ده متوقف.');
      const now = Date.now();
      if (row.starts_at && new Date(row.starts_at).getTime() > now) throw new Error('الكود لسه مش مفعّل.');
      if (row.ends_at && new Date(row.ends_at).getTime() <= now) throw new Error('الكود منتهي الصلاحية.');
      return {
        ok: true,
        code: row.code,
        percent: Number(row.percent) || 0,
        product_ids: Array.isArray(row.product_ids) ? row.product_ids : [],
        ends_at: row.ends_at || null
      };
    },

    demoMode() { return !!(window.__JL_DEMO__); },

    applies(c, item) {
      if (!c) return false;
      if (!c.product_ids || !c.product_ids.length) return true;
      return c.product_ids.includes(String(item.id));
    },

    breakdown(items = cart.get()) {
      const c = this.get();
      if (!c) return { coupon: null, eligible: 0, discount: 0, percent: 0 };
      const eligible = items.reduce((sum, i) => {
        if (!this.applies(c, i)) return sum;
        return sum + (Number(i.price) || 0) * (Number(i.qty) || 1);
      }, 0);
      const percent = Number(c.percent) || 0;
      const discount = Math.round(eligible * percent) / 100;
      return { coupon: c, eligible, discount, percent };
    }
  };

  /* ==========================================================
     3.d) ⭐ إعدادات المتجر (أسعار الشحن وغيرها) — قابلة للتعديل من الآدمن
     ==========================================================
     التخزين: localStorage فورًا (يشتغل من غير إنترنت) + جدول settings في Supabase.
     لو الجدول مش موجود، الإعدادات بتفضل شغالة محليًا من غير أي خطأ.
     ========================================================== */
  const SETTINGS_KEY = 'aw_settings_v1';

  const settings = {
    defaults() {
      const opts = Array.isArray(CFG.SHIPPING_OPTIONS) ? CFG.SHIPPING_OPTIONS : [];
      const normal = opts.find(o => o.id === 'normal') || opts[0] || {};
      const remote = opts.find(o => o.id === 'remote') || opts[1] || {};
      return {
        shipping_normal_fee: Number(CFG.SHIPPING_NORMAL_FEE ?? normal.fee ?? CFG.SHIPPING ?? 0) || 0,
        shipping_remote_fee: Number(CFG.SHIPPING_REMOTE_FEE ?? remote.fee ?? 0) || 0,
        shipping_normal_label: normal.label || 'الشحن العادي',
        shipping_remote_label: remote.label || 'الشحن للمناطق النائية',
        free_shipping_over: 0,          // 0 = مقفول (مفيش شحن مجاني تلقائي)
        free_shipping_enabled: false,
        shipping_note: ''
      };
    },
    _cache: null,

    local() {
      try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
      catch (_) { return {}; }
    },
    _apply() {
      this._cache = { ...this.defaults(), ...this.local() };
      return this._cache;
    },
    /** القيمة الحالية فورًا (متزامنة) */
    all() { return this._cache || this._apply(); },
    get(key) { return this.all()[key]; },

    /** تحميل من Supabase — ⭐ من awam-data (kind = setting) */
    async load({ force = false } = {}) {
      this._apply();
      if (this._remoteLoaded && !force) return this._cache;

      const absorb = rows => {
        const map = {};
        (rows || []).forEach(r => {
          if (!r || !r.key) return;
          let v = r.value;
          if (typeof v === 'string') { try { v = JSON.parse(v); } catch (_) {} }
          if (v && typeof v === 'object') Object.assign(map, v);
        });
        return map;
      };

      let map = {};
      try { map = absorb(await sb.kind.select(K.SETTING, '', { select: 'key,value' })); } catch (_) {}
      /* ⛔ مفيش قراءة من أي جدول تاني — لو الجدول الموحّد لسه مش متظبط
         بنستخدم القيم الافتراضية اللي في config.js (نفس الأسعار) */
      if (!Object.keys(map).length && CFG.ALLOW_LEGACY_TABLES === true && CFG.LEGACY_SETTINGS_TABLE) {
        try { map = absorb(await sb.select(CFG.LEGACY_SETTINGS_TABLE, 'select=key,value')); } catch (_) {}
      }
      if (Object.keys(map).length) {
        this._cache = { ...this.defaults(), ...this.local(), ...map };
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this._cache)); } catch (_) {}
      }
      this._remoteLoaded = true;
      return this._cache;
    },

    /** حفظ من لوحة التحكم */
    async save(patch) {
      this._cache = { ...this.all(), ...patch };
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this._cache)); } catch (_) {}
      document.dispatchEvent(new CustomEvent('jl:settings', { detail: this._cache }));
      let savedRemote = false;
      try {
        await sb.settingsUpsert(patch);
        savedRemote = true;
        this._remoteLoaded = true;
      } catch (_) {}
      return { savedRemote, values: this._cache };
    },

    /** سعر الشحن لطريقة معيّنة + حساب الشحن المجاني */
    shippingFee(mode, subtotal) {
      const s = this.all();
      const base = mode === 'remote' ? Number(s.shipping_remote_fee) || 0 : Number(s.shipping_normal_fee) || 0;
      const freeOver = Number(s.free_shipping_over) || 0;
      if (s.free_shipping_enabled && freeOver > 0 && Number(subtotal) >= freeOver) return 0;
      return base;
    },
    label(mode) {
      const s = this.all();
      return mode === 'remote' ? (s.shipping_remote_label || 'الشحن للمناطق النائية') : (s.shipping_normal_label || 'الشحن العادي');
    }
  };
  settings._apply();

  /* ==========================================================
     3.e) طلبات لسه ما اتحفظتش (شبكة / الجدول لسه مش متظبط)
     ----------------------------------------------------------
     بنحفظها في المتصفح ونحاول نبعتها تاني في أول زيارة جاية —
     كده مفيش أي كتابة في أي جدول برّه awam-data، والطلب
     ميتضيّعش (وفوق ده كله العميل بيبعته واتساب).
     ========================================================== */
  const PENDING_KEY = 'aw_pending_orders_v1';

  const pendingOrders = {
    all() {
      try { return JSON.parse(localStorage.getItem(PENDING_KEY)) || []; } catch (_) { return []; }
    },
    add(row) {
      const list = this.all();
      list.unshift({ ...row, queued_at: new Date().toISOString() });
      try { localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(0, 20))); } catch (_) {}
    },
    removeAt(index) {
      const list = this.all();
      list.splice(index, 1);
      try { localStorage.setItem(PENDING_KEY, JSON.stringify(list)); } catch (_) {}
    },
    /** إعادة إرسال أي طلب قديم — بترجع عدد اللي اتحفظ */
    async flush() {
      const list = this.all();
      if (!list.length) return 0;
      let sent = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        try {
          await sb.items.insert(list[i]);
          this.removeAt(i);
          sent++;
        } catch (_) { break; }
      }
      return sent;
    }
  };

  /* ==========================================================
     4) المنتجات (Supabase + Demo fallback)
     ========================================================== */
  const DEMO = [
    {
      id: 'demo-1', title: 'عباية «ندى»', title_en: 'NADA', price: 2200, old_price: 2600,
      description: 'عباية سوداء كلاسيكية بقماش الكريب المطفي، قصّة مريحة وأناقة مثالية لكل يوم.',
      image_url: 'assets/img/products/abaya-1.jpg', images: ['assets/img/products/abaya-1.jpg'],
      category: 'عبايات', fabric: 'كريب مطفي', badge: 'الأكثر طلباً',
      sizes: ['FREE SIZE', 'مقاس خاص'], colors: [{ name: 'أسود', hex: '#1A1A1A' }]
    },
    {
      id: 'demo-2', title: 'عباية «مريم»', title_en: 'MARYAM', price: 2600, old_price: null,
      description: 'عباية بيج كريمي بتطريز خفيف على الصدر، مثالية لحفلات الخطوبة والزيارات العائلية.',
      image_url: 'assets/img/products/abaya-2.jpg', images: ['assets/img/products/abaya-2.jpg'],
      category: 'دلنجات', fabric: 'ساتان حريري', badge: 'جديد',
      sizes: ['FREE SIZE', 'مقاس خاص'], colors: [{ name: 'بيج كريمي', hex: '#E8DCC8' }]
    },
    {
      id: 'demo-3', title: 'دلنجت «ليالي»', title_en: 'LAYALI', price: 3600, old_price: 4200,
      description: 'دلنجت وردي نبيتي مطرز يدوياً بخيوط ذهبية، قطعة استقبال فخمة تناسب المناسبات الخاصة.',
      image_url: 'assets/img/products/abaya-3.jpg', images: ['assets/img/products/abaya-3.jpg'],
      category: 'دلنجات', fabric: 'مخمل', badge: 'عرض محدود',
      sizes: ['FREE SIZE', 'مقاس خاص'], colors: [{ name: 'وردي نبيتي', hex: '#8C4A42' }]
    },
    {
      id: 'demo-4', title: 'دلنجت «ذهب»', title_en: 'THAHAB', price: 4500, old_price: null,
      description: 'دلنجت ذهبي بتطريز ثلاثي الأبعاد، لمسة من الرفاهية لحفلاتك وأعيادك.',
      image_url: 'assets/img/products/abaya-4.jpg', images: ['assets/img/products/abaya-4.jpg'],
      category: 'استقبال', fabric: 'ساتان لؤلؤي', badge: 'أتيليه',
      sizes: ['FREE SIZE', 'مقاس خاص'], colors: [{ name: 'ذهبي', hex: '#C58C73' }]
    },
    {
      id: 'demo-5', title: 'عباية استقبال «ملك»', title_en: 'MALAK', price: 3200, old_price: null,
      description: 'عباية استقبال كحلي بتطريز ناعم، قصّة ملكية تليق بحفلاتك الخاصة.',
      image_url: 'assets/img/products/abaya-5.jpg', images: ['assets/img/products/abaya-5.jpg'],
      category: 'استقبال', fabric: 'شيفون', badge: '',
      sizes: ['FREE SIZE', 'مقاس خاص'], colors: [{ name: 'كحلي', hex: '#2C3A57' }]
    }
  ];

  function normalize(row) {
    const images = (row.images && row.images.length ? row.images : [row.image_url]).filter(Boolean);
    return {
      ...row,
      id: row.id,
      title: row.title || row.title_en || `قطعة من ${util.siteName()}`,
      title_en: row.title_en || '',
      price: Number(row.price) || 0,
      old_price: row.old_price ? Number(row.old_price) : null,
      image_url: row.image_url || images[0],
      images,
      sizes: (row.sizes && row.sizes.length ? row.sizes : CFG.DEFAULT_SIZES),
      colors: (row.colors && row.colors.length ? row.colors : []),
      category: util.category(row.category || ''),
      fabric: row.fabric || '',
      description: row.description || `${util.siteName()} — مصنوعة بعناية بأجود الأقمشة.`,
      badge: row.badge || '',
      size_guide_url: row.size_guide_url || '',
      /* ⭐ نفاد المخزون: مقاسات/ألوان موجودة في القائمة لكن «SOLD OUT» */
      sold_sizes: Array.isArray(row.sold_sizes) ? row.sold_sizes : [],
      sold_colors: Array.isArray(row.sold_colors) ? row.sold_colors : [],
      sold_out: row.sold_out === true
    };
  }

  /* ==========================================================
     ⭐ متاح / نافد — دالة واحدة بيستخدمها الموقع كله
     ========================================================== */
  const stock = {
    /** المنتج كله نافد؟ */
    isSoldOut(p) { return !!(p && p.sold_out); },
    isSizeSold(p, size) {
      if (!p) return false;
      if (p.sold_out) return true;
      return (p.sold_sizes || []).some(x => String(x) === String(size));
    },
    isColorSold(p, color) {
      if (!p) return false;
      if (p.sold_out) return true;
      return (p.sold_colors || []).some(x => String(x) === String(color));
    },
    /** أول مقاس متاح (مش نافد) */
    firstSize(p) {
      const list = (p && p.sizes) || [];
      return list.find(x => !this.isSizeSold(p, x)) || '';
    },
    /** أول لون متاح */
    firstColor(p) {
      const list = (p && p.colors) || [];
      const c = list.find(x => !this.isColorSold(p, x && x.name));
      return c ? c.name : '';
    },
    /** هل فيه أي مقاس متاح؟ */
    hasSize(p) { return ((p && p.sizes) || []).some(x => !this.isSizeSold(p, x)); }
  };

  let _productsCache = null;
  const products = {
    async all({ force = false } = {}) {
      if (_productsCache && !force) return _productsCache;
      let rows = [];
      try {
        /* ⭐ المنتجات بس من awam-data (الطلبات والكوبونات والإعدادات في نفس الجدول) */
        try {
          rows = await sb.items.select(`select=*&kind=eq.${K.PRODUCT}&order=sort.asc,created_at.desc`);
        } catch (e) {
          if (!kindStore.isMissingKind(e)) throw e;
          kindStore._noKind = true;
          rows = await sb.items.select('select=*&order=sort.asc,created_at.desc');
        }
        if (!window.__JL_TABLE_LOGGED) {
          window.__JL_TABLE_LOGGED = true;
          console.info('[AWAM] المنتجات بتتقرأ من الجدول →', sb.itemsTable.table());
        }
        rows = (rows || [])
          .filter(r => !r.kind || String(r.kind) === String(K.PRODUCT))
          .filter(r => r.is_active !== false);
      } catch (err) {
        console.warn('[AWAM] Supabase غير متاح — عرض منتجات العرض.', err.message);
        rows = [];
      }
      window.__JL_DEMO__ = rows.length === 0;
      _productsCache = rows.length ? rows.map(normalize) : DEMO;
      return _productsCache;
    },
    async one(id) {
      const list = await this.all();
      return list.find(p => String(p.id) === String(id)) || null;
    },
    invalidate() { _productsCache = null; }
  };

  /* ==========================================================
     5) واجهة: Toast / Modal / Loader / Reveal
     ========================================================== */
  function toast(msg, kind = '') {
    let wrap = $('.toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      wrap.setAttribute('role', 'status');
      wrap.setAttribute('aria-live', 'polite');
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = 'toast ' + (kind ? 'toast--' + kind : '');
    el.innerHTML = `<span>${util.esc(msg)}</span>`;
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    setTimeout(() => { el.classList.remove('is-in'); setTimeout(() => el.remove(), 450); }, 3200);
  }
  util.toast = toast;

  function openModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add('is-open');
    document.body.classList.add('is-locked');
  }
  function closeModal(el) {
    const m = typeof el === 'string' ? document.getElementById(el) : el;
    if (!m) return;
    m.classList.remove('is-open');
    if (!$$('.modal.is-open').length) document.body.classList.remove('is-locked');
  }
  const modal = { open: openModal, close: closeModal };

  /* ---------- Loader ---------- */
  /* ⭐ قواعد ثابتة:
     - بيقفل على DOMContentLoaded (يعني الـ CSS والـ JS جاهزين) — مش على window.load
       (اللي كان بيستنى كل صور المنتجات فيبطّأ الإقلاع لثواني على النت البطيء)
     - أقل مدة 500ms عشان الأنيميشن يبان، وأقصى مدة 2200ms مهما حصل
  */
  function loader() {
    if (window.__JL_LOADER_RUN__) return Promise.resolve();
    window.__JL_LOADER_RUN__ = true;

    const el = $('#jl-loader');
    if (!el) { document.documentElement.classList.add('is-ready', 'jl-loaded'); return Promise.resolve(); }

    /* ⭐ نوقف المشغّل المدمج اللي اشتغل قبل تحميل الملف ده */
    try { window.__JL_LOADER_INLINE_STOP && window.__JL_LOADER_INLINE_STOP(); } catch (_) {}

    /* ⭐ الأداء: مفيش أي انتظار مصطنع — الصفحة تتكشف أول ما الـ DOM يجهز.
       (قبل كده كان فيه انتظار ٥٠٠ms لحد ٢٢٠٠ms كان بيأخّر أول رسم على الموبايل) */
    const MIN_MS = 0;
    const MAX_MS = 1200;
    const started = Date.now();
    const pctEl = $('.jl-loader-pct', el);
    const bar = $('.jl-loader-bar', el);
    let p = 0, done = false, resolveLoader;
    const finished = new Promise(res => { resolveLoader = res; });

    const paint = v => {
      if (pctEl) pctEl.textContent = String(Math.round(v)).padStart(2, '0') + '%';
      if (bar && bar.firstElementChild) bar.firstElementChild.style.width = v + '%';
    };

    const tick = setInterval(() => {
      // تقدّم بطيء لما نقرب من 90 — عشان الأرقام ما تقفش
      p = Math.min(92, p + Math.max(1.5, (92 - p) * 0.18));
      paint(p);
    }, 90);

    const revealPage = () => {
      document.documentElement.classList.add('is-ready', 'jl-loaded');
      if (el.isConnected) el.remove();
      revealInit();
      resolveLoader();
    };

    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(tick);
      clearTimeout(watchdog);
      paint(100);
      const out = () => {
        if (!el.isConnected) return revealPage();
        el.classList.add('is-leaving');
        // مدة الـ fade في CSS 0.22s — نستنى 210ms بس ونشيل العنصر
        setTimeout(revealPage, 210);
      };
      // نستنى باقي الحد الأدنى فقط، مش أكتر
      setTimeout(out, Math.max(0, MIN_MS - (Date.now() - started)));
    };

    const watchdog = setTimeout(finish, MAX_MS);

    if (document.readyState === 'loading') {
      ON(document, 'DOMContentLoaded', finish, { once: true });
    } else {
      finish();
    }

    return finished;
  }

  /* ---------- scroll reveal ---------- */
  let revealed = false;
  let revealObserver = null;
  function revealWithin(scope = document) {
    const selector = '.reveal, .reveal-lines';
    const els = scope.matches?.(selector) ? [scope, ...$$(selector, scope)] : $$(selector, scope);
    if (!els.length) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      els.forEach(el => el.classList.add('is-visible'));
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          const delay = Math.max(0, Math.min(parseFloat(el.dataset.delay || 0), .5));
          el.style.setProperty('--reveal-delay', `${delay}s`);
          el.classList.add('is-visible');
          revealObserver.unobserve(el);
        });
      }, { threshold: .08, rootMargin: '0px 0px -32px 0px' });
    }
    els.forEach(el => {
      if (!el.classList.contains('is-visible')) revealObserver.observe(el);
    });
  }
  function revealInit() {
    if (revealed) return;
    revealed = true;
    revealWithin(document);
  }

  /* ==========================================================
     6) الهيدر / الفوتر (يتم حقنهم في كل الصفحات)
     ========================================================== */
  const logoSVG = `
    <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <circle cx="50" cy="50" r="47" stroke="currentColor" stroke-width="1.2" opacity=".4"/>
      <circle cx="50" cy="50" r="41" stroke="currentColor" stroke-width=".7" opacity=".25"/>
      <path d="M63.5 27.5v30.2c0 9.6-6.6 16.3-16.2 16.3-8 0-13.6-4.4-15-11.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M57 27.5h13" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`;

  const LOGO_WORD = 'assets/img/brand/awam-wordmark-brown.png';
  /* ⭐ في الموبايل بنستخدم العلامة المختصرة بدل اللوجو الطويل عشان الهيدر يبقى مظبوط */
  const LOGO_MARK = 'assets/img/brand/awam-crest-brown.png';
  const LOGO_WORD_LIGHT = 'assets/img/brand/awam-wordmark-brown.png';

  const icons = {
    cash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6.5" width="19" height="11" rx="2.2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 10v4M18 10v4"/></svg>`,
    cart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l-1.2 12.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 7Z"/><path d="M9 7V6a3 3 0 0 1 6 0v1"/></svg>`,
    user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6"/></svg>`,
    menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 8h16M4 15h16"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M18 6l-1.4 1.4M7.4 16.6L6 18"/></svg>`,
    admin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="8.4" r="3.4"/>
      <path d="M5.2 20.2c.7-3.5 3.3-5.6 6.8-5.6 3.5 0 6.1 2.1 6.8 5.6"/>
      <path d="M8.7 3.1l1.3 1.3 2-2 2 2 1.3-1.3.7 3.1H8l.7-3.1Z"/>
    </svg>`,
    adminBadge: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3.2 5.4 6v5.1c0 4 2.7 7.5 6.6 9.7 3.9-2.2 6.6-5.7 6.6-9.7V6L12 3.2Z"/>
      <circle cx="12" cy="10.4" r="2.1"/>
      <path d="M8.9 16.1c.5-1.7 1.7-2.6 3.1-2.6s2.6.9 3.1 2.6"/>
    </svg>`
  };

  const COOKIE_CONSENT_KEY = 'awam_cookie_consent';
  function initCookieConsent() {
    if (document.getElementById('cookieConsent')) return;
    const savedChoice = () => {
      try {
        const entry = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE_CONSENT_KEY}=`));
        if (entry) return decodeURIComponent(entry.slice(COOKIE_CONSENT_KEY.length + 1));
      } catch (_) {}
      try { return localStorage.getItem(COOKIE_CONSENT_KEY) || ''; } catch (_) { return ''; }
    };
    const hasChoice = ['all', 'essential'].includes(savedChoice());
    const banner = document.createElement('section');
    banner.id = 'cookieConsent';
    banner.className = 'cookie-consent';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'تفضيلات الكوكيز');
    banner.hidden = hasChoice;
    banner.innerHTML = `
      <div class="cookie-consent-copy">
        <strong>تفضيلات الكوكيز</strong>
        <p>نستخدم ملفات تعريف الارتباط الضرورية فقط لحفظ سلتك وتسيير عملية الدفع. لا نستخدم كوكيز تحليلات أو إعلانات. الكوكيز الخاصة بالخدمات الخارجية تُدار من خلالها ومن خلال متصفحك.</p>
      </div>
      <div class="cookie-consent-actions">
        <button type="button" class="cookie-accept" data-cookie-choice="all">قبول الكل</button>
        <button type="button" class="cookie-essential" data-cookie-choice="essential">الضرورية فقط</button>
      </div>`;
    document.body.appendChild(banner);

    const saveChoice = choice => {
      const expiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
      const secure = location.protocol === 'https:' ? '; Secure' : '';
      try { document.cookie = `${COOKIE_CONSENT_KEY}=${encodeURIComponent(choice)}; Expires=${expiry}; Path=/; SameSite=Lax${secure}`; } catch (_) {}
      try { localStorage.setItem(COOKIE_CONSENT_KEY, choice); } catch (_) {}
      banner.hidden = true;
    };
    banner.querySelectorAll('[data-cookie-choice]').forEach(button => {
      ON(button, 'click', () => saveChoice(button.dataset.cookieChoice));
    });
    $$('[data-cookie-settings]').forEach(button => ON(button, 'click', () => {
      banner.hidden = false;
      banner.querySelector('[data-cookie-choice="all"]')?.focus();
    }));
  }

  function chrome() {
    const page = document.body.dataset.page || 'home';
    const SITE = util.siteName();
    const SUB = util.siteSuffix();
    /* ⭐ اللوجو زي ما هو + «الدلنجات» مكتوبة تحته بخط الموقع */
    const brandLockup = (cls) => `
      <span class="brand-lockup ${cls || ''}">
        <picture class="brand-word-wrap">
          <img class="brand-logo brand-logo--word" src="${LOGO_WORD}" alt="${util.esc(SITE)}" width="679" height="299" decoding="async">
        </picture>
        <picture class="brand-mark-wrap">
          <source type="image/webp" srcset="assets/img/brand/awam-crest-brown.webp">
          <img class="brand-logo brand-logo--mark" src="${LOGO_MARK}" alt="" width="400" height="400" decoding="async">
        </picture>
        <span class="brand-sub" aria-hidden="true">${util.esc(SUB)}</span>
      </span>`;
    const header = `
      <div class="announce">
        <span>🎉 توصيل مجّاني داخل البحيرة — تشكيلة ${util.esc(SITE)} الجديدة</span>
      </div>
      <header class="site-header" id="siteHeader">
        <div class="container header-inner">
          <a class="brand" href="index.html" aria-label="${util.esc(SITE)} — الصفحة الرئيسية">
            ${brandLockup('brand-lockup--header')}
          </a>
          <nav class="nav" aria-label="القائمة الرئيسية">
            <a href="index.html" class="${page === 'home' ? 'is-active' : ''}">الرئيسية</a>
            <a href="shop.html" class="${page === 'shop' ? 'is-active' : ''}">المتجر</a>
            <a href="index.html#collections">الأقسام</a>
            <a href="index.html#story">من نحن</a>
            <a href="index.html#contact">اتصل بنا</a>
          </nav>
          <div class="header-actions">
            <button class="icon-btn burger" id="burgerBtn" aria-label="القائمة">${icons.menu}</button>
            <button class="icon-btn" type="button" id="cartDrawerOpen" aria-label="فتح السلة" aria-controls="cartDrawer" aria-expanded="false">
              ${icons.cart}<span class="cart-count">0</span>
            </button>
          </div>
        </div>
      </header>
      <div class="mobile-nav" id="mobileNav">
        <button class="icon-btn close-m" id="closeMobile" aria-label="إغلاق">${icons.close}</button>
        <a href="index.html">الرئيسية</a>
        <a href="shop.html">المتجر</a>
        <a href="index.html#collections">الأقسام</a>
        <a href="index.html#story">من نحن</a>
        <a href="cart.html">السلة</a>
        <a href="index.html#contact">اتصل بنا</a>
      </div>`;

    const footer = `
      <footer class="site-footer" id="contact">
        <div class="container">
          <div class="footer-grid">
            <div class="footer-brand">
              <div class="brand">
                <picture>
                  <img class="brand-logo" src="${LOGO_WORD_LIGHT}" alt="${util.esc(SITE)}" width="679" height="299" loading="lazy" decoding="async">
                </picture>
                <span class="brand-sub brand-sub--footer">${util.esc(SUB)}</span>
              </div>
              <p>${util.esc(SITE)} — بوتيك دلنجات وعبايات في البحيرة. قطع بتتفصّل بعناية، بتوصيل سريع داخل البحيرة ومحافظات مصر.</p>
            </div>
            <div>
              <p class="footer-title">الأقسام</p>
              <ul>
                <li><a href="shop.html">كل المنتجات</a></li>
                ${util.categories().map(c => `<li><a href="shop.html?cat=${encodeURIComponent(c)}">${util.esc(c)}</a></li>`).join('')}
              </ul>
            </div>
            <div>
              <p class="footer-title">خدماتنا</p>
              <ul>
                <li><a href="cart.html">السلة</a></li>
                <li><a href="#" data-open-guide>دليل المقاسات</a></li>
                <li><a href="#" data-open-shipping>التوصيل والاسترجاع</a></li>
                <li><button class="cookie-settings" type="button" data-cookie-settings>إعدادات الكوكيز</button></li>
              </ul>
            </div>
            <div>
              <p class="footer-title">تواصل معنا</p>
              <ul>
                <li><a href="https://wa.me/${CFG.WHATSAPP_NUMBER}" target="_blank" rel="noopener">واتساب · 01129196650</a></li>
                <li><a href="${CFG.TIKTOK}" target="_blank" rel="noopener">تيك توك · ${CFG.TIKTOK_HANDLE}</a></li>
                <li><span>📍 ${util.esc(CFG.CITY)}</span></li>
                <li><span>⏰ ١٠ ص – ١٠ م</span></li>
              </ul>
            </div>
          </div>
          <div class="footer-bottom">
            <span>© ${new Date().getFullYear()} ${util.esc(SITE)} — بوتيك الدلنجات والعبايات</span>
            <span>صُنع بعناية <i class="admin-dot" id="adminDot" title="لوحة التحكم"></i></span>
          </div>
        </div>
      </footer>`;

    const hHost = document.getElementById('site-header');
    if (hHost) hHost.innerHTML = header;
    const fHost = document.getElementById('site-footer');
    if (fHost) fHost.innerHTML = footer;
    initCookieConsent();
    initCartDrawer();

    ON($('#burgerBtn'), 'click', () => $('#mobileNav')?.classList.add('is-open'));
    ON($('#closeMobile'), 'click', () => $('#mobileNav')?.classList.remove('is-open'));
    $$('#mobileNav a').forEach(a => ON(a, 'click', () => $('#mobileNav').classList.remove('is-open')));

    const hd = $('#siteHeader');
    const onScroll = () => hd?.classList.toggle('is-stuck', window.scrollY > 8);
    ON(window, 'scroll', onScroll, { passive: true }); onScroll();

    cart.badge();
    ON(document, 'jl:cart', () => cart.badge());
    initCountdowns();

    if (!document.getElementById('waFab')) {
      const a = document.createElement('a');
      a.id = 'waFab'; a.className = 'wa-fab';
      a.target = '_blank'; a.rel = 'noopener';
      a.setAttribute('aria-label', 'تواصل معنا على واتساب');
      a.href = waLink('مرحباً بـ ' + util.siteName() + ' ✦ عندك استفسار عن دلنجة أو عباية أو طلب؟');
      a.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.7-4.7A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8.6 9.4c.4 2.2 2 3.8 4.2 4.2l1-1.2 1.8.7c-.3 1.2-1.4 1.9-2.6 1.8-2.9-.3-5.2-2.6-5.5-5.5-.1-1.2.6-2.3 1.8-2.6l.7 1.8-1.4.8Z"/></svg>`;
      document.body.appendChild(a);
    }
  }

  /* ==========================================================
     7) واتساب — رسالة الطلب الكاملة (عربي)
     ========================================================== */
  function buildOrderMessage(order) {
    const L = [];
    L.push('✦ طلب جديد — ' + util.siteName() + ' ✦');
    L.push('رقم الطلب: ' + order.code);
    L.push('');
    L.push('— بيانات العميل —');
    L.push('الاسم: ' + order.name);
    L.push('الجوال: ' + order.phone);
    if (order.city) L.push('المدينة: ' + order.city);
    if (order.address) L.push('العنوان: ' + order.address);
    L.push('');
    L.push('— المنتجات —');
    order.items.forEach((i, n) => {
      L.push(`${n + 1}) ${i.title}${i.title_en ? ' / ' + i.title_en : ''}`);
      if (i.size) L.push('   المقاس: ' + i.size);
      if (i.color) L.push('   اللون: ' + i.color);
      L.push('   الكمية: ' + (i.qty || 1) + ' — السعر: ' + util.money((i.price || 0) * (i.qty || 1)));
      if (i.note) L.push('   ملاحظة: ' + i.note);
    });
    L.push('');

    const mes = order.measurements || {};
    const mKeys = [
      ['height', 'الطول'], ['bust', 'الصدر'], ['waist', 'الوسط'],
      ['hips', 'الأرداف'], ['shoulder', 'الكتف'], ['sleeve', 'طول الكم'], ['notes', 'ملاحظات المقاس']
    ];
    const mFilled = mKeys.filter(([k]) => mes[k]);
    const mImages = mes.images || [];
    if (mFilled.length || mImages.length) {
      L.push('— المقاسات (اختياري) —');
      mFilled.forEach(([k, label]) => L.push(`${label}: ${mes[k]}${['height', 'bust', 'waist', 'hips', 'shoulder', 'sleeve'].includes(k) ? ' سم' : ''}`));
      if (mImages.length) {
        L.push('صور المقاسات:');
        mImages.forEach((u, n) => L.push(`${n + 1}) ${u}`));
      }
      L.push('');
    }

    if (order.subtotal != null) L.push('المجموع الفرعي: ' + util.money(order.subtotal));
    if (order.couponCode || order.discount) {
      L.push(`الخصم${order.couponCode ? ' (كوبون ' + order.couponCode + ')' : ''}: −` + util.money(order.discount || 0));
    }
    if (order.shipping) L.push('التوصيل: ' + util.money(order.shipping));
    L.push('الإجمالي: ' + util.money(order.total));
    L.push('');
    L.push('— طريقة الدفع —');
    L.push(order.payment);
    /* ⭐ المقدم = مصاريف الشحن (فودافون كاش أو إنستاباي) */
    if (order.paymentId === 'vodafone_cash' || order.paymentId === 'instapay') {
      const isWallet = order.paymentId === 'instapay';
      L.push(`المطلوب الآن (مصاريف الشحن): ${util.moneyAr(order.deposit || 0)}`);
      L.push(`${isWallet ? 'عنوان إنستاباي' : 'رقم فودافون كاش'}: ${isWallet ? (CFG.INSTAPAY_HANDLE || '') : (CFG.VODAFONE_CASH_NUMBER || '01129196650')}`);
      L.push('المتبقي عند الاستلام: ' + util.moneyAr(Math.max(0, (order.total || 0) - (order.deposit || 0))));
      L.push('يرجى إرسال صورة التحويل لتأكيد الطلب.');
    }
    if (order.notes) { L.push(''); L.push('ملاحظات: ' + order.notes); }
    L.push('');
    L.push('مستمتع من متجر ' + util.siteName() + ' 🕊️');
    return L.join('\n');
  }

  function waLink(text) {
    return `https://wa.me/${CFG.WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
  }

  /* ==========================================================
     8) عناصر مشتركة: أكورديون + أدلة
     ========================================================== */
  function initAccordions(scope = document) {
    $$('.acc-item', scope).forEach(item => {
      const head = $('.acc-head', item);
      const body = $('.acc-body', item);
      if (!head || !body) return;
      ON(head, 'click', () => {
        const open = item.classList.toggle('is-open');
        body.style.height = open ? body.scrollHeight + 'px' : '0px';
        if (open) $$('.acc-item', scope).forEach(o => {
          if (o !== item && o.classList.contains('is-open')) {
            o.classList.remove('is-open');
            $('.acc-body', o).style.height = '0px';
          }
        });
      });
    });
  }

  const GUIDE_HTML = `
    <div class="modal-head">
      <h3>دليل المقاسات</h3>
      <button class="modal-close" data-close-modal aria-label="إغلاق">${icons.close}</button>
    </div>
    <p class="tiny muted">قاسِ بكشيدة مريحة. إذا كنتِ بين مقاسين، اختاري المقاس الأكبر. المقاسات بالسنتيمتر.</p>
    <div style="overflow:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px;text-align:center">
        <thead>
          <tr style="background:var(--bg-secondary)">
            <th style="padding:10px;border-bottom:1px solid var(--line)">المقاس</th>
            <th style="padding:10px;border-bottom:1px solid var(--line)">الصدر</th>
            <th style="padding:10px;border-bottom:1px solid var(--line)">الوسط</th>
            <th style="padding:10px;border-bottom:1px solid var(--line)">الأرداف</th>
            <th style="padding:10px;border-bottom:1px solid var(--line)">الطول</th>
          </tr>
        </thead>
        <tbody>
          ${((CFG.SIZE_GUIDE && CFG.SIZE_GUIDE.length) ? CFG.SIZE_GUIDE : [
            ['XS', '76–80', '58–62', '84–88', '136'],
            ['S', '80–84', '62–66', '88–92', '140'],
            ['M', '84–88', '66–70', '92–96', '142'],
            ['L', '88–92', '70–74', '96–100', '144'],
            ['XL', '92–98', '74–80', '100–106', '146'],
            ['2XL', '98–104', '80–86', '106–112', '148'],
            ['3XL', '104–110', '86–92', '112–118', '150'],
            ['4XL', '110–118', '92–100', '118–126', '152'],
            ['FREE SIZE', '90–110', '70–95', '95–120', '150']
          ]).map(r => `<tr>${r.map((c, i) => `<td style="padding:10px;border-bottom:1px solid var(--line);${i === 0 ? 'font-weight:500' : 'color:var(--ink-soft)'}">${c}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="tiny muted">مقاسك مش في الجدول؟ اختاري <b>«${util.esc(CFG.CUSTOM_SIZE_LABEL || 'مقاس خاص')}»</b> واكتبي رقم مقاسك (${CFG.CUSTOM_SIZE_MIN || 30}–${CFG.CUSTOM_SIZE_MAX || 70})، وممكن كمان تضيفي مقاساتكِ بالسنتيمتر عند إتمام الطلب.</p>`;

  function guidesModal() {
    if (document.getElementById('guideModal')) return;
    const d = document.createElement('div');
    d.className = 'modal'; d.id = 'guideModal';
    d.innerHTML = `<div class="modal-card">${GUIDE_HTML}</div>`;
    document.body.appendChild(d);

    const ship = document.createElement('div');
    ship.className = 'modal'; ship.id = 'shipModal';
    ship.innerHTML = `
      <div class="modal-card">
        <div class="modal-head">
          <h3>التوصيل والاسترجاع</h3>
          <button class="modal-close" data-close-modal aria-label="إغلاق">${icons.close}</button>
        </div>
        <ul style="display:grid;gap:10px;font-size:14px;color:var(--ink-soft);line-height:1.9">
          <li>— التوصيل داخل محافظة البحيرة في ٢–٥ أيام عمل.</li>
          <li>— ${util.esc(CFG.FREE_SHIPPING_NOTE)}.</li>
          <li>— الاسترجاع أو الاستبدال خلال ١٤ يوماً بشرط ألا تكون القطعة مستخدمة وأن تكون الملصقات عليها.</li>
          <li>— القطع بالمقاس المخصص تُفصل حسب الطلب ولا تُستبدل إلا في حال وجود عيب.</li>
          <li>— تُدفع دفعة مقدمة ٥٠٪ عبر فودافون كاش، والباقي عند الاستلام.</li>
        </ul>
      </div>`;
    document.body.appendChild(ship);

    $$('[data-open-guide]').forEach(b => ON(b, 'click', e => { e.preventDefault(); openModal('guideModal'); }));
    $$('[data-open-shipping]').forEach(b => ON(b, 'click', e => { e.preventDefault(); openModal('shipModal'); }));
    $$('[data-close-modal]').forEach(b => ON(b, 'click', () => closeModal(b.closest('.modal'))));
    $$('.modal').forEach(m => ON(m, 'click', e => { if (e.target === m) closeModal(m); }));
    ON(document, 'keydown', e => { if (e.key === 'Escape') $$('.modal.is-open').forEach(m => closeModal(m)); });
  }

  /* ==========================================================
     8.a) كارت المنتج الموحّد
     ========================================================== */
  function cardHTML(p, i = 0, opts = {}) {
    const st = offer.state(p);
    const off = offer.pct(p);
    const endsAt = offer.endsAt(p);
    const badgeText = String(p.badge || '').trim().toLowerCase();
    const saleBadge = st === 'live'
      ? `<span class="badge badge--sale">تخفيض -${off}٪</span>`
      : '';
    const labelBadge = /^(جديد|جديد arrival|just dropped|new)$/.test(badgeText)
      ? '<span class="badge badge--new">NEW</span>'
      : /الأكثر طلباً|bestseller|best seller|top seller/.test(badgeText)
        ? '<span class="badge badge--best">الأكثر طلباً</span>'
        : '';
    const soldBadge = stock.isSoldOut(p) || !stock.hasSize(p)
      ? '<span class="badge badge--soldout">SOLD OUT</span>'
      : '';
    const timedBadge = (st === 'live' && endsAt)
      ? `<span class="card-old-badge"><span class="dot-live"></span>عرض لفترة محدودة <span class="cd" data-offer-end="${endsAt.toISOString()}"></span></span>`
      : '';
    const priceHTML = st === 'live'
      ? `<span class="card-price">${util.money(p.price)}</span><span class="card-price-old">${util.money(p.old_price)}</span>`
      : `<span class="card-price">${util.money(p.price)}</span>`;
    const images = (p.images || []).filter(Boolean);
    const alternate = images.find(src => src !== p.image_url) || '';
    const quickBtns = opts.quick === false ? '' : `
      <div class="card-actions">
        <button class="card-quick" type="button" data-quick="${util.esc(p.id)}">إضافة سريعة <span aria-hidden="true">+</span></button>
        <button class="card-view" type="button" data-quick-view="${util.esc(p.id)}" aria-label="العرض السريع ${util.esc(p.title)}">عرض</button>
      </div>`;

    const cardSold = stock.isSoldOut(p) || !stock.hasSize(p);
    return `
    <article class="card reveal${cardSold ? ' is-soldout' : ''}" data-delay="${(i % 4) * 0.06}" data-id="${util.esc(p.id)}"${cardSold ? ' data-sold="1"' : ''}>
      <a href="product.html?id=${encodeURIComponent(p.id)}" class="card-media" aria-label="${util.esc(p.title)}">
        <img class="card-image-primary" src="${util.img(p.image_url, true)}" alt="${util.esc(p.title)}" width="480" height="600"
             loading="${i < 2 ? 'eager' : 'lazy'}" fetchpriority="${i === 0 ? 'high' : 'auto'}" decoding="async">
        ${alternate ? `<img class="card-image-alt" src="${util.img(alternate, true)}" alt="" width="480" height="600" loading="lazy" decoding="async" aria-hidden="true">` : ''}
        <span class="card-badges">${soldBadge}${labelBadge}${saleBadge}</span>
        ${timedBadge ? `<span class="card-timed-badge">${timedBadge}</span>` : ''}
      </a>
      ${quickBtns}
      <div class="card-body">
        <a class="card-title" href="product.html?id=${encodeURIComponent(p.id)}">${util.esc(p.title)}${p.title_en ? ` <span class="en muted card-title-en">${util.esc(p.title_en)}</span>` : ''}</a>
        <div class="card-meta">${priceHTML}</div>
        ${p.category ? `<span class="card-fabric">${util.esc(p.category)}${p.fabric ? ' · ' + util.esc(p.fabric) : ''}</span>` : ''}
      </div>
    </article>`;
  }

  function openQuickView(p) {
    const id = 'quickModal';
    let m = document.getElementById(id);
    if (!m) {
      m = document.createElement('div');
      m.className = 'modal'; m.id = id;
      document.body.appendChild(m);
      ON(m, 'click', e => { if (e.target === m) modal.close(m); });
    }
    const firstSize = stock.firstSize(p);
    const firstColor = stock.firstColor(p);
    const hasCustomSize = (p.sizes || []).some(x => util.isCustomSize(x));
    /* ⭐ المقاسات النافدة تفضل ظاهرة لكن مقفولة ومكتوب عليها SOLD OUT */
    const sizes = (p.sizes || []).map(size => {
      const sold = stock.isSizeSold(p, size);
      const on = !sold && size === firstSize;
      return `<button class="opt-btn ${on ? 'is-on' : ''} ${sold ? 'is-soldout' : ''}" type="button" data-q-size="${util.esc(size)}" ${sold ? 'disabled aria-disabled="true"' : ''}><span class="opt-name">${util.esc(size)}</span>${sold ? '<span class="sold-tag">SOLD OUT</span>' : ''}</button>`;
    }).join('');
    const colors = (p.colors || []).map(color => {
      const sold = stock.isColorSold(p, color.name);
      const on = !sold && color.name === firstColor;
      return `<button class="swatch ${on ? 'is-on' : ''} ${sold ? 'is-soldout' : ''}" type="button" data-q-color="${util.esc(color.name)}" title="${util.esc(color.name)}${sold ? ' — SOLD OUT' : ''}" ${sold ? 'disabled aria-disabled="true"' : ''}><i style="background:${util.esc(color.hex || '#EFECE6')}"></i><span class="swatch-name">${util.esc(color.name)}</span>${sold ? '<span class="sold-tag">SOLD OUT</span>' : ''}</button>`;
    }).join('');
    const sale = offer.state(p) === 'live';
    m.innerHTML = `
      <div class="modal-card quick-card">
        <div class="modal-head"><div><span class="eyebrow">QUICK VIEW</span><h3>${util.esc(p.title)}</h3></div><button class="modal-close" type="button" data-close aria-label="إغلاق">✕</button></div>
        <div class="quick-grid">
          <div class="quick-image"><img src="${util.img(p.image_url)}" alt="${util.esc(p.title)}" width="400" height="500"></div>
          <div class="quick-info">
            <div class="card-meta"><span class="card-price">${util.money(p.price)}</span>${sale ? `<span class="card-price-old">${util.money(p.old_price)}</span><span class="badge badge--sale">تخفيض -${offer.pct(p)}٪</span>` : ''}</div>
            <p class="tiny muted">${util.esc((p.description || '').slice(0, 150))}</p>
            ${sizes ? `<div class="opt"><span class="opt-label">اختاري المقاس</span><div class="opt-grid">${sizes}</div></div>` : ''}
            ${hasCustomSize ? `<div class="size-custom" id="qCustomWrap" hidden>
              <label class="opt-label" for="qCustomValue">${util.esc(CFG.CUSTOM_SIZE_LABEL || 'مقاس خاص')} — اكتبي رقم مقاسك</label>
              <input class="input size-custom-input" id="qCustomValue" inputmode="numeric" autocomplete="off"
                     placeholder="مثال: 42" aria-describedby="qCustomHint">
              <span class="tiny muted" id="qCustomHint">من ${CFG.CUSTOM_SIZE_MIN || 30} لـ ${CFG.CUSTOM_SIZE_MAX || 70}</span>
            </div>` : ''}
            ${colors ? `<div class="opt"><span class="opt-label">اللون</span><div class="opt-grid">${colors}</div></div>` : ''}
            <button class="btn btn--block" type="button" id="quickAdd">أضيفي للسلة</button>
            <a class="link-u" href="product.html?id=${encodeURIComponent(p.id)}">التفاصيل الكاملة <span class="en">→</span></a>
          </div>
        </div>
      </div>`;
    modal.open(id);
    ON(m.querySelector('[data-close]'), 'click', () => modal.close(m));
    const qCustomWrap = m.querySelector('#qCustomWrap');
    const qCustomValue = m.querySelector('#qCustomValue');
    m.querySelectorAll('[data-q-size]').forEach(b => ON(b, 'click', () => {
      m.querySelectorAll('[data-q-size]').forEach(x => x.classList.toggle('is-on', x === b));
      const custom = util.isCustomSize(b.dataset.qSize);
      if (qCustomWrap) {
        qCustomWrap.hidden = !custom;
        if (custom) setTimeout(() => qCustomValue && qCustomValue.focus(), 30);
      }
    }));
    m.querySelectorAll('[data-q-color]').forEach(b => ON(b, 'click', () => {
      m.querySelectorAll('[data-q-color]').forEach(x => x.classList.toggle('is-on', x === b));
    }));
    ON(m.querySelector('#quickAdd'), 'click', () => {
      const baseSize = m.querySelector('[data-q-size].is-on')?.dataset.qSize || '';
      const color = m.querySelector('[data-q-color].is-on')?.dataset.qColor || '';
      if (stock.isSoldOut(p) || !stock.hasSize(p)) return toast('المنتج ده نافد حاليًا.', 'warn');
      if (sizes && !baseSize) return toast('اختاري المقاس أولاً.', 'warn');
      if (baseSize && stock.isSizeSold(p, baseSize)) return toast('المقاس ده نافد — اختاري مقاس تاني.', 'warn');
      if (color && stock.isColorSold(p, color)) return toast('اللون ده نافد — اختاري لون تاني.', 'warn');
      let customValue = '';
      if (util.isCustomSize(baseSize)) {
        customValue = (qCustomValue?.value || '').trim();
        if (!util.validCustomSize(customValue)) {
          qCustomValue?.focus();
          return toast(`اكتبي رقم مقاسك (${CFG.CUSTOM_SIZE_MIN || 30}–${CFG.CUSTOM_SIZE_MAX || 70}).`, 'warn');
        }
      }
      const size = util.composeSize(baseSize, customValue);
      cart.add({ id: p.id, title: p.title, title_en: p.title_en, price: p.price, qty: 1, size, color, image: p.image_url });
      toast('تمت الإضافة إلى سلتك', 'ok');
      modal.close(m);
    });
  }

  function initCartDrawer() {
    if (document.getElementById('cartDrawer')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="cart-drawer-backdrop" data-cart-close></div>
      <div class="cart-drawer" id="cartDrawer" role="dialog" aria-modal="true" aria-label="السلة" aria-hidden="true" tabindex="-1">
        <div class="cart-drawer-head"><div><span class="eyebrow">سلتك</span><h2>السلة <span class="drawer-count" id="drawerCount">0</span></h2></div><button class="modal-close" type="button" data-cart-close aria-label="إغلاق السلة">✕</button></div>
        <div class="cart-drawer-items" id="drawerItems"></div>
        <div class="cart-drawer-empty" id="drawerEmpty"><p>سلتك فارغة.</p><a class="btn btn--ghost btn--sm" href="shop.html">تسوّقي الآن</a></div>
        <div class="cart-drawer-foot" id="drawerFoot"><div class="drawer-total"><span>المجموع الفرعي</span><b id="drawerSubtotal"></b></div><div class="drawer-total drawer-total-final"><span>الإجمالي</span><b id="drawerTotal"></b></div><a class="btn btn--block" id="drawerCheckout" href="checkout.html">إتمام الطلب</a><a class="drawer-view-bag" href="cart.html">عرض السلة الكاملة</a></div>
      </div>`);
    const drawer = $('#cartDrawer');
    let returnFocus = null;
    // الحالة الابتدائية: السلة مقفولة دايمًا مع أول تحميل (حتى لو المتصفح رجّع الصفحة من الكاش)
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-locked');
    const render = () => {
      const items = cart.get();
      $('#drawerCount').textContent = items.reduce((sum, item) => sum + (item.qty || 1), 0);
      $('#drawerItems').innerHTML = items.map(item => {
        const key = `${item.id}__${item.size || ''}__${item.color || ''}`;
        return `<article class="drawer-item" data-key="${util.esc(key)}"><img src="${util.img(item.image || item.image_url, true)}" alt=""><div class="drawer-item-info"><b>${util.esc(item.title)}</b><span>${[(item.size && (util.isCustomSize(item.size) ? util.esc(item.size) : `مقاس ${util.esc(item.size)}`)), item.color && util.esc(item.color)].filter(Boolean).join(' · ')}</span><strong>${util.money(item.price)}</strong></div><button type="button" class="drawer-remove" data-drawer-remove aria-label="حذف ${util.esc(item.title)}">×</button></article>`;
      }).join('');
      $('#drawerEmpty').classList.toggle('hide', items.length > 0);
      $('#drawerFoot').classList.toggle('hide', !items.length);
      $('#drawerSubtotal').textContent = util.money(cart.subtotal());
      $('#drawerTotal').textContent = util.money(cart.total());
    };
    const close = () => {
      if (!drawer.classList.contains('is-open')) { document.body.classList.remove('is-locked'); return; }
      drawer.classList.remove('is-open');
      $('.cart-drawer-backdrop').classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
      $('#cartDrawerOpen')?.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('is-locked');
      returnFocus?.focus();
      returnFocus = null;
    };
    ON($('#cartDrawerOpen'), 'click', () => {
      returnFocus = document.activeElement;
      render(); drawer.classList.add('is-open'); $('.cart-drawer-backdrop').classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
      $('#cartDrawerOpen')?.setAttribute('aria-expanded', 'true');
      document.body.classList.add('is-locked'); drawer.focus();
    });
    $$('[data-cart-close]').forEach(el => ON(el, 'click', close));
    ON(document, 'keydown', e => { if (e.key === 'Escape' && drawer.classList.contains('is-open')) close(); });
    ON(document, 'jl:cart', render);
    ON($('#drawerItems'), 'click', e => {
      const row = e.target.closest('.drawer-item');
      if (!row) return;
      if (e.target.closest('[data-drawer-remove]')) cart.remove(row.dataset.key);
    });
    ON($('#drawerCheckout'), 'click', e => { if (!cart.get().length) { e.preventDefault(); toast('سلتك فارغة.', 'warn'); } });
    // لو الصفحة رجعت من الـ bfcache بعد ما كانت السلة مفتوحة، نقفلها ونفكّ قفل السكرول
    ON(window, 'pageshow', () => { close(); });
    render();
  }

  ON(document, 'click', async e => {
    const trigger = e.target.closest('[data-quick], [data-quick-view]');
    if (!trigger) return;
    e.preventDefault();
    const id = trigger.dataset.quick || trigger.dataset.quickView;
    const p = (await products.all()).find(item => String(item.id) === String(id));
    if (p) openQuickView(p);
  });

  /* ==========================================================
     Keep one lightweight timer for all visible offer countdowns.
     ========================================================== */
  let countdownTimer = null;
  function initCountdowns() {
    if (!$$('[data-offer-end]').length || countdownTimer) return;
    const tick = () => {
      $$('[data-offer-end]').forEach(el => {
        const end = new Date(el.dataset.offerEnd);
        if (isNaN(end)) return;
        const left = end.getTime() - Date.now();
        if (left <= 0) {
          el.textContent = 'انتهى';
          el.closest('.offer-strip, .card-old-badge')?.remove();
          return;
        }
        el.textContent = offer.countdown(end);
      });
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  /* ==========================================================
     8.b) صندوق الكوبون
     ========================================================== */
  function couponBoxHTML() {
    const c = coupons.get();
    if (c) {
      return `<div class="coupon-applied">
          <span class="coupon-tag en">${util.esc(c.code)}</span>
          <span class="coupon-txt">خصم <b>${Number(c.percent)}٪</b> على المنتجات المؤهلة في سلتك</span>
          <button class="coupon-x" data-coupon-remove aria-label="إزالة الكوبون">✕</button>
        </div>`;
    }
    return `<div class="coupon-form">
        <input class="input en" id="couponInput" placeholder="كود الخصم" dir="ltr" autocomplete="off">
        <button class="btn btn--ghost btn--sm" id="couponApply">تطبيق</button>
      </div>
      <p class="coupon-msg" id="couponMsg"></p>`;
  }

  function bindCouponBox(scope = document, onChange) {
    const input = $('#couponInput', scope);
    const btn = $('#couponApply', scope);
    const msg = $('#couponMsg', scope);

    if (input) ON(input, 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
    if (btn) ON(btn, 'click', apply);
    const rm = $('[data-coupon-remove]', scope);
    if (rm) ON(rm, 'click', () => {
      coupons.clear();
      toast('تم إزالة الكوبون.');
      onChange && onChange();
    });

    async function apply() {
      const code = (input?.value || '').trim();
      if (!code) return;
      if (msg) { msg.textContent = 'جارٍ التحقق…'; msg.className = 'coupon-msg'; }
      if (btn) btn.disabled = true;
      try {
        const res = await coupons.validate(code);
        toast(`تم تطبيق الكوبون ${res.code} — خصم ${Number(res.percent)}٪.`, 'ok');
        onChange && onChange();
      } catch (err) {
        if (msg) { msg.textContent = err.message; msg.className = 'coupon-msg is-err'; }
      } finally {
        if (btn) btn.disabled = false;
      }
    }
  }

  /* ==========================================================
     9) التشغيل
     ========================================================== */
  let adminToolsPromise = null;
  function loadAdminTools() {
    if (window.__JL_ADMIN_READY) return Promise.resolve();
    if (adminToolsPromise) return adminToolsPromise;
    adminToolsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `assets/js/admin.js?v=${encodeURIComponent(CFG.ASSET_VERSION || '1')}`;
      script.onload = () => resolve();
      script.onerror = () => { adminToolsPromise = null; reject(new Error('فشل تحميل أدوات الآدمن.')); };
      document.head.appendChild(script);
    });
    return adminToolsPromise;
  }

  /* ==========================================================
     ⭐ Service Worker — تسريع الزيارات المتكررة على الموبايل
     بيخزّن CSS/JS/الصور (وأي صورة منتج من Supabase Storage) محليًا،
     فالزيارة التانية بتفتح من غير ما تنزّل حاجة تقريبًا.
     بيشتغل على https بس (GitHub Pages / Vercel) — file:// بيتجاهله.
     ========================================================== */
  function registerSW() {
    if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
    const v = encodeURIComponent(CFG.ASSET_VERSION || '1');
    navigator.serviceWorker.register(`sw.js?v=${v}`, { scope: './' }).catch(() => { /* مش مشكلة — الموقع شغال */ });
  }
  ON(window, 'load', () => setTimeout(registerSW, 1400));

  document.documentElement.classList.add('js-reveal');
  admin.handleUrl();

  document.addEventListener('DOMContentLoaded', () => {
    loader();
    chrome();
    guidesModal();
    initAccordions();
    document.documentElement.classList.add('is-ready');
    if (!$('#jl-loader')) revealInit();

    if (admin.isAdmin()) loadAdminTools().catch(err => toast(err.message, 'warn'));
    const openAdmin = () => {
      if (!admin.isAdmin()) {
        location.href = `index.html?admin=${encodeURIComponent(admin.token())}`;
        return;
      }
      loadAdminTools()
        .then(() => document.dispatchEvent(new CustomEvent('jl:open-admin')))
        .catch(err => toast(err.message, 'warn'));
    };
    ON($('#quickAdmin'), 'click', openAdmin);
    ON($('#adminDot'), 'click', () => {
      if (admin.isAdmin()) openAdmin();
      else toast('وضع الآدمن غير مفعّل في هذا المتصفح.');
    });
  });

  ON(window, 'pageshow', e => {
    if (e.persisted) {
      products.invalidate();
      cart.badge();
    }
  });

  /* ==========================================================
     التصدير
     ========================================================== */
  window.JL = { CFG, $, $$, ON, util, sb, admin, cart, products, coupons, offer, stock, settings, pendingOrders, KINDS: K, kindStore, cardHTML, initCountdowns, normalize,
    couponBoxHTML, bindCouponBox, modal, toast, loader, waLink, buildOrderMessage, initAccordions, revealWithin, icons, logoSVG };
})();
