/* today.js — greeting + today's agenda from the merged calendar feed. */
async function initToday() {
  const u = Auth.user();
  const h = new Date().getHours();
  document.getElementById('todayHello').textContent =
    `Good ${h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'}${u ? ', ' + u.name.split(' ')[0] : ''}`;
  const box = document.getElementById('todayList');
  box.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const today = new Date();
    const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const { days } = await API.get(`/api/calendar?from=${t}&to=${t}`);
    const d = days[t];
    if (!d || (!d.reminders.length && !d.plan_blocks.length && !d.events.length)) {
      box.innerHTML = '<div class="card center"><p style="font-size:40px">🌤️</p><p><b>Nothing scheduled today.</b></p><p class="muted sm">Enjoy the free day — or plan one.</p></div>';
      return;
    }
    let html = '';
    d.events.forEach((e) => html += `<div class="rem"><div class="dot" style="background:var(--gold)"></div><div class="t"><b>${UI.esc(e.title)}</b><span>📌 ${e.kind}</span></div></div>`);
    d.reminders.forEach((r) => html += Reminders.row(r));
    d.plan_blocks.forEach((b) => html += `<div class="rem"><div class="dot" style="background:var(--muted)"></div><div class="t"><b>${UI.esc(b.title)}</b><span>📋 ${b.minutes} min ${b.done ? '· done' : ''}</span></div></div>`);
    box.innerHTML = html;
    Reminders.bindRows(box);
  } catch (e) { box.innerHTML = `<p class="muted">Couldn't load — is the backend running?</p>`; }
  document.getElementById('todayVoice').onclick = () => go('voice');
};

document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('page-today')) initToday(); });
