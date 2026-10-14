/* settings.js — profile view/update, backend URL, logout. */
async function initSettings() {
  const darkMode = document.getElementById('darkMode');
  darkMode.checked = document.documentElement.dataset.theme === 'dark';
  darkMode.onchange = () => Layout.setTheme(darkMode.checked ? 'dark' : 'light');
  const pushStatus = document.getElementById('pushStatus');
  const pushEnable = document.getElementById('pushEnable');
  const pushTest = document.getElementById('pushTest');
  const registered = localStorage.getItem('persona_push_registered') === 'true';
  pushTest.disabled = !registered;
  if (!('Notification' in window)) pushStatus.textContent = 'This browser does not support web notifications.';
  else if (Notification.permission === 'denied') pushStatus.textContent = 'Notifications are blocked for this site. Change the site permission beside the address bar, then refresh this device here.';
  else if (Notification.permission === 'default') pushStatus.textContent = 'Notifications are not enabled yet. Tap Enable and choose Allow when your browser asks.';
  else if (registered) pushStatus.textContent = 'This browser allows notifications and this device is registered. Send a test to confirm delivery.';
  else pushStatus.textContent = 'Browser permission is allowed, but this device still needs to be registered.';
  pushEnable.onclick = async () => {
    pushEnable.disabled = true;
    pushEnable.textContent = 'Enabling…';
    try {
      const success = await Auth.registerPush();
      pushStatus.textContent = success ? 'This device is registered for reminder notifications.' : (Notification.permission === 'denied' ? 'Notifications are blocked for this site. Change permission beside the address bar and try again.' : 'Notifications were not enabled. Allow them in the browser prompt and try again.');
      pushTest.disabled = !success;
      if (success) UI.toast('Notifications enabled');
    } catch (error) {
      pushStatus.textContent = error.message;
      UI.toast(error.message, 4500);
    } finally {
      pushEnable.disabled = false;
      pushEnable.textContent = 'Enable notifications';
    }
  };
  pushTest.onclick = async () => {
    pushTest.disabled = true; pushTest.textContent = 'Sending…';
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio) { const context = new Audio(); const oscillator = context.createOscillator(), gain = context.createGain(); oscillator.frequency.value = 660; gain.gain.setValueAtTime(.08, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .45); oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .45); oscillator.onended = () => context.close(); }
      await API.post('/api/auth/devices/test', {}); pushStatus.textContent = 'Test sound played and notification sent. Closed or locked devices use the browser or operating system notification sound.'; UI.toast('Test notification and sound sent');
    }
    catch (error) { pushStatus.textContent = error.message; UI.toast(error.message, 5000); }
    finally { pushTest.disabled = false; pushTest.textContent = 'Send test'; }
  };
  try {
    const { user } = await API.get('/api/auth/me');
    document.getElementById('profileCard').innerHTML = `
      <b style="font-size:18px">${UI.esc(user.name)}</b><p class="muted sm">${UI.esc(user.email || '')} ${UI.esc(user.phone || '')}</p>
      ${UI.field('Work', `<input id="pfWork" value="${UI.esc(user.work || '')}">`)}
      ${UI.field('Field', `<input id="pfField" value="${UI.esc(user.field_of_study || '')}">`)}
      ${UI.field('Degrees', `<input id="pfDeg" value="${UI.esc(user.degrees || '')}">`)}
      ${UI.field('Bio', `<input id="pfBio" value="${UI.esc(user.bio || '')}">`)}
      ${UI.field('Timezone', `<input id="pfTimezone" value="${UI.esc(user.timezone || 'Asia/Kolkata')}" placeholder="Asia/Kolkata" autocomplete="off">`)}
      <button class="btn primary" id="pfSave" style="width:100%">Save profile</button>`;
    document.getElementById('pfSave').onclick = async () => {
      await API.patch('/api/auth/me', {
        work: document.getElementById('pfWork').value.trim(),
        field_of_study: document.getElementById('pfField').value.trim(),
        degrees: document.getElementById('pfDeg').value.trim(),
        bio: document.getElementById('pfBio').value.trim(),
        timezone: document.getElementById('pfTimezone').value.trim(),
      });
      UI.toast('Profile saved');
    };
  } catch { document.getElementById('profileCard').innerHTML = '<p class="muted">Could not load profile.</p>'; }
  document.getElementById('apiBase').value = localStorage.getItem('persona_api') || '';
  document.getElementById('apiBase').placeholder = API.base;
  const backendStatus = document.getElementById('backendStatus');
  const checkBackend = async () => {
    backendStatus.textContent = `Checking ${API.base}…`;
    try {
      const result = await API.get('/health');
      backendStatus.textContent = result.ok && result.database === 'ok'
        ? `Backend and database connected at ${API.base}.`
        : `Backend is running at ${API.base}, but its database is not ready.`;
    } catch (error) {
      backendStatus.textContent = `Cannot reach ${API.base}. ${error.message}`;
    }
  };
  document.getElementById('backendCheck').onclick = checkBackend;
  const personalFav = { kind: 'song' };
  const renderPersonalFavorites = async () => {
    const list = document.getElementById('personalFavList');
    list.innerHTML = '<p class="muted sm">Loading personal favorites…</p>';
    try {
      const items = await API.get(`/api/favorites?kind=${personalFav.kind}`);
      list.innerHTML = items.length ? items.map((item) => `<div class="rem"><div class="dot"></div><div class="t"><b>${UI.esc(item.title)}</b><span>Saved ${UI.d(item.created_at)}</span></div><button class="btn sm" data-personal-fav-delete="${UI.esc(item.id)}" aria-label="Remove ${UI.esc(item.title)}">Remove</button></div>`).join('') : `<p class="muted sm">No ${personalFav.kind === 'movie' ? 'films' : `${personalFav.kind}s`} saved yet.</p>`;
      list.querySelectorAll('[data-personal-fav-delete]').forEach((button) => button.onclick = async () => {
        try { await API.del(`/api/favorites/${button.dataset.personalFavDelete}`); await renderPersonalFavorites(); }
        catch (error) { UI.toast(error.message); }
      });
    } catch (error) { list.innerHTML = `<p class="muted sm">Could not load favorites: ${UI.esc(error.message)}</p>`; }
  };
  document.querySelectorAll('#personalFavSeg [data-f]').forEach((button) => button.onclick = async () => {
    personalFav.kind = button.dataset.f;
    document.querySelectorAll('#personalFavSeg [data-f]').forEach((tab) => tab.classList.toggle('on', tab === button));
    document.getElementById('personalFavTitle').placeholder = personalFav.kind === 'movie' ? 'Film title' : personalFav.kind === 'playlist' ? 'Playlist name' : 'Song or artist';
    await renderPersonalFavorites();
  });
  document.getElementById('personalFavAdd').onclick = async () => {
    const title = document.getElementById('personalFavTitle').value.trim();
    if (!title) return UI.toast('Add a title first');
    try { await API.post('/api/favorites', { kind: personalFav.kind, title }); document.getElementById('personalFavTitle').value = ''; await renderPersonalFavorites(); UI.toast('Saved to your personal favorites'); }
    catch (error) { UI.toast(error.message); }
  };
  document.getElementById('personalFavSpotify').onclick = async () => {
    try {
      const songs = await API.get('/api/favorites?kind=song');
      if (!songs.length) return UI.toast('Save a few favorite songs first');
      UI.sheet(`<h3 style="font-family:var(--font-d);font-size:22px;margin-bottom:12px">Make a Spotify playlist</h3>${UI.field('Playlist name','<input id="personalPlaylistName" value="My Persona Mix">')}<p class="muted sm">${songs.length} favorite songs will be searched and added after you confirm.</p><button class="btn primary" id="personalPlaylistCreate">Create playlist</button><button class="textAction" id="personalSpotifyConnect">Connect Spotify</button>`);
      document.getElementById('personalSpotifyConnect').onclick = () => { location.href = API.base + '/api/playlists/spotify/login'; };
      document.getElementById('personalPlaylistCreate').onclick = async () => {
        const name = document.getElementById('personalPlaylistName').value.trim();
        if (!name) return UI.toast('Enter a playlist name');
        try { const result = await API.post('/api/playlists', { name, songs: songs.map((item) => item.title) }); UI.closeSheet(); UI.toast(`Playlist created: ${result.added}/${result.of} songs matched`); }
        catch (error) { UI.toast(error.message); }
      };
    } catch (error) { UI.toast(error.message); }
  };
  renderPersonalFavorites();
  document.getElementById('apiSave').onclick = () => {
    const v = document.getElementById('apiBase').value.trim().replace(/\/$/, '');
    if (v) localStorage.setItem('persona_api', v); else localStorage.removeItem('persona_api');
    UI.toast('Backend URL saved');
    checkBackend();
  };
  checkBackend();
  document.getElementById('logoutBtn').onclick = () => UI.confirmSheet('Log out?', 'You can log back in anytime.', () => Auth.logout(), 'Log out');
};

document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('page-settings')) initSettings(); });
