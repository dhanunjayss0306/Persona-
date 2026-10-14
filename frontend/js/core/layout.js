/* Shared page chrome and navigation. */
function go(page) {
  if (page === 'plan') {
    if (!location.pathname.endsWith('/plan.html')) location.href = 'plan.html';
    return;
  }
  const planningViews = { calendar: 'calendar', reminders: 'reminders', planner: 'planner' };
  const view = planningViews[page];
  if (view) {
    if (location.pathname.endsWith('/plan.html')) window.PlanHub?.show(view);
    else location.href = `plan.html#${view}`;
    return;
  }
  location.href = page + '.html';
}

const AppIcon = {
  paths: {
    home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    spark:'<path d="m12 3 1.9 5.8L20 11l-6.1 2.1L12 19l-1.9-5.9L4 11l6.1-2.2L12 3zM19 15l1 2.5 2 1-2 1-1 2.5-1-2.5-2-1 2-1z"/>',
    more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    planner:'<path d="M5 4h14v17H5zM8 8h8M8 12h8M8 16h5"/>', book:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22zM4 5.5v16.5"/>',
    cart:'<path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 1.9-1.4L22 8H6M10 21h.01M18 21h.01"/>',
    wallet:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M16 14h2"/>', star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6"/>',
    mic:'<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>',
    phone:'<path d="M5 4h3l2 5-2 1.5a15 15 0 0 0 5.5 5.5L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    settings:'<path d="M10 2h4l.6 2.2a8 8 0 0 1 1.5.9l2.2-.6 2 3.5-1.6 1.6a8 8 0 0 1 0 1.8l1.6 1.6-2 3.5-2.2-.6a8 8 0 0 1-1.5.9L14 19h-4l-.6-2.2a8 8 0 0 1-1.5-.9l-2.2.6-2-3.5 1.6-1.6a8 8 0 0 1 0-1.8L3.7 8l2-3.5 2.2.6a8 8 0 0 1 1.5-.9L10 2z"/><circle cx="12" cy="11" r="2.5"/>',
    logout:'<path d="M10 17l5-5-5-5M15 12H3M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
    moon:'<path d="M20.9 13A8.5 8.5 0 0 1 11 3.1 8.5 8.5 0 1 0 20.9 13z"/>',
  },
  svg(name) { return `<svg class="appIcon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${this.paths[name] || this.paths.more}</svg>`; },
};

const Layout = {
  TABS: [['today','home','Today'],['plan','calendar','Plan'],['ai','spark','Ask']],
  MORE: [['journal','book','Journal'],['cart','cart','Price tracker'],['expenses','wallet','Expenses'],['favorites','star','Favorites'],['groups','users','Groups'],['voice','mic','Voice'],['settings','settings','Settings']],
  applyTheme() {
    const saved = localStorage.getItem('persona_theme');
    const theme = saved || 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    let themeMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.name = 'theme-color';
      document.head.appendChild(themeMeta);
    }
    themeMeta.content = theme === 'dark' ? '#171c19' : '#E7EEE5';
  },
  setTheme(theme) {
    localStorage.setItem('persona_theme', theme === 'dark' ? 'dark' : 'light');
    this.applyTheme();
    this.syncThemeButton();
  },
  syncThemeButton() {
    const button = document.getElementById('themeBtn');
    if (!button) return;
    const dark = document.documentElement.dataset.theme === 'dark';
    button.innerHTML = AppIcon.svg(dark ? 'moon' : 'sun');
    button.setAttribute('aria-label', dark ? 'Switch to light appearance' : 'Switch to dark appearance');
    button.title = dark ? 'Switch to light appearance' : 'Switch to dark appearance';
    const preference = document.getElementById('darkMode');
    if (preference) preference.checked = dark;
  },
  chrome(mode, title, tab) {
    this.applyTheme();
    const app = document.getElementById('app');
    if (mode === 'app') {
      if (!Auth.user()) { location.href = '../index.html'; return; }
      document.title = title + ' · Persona';
      app.insertAdjacentHTML('afterbegin', `<header id="appbar" class="glass"><a class="brandHome" href="today.html" aria-label="Persona home"><img class="logoMark" src="../assets/logo-mark.png" alt=""></a><h1>${title}</h1><div class="headerActions"><button id="themeBtn" class="iconBtn" aria-label="Switch appearance"></button><button id="profileBtn" class="iconBtn" aria-label="Settings">${AppIcon.svg('settings')}</button></div></header>`);
      document.getElementById('profileBtn').onclick = () => go('settings');
      this.syncThemeButton();
      document.getElementById('themeBtn').onclick = () => this.setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    }
    let nav = '';
    const activeTab = ['calendar', 'reminders', 'planner'].includes(tab) ? 'plan' : tab;
    if (mode === 'app') nav = '<nav id="tabbar" aria-label="Main navigation">' + this.TABS.map(([p, icon, label]) => `<button data-go="${p}" class="${p === activeTab ? 'on' : ''}" aria-label="${label}">${AppIcon.svg(icon)}<span>${label}</span></button>`).join('') + `<button data-more="1" aria-label="More">${AppIcon.svg('more')}<span>More</span></button></nav>`;
    app.insertAdjacentHTML('beforeend', nav + '<div id="sheetWrap" class="hidden"><div id="sheetBg"></div><div id="sheet" class="glass"></div></div><div id="toast" class="hidden" role="status" aria-live="polite"></div>');
    document.getElementById('sheetBg').onclick = () => UI.closeSheet();
    if (mode === 'app') {
      app.querySelectorAll('#tabbar [data-go]').forEach((b) => { b.onclick = () => go(b.dataset.go); });
      app.querySelector('#tabbar [data-more]').onclick = () => {
        UI.sheet('<h3 class="moreTitle">Explore</h3><div class="moreGrid">' + this.MORE.map(([p, icon, label]) => `<button class="moreItem" onclick="go('${p}')">${AppIcon.svg(icon)}<span>${label}</span></button>`).join('') + `</div><button class="moreItem logoutItem" id="menuLogout">${AppIcon.svg('logout')}<span>Log out</span></button>`);
        document.getElementById('menuLogout').onclick = () => UI.confirmSheet('Log out?', 'You can log back in anytime.', () => Auth.logout(), 'Log out');
      };
    }
  },
};
