/* Assistant chat with speech input. Spoken requests are transcribed first, then sent as questions. */
function initAi() {
  const log = document.getElementById('chatLog');
  const say = (text, who = 'ai') => {
    log.insertAdjacentHTML('beforeend', `<div class="msg ${who}">${UI.esc(text)}</div>`);
    log.scrollTop = log.scrollHeight;
  };
  say('Hi, I’m Persona. I can check what’s on today, what is coming tomorrow, or when your next exam is. You can type or tap the microphone.');
  const send = async (text = document.getElementById('chatIn').value.trim()) => {
    if (!text) return;
    const input = document.getElementById('chatIn'); input.value = '';
    say(text, 'me');
    const typing = document.createElement('div'); typing.className = 'msg ai'; typing.textContent = 'Checking your plan…'; log.appendChild(typing);
    try { const result = await API.get('/api/ai/ask?q=' + encodeURIComponent(text)); typing.remove(); say(result.answer); }
    catch (error) { typing.remove(); say(`I couldn’t check that just now. ${error.message || 'Check your connection and try again.'}`); }
  };
  document.getElementById('chatSend').onclick = () => send();
  document.getElementById('chatIn').onkeydown = (event) => { if (event.key === 'Enter') send(); };
  document.querySelectorAll('[data-prompt]').forEach((button) => button.onclick = () => send(button.dataset.prompt));
  document.getElementById('openVoiceActions').onclick = () => go('voice');
  document.getElementById('assistantMic').onclick = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return UI.toast('Voice questions need Chrome or Edge. You can type below.');
    const recognition = new SpeechRecognition(); recognition.lang = 'en-IN'; recognition.interimResults = false; recognition.maxAlternatives = 1;
    const button = document.getElementById('assistantMic'); button.disabled = true; button.textContent = 'Listening…';
    recognition.onresult = (event) => { const text = event.results?.[0]?.[0]?.transcript?.trim(); if (text) send(text); else UI.toast('I didn’t catch that. Try again or type your question.'); };
    recognition.onerror = (event) => UI.toast(event.error === 'not-allowed' ? 'Allow microphone access in your browser to ask by voice.' : 'Voice input could not start. You can type your question.');
    recognition.onend = () => { button.disabled = false; button.textContent = '🎙'; };
    try { recognition.start(); } catch { button.disabled = false; button.textContent = '🎙'; UI.toast('Could not start voice input.'); }
  };
}
document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('page-ai')) initAi(); });
