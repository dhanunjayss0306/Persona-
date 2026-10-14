/* today.js — greeting + today's agenda from the merged calendar feed. */
async function initToday() {
  let timezone='Asia/Kolkata'; try { timezone=(await API.get('/api/auth/me')).user?.timezone||timezone; } catch(error) { console.error('Could not load profile timezone:',error.message); }
  const u = Auth.user();
  const h = new Date().getHours();
  document.getElementById('todayHello').textContent =
    `Good ${h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'}${u ? ', ' + u.name.split(' ')[0] : ''}`;
  const box = document.getElementById('todayList');
  box.innerHTML = '<p class="muted">Loading…</p>';
  document.querySelectorAll('.quickRow [data-go]').forEach((button) => button.onclick = () => go(button.dataset.go));
  document.getElementById('todayVoice').onclick = () => go('voice');
  const upcomingExamPrompt = renderUpcomingExamPrompt(box);
  const activeSticky = renderActiveSticky(box);
  const weeklyReview = renderWeeklyReview(box, timezone);
  try {
    const { days, from:t } = await API.get('/api/calendar');
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
  } catch (e) {
    box.innerHTML = `<div class="card"><p class="muted">Could not load today: ${UI.esc(e?.message || 'request failed')}</p><button class="btn" id="todayRetry">Try again</button></div>`;
    document.getElementById('todayRetry').onclick = () => initToday();
  } finally {
    await upcomingExamPrompt;
    await activeSticky;
    await weeklyReview;
  }
};

async function renderUpcomingExamPrompt(box) {
  try {
    const events = await API.get('/api/planner/events');
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const through = new Date(from); through.setDate(through.getDate() + 30);
    const upcoming = (events || []).filter((event) => {
      const [year, month, day] = String(event.event_date).slice(0, 10).split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return date >= from && date <= through && (event.kind || 'exam').toLowerCase().includes('exam');
    }).sort((a, b) => a.event_date.localeCompare(b.event_date));
    if (!upcoming.length) return;
    const exam = upcoming[0];
    const [year, month, day] = exam.event_date.slice(0, 10).split('-').map(Number);
    const examDate = new Date(year, month - 1, day);
    const daysLeft = Math.round((examDate - from) / 864e5);
    const when = daysLeft === 0 ? 'today' : daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`;
    const examLabel = examDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    box.insertAdjacentHTML('afterbegin', `<section class="card examPrompt"><span class="eyebrow">STUDY CHECK-IN</span><h3>${UI.esc(exam.title)} is ${when}</h3><p class="muted sm">Your exam is on ${examLabel}. Set aside study time today; Persona can turn your topics into a daily plan and reminders.</p><button class="btn primary" id="todayExamPlan" type="button">Open study planner</button>${upcoming.length > 1 ? `<p class="muted sm examMore">${upcoming.length - 1} more exam${upcoming.length === 2 ? '' : 's'} in the next 30 days</p>` : ''}</section>`);
    document.getElementById('todayExamPlan').onclick = () => go('planner');
  } catch (error) { box.insertAdjacentHTML('afterbegin', `<p class="muted sm" role="alert">Could not load exam dates: ${UI.esc(error.message)}</p>`); }
}

async function renderActiveSticky(box) {
  try {
    const reminders = await API.get('/api/reminders');
    const active = (reminders || []).filter((item) => item.type === 'nag' && item.status !== 'done' && new Date(item.due_at) <= new Date()).sort((a,b) => new Date(a.due_at)-new Date(b.due_at));
    if (!active.length) return;
    box.insertAdjacentHTML('afterbegin', `<section class="card activeSticky"><span class="eyebrow">STICKY MINDER</span><h3>Still on your list</h3>${active.slice(0,8).map((item) => `<div class="stickyItem" data-sticky-id="${UI.esc(item.id)}"><div><b>${UI.esc(item.title)}</b><small>${UI.dt(item.due_at)}</small></div><button class="btn sm" data-sticky-snooze="${UI.esc(item.id)}">Snooze 10m</button><button class="btn primary sm" data-sticky-done="${UI.esc(item.id)}">Done</button></div>`).join('')}</section>`);
    box.querySelectorAll('[data-sticky-done]').forEach((button) => button.onclick = async () => { try { await API.patch(`/api/reminders/${button.dataset.stickyDone}`, { status: 'done' }); await initToday(); UI.toast('Marked done'); } catch(error) { UI.toast(error.message); } });
    box.querySelectorAll('[data-sticky-snooze]').forEach((button) => button.onclick = async () => { try { const due = new Date(Date.now()+10*60000).toISOString(); await API.patch(`/api/reminders/${button.dataset.stickySnooze}`, { due_at: due }); await initToday(); UI.toast('Snoozed for 10 minutes'); } catch(error) { UI.toast(error.message); } });
  } catch (error) { box.insertAdjacentHTML('afterbegin', `<p class="muted sm" role="alert">Could not load sticky reminders: ${UI.esc(error.message)}</p>`); }
}

async function renderWeeklyReview(box, timezone='Asia/Kolkata') {
  try {
    const rows=await API.get('/api/reminders'), now=new Date(), todayKey=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now), today=new Date(`${todayKey}T12:00:00Z`), start=new Date(today); start.setUTCDate(start.getUTCDate()-6);
    const week=Array.from({length:7},(_,index)=>{const date=new Date(start);date.setUTCDate(date.getUTCDate()+index);const key=date.toISOString().slice(0,10);const items=rows.filter((row)=>new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(row.due_at))===key);return {key,label:date.toLocaleDateString('en-IN',{weekday:'short'}),done:items.filter((row)=>row.status==='done').length,total:items.length};});
    const complete=week.reduce((sum,day)=>sum+day.done,0), total=week.reduce((sum,day)=>sum+day.total,0), percent=total?Math.round(complete/total*100):0;
    let streak=0; for(let i=week.length-1;i>=0;i--){if(week[i].done)streak++;else if(week[i].key!==todayKey)break;}
    const chart=`<div class="weekChart" role="img" aria-label="Reminders completed over the last seven days">${week.map((day)=>`<div><i style="height:${Math.max(8,day.total?day.done/day.total*100:8)}%" title="${day.done} of ${day.total} done"></i><small>${day.label}</small></div>`).join('')}</div>`;
    box.insertAdjacentHTML('beforeend', `<details class="card weeklyReview"><summary><span class="eyebrow">YOUR WEEK</span><b>Progress and streak</b><span class="weeklyScore">${percent}%</span></summary><p class="muted sm">${complete} of ${total} reminders done · ${streak}-day completion streak</p>${chart}</details>`);
  } catch (error) { box.insertAdjacentHTML('beforeend', `<section class="card" role="alert"><b>Could not load weekly review</b><p class="muted sm">${UI.esc(error.message)}</p></section>`); }
}

document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('page-today')) initToday(); });
