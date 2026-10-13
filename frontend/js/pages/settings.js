/* settings.js — profile view/update, backend URL, logout. */
async function initSettings() {
  const darkMode = document.getElementById('darkMode');
  darkMode.checked = document.documentElement.dataset.theme === 'dark';
  darkMode.onchange = () => Layout.setTheme(darkMode.checked ? 'dark' : 'light');
  const pushStatus = document.getElementById('pushStatus');
  const pushEnable = document.getElementById('pushEnable');
  if (window.Notification?.permission === 'granted') pushStatus.textContent = 'Notifications are allowed. Enable or refresh this device registration.';
  pushEnable.onclick = async () => {
    pushEnable.disabled = true;
    pushEnable.textContent = 'Enabling…';
    try {
      const registered = await Auth.registerPush();
      pushStatus.textContent = registered ? 'This device is registered for reminder notifications.' : 'Notifications are blocked in this browser. Allow them in the site controls and try again.';
      if (registered) UI.toast('Notifications enabled');
    } catch (error) {
      pushStatus.textContent = error.message;
      UI.toast(error.message, 4500);
    } finally {
      pushEnable.disabled = false;
      pushEnable.textContent = 'Enable notifications';
    }
  };
  try {
    const { user } = await API.get('/api/auth/me');
    document.getElementById('profileCard').innerHTML = `
      <b style="font-size:18px">${UI.esc(user.name)}</b><p class="muted sm">${UI.esc(user.email || '')} ${UI.esc(user.phone || '')}</p>
      ${UI.field('Work', `<input id="pfWork" value="${UI.esc(user.work || '')}">`)}
      ${UI.field('Field', `<input id="pfField" value="${UI.esc(user.field_of_study || '')}">`)}
      ${UI.field('Degrees', `<input id="pfDeg" value="${UI.esc(user.degrees || '')}">`)}
      ${UI.field('Bio', `<input id="pfBio" value="${UI.esc(user.bio || '')}">`)}
      <button class="btn primary" id="pfSave" style="width:100%">Save profile</button>`;
    document.getElementById('pfSave').onclick = async () => {
      await API.patch('/api/auth/me', {
        work: document.getElementById('pfWork').value.trim(),
        field_of_study: document.getElementById('pfField').value.trim(),
        degrees: document.getElementById('pfDeg').value.trim(),
        bio: document.getElementById('pfBio').value.trim(),
      });
      UI.toast('Profile saved');
    };
  } catch { document.getElementById('profileCard').innerHTML = '<p class="muted">Could not load profile.</p>'; }
  document.getElementById('apiBase').value = localStorage.getItem('persona_api') || '';
  document.getElementById('apiBase').placeholder = API.base;
  document.getElementById('apiSave').onclick = () => {
    const v = document.getElementById('apiBase').value.trim().replace(/\/$/, '');
    if (v) localStorage.setItem('persona_api', v); else localStorage.removeItem('persona_api');
    UI.toast('Backend URL saved — reopen the app');
  };
  document.getElementById('logoutBtn').onclick = () => UI.confirmSheet('Log out?', 'You can log back in anytime.', () => Auth.logout(), 'Log out');
};

document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('page-settings')) initSettings(); });
