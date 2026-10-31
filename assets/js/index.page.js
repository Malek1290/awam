/* ============================================================
   عوام AWAM — HOME PAGE
   ============================================================ */
const { $, products, cardHTML } = window.JL;

document.addEventListener('DOMContentLoaded', async () => {
  const grid = $('#homeGrid');
  const list = await products.all();
  grid.innerHTML = list.slice(0, 8).map((product, index) => cardHTML(product, index, { quick: true })).join('');
  window.JL.initCountdowns();
  window.JL.revealWithin(grid);
});
