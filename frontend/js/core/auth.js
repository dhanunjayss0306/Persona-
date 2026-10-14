/* auth.js — login, signup, onboarding, session. No page layout here. */
const PUSH_CONFIG = window.PERSONA_FIREBASE_CONFIG || {};
const VAPID_KEY = window.PERSONA_VAPID_KEY || 'PASTE_ME';
const Auth = {
  user() { try { return JSON.parse(localStorage.getItem('persona_user')); } catch (e) { return null; } },
  save(r, next) {
    localStorage.setItem('persona_token', r.token);
    localStorage.setItem('persona_user', JSON.stringify(r.user));
    const ready = PUSH_CONFIG.apiKey && PUSH_CONFIG.apiKey !== 'PASTE_ME' && VAPID_KEY !== 'PASTE_ME';
    if (!ready) { location.href = next; return; }
    let timeout;
    Promise.race([this.registerPush(), new Promise((resolve) => { timeout = setTimeout(resolve, 8000); })])
      .catch((error) => console.warn('[push] skipped:', error.message))
      .finally(() => { clearTimeout(timeout); location.href = next; });
  },
  async registerPush() {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) {
      throw new Error('Push notifications need a supported browser on HTTPS or localhost.');
    }
    if (!PUSH_CONFIG.apiKey || PUSH_CONFIG.apiKey === 'PASTE_ME' || !VAPID_KEY || VAPID_KEY === 'PASTE_ME') {
      throw new Error('Add the Firebase Web Push certificate key to frontend/firebase-config.js.');
    }
    if (!window.firebase?.messaging) throw new Error('Firebase Messaging did not load. Check your connection and reload.');
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission !== 'granted') return false;
    if (!firebase.apps.length) firebase.initializeApp(PUSH_CONFIG);
    const registration = await navigator.serviceWorker.ready;
    const token = await firebase.messaging().getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return false;
    await API.post('/api/auth/devices', { fcm_token: token, label: 'web' });
    localStorage.setItem('persona_push_registered', 'true');
    console.info('[push] device registered');
    return true;
  },
  logout() {
    localStorage.removeItem('persona_token');
    localStorage.removeItem('persona_user');
    localStorage.removeItem('persona_push_registered');
    location.href = '../index.html';
  },
  /* ---- index.html (login) ---- */
  initLogin() {
    const box = document.getElementById('authBox');
    box.innerHTML = `
      <img class="logoMark lg" src="assets/logo-mark.png" alt="Persona">
      <h2 class="display">Persona</h2><p class="muted">Reminders that nag till proven.</p>
      <div class="authCard">
        ${UI.field('Email or phone', '<input id="liLogin" placeholder="you@mail.com / +91…">')}
        ${UI.field('Password', '<input id="liPass" type="password" placeholder="••••••••">')}
        <button class="btn primary" id="liGo" style="width:100%;margin-top:6px">Log in</button>
        <p class="center" style="margin-top:14px"><a class="linkBtn" href="pages/signup.html">Create account</a></p>
      </div>`;
    const v = (id) => document.getElementById(id).value.trim();
    document.getElementById('liGo').onclick = async () => {
      try {
        const r = await API.post('/api/auth/signin', { login: v('liLogin'), password: v('liPass') });
        Auth.save(r, 'pages/today.html');
      } catch (e) { UI.toast(e.message); }
    };
  },
  /* ---- pages/signup.html ---- */
  initSignup() {
    const box = document.getElementById('signupBox');
    box.innerHTML = `
      <img class="logoMark lg" src="../assets/logo-mark.png" alt="Persona">
      <h2 class="display">Create account</h2><p class="muted">Thirty seconds, then you're in.</p>
      <div class="authCard">
        ${UI.field('Name', '<input id="suName" placeholder="Your name">')}
        ${UI.field('Email', '<input id="suEmail" placeholder="you@mail.com">')}
        ${UI.field('Phone (optional)', '<input id="suPhone" placeholder="+91…">')}
        ${UI.field('Password', '<input id="suPass" type="password" placeholder="Choose a password">')}
        ${UI.field('What do you do?', '<input id="suWork" placeholder="Student">')}
        ${UI.field('Studying / working in', '<input id="suField" placeholder="B.Tech CSE">')}
        ${UI.field('Degrees', '<input id="suDeg" placeholder="B.Tech 2nd year">')}
        ${UI.field('About you (optional)', '<input id="suBio" placeholder="Anything I should know">')}
        <button class="btn primary" id="suGo" style="width:100%;margin-top:6px">Create account</button>
        <p class="center" style="margin-top:14px"><a class="linkBtn" href="../index.html">Back to login</a></p>
      </div>`;
    const v = (id) => document.getElementById(id).value.trim();
    document.getElementById('suGo').onclick = async () => {
      try {
        const r = await API.post('/api/auth/signup', {
          name: v('suName'), email: v('suEmail'), phone: v('suPhone'), password: v('suPass'),
          work: v('suWork'), field_of_study: v('suField'), degrees: v('suDeg'), bio: v('suBio'),
        });
        Auth.save(r, 'onboarding.html');
      } catch (e) { UI.toast(e.message); }
    };
  },
};
