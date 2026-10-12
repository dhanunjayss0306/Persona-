/* auth.js — login, signup, onboarding, session. No page layout here. */
const Auth = {
  user() { try { return JSON.parse(localStorage.getItem('persona_user')); } catch (e) { return null; } },
  save(r, next) {
    localStorage.setItem('persona_token', r.token);
    localStorage.setItem('persona_user', JSON.stringify(r.user));
    location.href = next;
  },
  logout() {
    localStorage.removeItem('persona_token');
    localStorage.removeItem('persona_user');
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
        <button class="btn" id="liGoogle" style="width:100%;margin-top:10px">G &nbsp;Sign in with Google</button>
        <p class="center" style="margin-top:14px"><a class="linkBtn" href="pages/signup.html">Create account</a></p>
      </div>`;
    const v = (id) => document.getElementById(id).value.trim();
    document.getElementById('liGo').onclick = async () => {
      try {
        const r = await API.post('/api/auth/signin', { login: v('liLogin'), password: v('liPass') });
        Auth.save(r, 'pages/today.html');
      } catch (e) { UI.toast(e.message); }
    };
    document.getElementById('liGoogle').onclick = () => UI.toast('Add your Google Client ID to enable this');
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
