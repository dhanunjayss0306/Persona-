/* ai.js — personal AI chat. Answers from YOUR data via /api/ai/ask. */
function initAi() {
  const log = document.getElementById('chatLog');
  if (!log.dataset.init) {
    log.dataset.init = '1';
    aiSay("Hi, I'm Persona's memory. Ask me things like:\n• What's due tomorrow?\n• Last week's progress?\n• How much did I spend?\n• Any price drops?");
  }
  const send = async () => {
    const inp = document.getElementById('chatIn');
    const q = inp.value.trim(); if (!q) return;
    inp.value = '';
    log.innerHTML += `<div class="msg me">${UI.esc(q)}</div>`;
    log.scrollTop = log.scrollHeight;
    const typing = document.createElement('div');
    typing.className = 'msg ai'; typing.textContent = '…'; log.appendChild(typing);
    try {
      const r = await API.get('/api/ai/ask?q=' + encodeURIComponent(q));
      typing.remove(); aiSay(r.answer);
    } catch (e) { typing.remove(); aiSay("Couldn't reach the backend."); }
  };
  document.getElementById('chatSend').onclick = send;
  document.getElementById('chatIn').onkeydown = (e) => { if (e.key === 'Enter') send(); };
  function aiSay(t) {
    log.innerHTML += `<div class="msg ai">${UI.esc(t)}</div>`;
    log.scrollTop = log.scrollHeight;
  }
};

document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('page-ai')) initAi(); });
