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
    const res = await fetch(this.base + path, { method, headers, body: payload });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  },
  get: (p) => API.call(p),
  post: (p, body) => API.call(p, { method: 'POST', body }),
  patch: (p, body) => API.call(p, { method: 'PATCH', body }),
  del: (p) => API.call(p, { method: 'DELETE' }),
};
