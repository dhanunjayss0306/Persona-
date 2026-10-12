/* onboarding.js — first-run questions (pages/onboarding.html). */
document.addEventListener('DOMContentLoaded', async () => {
  if (!document.getElementById('page-onboarding')) return;
  if (!Auth.user()) { location.href = '../index.html'; return; }
  try {
    const qs = await API.get('/api/auth/onboarding/questions');
    const box = document.getElementById('onbBox');
    box.innerHTML = qs.map((q) => UI.field(q.question, `<input data-k="${q.key}" placeholder="…">`)).join('');
    document.getElementById('onbSave').onclick = async () => {
      const ans = {};
      box.querySelectorAll('input').forEach((i) => { if (i.value.trim()) ans[i.dataset.k] = i.value.trim(); });
      try { await API.post('/api/auth/onboarding/answers', ans); } catch (e) { /* continue anyway */ }
      go('today');
    };
  } catch (e) { UI.toast('Could not load questions'); }
});
