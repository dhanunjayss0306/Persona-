/* cart.js — price tracker: paste link → auto-added → price checked → drop alerts. */
async function initCart() {
  const box = document.getElementById('cartList');
  box.innerHTML = '<p class="muted">Loading…</p>';
  document.getElementById('cartAdd').onclick = Cart.sheet;
  try {
    const items = await API.get('/api/cart');
    if (!items.length) { box.innerHTML = '<div class="card center"><p style="font-size:40px">🛒</p><p><b>Cart is empty.</b></p><p class="muted sm">Paste a product link — I\'ll track its price.</p></div>'; return; }
    box.innerHTML = items.map((c) => {
      const hit = c.target_price && c.last_price && Number(c.last_price) <= Number(c.target_price);
      return `<div class="card"><b>${UI.esc(c.name)}</b>
        <p class="muted sm">${UI.esc(c.shop || '')} · <a href="${UI.esc(c.url)}" target="_blank">open product</a></p>
        <p style="font-size:22px;font-weight:800;font-family:var(--font-d)">${c.last_price ? UI.inr(c.last_price) : '—'}
        ${c.target_price ? `<span class="sm muted"> / target ${UI.inr(c.target_price)}</span>` : ''}</p>
        ${hit ? '<p><span class="badge nag">target hit</span></p>' : ''}
        ${c.last_checked_at ? `<p class="sm muted">checked ${UI.dt(c.last_checked_at)}</p>` : ''}
        <div class="row" style="margin-top:10px"><button class="btn" data-check="${c.id}">↻ Check now</button>
        <button class="btn" data-hist="${c.id}">📈</button>
        <button class="btn" data-edt="${c.id}">✎ Target</button>
        <button class="btn danger" style="margin:0" data-delc="${c.id}">✕</button></div>
        <div id="hist-${c.id}"></div></div>`;
    }).join('');
    box.querySelectorAll('[data-check]').forEach((b) => b.onclick = async () => {
      UI.toast('Checking…');
      try { const r = await API.post(`/api/cart/${b.dataset.check}/check`); UI.toast(r.target_hit ? `🎯 Target hit at ${UI.inr(r.price)}!` : `Now ${UI.inr(r.price)}`); initCart(); }
      catch (e) { UI.toast(e.message); }
    });
    box.querySelectorAll('[data-hist]').forEach((b) => b.onclick = async () => {
      const h = await API.get(`/api/cart/${b.dataset.hist}/history`);
      const el = document.getElementById('hist-' + b.dataset.hist);
      if (!h.length) { el.innerHTML = '<p class="sm muted">No history yet.</p>'; return; }
      const max = Math.max(...h.map((x) => Number(x.price)));
      el.innerHTML = `<div class="spark">${h.slice(-20).map((x) => `<i style="height:${Math.max(8, Number(x.price) / max * 100)}%"></i>`).join('')}</div>`;
    });
    box.querySelectorAll('[data-edt]').forEach((b) => b.onclick = () => {
      UI.sheet(`<h3 style="font-family:var(--font-d);font-size:22px;margin-bottom:12px">Alert me when…</h3>
        ${UI.field('Target price (₹)', '<input id="ctT" type="number" placeholder="1500">')}
        <button class="btn primary" id="ctGo" style="width:100%">Save target</button>`);
      document.getElementById('ctGo').onclick = async () => {
        await API.patch(`/api/cart/${b.dataset.edt}`, { target_price: Number(document.getElementById('ctT').value) || null });
        UI.closeSheet(); UI.toast('Target saved'); initCart();
      };
    });
    box.querySelectorAll('[data-delc]').forEach((b) => b.onclick = () =>
      UI.confirmSheet('Remove from cart?', 'Price history goes too.', async () => { await API.del(`/api/cart/${b.dataset.delc}`); initCart(); }));
  } catch (e) { box.innerHTML = '<p class="muted">Backend unreachable.</p>'; }
};
const Cart = {
  sheet() {
    UI.sheet(`<h3 style="font-family:var(--font-d);font-size:22px;margin-bottom:12px">Track a product</h3>
      ${UI.field('Name', '<input id="cName" placeholder="boAt Nirvana Space">')}
      ${UI.field('Product link', '<input id="cUrl" placeholder="https://… (Myntra, Ajio, Flipkart, Amazon)">')}
      ${UI.field('Tell me when below ₹ (optional)', '<input id="cT" type="number" placeholder="1500">')}
      <button class="btn primary" id="cGo" style="width:100%">Add + check price</button>`);
    document.getElementById('cGo').onclick = async () => {
      const name = document.getElementById('cName').value.trim(), url = document.getElementById('cUrl').value.trim();
      if (!name || !url) return UI.toast('Name + link needed');
      try {
        const item = await API.post('/api/cart', { name, url, target_price: Number(document.getElementById('cT').value) || null });
        UI.closeSheet(); UI.toast('Added — checking price…');
        API.post(`/api/cart/${item.id}/check`).then(() => initCart()).catch(() => initCart());
      } catch (e) { UI.toast(e.message); }
    };
  },
};

document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('page-cart')) initCart(); });
