/* Monthly calendar backed by the merged calendar feed. */
const Cal = { y: 0, m: 0, sel: null, feed: {}, loadError: false, requestId: 0 };
const localISODate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function initCalendar() {
  const now = new Date();
  Cal.y = now.getFullYear(); Cal.m = now.getMonth(); Cal.sel = localISODate(now);
  document.getElementById('calPrev').onclick = () => Cal.moveMonth(-1);
  document.getElementById('calNext').onclick = () => Cal.moveMonth(1);
  document.getElementById('calAdd').onclick = () => Cal.add();
  Cal.draw();
}

Cal.moveMonth = function (delta) {
  const next = new Date(Cal.y, Cal.m + delta, 1);
  Cal.y = next.getFullYear(); Cal.m = next.getMonth();
  const day = Math.min(Number(Cal.sel.slice(-2)), new Date(Cal.y, Cal.m + 1, 0).getDate());
  Cal.sel = `${Cal.y}-${String(Cal.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  Cal.draw();
};

Cal.draw = async function () {
  const requestId = ++Cal.requestId;
  document.getElementById('calTitle').textContent = new Date(Cal.y, Cal.m, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const from = `${Cal.y}-${String(Cal.m + 1).padStart(2, '0')}-01`;
  const last = new Date(Cal.y, Cal.m + 1, 0).getDate();
  const to = `${Cal.y}-${String(Cal.m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  try { Cal.feed = (await API.get(`/api/calendar?from=${from}&to=${to}`)).days; Cal.loadError = false; }
  catch { Cal.feed = {}; Cal.loadError = true; }
  if (requestId !== Cal.requestId) return;
  const first = new Date(Cal.y, Cal.m, 1).getDay();
  let html = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => `<div class="dow">${day}</div>`).join('');
  for (let i = 0; i < first; i++) html += '<div aria-hidden="true"></div>';
  for (let day = 1; day <= last; day++) {
    const key = `${Cal.y}-${String(Cal.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const data = Cal.feed[key];
    const has = data && (data.reminders.length || data.plan_blocks.length || data.events.length);
    const today = key === localISODate(new Date());
    html += `<button class="day${has ? ' has' : ''}${key === Cal.sel ? ' sel' : ''}${today ? ' today' : ''}" data-d="${key}" aria-label="${day}${has ? ', items planned' : ''}" aria-pressed="${key === Cal.sel}">${day}</button>`;
  }
  const grid = document.getElementById('calGrid');
  grid.innerHTML = html;
  grid.querySelectorAll('.day').forEach((button) => { button.onclick = () => { Cal.sel = button.dataset.d; Cal.draw(); }; });
  Cal.day();
};

Cal.day = function () {
  const box = document.getElementById('calDay');
  const data = Cal.feed[Cal.sel];
  const heading = `<div class="dayPlanHead"><div><span class="eyebrow">SELECTED DAY</span><h3>${UI.esc(UI.d(Cal.sel))}</h3></div><button class="btn addDayBtn" id="calAddDay"><span aria-hidden="true">+</span> Add activity</button></div>`;
  if (Cal.loadError) {
    box.innerHTML = `${heading}<div class="emptyPlan"><b>Couldn’t load your calendar</b><p>Check your connection and try again.</p><button class="btn" id="calRetry">Retry</button></div>`;
    document.getElementById('calRetry').onclick = () => Cal.draw();
  } else if (!data || (!data.reminders.length && !data.plan_blocks.length && !data.events.length)) {
    box.innerHTML = `${heading}<div class="emptyPlan"><span class="emptySun" aria-hidden="true"><svg viewBox="0 0 52 52" fill="none"><circle cx="26" cy="26" r="10"/><path d="M26 3v8m0 30v8M3 26h8m30 0h8M9.7 9.7l5.7 5.7m21.2 21.2 5.7 5.7m0-32.6-5.7 5.7M15.4 36.6l-5.7 5.7"/></svg></span><b>A little room to plan</b><p>Add a task, appointment, or anything you want to make time for.</p></div>`;
  } else {
    let html = heading;
    data.events.forEach((event) => { html += `<div class="rem"><div class="dot" style="background:var(--gold)"></div><div class="t"><b>${UI.esc(event.title)}</b><span>${UI.esc(event.kind || 'Event')}</span></div><span class="badge">Event</span></div>`; });
    data.reminders.forEach((reminder) => { html += Reminders.row(reminder); });
    data.plan_blocks.forEach((block) => { html += `<div class="rem"><div class="dot" style="background:var(--muted)"></div><div class="t"><b>${UI.esc(block.title)}</b><span>${Number(block.minutes) || 0} min${block.done ? ' · done' : ''}</span></div></div>`; });
    box.innerHTML = html;
    Reminders.bindRows(box);
  }
  const addDay = document.getElementById('calAddDay');
  if (addDay) addDay.onclick = () => Cal.add();
};

Cal.add = function () {
  UI.sheet(`<div class="calendarSheetHead"><span class="eyebrow">MAKE A PLAN</span><h2>Add to your day</h2><p>This will appear on your calendar and in reminders.</p></div>
    ${UI.field('What are you planning?', '<input id="caTitle" maxlength="160" placeholder="e.g. Team check-in">')}
    <div class="row calendarDateRow"><div>${UI.field('Date', `<input id="caDate" type="date" value="${UI.esc(Cal.sel)}">`)}</div><div>${UI.field('Time', '<input id="caTime" type="time" value="09:00">')}</div></div>
    ${UI.field('Notes (optional)', '<input id="caDetails" maxlength="500" placeholder="Add a little context">')}
    <button class="btn primary calendarSave" id="caSave">Add to calendar</button>`);
  document.getElementById('caSave').onclick = async (event) => {
    const button = event.currentTarget;
    const title = document.getElementById('caTitle').value.trim();
    const date = document.getElementById('caDate').value;
    const time = document.getElementById('caTime').value;
    const details = document.getElementById('caDetails').value.trim();
    if (!title) return UI.toast('Add a title for your activity');
    if (!date || !time) return UI.toast('Choose a date and time');
    const dueAt = new Date(`${date}T${time}`);
    if (Number.isNaN(dueAt.getTime())) return UI.toast('Choose a valid date and time');
    button.disabled = true; button.textContent = 'Adding…';
    try {
      await API.post('/api/reminders', { title, details, type: 'once', due_at: dueAt.toISOString() });
      Cal.sel = date; Cal.y = dueAt.getFullYear(); Cal.m = dueAt.getMonth();
      UI.closeSheet(); UI.toast('Added to your calendar'); await Cal.draw();
    } catch (error) { button.disabled = false; button.textContent = 'Add to calendar'; UI.toast(error.message); }
  };
};

document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('page-calendar')) initCalendar(); });
