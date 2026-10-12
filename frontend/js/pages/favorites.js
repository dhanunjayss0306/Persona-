/* favorites.js — songs, playlists, movies. Plus one-tap Spotify playlist creation. */
const Fav = { kind: 'song' };
async function initFavorites() {
  document.querySelectorAll('#favSeg button').forEach((b) => b.onclick = () => {
    document.querySelectorAll('#favSeg button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on'); Fav.kind = b.dataset.f; Fav.render();
  });
  document.getElementById('favAdd').onclick = Fav.sheet;
  document.getElementById('mkPlaylist').onclick = Fav.makePlaylist;
  Fav.render();
};
Fav.render = async function () {
  const box = document.getElementById('favList');
  try {
    const items = await API.get(`/api/favorites?kind=${Fav.kind}`);
    box.innerHTML = items.length ? items.map((f) =>
      `<div class="rem"><div class="dot" style="background:${Fav.kind === 'movie' ? 'var(--gold)' : 'var(--signal)'}"></div>
       <div class="t"><b>${UI.esc(f.title)}</b><span>${UI.d(f.created_at)}</span></div>
       <button class="btn sm" data-fdel="${f.id}">✕</button></div>`).join('')
      : `<p class="muted center" style="margin-top:30px">No ${Fav.kind}s yet. Tap + to add.</p>`;
    box.querySelectorAll('[data-fdel]').forEach((b) => b.onclick = async () => { await API.del(`/api/favorites/${b.dataset.fdel}`); Fav.render(); });
  } catch (e) { box.innerHTML = '<p class="muted">Backend unreachable.</p>'; }
};
Fav.sheet = function () {
  UI.sheet(`<h3 style="font-family:var(--font-d);font-size:22px;margin-bottom:12px">Add ${Fav.kind}</h3>
    ${UI.field('Title', `<input id="fTitle" placeholder="${Fav.kind === 'movie' ? 'Movie name' : 'Song — Artist'}">`)}
    <button class="btn primary" id="fGo" style="width:100%">Add to favorites</button>`);
  document.getElementById('fGo').onclick = async () => {
    const title = document.getElementById('fTitle').value.trim();
    if (!title) return UI.toast('Title needed');
    await API.post('/api/favorites', { kind: Fav.kind, title });
    UI.closeSheet(); UI.toast('Added ⭐'); Fav.render();
  };
};
Fav.makePlaylist = async function () {
  const songs = await API.get('/api/favorites?kind=song');
  if (!songs.length) return UI.toast('Add some favorite songs first');
  UI.sheet(`<h3 style="font-family:var(--font-d);font-size:22px;margin-bottom:12px">Spotify playlist</h3>
    ${UI.field('Playlist name', '<input id="plName" value="My Persona Mix">')}
    <p class="muted sm" style="margin-bottom:12px">${songs.length} favorite songs will be added.</p>
    <button class="btn primary" id="plGo" style="width:100%">Create on Spotify</button>
    <p class="sm muted" style="margin-top:10px">First time? <button class="linkBtn" id="spLogin">Connect Spotify</button></p>`);
  document.getElementById('spLogin').onclick = () => { location.href = API.base + '/api/playlists/spotify/login'; };
  document.getElementById('plGo').onclick = async () => {
    try {
      const r = await API.post('/api/playlists', { name: document.getElementById('plName').value.trim(), songs: songs.map((s) => s.title) });
      UI.closeSheet(); UI.toast(`Playlist created — ${r.added}/${r.of} songs found ♫`);
    } catch (e) { UI.toast(e.message); }
  };
};

document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('page-favorites')) initFavorites(); });
