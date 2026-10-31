/* ============================================================
   عوام الدلنجات — SHOP
   الأقسام بتيجي من config.js (مصدر واحد) + خريطة الأسماء القديمة
   ============================================================ */
const { $, $$, ON, util, products, cardHTML } = window.JL;

/* ⭐ «الكل» + الأقسام الأربعة: عبايات · عبايات سواريه · درسات · هوم وير */
const AWAM_FILTERS = [
  { label: 'الكل', key: 'all' },
  ...util.categories().map(label => ({ label, key: `category:${label}` }))
];

function matchesFilter(product, key) {
  if (key === 'all') return true;
  if (key.startsWith('category:')) {
    /* util.category بتحوّل الأسماء القديمة (دلنجات → درسات، استقبال → عبايات سواريه) */
    return String(util.category(product.category) || '').toLowerCase() === key.slice(9).toLowerCase();
  }
  return true;
}

document.addEventListener('DOMContentLoaded', async () => {
  const grid = $('#shopGrid');
  const chipsBox = $('#catChips');
  const sortSel = $('#sortSel');
  const countEl = $('#resCount');
  const params = new URLSearchParams(location.search);
  let list = await products.all();
  const requested = util.category(params.get('cat') || '');
  const extraCategories = [...new Set(list.map(p => util.category(p.category)).filter(Boolean))]
    .filter(category => !AWAM_FILTERS.some(f => f.label.toLowerCase() === category.toLowerCase()));
  const filters = [...AWAM_FILTERS, ...extraCategories.map(category => ({ label: category, key: `category:${category}` }))];
  let active = requested
    ? (filters.find(f => f.key.toLowerCase() === requested.toLowerCase() || f.label.toLowerCase() === requested.toLowerCase())?.key || `category:${requested}`)
    : 'all';

  chipsBox.innerHTML = filters.map(f => `
    <button class="chip ${f.key === active ? 'is-on' : ''}" type="button" data-filter="${util.esc(f.key)}" aria-pressed="${f.key === active}">${util.esc(f.label)}</button>`).join('');
  $$('.chip', chipsBox).forEach(button => ON(button, 'click', () => {
    active = button.dataset.filter;
    $$('.chip', chipsBox).forEach(chip => {
      const selected = chip === button;
      chip.classList.toggle('is-on', selected);
      chip.setAttribute('aria-pressed', String(selected));
    });
    const selected = filters.find(f => f.key === active);
    if (active === 'all') history.replaceState({}, '', location.pathname);
    else history.replaceState({}, '', `?cat=${encodeURIComponent(selected?.label || active.slice(9))}`);
    render();
  }));

  function render() {
    let rows = list.filter(product => matchesFilter(product, active));
    const sort = sortSel.value;
    if (sort === 'price-asc') rows.sort((a, b) => a.price - b.price);
    if (sort === 'price-desc') rows.sort((a, b) => b.price - a.price);
    if (sort === 'new') rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    if (!rows.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>مفيش قطع في القسم ده بعد</b><span class="tiny">جرّبي قسم تاني أو تسوّقي كل المنتجات.</span><button class="btn btn--ghost btn--sm" type="button" data-reset-filter>تسوّقي الكل</button></div>`;
      ON(grid.querySelector('[data-reset-filter]'), 'click', () => chipsBox.querySelector('[data-filter="all"]')?.click());
    } else {
      grid.innerHTML = rows.map((product, index) => cardHTML(product, index)).join('');
      window.JL.initCountdowns();
      window.JL.revealWithin(grid);
    }
    countEl.textContent = `${rows.length} ${rows.length === 1 ? 'قطعة' : 'قطعة'}`;
  }

  ON(sortSel, 'change', render);
  render();
});
