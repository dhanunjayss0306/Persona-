/* Voice capture and actions. Recognition runs in the browser; parsing and saving use the API. */
async function initVoice() {
  const $ = (id) => document.getElementById(id);
  try { const profile = await API.get('/api/voice/profile'); $('wakeWord').value = profile.wake_word || 'Hey Persona'; } catch { /* Profile is optional until saved. */ }
  $('micBig').onclick = () => Voice.listen();
  $('personaCommandGo').onclick = () => Voice.command($('personaCommand').value.trim());
  $('voiceFallbackGo').onclick = () => {
    const text = $('voiceFallbackText').value.trim();
    if (!text) return UI.toast('Type a task or something you want to remember');
    Voice.processText(text);
  };
  $('wakeSave').onclick = async () => {
    const word = $('wakeWord').value.trim() || 'Hey Persona';
    try { await API.post('/api/voice/profile', { wake_word: word }); UI.toast('Wake phrase saved'); }
    catch (error) { UI.toast(error.message); }
  };
  $('wakeToggle').onchange = (event) => Voice.wake(event.target.checked);
  $('enrollBtn').onclick = () => Voice.enroll();
  try {
    const status = await API.get('/api/voice/google/status');
    $('googleConnect').classList.toggle('hidden', status.connected);
  } catch { /* Google Calendar setup is optional. */ }
  $('googleConnect').onclick = async () => {
    try { const result = await API.post('/api/voice/google/login-url', {}); location.href = result.url; }
    catch (error) { UI.toast(error.message); }
  };
  $('callGo').onclick = async () => {
    const name = $('callName').value.trim(); if (!name) return UI.toast('Enter a contact name');
    UI.confirmSheet('Call this contact?', `Persona will open your phone app for ${name}.`, async () => {
      try { const result = await API.get('/api/voice/call?name=' + encodeURIComponent(name)); location.href = result.tel_link; }
      catch (error) { UI.toast(error.message); }
    }, 'Open phone');
  };
  $('songGo').onclick = async () => {
    const song = $('songName').value.trim(); if (!song) return UI.toast('Enter a song');
    UI.confirmSheet('Find this song?', `Open a music search for ${song}.`, async () => {
      const tab = window.open('about:blank', '_blank');
      if (!tab) return UI.toast('Allow pop-ups to open JioSaavn.');
      tab.opener = null;
      try { const result = await API.get('/api/voice/jiosaavn?song=' + encodeURIComponent(song)); tab.location.href = result.url; }
      catch (error) { tab.close(); UI.toast(error.message); }
    }, 'Find song');
  };
  $('placeGo').onclick = () => {
    const place = $('placeName').value.trim(); if (!place) return UI.toast('Enter a place or address');
    UI.confirmSheet('Open directions?', `Show a route to ${place} in Google Maps.`, () => { location.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place)}`; }, 'Open Maps');
  };
  $('meetGo').onclick = async () => {
    const title = $('meetTitle').value.trim() || 'Persona meeting';
    UI.confirmSheet('Create a Google Meet?', `Persona will create a calendar event called “${title}”.`, async () => {
      try {
        const result = await API.post('/api/voice/meet', { title });
        $('meetOut').innerHTML = `<p class="meetResult">Meet link ready · <a href="${UI.esc(result.meet_link)}" target="_blank" rel="noopener">Open meeting</a> <button class="btn sm" id="copyMeetLink">Copy link</button></p>`;
        document.getElementById('copyMeetLink').onclick = async () => { try { await navigator.clipboard.writeText(result.meet_link); UI.toast('Meet link copied'); } catch { UI.toast(result.meet_link); } };
      } catch (error) { UI.toast(error.message); if (/connect google/i.test(error.message)) $('googleConnect').classList.remove('hidden'); }
    }, 'Create meeting');
  };
  $('cAdd').onclick = async () => {
    const name = $('cName').value.trim(), phone = $('cPhone').value.trim();
    if (!name || !phone) return UI.toast('Enter a name and phone number');
    try { await API.post('/api/voice/contacts', { name, phone }); $('cName').value = ''; $('cPhone').value = ''; await Voice.contacts(); UI.toast('Contact added'); }
    catch (error) { UI.toast(error.message); }
  };
  Voice.contacts();
}

const Voice = {
  rec: null, micStream: null, listening: false, requesting: false, watching: false, watchRestart: null,
  sr() { const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition; return Recognition ? new Recognition() : null; },
  async command(text) {
    const out=document.getElementById('personaCommandResult');
    let command; try { command=(await API.post('/api/voice/command/parse',{text})).command; } catch(error) { UI.toast(error.message); return; }
    if(!command){out.textContent='Try “add <song> to <playlist>”, “add this song to my <playlist>”, “create a Google Meet link”, “call <name>”, or “take me to <place>”.';return;}
    const action=command.intent==='spotify_add'?`Add ${command.currentlyPlaying?'the currently playing song':`“${command.song}”`} to Spotify playlist “${command.playlist}”`:command.intent==='call'?`Call ${command.name}`:command.intent==='directions'?`Open directions to ${command.place}`:'Create a Google Meet link';
    UI.confirmSheet('Confirm this command?',action,async()=>{try{
      if(command.intent==='spotify_add'){const r=await API.post('/api/playlists/command-add',{song:command.song,playlist:command.playlist,currently_playing:command.currentlyPlaying});out.textContent=`Added ${r.song} to ${r.playlist}.`;}
      if(command.intent==='call'){const r=await API.get('/api/voice/call?name='+encodeURIComponent(command.name));location.href=r.tel_link;}
      if(command.intent==='directions')location.href=`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(command.place)}`;
      if(command.intent==='meet'){const r=await API.post('/api/voice/meet',{});out.innerHTML=`Meet link: <a href="${UI.esc(r.meet_link)}" target="_blank" rel="noopener">Open meeting</a>`;}
    }catch(error){if(command.intent==='spotify_add'&&/connect spotify/i.test(error.message)){try{const r=await API.post('/api/playlists/spotify/login-url',{});location.href=r.url;return;}catch(e){UI.toast(e.message);return;}}if(command.intent==='meet'&&/connect google/i.test(error.message)){try{const r=await API.post('/api/voice/google/login-url',{});location.href=r.url;return;}catch(e){UI.toast(e.message);return;}}UI.toast(error.message);}},'Continue');
  },
  stopMicStream() { this.micStream?.getTracks().forEach((track) => track.stop()); this.micStream = null; },
  async requestMic() {
    if (!window.isSecureContext) throw new Error('Microphone access needs HTTPS or localhost. Open this app on a secure address.');
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This page cannot access a microphone. Use HTTPS or localhost in Chrome or Edge.');
    return navigator.mediaDevices.getUserMedia({ audio: true });
  },
  resetMic(message = 'Tap the microphone and speak') {
    this.requesting = false; this.listening = false; this.stopMicStream();
    const button = document.getElementById('micBig');
    button.classList.remove('live'); button.disabled = false; button.setAttribute('aria-label', 'Start speaking');
    document.getElementById('micHint').textContent = message;
  },
  async listen() {
    if (this.listening) { try { this.rec?.stop(); } catch {} return; }
    if (this.requesting) return UI.toast('Respond to the microphone permission prompt, then try again.');
    if (this.watching) this.stopWake();
    const recognition = this.sr();
    if (!recognition) return UI.toast('Voice input needs Chrome or Edge. Open this page in one of those browsers.');
    const button = document.getElementById('micBig');
    this.requesting = true;
    button.classList.add('live'); button.disabled = true; button.setAttribute('aria-label', 'Requesting microphone access');
    document.getElementById('micHint').textContent = 'Requesting microphone access…';
    try { this.micStream = await this.requestMic(); }
    catch (error) {
      this.resetMic();
      const message = error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'
        ? 'Microphone access was denied. Allow it using the site controls beside the address bar, then try again.'
        : error.name === 'NotFoundError' ? 'No microphone was found. Connect or enable one, then try again.'
        : error.name === 'NotReadableError' ? 'The microphone is busy in another app. Close that app and try again.'
        : error.message || 'Could not access the microphone.';
      UI.toast(message, 5000); return;
    }
    this.requesting = false; this.listening = true; this.rec = recognition;
    this.stopMicStream(); // Recognition opens its own input after the permission check.
    button.disabled = false; button.setAttribute('aria-label', 'Stop listening');
    document.getElementById('micHint').textContent = 'Listening… tap to cancel';
    recognition.lang = 'en-IN'; recognition.interimResults = false; recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const text = event.results?.[0]?.[0]?.transcript?.trim();
      this.resetMic('Preparing a review…');
      if (!text) return UI.toast('I didn’t catch that. Check your microphone and try again.');
      this.processText(text);
    };
    recognition.onerror = (event) => {
      const messages = {
        'not-allowed':'Microphone access was blocked. Allow it in the site controls beside the address bar.',
        'service-not-allowed':'Speech recognition is blocked by this browser.',
        'no-speech':'No speech detected. Check your microphone and try again.',
        'audio-capture':'No microphone was found.',
        'network':'Microphone access worked, but the browser speech-to-text service is unreachable. Check the internet and browser speech settings, or type your request below.',
      };
      const message = messages[event.error] || 'Microphone error. Please try again.';
      this.resetMic(event.error === 'aborted' ? 'Tap the microphone and speak' : message);
      if (event.error !== 'aborted') UI.toast(message, 5000);
    };
    recognition.onend = () => { if (this.listening) this.resetMic(); };
    try { recognition.start(); }
    catch { this.resetMic(); UI.toast('Could not start speech recognition. Try again.'); }
  },
  async processText(text) {
    if (/^add\s+.+\s+to\s+.+$/i.test(text) || /^create\s+(?:a\s+)?(?:(?:google)\s+)?meet\s+link[\s.,!?;:]*$/i.test(text) || /^call\s+.+$/i.test(text) || /^take\s+me\s+to\s+.+$/i.test(text)) return this.command(text);
    document.getElementById('micText').textContent = `“${text}”`;
    document.getElementById('micHint').textContent = 'Preparing a review…';
    try {
      const preview = await API.post('/api/voice/parse', { text, dry_run: true });
      if (!preview.understood.items.length) { document.getElementById('micHint').textContent = 'Tap the microphone and speak'; return UI.toast('I couldn’t find an item. Try saying a task and time.'); }
      this.review(text, preview.understood);
    } catch (error) { document.getElementById('micHint').textContent = 'Tap the microphone and speak'; UI.toast(error.message); }
  },
  review(text, understood) {
    const items = understood.items.map((item) => {
      const time = item.start == null ? '' : ` · ${Math.floor(item.start / 60)}:${String(item.start % 60).padStart(2, '0')}`;
      return `<li><span class="reviewDot"></span><span><b>${UI.esc(item.title)}</b><small>${UI.esc(item.kind)}${time}</small></span></li>`;
    }).join('');
    UI.sheet(`<div class="reviewHead"><span class="reviewEyebrow">VOICE NOTE</span><h2>Here’s what I heard</h2><p>Scheduled for ${UI.esc(understood.date)}</p></div><p class="reviewQuote">“${UI.esc(text)}”</p><ul class="reviewList">${items}</ul><div class="reviewActions"><button class="btn" id="vCancel">Edit by speaking again</button><button class="btn primary" id="vCreate">Create ${understood.items.length} ${understood.items.length === 1 ? 'reminder' : 'reminders'}</button></div>`);
    document.getElementById('vCancel').onclick = () => { UI.closeSheet(); document.getElementById('micHint').textContent = 'Tap the microphone and speak'; };
    document.getElementById('vCreate').onclick = async (event) => {
      const button = event.currentTarget; button.disabled = true; button.textContent = 'Creating…';
      try {
        const result = await API.post('/api/voice/parse', { text });
        UI.closeSheet(); UI.toast(`${result.created.length} reminder${result.created.length === 1 ? '' : 's'} created`);
        document.getElementById('micHint').textContent = 'Tap the microphone and speak';
      } catch (error) { button.disabled = false; button.textContent = `Create ${understood.items.length} reminders`; UI.toast(error.message); }
    };
  },
  stopWake() {
    this.watching = false; clearTimeout(this.watchRestart);
    try { this.rec?.stop(); } catch {}
    this.rec = null; this.stopMicStream();
    const toggle = document.getElementById('wakeToggle'); if (toggle) toggle.checked = false;
  },
  async wake(on) {
    if (!on) return this.stopWake();
    const recognition = this.sr();
    if (!recognition) { document.getElementById('wakeToggle').checked = false; return UI.toast('Wake phrase needs Chrome or Edge.'); }
    this.stopWake(); this.watching = true; this.rec = recognition;
    document.getElementById('wakeToggle').checked = true;
    try { this.micStream = await this.requestMic(); }
    catch (error) {
      this.stopWake();
      UI.toast(error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'
        ? 'Microphone access was denied. Allow it in the site controls beside the address bar.'
        : error.message || 'Could not access the microphone.', 5000);
      return;
    }
    if (!this.watching) { this.stopMicStream(); return; }
    this.stopMicStream(); // Release the permission-check stream before Web Speech opens the mic.
    const phrase = (document.getElementById('wakeWord').value || 'Hey Persona').trim().toLocaleLowerCase();
    recognition.lang = 'en-IN'; recognition.continuous = true; recognition.interimResults = true;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).filter((result) => result.isFinal).map((result) => result[0].transcript).join(' ').toLocaleLowerCase();
      const index = transcript.lastIndexOf(phrase);
      if (index >= 0) {
        const command = transcript.slice(index + phrase.length).replace(/^[\s,.:;-]+/, '').trim();
        this.stopWake();
        if (command) this.processText(command); else this.listen();
      }
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') { this.stopWake(); UI.toast('Microphone access was blocked. Allow it in the site controls beside the address bar.', 5000); }
      else if (event.error === 'network') UI.toast('Microphone access is working, but your browser speech-to-text service is unreachable. Check network/browser speech settings or try Chrome.', 5000);
    };
    recognition.onend = () => {
      if (this.watching) this.watchRestart = setTimeout(() => { if (this.watching) { try { recognition.start(); } catch { this.stopWake(); UI.toast('Wake phrase listening stopped. Tap to restart.'); } } }, 350);
    };
    try { recognition.start(); UI.toast(`Wake phrase active: “${phrase}”…`); }
    catch { this.stopWake(); UI.toast('Could not start wake phrase listening.'); }
  },
  enroll() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return UI.toast('Voice recording needs microphone access in a supported browser.');
    UI.sheet(`<div class="reviewHead"><span class="reviewEyebrow">VOICE PROFILE</span><h2>Enroll your voice</h2><p>Save a short sample to your profile. It does not verify who is speaking.</p></div><div class="enrollControls"><button class="btn primary" id="enRec">Start recording</button><button class="btn" id="enStop" disabled>Stop and save</button><button class="btn" id="enCancel">Cancel</button></div><p class="muted sm" id="enStatus" aria-live="polite">Recording stays on this device until you save.</p>`);
    let recorder, stream, chunks = [], timer, cancelled = false, saving = false;
    const cancel = () => {
      if (saving) return;
      cancelled = true; clearTimeout(timer);
      if (recorder?.state === 'recording') recorder.stop();
      stream?.getTracks().forEach((track) => track.stop());
      document.getElementById('sheetBg').onclick = () => UI.closeSheet(); UI.closeSheet();
    };
    document.getElementById('sheetBg').onclick = cancel;
    document.getElementById('enCancel').onclick = cancel;
    document.getElementById('enRec').onclick = async (event) => {
      try {
        stream = await this.requestMic(); cancelled = false;
        recorder = new MediaRecorder(stream); chunks = [];
        recorder.ondataavailable = (dataEvent) => { if (dataEvent.data.size) chunks.push(dataEvent.data); };
        recorder.start(); event.currentTarget.disabled = true;
        document.getElementById('enStop').disabled = false; document.getElementById('enStatus').textContent = 'Recording…';
        timer = setTimeout(() => document.getElementById('enStop')?.click(), 15000);
      } catch (error) {
        UI.toast(error.name === 'NotAllowedError' ? 'Microphone access was denied. Allow it beside the address bar.' : error.message || 'Could not start recording.', 5000);
      }
    };
    document.getElementById('enStop').onclick = () => {
      if (!recorder || recorder.state === 'inactive') return;
      clearTimeout(timer);
      recorder.onstop = async () => {
        stream?.getTracks().forEach((track) => track.stop());
        if (cancelled) return;
        saving = true;
        const form = new FormData(); form.append('wake_word', document.getElementById('wakeWord').value.trim() || 'Hey Persona');
        form.append('sample', new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }), 'voice-sample.webm');
        try { await API.call('/api/voice/profile', { method: 'POST', form }); document.getElementById('sheetBg').onclick = () => UI.closeSheet(); UI.closeSheet(); UI.toast('Voice sample saved'); }
        catch (error) { saving = false; document.getElementById('sheetBg').onclick = () => UI.closeSheet(); UI.toast(error.message); }
      };
      recorder.stop(); document.getElementById('enStatus').textContent = 'Saving your sample…';
    };
  },
  async contacts() {
    const box = document.getElementById('contactList');
    try {
      const contacts = await API.get('/api/voice/contacts');
      box.innerHTML = contacts.map((contact) => `<div class="contactRow"><div class="contactAvatar">${UI.esc(contact.name.slice(0, 1).toLocaleUpperCase())}</div><div class="contactInfo"><b>${UI.esc(contact.name)}</b><span>${UI.esc(contact.phone)}</span></div><a class="contactCall" href="tel:${UI.esc(contact.phone)}" aria-label="Call ${UI.esc(contact.name)}"><svg class="appIcon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${AppIcon.paths.phone}</svg></a></div>`).join('') || '<p class="muted sm">Your saved contacts will appear here.</p>';
    } catch { box.innerHTML = '<p class="muted sm">Couldn’t load contacts. Check your connection.</p>'; }
  },
};

document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('page-voice')) initVoice(); });
