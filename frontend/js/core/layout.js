/* layout.js — shared page chrome + navigation. Loaded on every page.
   Layout.chrome('app', title, tab)    → app bar + tab bar + login guard (normal pages)
   Layout.chrome('minimal')            → sheet/toast only (login, signup)            */
function go(page) { location.href = page + '.html'; }

const Layout = {
  TABS: [
    ['today', '🏠', 'Today'],
    ['reminders', '⏰', 'Reminders'],
    ['calendar', '📅', 'Calendar'],
    ['ai', '✨', 'Ask'],
  ],
  MORE: [
    ['planner', '📋', 'Planner'],
    ['journal', '📖', 'Journal'],
    ['cart', '🛒', 'Price tracker'],
    ['expenses', '💸', 'Expenses'],
    ['favorites', '⭐', 'Favorites'],
    ['groups', '👥', 'Groups'],
    ['voice', '🎙', 'Voice'],
    ['settings', '⚙', 'Settings'],
  ],
  chrome(mode, title, tab) {
    const app = document.getElementById('app');
    if (mode === 'app') {
      if (!Auth.user()) { location.href = '../index.html'; return; }
      document.title = title + ' · Persona';
      app.insertAdjacentHTML('afterbegin',
        `<header id="appbar" class="glass"><img class="logoMark" src="../assets/logo-mark.png" alt="Persona"><h1>${title}</h1><button id="profileBtn" class="iconBtn" aria-label="Settings">⚙</button></header>`);
      document.getElementById('profileBtn').onclick = () => go('settings');
    }
    let nav = '';
    if (mode === 'app') {
      nav = '<nav id="tabbar">' +
        this.TABS.map(([p, ic, label]) => `<button data-go="${p}" class="${p === tab ? 'on' : ''}">${ic}<span>${label}</span></button>`).join('') +
        '<button data-more="1">☰<span>More</span></button></nav>';
    }
    app.insertAdjacentHTML('beforeend', nav +
      '<div id="sheetWrap" class="hidden"><div id="sheetBg"></div><div id="sheet" class="glass"></div></div>' +
      '<div id="toast" class="hidden"></div>');
    document.getElementById('sheetBg').onclick = () => UI.closeSheet();
    if (mode === 'app') {
      app.querySelectorAll('#tabbar [data-go]').forEach((b) => { b.onclick = () => go(b.dataset.go); });
      app.querySelector('#tabbar [data-more]').onclick = () => UI.sheet(
        '<h3 style="font-size:20px;font-weight:700;margin-bottom:12px">More</h3>' +
        this.MORE.map(([p, ic, label]) => `<button class="btn" style="width:100%;margin-bottom:8px;text-align:left" onclick="go('${p}')">${ic} &nbsp;${label}</button>`).join(''));
      this.push();
    }
  },
  push() {
    try {
      if (!('Notification' in window) || Notification.permission !== 'default') return;
      if (!localStorage.getItem('persona_push_asked')) {
        localStorage.setItem('persona_push_asked', '1');
        Notification.requestPermission().catch(() => {});
      }
    } catch (e) { /* ignore */ }
  },
};
