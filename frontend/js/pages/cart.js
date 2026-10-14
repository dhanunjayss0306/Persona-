/* cart.js — price tracker: paste link → auto-added → price checked → drop alerts. */
async function initCart() {
  const box = document.getElementById('cartList');
  box.innerHTML = '<p class="muted">Loading…</p>';
  document.getElementById('cartAdd').onclick = Cart.sheet;
  try {
    const items = await API.get('/api/cart');
    if (!items.length) { box.innerHTML = '<div class="card center"><p style="font-size:40px">🛒</p><p><b>Cart is empty.</b></p><p class="muted sm">Track a product from a supported retailer. Prices are shown only when the retailer publishes a verifiable INR price.</p></div>'; return; }
    box.innerHTML = items.map((c) => {
      const verified = c.last_price_source === 'verified' && c.last_price != null;
      const hit = c.target_price && verified && Number(c.last_price) <= Number(c.target_price);
      return `<div class="card"><b>${UI.esc(c.name)}</b>
        <p class="muted sm">${UI.esc(c.shop || '')} · <a href="${UI.esc(c.url)}" target="_blank">open product</a></p>
        <p style="font-size:22px;font-weight:800;font-family:var(--font-d)">${verified ? UI.inr(c.last_price) : 'No verified price yet'}
        ${c.target_price ? `<span class="sm muted"> / target ${UI.inr(c.target_price)}</span>` : ''}</p>
        ${hit ? '<p><span class="badge nag">target hit</span></p>' : ''}
        ${verified && c.last_checked_at ? `<p class="sm muted">verified ${UI.dt(c.last_checked_at)}</p>` : '<p class="sm muted">The shop may block checks or omit exact price data; guesses are never displayed.</p>'}
        <div class="row" style="margin-top:10px"><button class="btn" data-check="${c.id}">↻ Check now</button>
        <button class="btn" data-edt="${c.id}">✎ Target</button>
        <button class="btn danger" style="margin:0" data-delc="${c.id}">✕</button></div>
        <section class="priceHistory" id="hist-${c.id}" aria-label="Price history for ${UI.esc(c.name)}"><p class="muted sm">Loading price history…</p></section></div>`;
    }).join('');
    box.querySelectorAll('[data-check]').forEach((b) => b.onclick = async () => {
      UI.toast('Checking…');
      try { const r = await API.post(`/api/cart/${b.dataset.check}/check`); UI.toast(r.target_hit ? `🎯 Target hit at ${UI.inr(r.price)}!` : `Verified at ${UI.inr(r.price)}`); initCart(); }
      catch (e) { UI.toast(e.message); }
    });
    items.forEach((item) => Cart.loadHistory(item.id));
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
  } catch (e) {
    box.innerHTML = `<div class="card"><b>Could not load price tracker</b><p class="muted">${UI.esc(e?.message || 'Request failed')}</p><button class="btn" id="cartRetry">Try again</button></div>`;
    document.getElementById('cartRetry').onclick = () => initCart();
  }
};
const Cart = {
  async loadHistory(id) {
    const el = document.getElementById('hist-' + id);
    if (!el) return;
    try {
      const history = await API.get(`/api/cart/${id}/history`);
      if (!history.length) {
        el.innerHTML = '<p class="priceHistoryEmpty">No verified history yet. Choose <b>Check now</b> to record a reading if the retailer provides exact INR price data.</p>';
        return;
      }
      const points = history.slice(-16).map((entry) => ({ price: Number(entry.price), date: entry.checked_at }));
      const prices = points.map((point) => point.price);
      const min = Math.min(...prices), max = Math.max(...prices), spread = max - min || max * .12 || 1;
      const coords = points.map((point, index) => ({
        ...point,
        x: points.length === 1 ? 160 : 12 + (index / (points.length - 1)) * 296,
        y: 76 - ((point.price - min) / spread) * 54,
      }));
      const line = coords.map((point) => `${point.x},${point.y}`).join(' ');
      const last = coords[coords.length - 1];
      const low = Math.min(...prices);
      el.innerHTML = `<div class="historyHeading"><span>PRICE HISTORY</span><span>${points.length} ${points.length === 1 ? 'check' : 'checks'}</span></div>
        <svg class="historyChart" viewBox="0 0 320 92" role="img" aria-label="Price history, from ${UI.inr(prices[0])} to ${UI.inr(last.price)}">
          <path class="historyGrid" d="M8 22H312M8 49H312M8 76H312"/><polyline class="historyLine" points="${line}"/>
          ${coords.map((point) => `<circle class="historyPoint" cx="${point.x}" cy="${point.y}" r="3"><title>${UI.inr(point.price)}${point.date ? ` · ${UI.d(point.date)}` : ''}</title></circle>`).join('')}
          <circle class="historyLatest" cx="${last.x}" cy="${last.y}" r="5"/>
        </svg><div class="historyMeta"><span>Lowest <b>${UI.inr(low)}</b></span><span>Latest <b>${UI.inr(last.price)}</b></span><span>${last.date ? UI.d(last.date) : ''}</span></div>`;
    } catch (error) {
      el.innerHTML = `<p class="priceHistoryEmpty">Could not load history: ${UI.esc(error?.message || 'request failed')}</p>`;
    }
  },
  sheet() {
    UI.sheet(`<h3 style="font-family:var(--font-d);font-size:22px;margin-bottom:12px">Track a product</h3>
      ${UI.field('Name', '<input id="cName" placeholder="boAt Nirvana Space">')}
      ${UI.field('Product link', '<input id="cUrl" placeholder="https://… (Amazon India, Flipkart, Croma, Myntra, Ajio)">')}
      ${UI.field('Tell me when below ₹ (optional)', '<input id="cT" type="number" placeholder="1500">')}
      <p class="muted sm">Prices are recorded only when the shop page provides an explicit INR product price. Some stores block automatic checks.</p>
      <button class="btn primary" id="cGo" style="width:100%">Add + check price</button>`);
    document.getElementById('cGo').onclick = async () => {
      const name = document.getElementById('cName').value.trim(), url = document.getElementById('cUrl').value.trim();
      if (!name || !url) return UI.toast('Name + link needed');
      try {
        const item = await API.post('/api/cart', { name, url, target_price: Number(document.getElementById('cT').value) || null });
        UI.closeSheet(); UI.toast('Added — checking price…');
        API.post(`/api/cart/${item.id}/check`).then(() => initCart()).catch((error) => { UI.toast(error.message, 5000); initCart(); });
      } catch (e) { UI.toast(e.message); }
    };
  },
};

document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('page-cart')) initCart(); });
