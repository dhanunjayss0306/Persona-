/* reminders.js — list, create, proof-to-dismiss, edit, delete. */
const Reminders = {
  filter: 'all',
  row(r) {
    const type = r.type === 'nag' ? '<span class="badge nag">Sticky</span>' : '<span class="badge">once</span>';
    const source = r.details?.startsWith('Plan assistant:') ? '<span class="badge">study plan</span>' : '';
    const done = r.status === 'done' ? ' done' : '';
    return `<div class="rem ${r.type}${done}" data-id="${r.id}">
      <div class="dot"></div>
      <div class="t"><b>${UI.esc(r.title)}</b><span>${UI.dt(r.due_at)} · ${r.status}</span></div>
      ${source || type}</div>`;
  },
  bindRows(root) {
    root.querySelectorAll('.rem[data-id]').forEach((el) => {
      el.onclick = () => Reminders.detail(el.dataset.id);
    });
  },
  async render() {
    const box = document.getElementById('remList');
    box.innerHTML = '<p class="muted">Loading…</p>';
    try {
      const all = await API.get('/api/reminders');
      const rows = all.filter((r) => this.filter === 'all' || r.type === this.filter);
      box.innerHTML = rows.length ? rows.map((r) => this.row(r)).join('') : '<p class="muted center" style="margin-top:30px">No reminders. Tap + to add one.</p>';
      this.bindRows(box);
    } catch (e) {
      const message = e?.message || 'Request failed';
      box.innerHTML = `<section class="card remLoadError" role="alert"><b>Could not load reminders</b><p class="muted">${UI.esc(message)}</p><button class="btn" id="remRetry" type="button">Try again</button></section>`;
      document.getElementById('remRetry').onclick = () => this.render();
    }
  },
  createSheet() {
    const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    UI.sheet(`<h3 style="font-family:var(--font-d);font-size:22px;margin-bottom:12px">New reminder</h3>
      ${UI.field('Title', '<input id="nrTitle" placeholder="Submit assignment">')}
      ${UI.field('Type', `<div class="seg" id="nrType"><button data-t="once" class="on">Once</button><button data-t="nag">Sticky</button></div>`)}
      <div class="row reminderWhen"><div>${UI.field('Date', `<input id="nrDate" type="date" value="${now.toISOString().slice(0, 10)}">`)}</div><div>${UI.field('Time', `<input id="nrTime" type="time" value="${now.toISOString().slice(11, 16)}">`)}</div></div>
      <p class="muted sm reminderClockHint">Choose a time using your device’s clock picker.</p>
      ${UI.field('Details (optional)', '<input id="nrDet" placeholder="…">')}
      <button class="btn primary" id="nrGo" style="width:100%">Set reminder</button>`);
    let type = 'once';
    document.querySelectorAll('#nrType button').forEach((b) => b.onclick = () => {
      document.querySelectorAll('#nrType button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on'); type = b.dataset.t;
    });
    document.getElementById('nrGo').onclick = async () => {
      try {
        const date = document.getElementById('nrDate').value, time = document.getElementById('nrTime').value;
        if (!date || !time) return UI.toast('Choose a date and time');
        const due = new Date(`${date}T${time}`);
        await API.post('/api/reminders', {
          title: document.getElementById('nrTitle').value.trim(),
          details: document.getElementById('nrDet').value.trim(),
          type, due_at: due.toISOString(),
        });
        UI.closeSheet(); UI.toast('Reminder set'); this.render();
      } catch (e) { UI.toast(e.message); }
    };
  },
  async detail(id) {
    const r = await API.get(`/api/reminders/${id}`);
    const proofs = await API.get(`/api/reminders/${id}/proofs`).catch(() => []);
    UI.sheet(`<h3 style="font-family:var(--font-d);font-size:22px;margin-bottom:6px">${UI.esc(r.title)}</h3>
      <p class="muted sm" style="margin-bottom:12px">${r.type === 'nag' ? 'Sticky — repeats every 5 min until Done; proof is optional' : 'One-time'} · ${UI.dt(r.due_at)} · ${r.status}</p>
      ${r.details ? `<p style="margin-bottom:12px">${UI.esc(r.details)}</p>` : ''}
      ${proofs.length ? `<p class="kicker">Proof submitted</p>` + proofs.map((p) => `<p class="sm">✓ ${p.kind}${p.text ? ' — ' + UI.esc(p.text) : ''}${p.file_url ? ` — <a href="${p.file_url}" target="_blank">view</a>` : ''}</p>`).join('') : ''}
      ${r.status !== 'done' ? `
      <div class="row"><button class="btn primary" id="remDone">Done</button><button class="btn" id="remSnooze">Snooze 10m</button></div>
      <p class="kicker">Add proof (optional)</p>
      <div class="row"><button class="btn" id="pfPhoto">📷 Photo</button><button class="btn" id="pfVoice">🎤 Voice</button></div>
      <div class="row"><input id="pfText" placeholder="Or type what you did…"><button class="btn primary" id="pfTextGo">✓</button></div>
      <input type="file" id="pfFile" accept="image/*,audio/*,.pdf" class="hidden">` : '<p class="kicker" style="color:var(--ok)">✓ Done — nagging stopped</p>'}
      <div class="row" style="margin-top:14px"><button class="btn" id="rEdit">✎ Edit</button><button class="btn danger" id="rDel" style="margin:0">Delete</button></div>`);
    const fileOf = (kind) => {
      const inp = document.getElementById('pfFile');
      inp.onchange = async () => {
        if (!inp.files[0]) return;
        const fd = new FormData(); fd.append('kind', kind); fd.append('file', inp.files[0]);
        try { await API.call(`/api/reminders/${id}/proof`, { method: 'POST', form: fd }); proofDone(); }
        catch (e) { UI.toast(e.message); }
      };
      inp.click();
    };
    const proofDone = () => { UI.toast('Proof accepted — nagging stopped ✓'); UI.closeSheet(); this.render(); };
    const has = (x) => document.getElementById(x);
    if (has('remDone')) has('remDone').onclick = async () => { try { await API.patch(`/api/reminders/${id}`, { status:'done' }); UI.closeSheet(); this.render(); } catch(e) { UI.toast(e.message); } };
    if (has('remSnooze')) has('remSnooze').onclick = async () => { try { await API.patch(`/api/reminders/${id}`, { due_at:new Date(Date.now()+600000).toISOString() }); UI.closeSheet(); this.render(); UI.toast('Snoozed for 10 minutes'); } catch(e) { UI.toast(e.message); } };
    if (has('pfPhoto')) has('pfPhoto').onclick = () => fileOf('photo');
    if (has('pfVoice')) has('pfVoice').onclick = () => fileOf('voice');
    if (has('pfTextGo')) has('pfTextGo').onclick = async () => {
      const t = has('pfText').value.trim(); if (!t) return UI.toast('Type what you did');
      try { await API.post(`/api/reminders/${id}/proof`, { kind: 'text', text: t }); proofDone(); }
      catch (e) { UI.toast(e.message); }
    };
    has('rDel').onclick = () => UI.confirmSheet('Delete reminder?', 'This cannot be undone.', async () => {
      await API.del(`/api/reminders/${id}`); this.render();
    });
    has('rEdit').onclick = () => {
      const editDate = new Date(r.due_at);
      editDate.setMinutes(editDate.getMinutes() - editDate.getTimezoneOffset());
      UI.sheet(`<h3 style="font-family:var(--font-d);font-size:22px;margin-bottom:12px">Edit reminder</h3>
        ${UI.field('Title', `<input id="erTitle" value="${UI.esc(r.title)}">`)}
        <div class="row reminderWhen"><div>${UI.field('Date', `<input id="erDate" type="date" value="${editDate.toISOString().slice(0, 10)}">`)}</div><div>${UI.field('Time', `<input id="erTime" type="time" value="${editDate.toISOString().slice(11, 16)}">`)}</div></div>
        ${UI.field('Details', `<input id="erDet" value="${UI.esc(r.details || '')}">`)}
        <button class="btn primary" id="erGo" style="width:100%">Save</button>`);
      document.getElementById('erGo').onclick = async () => {
        try {
          const date = document.getElementById('erDate').value, time = document.getElementById('erTime').value;
          if (!date || !time) return UI.toast('Choose a date and time');
          await API.patch(`/api/reminders/${id}`, {
            title: document.getElementById('erTitle').value.trim(),
            details: document.getElementById('erDet').value.trim(),
            due_at: new Date(`${date}T${time}`).toISOString(),
          });
          UI.closeSheet(); UI.toast('Updated'); this.render();
        } catch (e) { UI.toast(e.message); }
      };
    };
  },
};

const Tasks = { filter: 'today' };
async function initTasks() {
  document.getElementById('taskAdd').onclick = () => Tasks.add();
  document.querySelectorAll('#taskSeg [data-task-filter]').forEach((button) => button.onclick = () => {
    Tasks.filter = button.dataset.taskFilter;
    document.querySelectorAll('#taskSeg [data-task-filter]').forEach((tab) => tab.classList.toggle('on', tab === button));
    Tasks.render();
  });
  await Tasks.render();
}
Tasks.render = async function () {
  const box = document.getElementById('taskList'); box.innerHTML = '<p class="muted">Loading tasks…</p>';
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const fromDate = new Date(today); fromDate.setDate(fromDate.getDate()-90);
    const toDate = new Date(today); toDate.setDate(toDate.getDate()+90);
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const [all, calendar] = await Promise.all([API.get('/api/reminders'), API.get(`/api/calendar?from=${iso(fromDate)}&to=${iso(toDate)}`)]);
    const tasks = [
      ...all.map((task) => ({ id:task.id, title:task.title, due:task.due_at, done:task.status==='done', source:'reminder', detail:`${task.type==='nag'?'Sticky':'Plain'} task · ${task.status}`, raw:task })),
      ...Object.entries(calendar.days || {}).flatMap(([date,day]) => [
        ...(day.events||[]).map((event) => ({ id:event.id, title:event.title, due:event.source==='calendar' ? `${date}T${event.start_time||'09:00'}` : `${date}T00:00`, done:false, source:'context', detail:event.kind||'Calendar event', raw:event })),
        ...(day.plan_blocks||[]).map((block) => ({ id:`${block.plan_id}|${date}`, title:block.title, due:`${date}T12:00`, done:Boolean(block.done), source:'context', detail:`Study block · ${block.minutes||0} min`, raw:block })),
      ]),
    ];
    const filtered = tasks.filter((task) => {
      const due=new Date(task.due);
      if(this.filter==='history') return task.source==='context' && due<today;
      if(this.filter==='done') return task.source==='reminder' && task.done;
      if(task.source==='context') return false;
      if(task.done) return false;
      if(this.filter==='today') return due>=today && due<new Date(today.getTime()+864e5);
      if(this.filter==='overdue') return due<today;
      return due>=new Date(today.getTime()+864e5);
    }).sort((a,b)=>new Date(a.due)-new Date(b.due));
    box.innerHTML = filtered.length ? filtered.map((task) => `<div class="rem taskRow${task.done?' done':''}" data-task-source="${task.source}" data-task-id="${UI.esc(task.id)}"><div class="dot"></div><div class="t"><b>${UI.esc(task.title)}</b><span>${UI.esc(task.detail)} · ${UI.d(task.due)}</span></div>${task.source==='reminder'?`<button class="btn sm" data-task-edit="${UI.esc(task.id)}">Edit</button>${task.done?'':`<button class="btn primary sm" data-task-done="${UI.esc(task.id)}">Done</button>`}<button class="btn sm" data-task-delete="${UI.esc(task.id)}" aria-label="Delete ${UI.esc(task.title)}">×</button>`:'<span class="badge">History</span>'}</div>`).join('') : `<div class="card center"><p><b>No ${this.filter} items.</b></p><p class="muted sm">A little space to breathe, or add a task when you’re ready.</p></div>`;
    box.querySelectorAll('[data-task-edit]').forEach((button) => button.onclick=(event)=>{event.stopPropagation();Reminders.detail(button.dataset.taskEdit);});
    box.querySelectorAll('[data-task-done]').forEach((button) => button.onclick=async(event)=>{event.stopPropagation();try{await API.patch(`/api/reminders/${button.dataset.taskDone}`,{status:'done'});await Tasks.render();UI.toast('Task done');}catch(error){UI.toast(error.message);}});
    box.querySelectorAll('[data-task-plan-done]').forEach((button) => button.onclick=async()=>{const [plan_id,day]=button.dataset.taskPlanDone.split('|');try{await API.post('/api/planner/day-done',{plan_id,day});await Tasks.render();UI.toast('Study day complete');}catch(error){UI.toast(error.message);}});
    box.querySelectorAll('[data-task-delete]').forEach((button) => button.onclick=(event)=>{event.stopPropagation();UI.confirmSheet('Delete task?','This cannot be undone.',async()=>{await API.del(`/api/reminders/${button.dataset.taskDelete}`);await Tasks.render();});});
    box.querySelectorAll('[data-task-calendar-edit]').forEach((button)=>button.onclick=()=>{const item=tasks.find((task)=>task.source==='calendar'&&String(task.id)===button.dataset.taskCalendarEdit);if(item)Cal.edit(item.raw);});
    box.querySelectorAll('[data-task-calendar-delete]').forEach((button)=>button.onclick=async()=>{try{await API.del(`/api/calendar/events/${button.dataset.taskCalendarDelete}`);await Tasks.render();UI.toast('Calendar event removed');}catch(error){UI.toast(error.message);}});
  } catch (error) { box.innerHTML = `<div class="card"><b>Could not load tasks</b><p class="muted">${UI.esc(error.message)}</p><button class="btn" id="taskRetry">Retry</button></div>`; document.getElementById('taskRetry').onclick = () => Tasks.render(); }
};
Tasks.add = function () {
  const now = new Date(); now.setMinutes(now.getMinutes()-now.getTimezoneOffset());
  UI.sheet(`<h3 style="font-family:var(--font-d);font-size:22px;margin-bottom:12px">Add a task</h3>${UI.field('Task', '<input id="taskTitle" maxlength="160" placeholder="Finish the assignment">')}<div class="row"><input id="taskDate" type="date" value="${now.toISOString().slice(0,10)}" aria-label="Due date"><input id="taskTime" type="time" value="17:00" aria-label="Due time"></div><label class="switchRow"><span>Sticky reminders</span><input type="checkbox" id="taskSticky" checked></label><button class="btn primary" id="taskSave" style="width:100%">Add task</button><p class="muted sm" style="margin-top:8px">Sticky tasks repeat every five minutes. Plain tasks stay quiet.</p>`);
  document.getElementById('taskSave').onclick = async () => { const title=document.getElementById('taskTitle').value.trim(), date=document.getElementById('taskDate').value, time=document.getElementById('taskTime').value; if (!title || !date || !time) return UI.toast('Add a task and due time'); try { await API.post('/api/reminders',{title,type:document.getElementById('taskSticky').checked?'nag':'plain',proof_required:false,due_at:new Date(`${date}T${time}`).toISOString()}); UI.closeSheet(); await Tasks.render(); UI.toast('Task added'); } catch(error) { UI.toast(error.message); } };
};
function initReminders() {
  document.querySelectorAll('#remSeg button').forEach((b) => b.onclick = () => {
    document.querySelectorAll('#remSeg button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on'); Reminders.filter = b.dataset.f; Reminders.render();
  });
  document.getElementById('remAdd').onclick = () => Reminders.createSheet();
  Reminders.render();
};

document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('page-reminders') && !document.getElementById('planHub')) initReminders(); });
