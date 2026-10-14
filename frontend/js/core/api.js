/* api.js — one function for every backend call. */
const API = {
  get base() { return localStorage.getItem('persona_api') || 'http://localhost:3001'; },
  get token() { return localStorage.getItem('persona_token'); },
  async call(path, { method = 'GET', body, form } = {}) {
    const headers = {};
    if (this.token) headers['Authorization'] = 'Bearer ' + this.token;
    let payload;
    if (form) { payload = form; } // FormData (file upload) — browser sets content type
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    
    const startTime = performance.now();
    let res;
    try {
      res = await fetch(this.base + path, { method, headers, body: payload });
    } catch (cause) {
      throw new Error(`Cannot reach Persona backend at ${this.base}. Check that the backend is running and the API URL in Settings is correct.`, { cause });
    }
    const endTime = performance.now();
    console.debug(`API ${method} ${path} took ${Math.round(endTime - startTime)}ms`);

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  },

  get: (p) => API.call(p),
  post: (p, body) => API.call(p, { method: 'POST', body }),
  patch: (p, body) => API.call(p, { method: 'PATCH', body }),
  del: (p) => API.call(p, { method: 'DELETE' }),
};

// Register the app shell on secure origins so installed builds receive updates
// and can open their core screens offline. Skip gracefully on plain HTTP hosts.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const scriptUrl = document.currentScript?.src || location.href;
  navigator.serviceWorker.register(new URL('../../sw.js', scriptUrl), { updateViaCache: 'none' }).then((registration) => {
    registration.update().catch(() => {});
    if (navigator.serviceWorker.controller) {
      let hasReloadedForUpdate = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hasReloadedForUpdate) return;
        hasReloadedForUpdate = true;
        location.reload();
      });
    }
  }).catch(() => {});
}


// Push action links carry no credentials. After the app loads, act with the
// signed-in browser token, then open the unified task list.
window.addEventListener('DOMContentLoaded', async () => {
  const query = new URLSearchParams(location.search);
  const action = query.get('stickyAction'), reminderId = query.get('reminderId');
  if (!['done', 'snooze'].includes(action) || !/^[0-9a-f-]{30,40}$/i.test(reminderId || '')) return;
  try {
    const patch = action === 'done' ? { status: 'done' } : { due_at: new Date(Date.now() + 10 * 60000).toISOString() };
    await API.patch(`/api/reminders/${reminderId}`, patch);
  } catch (error) { console.warn('[notification action]', error.message); }
  history.replaceState(null, '', `${location.pathname}#tasks`);
});
