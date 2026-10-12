/* groups.js — group tasks: create group, add members, assign, progress board. */
async function initGroups() {
  const box = document.getElementById('groupList');
  box.innerHTML = '<p class="muted">Loading…</p>';
  document.getElementById('groupAdd').onclick = Groups.sheet;
  try {
    const groups = await API.get('/api/groups');
    if (!groups.length) { box.innerHTML = '<div class="card center"><p style="font-size:40px">👥</p><p><b>No groups yet.</b></p><p class="muted sm">Create one, add people, split the work.</p></div>'; return; }
    box.innerHTML = groups.map((g) => {
      const tasks = g.group_tasks || [];
      const done = tasks.filter((t) => t.status === 'done').length;
      const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
      return `<div class="card"><b style="font-size:17px">${UI.esc(g.name)}</b>
        <p class="muted sm">${(g.group_members || []).length} members</p>
        <div class="prog"><i style="width:${pct}%"></i></div>
        <p class="sm" style="margin:6px 0 10px">${done}/${tasks.length} done</p>
        ${tasks.map((t) => `<div class="rem${t.status === 'done' ? ' done' : ''}"><div class="dot" style="background:${t.status === 'done' ? 'var(--ok)' : 'var(--signal)'}"></div>
          <div class="t"><b>${UI.esc(t.title)}</b><span>${t.due_at ? UI.dt(t.due_at) : 'no date'} · ${t.status}</span></div>
          ${t.status !== 'done' ? `<button class="btn sm" data-gdone="${t.id}">✓</button>` : ''}</div>`).join('')}
        <div class="row" style="margin-top:8px"><input id="gt-${g.id}" placeholder="New task…"><button class="btn" data-gadd="${g.id}">+</button></div></div>`;
    }).join('');
    box.querySelectorAll('[data-gadd]').forEach((b) => b.onclick = async () => {
      const inp = document.getElementById('gt-' + b.dataset.gadd);
      const title = inp.value.trim(); if (!title) return;
      const email = prompt('Assign to (email, optional):') || '';
      await API.post(`/api/groups/${b.dataset.gadd}/tasks`, { title, assignee_email: email || undefined });
      UI.toast('Task added'); initGroups();
    });
    box.querySelectorAll('[data-gdone]').forEach((b) => b.onclick = async () => {
      await API.post(`/api/groups/tasks/${b.dataset.gdone}/done`);
      UI.toast('Marked done ✓'); initGroups();
    });
  } catch (e) { box.innerHTML = '<p class="muted">Backend unreachable.</p>'; }
};
const Groups = {
  sheet() {
    UI.sheet(`<h3 style="font-family:var(--font-d);font-size:22px;margin-bottom:12px">New group</h3>
      ${UI.field('Group name', '<input id="gName" placeholder="Project team">')}
      ${UI.field('Member emails (comma separated)', '<input id="gEmails" placeholder="a@mail.com, b@mail.com">')}
      <p class="sm muted" style="margin-bottom:10px">Everyone needs a Persona account.</p>
      <button class="btn primary" id="gGo" style="width:100%">Create group</button>`);
    document.getElementById('gGo').onclick = async () => {
      const name = document.getElementById('gName').value.trim();
      if (!name) return UI.toast('Name needed');
      const member_emails = document.getElementById('gEmails').value.split(',').map((s) => s.trim()).filter(Boolean);
      try { await API.post('/api/groups', { name, member_emails }); UI.closeSheet(); UI.toast('Group created'); initGroups(); }
      catch (e) { UI.toast(e.message); }
    };
  },
};

document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('page-groups')) initGroups(); });
