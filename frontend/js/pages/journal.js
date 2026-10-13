/* journal.js — the 3D rotating book. Entries are pages; themes re-skin the cover. */
const Journal = { entries: [], idx: 0 };
async function initJournal() {
  try {
    Journal.entries = await API.get('/api/journal');
  } catch { Journal.entries = []; }
  Journal.idx = Math.max(0, Journal.entries.length - 1);
  document.getElementById('bookCount').textContent = Journal.entries.length + ' entries';
  Journal.show();
  document.getElementById('bookPrev').onclick = () => Journal.turn(-1);
  document.getElementById('bookNext').onclick = () => Journal.turn(1);
  document.getElementById('bookWrite').onclick = Journal.writeSheet;
  document.getElementById('bookTheme').onchange = (e) => {
    document.querySelector('.bookCover').className = 'bookCover theme-' + e.target.value;
  };
  document.getElementById('bookShare').onclick = async () => {
    const e = Journal.entries[Journal.idx];
    if (!e) return UI.toast('Write something first');
    const r = await API.post(`/api/journal/${e.id}/share`);
    const url = location.origin + location.pathname.replace(/[^/]*$/, '') + r.share_url.replace(/^\//, '');
    UI.sheet(`<h3 style="font-family:var(--font-d);font-size:22px;margin-bottom:8px">Share this entry</h3>
      <p class="muted sm" style="margin-bottom:12px">Anyone with this link can read it book-style. No login needed.</p>
      <input id="shareUrl" readonly value="${url}" onclick="this.select()">
      <div class="row"><button class="btn primary" id="cpLink">Copy</button><button class="btn danger" style="margin:0" id="revLink">Revoke</button></div>`);
    document.getElementById('cpLink').onclick = () => { navigator.clipboard.writeText(url); UI.toast('Copied'); };
    document.getElementById('revLink').onclick = async () => { await API.del(`/api/journal/${e.id}/share`); UI.closeSheet(); UI.toast('Link revoked'); };
  };
};
Journal.turn = function (direction) {
  const next = Journal.idx + direction;
  if (next < 0 || next >= Journal.entries.length || Journal.turning) return;
  const book = document.getElementById('book3d');
  Journal.turning = true;
  book.classList.add(direction > 0 ? 'turn-next' : 'turn-prev');
  setTimeout(() => { Journal.idx = next; Journal.show(); }, 210);
  setTimeout(() => { book.classList.remove('turn-next', 'turn-prev'); Journal.turning = false; }, 470);
};
Journal.show = function () {
  const p = document.getElementById('bookPage');
  const e = Journal.entries[Journal.idx];
  if (!e) { p.innerHTML = '<h4>Empty book</h4><p class="muted">Tap “Write today” to begin.</p>'; return; }
  p.innerHTML = `<div class="mood">${UI.esc(e.mood || 'A NOTE TO SELF')} · ${UI.d(e.entry_date)}</div><h4>${UI.esc(e.title || 'Untitled')}</h4><p>${UI.esc(e.body)}</p>`;
};
Journal.writeSheet = function () {
  const t = new Date().toISOString().slice(0, 10);
  UI.sheet(`<h3 style="font-family:var(--font-d);font-size:22px;margin-bottom:12px">Today's entry</h3>
    ${UI.field('Title', '<input id="jTitle" placeholder="…">')}
    ${UI.field('Body', '<textarea id="jBody" placeholder="Something about my life…"></textarea>')}
    <div class="row">${UI.field('Mood', '<input id="jMood" placeholder="calm">')}${UI.field('Date', `<input id="jDate" type="date" value="${t}">`)}</div>
    <button class="btn primary" id="jGo" style="width:100%">Save page</button>`);
  document.getElementById('jGo').onclick = async () => {
    const body = document.getElementById('jBody').value.trim();
    if (!body) return UI.toast('Write something first');
    try {
      await API.post('/api/journal', {
        title: document.getElementById('jTitle').value.trim(),
        body, mood: document.getElementById('jMood').value.trim(),
        entry_date: document.getElementById('jDate').value,
        theme: document.getElementById('bookTheme').value,
      });
      UI.closeSheet(); UI.toast('Page added 📖'); initJournal();
    } catch (e) { UI.toast(e.message); }
  };
};

document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('page-journal')) initJournal(); });
