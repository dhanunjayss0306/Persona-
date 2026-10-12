/* voice.js — mic input → NLP parse, wake word, enrollment, call/JioSaavn/Meet. */
async function initVoice() {
  try {
    const p = await API.get('/api/voice/profile');
    document.getElementById('wakeWord').value = p.wake_word || 'Hey Persona';
  } catch { /* ignore */ }
  document.getElementById('micBig').onclick = Voice.listen;
  document.getElementById('wakeSave').onclick = async () => {
    await API.post('/api/voice/profile', { wake_word: document.getElementById('wakeWord').value.trim() || 'Hey Persona' });
    UI.toast('Wake word saved');
  };
  document.getElementById('wakeToggle').onchange = (e) => Voice.wake(e.target.checked);
  document.getElementById('enrollBtn').onclick = Voice.enroll;
  document.getElementById('callGo').onclick = async () => {
    const name = document.getElementById('callName').value.trim(); if (!name) return;
    try { const r = await API.get('/api/voice/call?name=' + encodeURIComponent(name)); location.href = r.tel_link; }
    catch (e) { UI.toast(e.message); }
  };
  document.getElementById('songGo').onclick = async () => {
    const song = document.getElementById('songName').value.trim(); if (!song) return;
    const r = await API.get('/api/voice/jiosaavn?song=' + encodeURIComponent(song));
    window.open(r.url, '_blank');
  };
  document.getElementById('meetGo').onclick = async () => {
    try {
      const r = await API.post('/api/voice/meet', { title: document.getElementById('meetTitle').value.trim() || 'Persona meeting' });
      document.getElementById('meetOut').innerHTML = `<p style="margin-top:10px"><b>Meet link:</b> <a href="${r.meet_link}" target="_blank">${r.meet_link}</a></p>`;
    } catch (e) { UI.toast(e.message + ' — connect Google first'); }
  };
  document.getElementById('cAdd').onclick = async () => {
    const name = document.getElementById('cName').value.trim(), phone = document.getElementById('cPhone').value.trim();
    if (!name || !phone) return UI.toast('Name + phone needed');
    await API.post('/api/voice/contacts', { name, phone });
    document.getElementById('cName').value = ''; document.getElementById('cPhone').value = '';
    Voice.contacts();
  };
  Voice.contacts();
};
const Voice = {
  rec: null, watching: false,
  sr() { const W = window.SpeechRecognition || window.webkitSpeechRecognition; return W ? new W() : null; },
  listen() {
    const r = this.sr();
    if (!r) return UI.toast('Voice input needs Chrome/Edge');
    const btn = document.getElementById('micBig');
    btn.classList.add('live'); document.getElementById('micHint').textContent = 'Listening…';
    r.lang = 'en-IN'; r.interimResults = false;
    r.onresult = async (e) => {
      const text = e.results[0][0].transcript;
      document.getElementById('micText').textContent = '"' + text + '"';
      btn.classList.remove('live'); document.getElementById('micHint').textContent = 'Tap and speak';
      UI.toast('Arranging…');
      try {
        const res = await API.post('/api/voice/parse', { text });
        const items = res.understood.items.map((i) => `• ${i.title} (${i.kind}${i.start != null ? ', ' + Math.floor(i.start / 60) + ':' + String(i.start % 60).padStart(2, '0') : ''})`).join('\n');
        UI.sheet(`<h3 style="font-family:var(--font-d);font-size:22px;margin-bottom:8px">I understood</h3>
          <p class="muted sm" style="margin-bottom:8px">For ${res.understood.date}:</p>
          <p style="white-space:pre-wrap;margin-bottom:14px">${UI.esc(items) || 'nothing'}</p>
          <p class="sm" style="color:var(--ok);margin-bottom:12px">✓ ${res.created.length} item(s) created and arranged.</p>
          <button class="btn primary" id="vOk" style="width:100%">Done</button>`);
        document.getElementById('vOk').onclick = UI.closeSheet;
      } catch (err) { UI.toast(err.message); }
    };
    r.onerror = () => { btn.classList.remove('live'); UI.toast('Mic error — try again'); };
    r.start();
  },
  wake(on) {
    const r = this.sr();
    if (!r) { document.getElementById('wakeToggle').checked = false; return UI.toast('Wake word needs Chrome/Edge'); }
    if (!on) { try { this.rec && this.rec.stop(); } catch { } this.watching = false; return; }
    const word = (document.getElementById('wakeWord').value || 'Hey Persona').toLowerCase();
    r.lang = 'en-IN'; r.continuous = true; r.interimResults = true;
    this.rec = r; this.watching = true;
    r.onresult = (e) => {
      const t = Array.from(e.results).map((x) => x[0].transcript).join(' ').toLowerCase();
      if (t.includes(word)) { try { r.stop(); } catch { } this.watching = false; document.getElementById('wakeToggle').checked = false; this.listen(); }
    };
    r.onend = () => { if (this.watching) { try { r.start(); } catch { } } };
    r.start();
    UI.toast(`Listening for "${word}"…`);
  },
  enroll() {
    UI.sheet(`<h3 style="font-family:var(--font-d);font-size:22px;margin-bottom:8px">Enroll your voice</h3>
      <p class="muted sm" style="margin-bottom:12px">Record ~5 seconds so Persona knows your voice.</p>
      <div class="row"><button class="btn signal" id="enRec">⏺ Record</button><button class="btn" id="enStop">⏹ Stop & save</button></div>`);
    let mr, chunks = [];
    document.getElementById('enRec').onclick = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mr = new MediaRecorder(stream); chunks = [];
      mr.ondataavailable = (e) => chunks.push(e.data); mr.start();
      UI.toast('Recording…');
    };
    document.getElementById('enStop').onclick = () => {
      if (!mr) return;
      mr.onstop = async () => {
        const fd = new FormData();
        fd.append('wake_word', document.getElementById('wakeWord').value.trim() || 'Hey Persona');
        fd.append('sample', new Blob(chunks, { type: 'audio/webm' }), 'sample.webm');
        try { await API.call('/api/voice/profile', { method: 'POST', form: fd }); UI.closeSheet(); UI.toast('Voice enrolled ✓'); }
        catch (e) { UI.toast(e.message); }
      };
      mr.stop();
    };
  },
  async contacts() {
    try {
      const cs = await API.get('/api/voice/contacts');
      document.getElementById('contactList').innerHTML = cs.map((c) =>
        `<div class="rem"><div class="dot" style="background:var(--gold)"></div><div class="t"><b>${UI.esc(c.name)}</b><span>${UI.esc(c.phone)}</span></div><a class="btn sm" href="tel:${UI.esc(c.phone)}">📞</a></div>`).join('') || '<p class="muted sm">No contacts yet.</p>';
    } catch { /* ignore */ }
  },
};

document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('page-voice')) initVoice(); });
