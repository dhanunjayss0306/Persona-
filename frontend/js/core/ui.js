/* ui.js — toast, bottom sheet, confirm, formatting helpers. */
const UI = {
  toast(msg, ms = 2200) {
    UI.haptic('light');
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.add('hidden'), ms);
  },
  haptic(type = 'light') {
    if (!('vibrate' in navigator)) return;
    const patterns = {
      'light': [10],
      'medium': [30],
      'heavy': [60],
      'success': [10, 30, 10],
      'error': [50, 100, 50]
    };
    navigator.vibrate(patterns[type] || patterns.light);
  },
  sheet(html) {
    UI.haptic('light');
    const w = document.getElementById('sheetWrap');
    document.getElementById('sheet').innerHTML = html;
    w.classList.remove('hidden');
  },

  closeSheet() { document.getElementById('sheetWrap').classList.add('hidden'); },
  confirmSheet(title, msg, onYes, yesLabel = 'Delete') {
    UI.sheet(`<h3 style="font-family:var(--font-d);font-size:22px;margin-bottom:8px">${title}</h3>
      <p class="muted" style="margin-bottom:18px">${msg}</p>
      <div class="row"><button class="btn danger" id="cfNo" style="margin:0">Cancel</button>
      <button class="btn primary" id="cfYes">${yesLabel}</button></div>`);
    document.getElementById('cfNo').onclick = UI.closeSheet;
    document.getElementById('cfYes').onclick = () => { UI.closeSheet(); onYes(); };
  },
  field(label, inner) { return `<label class="kicker">${label}</label>${inner}`; },
  dt(iso) { return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); },
  d(iso) { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); },
  inr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); },
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  googleLinks(s) {
    return UI.esc(s).replace(/https:\/\/meet\.google\.com\/[a-z0-9-]+/gi, (url) =>
      `<a href="${url}" target="_blank" rel="noopener">Open Google Meet</a>`).replace(/\n/g, '<br>');
  },
};
