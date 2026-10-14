/* planner.js — build 2–3 month plans, re-plan, tick days, fixed events. */
async function initPlanner() {
  const box = document.getElementById('planList');
  box.innerHTML = '<p class="muted">Loading…</p>';
  document.getElementById('planAdd').onclick = Plan.sheet;
  try {
    const plans = await API.get('/api/planner');
    if (!plans.length) { box.innerHTML = '<div class="card center"><p style="font-size:40px">🗺️</p><p><b>No plans yet.</b></p><p class="muted sm">Tap + and tell me your exams, topics and hours.</p></div>'; return; }
    box.innerHTML = plans.map((p) => {
      const days = (p.plan_days || []).sort((a, b) => a.day.localeCompare(b.day));
      const done = days.filter((d) => d.done).length;
      const pct = days.length ? Math.round(done / days.length * 100) : 0;
      return `<div class="card"><b style="font-size:17px">${UI.esc(p.title)}</b>
        <p class="muted sm">${UI.d(p.start_date)} → ${UI.d(p.end_date)} · ${p.hours_per_day}h/day</p>
        <div class="prog"><i style="width:${pct}%"></i></div>
        <p class="sm" style="margin:6px 0 10px">${done}/${days.length} days · ${pct}%</p>
        <div class="row"><button class="btn" data-replan="${p.id}">↻ Re-plan</button>
        <button class="btn" data-days="${p.id}">Days</button>
        <button class="btn danger" style="margin:0" data-delplan="${p.id}">✕</button></div></div>`;
    }).join('');
    box.querySelectorAll('[data-replan]').forEach((b) => b.onclick = async () => {
      const r = await API.post(`/api/planner/${b.dataset.replan}/replan`);
      UI.toast(r.message || `Re-planned ${r.rebuilt_days || 0} days`); initPlanner();
    });
    box.querySelectorAll('[data-delplan]').forEach((b) => b.onclick = () =>
      UI.confirmSheet('Delete plan?', 'All its days go too.', async () => { await API.del(`/api/planner/${b.dataset.delplan}`); initPlanner(); }));
    box.querySelectorAll('[data-days]').forEach((b) => b.onclick = () => Plan.days(b.dataset.days, plans));
  } catch (e) {
    box.innerHTML = `<div class="card"><b>Could not load planner</b><p class="muted">${UI.esc(e?.message || 'Request failed')}</p><button class="btn" id="planRetry">Try again</button></div>`;
    document.getElementById('planRetry').onclick = () => initPlanner();
  }
};
const Plan = {
  sheet() {
    const t = new Date().toISOString().slice(0, 10);
    const e = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
    UI.sheet(`<h3 style="font-family:var(--font-d);font-size:22px;margin-bottom:12px">New plan</h3>
      ${UI.field('Title', '<input id="plTitle" placeholder="Semester exams">')}
      <div class="row">${UI.field('From', `<input id="plFrom" type="date" value="${t}">`)}${UI.field('To', `<input id="plTo" type="date" value="${e}">`)}</div>
      ${UI.field('Hours per day', '<input id="plHrs" type="number" value="4" min="1" max="16">')}
      ${UI.field('Daily study reminder', '<input id="plTime" type="time" value="17:00">')}
      ${UI.field('Topics (one per line)', '<textarea id="plTopics" placeholder="Java OOP\nDBMS joins\nOS scheduling"></textarea>')}
      ${UI.field('Leisure', '<input id="plLei" placeholder="Movies, games…">')}
      <p class="kicker">Fixed events first? Add exams below, then build.</p>
      <div class="row"><input id="evTitle" placeholder="Exam name"><input id="evDate" type="date"><button class="btn" id="evAdd">+</button></div>
      <button class="btn primary" id="plGo" style="width:100%">Build my plan</button>`);
    document.getElementById('evAdd').onclick = async () => {
      const title = document.getElementById('evTitle').value.trim(), event_date = document.getElementById('evDate').value;
      if (!title || !event_date) return UI.toast('Exam name + date needed');
      await API.post('/api/planner/events', { title, event_date });
      UI.toast('Exam added'); document.getElementById('evTitle').value = '';
    };
    document.getElementById('plGo').onclick = async () => {
      const topics = document.getElementById('plTopics').value.split('\n').map((s) => s.trim()).filter(Boolean);
      if (!topics.length) return UI.toast('Add at least one topic');
      try {
        const start = document.getElementById('plFrom').value, end = document.getElementById('plTo').value;
        const studyTime = document.getElementById('plTime').value;
        if (!start || !end || !studyTime || end < start) return UI.toast('Choose a valid date range and reminder time');
        const studyReminders = [];
        const cursor = new Date(`${start}T12:00:00`), last = new Date(`${end}T12:00:00`);
        while (cursor <= last) {
          const day = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
          const due = new Date(`${day}T${studyTime}`);
          if (due > new Date()) studyReminders.push({ due_at: due.toISOString() });
          cursor.setDate(cursor.getDate() + 1);
        }
        const r = await API.post('/api/planner/build', {
          title: document.getElementById('plTitle').value.trim() || 'My plan',
          start_date: start, end_date: end,
          hours_per_day: Number(document.getElementById('plHrs').value),
          topics, leisure: document.getElementById('plLei').value.trim(), study_reminders: studyReminders,
        });
        UI.closeSheet(); UI.toast(`Planned ${r.days} days · ${r.reminders || 0} study reminders set`); initPlanner();
      } catch (e) { UI.toast(e.message); }
    };
  },
  days(id, plans) {
    const p = plans.find((x) => x.id === id);
    const days = (p.plan_days || []).sort((a, b) => a.day.localeCompare(b.day)).slice(0, 60);
    UI.sheet(`<h3 style="font-family:var(--font-d);font-size:22px;margin-bottom:12px">${UI.esc(p.title)}</h3>` +
      days.map((d) => `<div class="rem${d.done ? ' done' : ''}"><div class="dot" style="background:${d.done ? 'var(--ok)' : 'var(--gold)'}"></div>
        <div class="t"><b>${UI.d(d.day)}</b><span>${(d.blocks || []).map((b) => `${UI.esc(b.title)} (${b.minutes}m)`).join(' · ')}</span></div>
        ${d.done ? '' : `<button class="btn sm" data-done="${p.id}|${d.day}">✓</button>`}</div>`).join(''));
    document.querySelectorAll('[data-done]').forEach((b) => b.onclick = async () => {
      const [plan_id, day] = b.dataset.done.split('|');
      await API.post('/api/planner/day-done', { plan_id, day });
      UI.closeSheet(); initPlanner();
    });
  },
};

document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('page-planner') && !document.getElementById('planHub')) initPlanner(); });
