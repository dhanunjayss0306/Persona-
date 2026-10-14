/* expenses.js — 5-second UPI expense log + monthly summaries. */
async function initExpenses() {
  document.getElementById('expAdd').onclick = Exp.sheet;
  const m = new Date().toISOString().slice(0, 7);
  try {
    const s = await API.get(`/api/expenses/summary?month=${m}`);
    document.getElementById('expSummary').innerHTML =
      `<p class="kicker">This month</p><p style="font-family:var(--font-d);font-size:34px;font-weight:800">${UI.inr(s.total)}</p>
       <p class="muted sm">${s.count} payments</p>
       <div class="spark">${Object.values(s.byCategory).map((v) => { const mx = Math.max(...Object.values(s.byCategory), 1); return `<i style="height:${Math.max(10, v / mx * 100)}%"></i>`; }).join('')}</div>
       <p class="sm" style="margin-top:8px">${Object.entries(s.byCategory).map(([k, v]) => `${UI.esc(k)}: ${UI.inr(v)}`).join(' · ')}</p>`;
    const list = await API.get('/api/expenses');
    document.getElementById('expList').innerHTML = list.slice(0, 50).map((e) =>
      `<div class="rem"><div class="dot" style="background:var(--gold)"></div>
       <div class="t"><b>${UI.inr(e.amount)}${e.paid_to ? ' → ' + UI.esc(e.paid_to) : ''}</b><span>${UI.esc(e.upi_app || '')} ${UI.esc(e.category || '')} · ${UI.dt(e.spent_at)}</span></div>
       <button class="btn sm" data-exdel="${e.id}">✕</button></div>`).join('') || '<p class="muted center">No expenses logged.</p>';
    document.querySelectorAll('[data-exdel]').forEach((b) => b.onclick = async () => { await API.del(`/api/expenses/${b.dataset.exdel}`); initExpenses(); });
  } catch (e) { document.getElementById('expList').innerHTML = `<div class="card"><p class="muted">Could not load expenses: ${UI.esc(e?.message || 'request failed')}</p><button class="btn" id="expRetry">Try again</button></div>`; document.getElementById('expRetry').onclick = () => initExpenses(); }
};
const Exp = {
  sheet() {
    UI.sheet(`<h3 style="font-family:var(--font-d);font-size:22px;margin-bottom:12px">Log payment</h3>
      ${UI.field('Amount ₹', '<input id="eAmt" type="number" inputmode="decimal" placeholder="250">')}
      <div class="row">${UI.field('Paid to', '<input id="eTo" placeholder="Canteen">')}${UI.field('UPI app', `<select id="eApp"><option>GPay</option><option>PhonePe</option><option>Paytm</option><option>BHIM</option><option>Other</option></select>`)}</div>
      ${UI.field('Category', '<input id="eCat" placeholder="food, travel…">')}
      <button class="btn primary" id="eGo" style="width:100%">Save</button>`);
    document.getElementById('eGo').onclick = async () => {
      const amount = Number(document.getElementById('eAmt').value);
      if (!amount) return UI.toast('Amount needed');
      try {
        await API.post('/api/expenses', { amount, paid_to: document.getElementById('eTo').value.trim(), upi_app: document.getElementById('eApp').value, category: document.getElementById('eCat').value.trim() });
        UI.closeSheet(); UI.toast('Logged'); initExpenses();
      } catch (e) { UI.toast(e.message); }
    };
  },
};

document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('page-expenses')) initExpenses(); });
