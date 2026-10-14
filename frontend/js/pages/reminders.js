/* reminders.js — list, create, proof-to-dismiss, edit, delete. */
const Reminders = {
  filter: 'all',
  row(r) {
    const type = r.type === 'nag' ? '<span class="badge nag">strict</span>' : '<span class="badge">once</span>';
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
      ${UI.field('Type', `<div class="seg" id="nrType"><button data-t="once" class="on">Once</button><button data-t="nag">Strict (nags till proof)</button></div>`)}
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
      <p class="muted sm" style="margin-bottom:12px">${r.type === 'nag' ? 'STRICT — nags every 5 min until you prove it' : 'One-time'} · ${UI.dt(r.due_at)} · ${r.status}</p>
      ${r.details ? `<p style="margin-bottom:12px">${UI.esc(r.details)}</p>` : ''}
      ${proofs.length ? `<p class="kicker">Proof submitted</p>` + proofs.map((p) => `<p class="sm">✓ ${p.kind}${p.text ? ' — ' + UI.esc(p.text) : ''}${p.file_url ? ` — <a href="${p.file_url}" target="_blank">view</a>` : ''}</p>`).join('') : ''}
      ${r.status !== 'done' ? `
      <p class="kicker">Prove it's done</p>
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
function initReminders() {
  document.querySelectorAll('#remSeg button').forEach((b) => b.onclick = () => {
    document.querySelectorAll('#remSeg button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on'); Reminders.filter = b.dataset.f; Reminders.render();
  });
  document.getElementById('remAdd').onclick = () => Reminders.createSheet();
  Reminders.render();
};

document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('page-reminders') && !document.getElementById('planHub')) initReminders(); });
