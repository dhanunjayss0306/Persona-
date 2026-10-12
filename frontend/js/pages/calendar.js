/* calendar.js — month grid fed by the merged /api/calendar feed. */
const Cal = { y: 0, m: 0, sel: null, feed: {} };
function initCalendar() {
  const n = new Date();
  Cal.y = n.getFullYear(); Cal.m = n.getMonth();
  Cal.sel = n.toISOString().slice(0, 10);
  document.getElementById('calPrev').onclick = () => { Cal.m--; if (Cal.m < 0) { Cal.m = 11; Cal.y--; } Cal.draw(); };
  document.getElementById('calNext').onclick = () => { Cal.m++; if (Cal.m > 11) { Cal.m = 0; Cal.y++; } Cal.draw(); };
  Cal.draw();
};
Cal.draw = async function () {
  const title = new Date(Cal.y, Cal.m, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  document.getElementById('calTitle').textContent = title;
  const from = `${Cal.y}-${String(Cal.m + 1).padStart(2, '0')}-01`;
  const last = new Date(Cal.y, Cal.m + 1, 0).getDate();
  const to = `${Cal.y}-${String(Cal.m + 1).padStart(2, '0')}-${last}`;
  try { Cal.feed = (await API.get(`/api/calendar?from=${from}&to=${to}`)).days; }
  catch { Cal.feed = {}; }
  const first = new Date(Cal.y, Cal.m, 1).getDay();
  let html = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < first; i++) html += '<div></div>';
  for (let d = 1; d <= last; d++) {
    const key = `${Cal.y}-${String(Cal.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const day = Cal.feed[key];
    const has = day && (day.reminders.length || day.plan_blocks.length || day.events.length);
    html += `<button class="day${has ? ' has' : ''}${key === Cal.sel ? ' sel' : ''}" data-d="${key}">${d}</button>`;
  }
  const g = document.getElementById('calGrid');
  g.innerHTML = html;
  g.querySelectorAll('.day').forEach((b) => b.onclick = () => { Cal.sel = b.dataset.d; Cal.draw(); });
  Cal.day();
};
Cal.day = function () {
  const box = document.getElementById('calDay');
  const d = Cal.feed[Cal.sel];
  if (!d) { box.innerHTML = `<p class="kicker">${UI.d(Cal.sel)} — nothing</p>`; return; }
  let html = `<p class="kicker">${UI.d(Cal.sel)}</p>`;
  d.events.forEach((e) => html += `<div class="rem"><div class="dot" style="background:var(--gold)"></div><div class="t"><b>${UI.esc(e.title)}</b><span>📌 ${e.kind}</span></div></div>`);
  d.reminders.forEach((r) => html += Reminders.row(r));
  d.plan_blocks.forEach((b) => html += `<div class="rem"><div class="dot" style="background:var(--muted)"></div><div class="t"><b>${UI.esc(b.title)}</b><span>📋 ${b.minutes} min</span></div></div>`);
  box.innerHTML = html;
  Reminders.bindRows(box);
};

document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('page-calendar')) initCalendar(); });
