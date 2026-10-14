/* sw.js — Persona service worker: app-shell cache + FCM push. */
importScripts('./firebase-config.js');
const firebaseConfig = self.PERSONA_FIREBASE_CONFIG;
const CACHE = 'persona-v11';
const SHELL = ['./', './index.html', './manifest.json',
  './css/tokens.css', './css/components.css', './css/journal.css',
  './assets/logo-mark.png', './assets/ambient-linework.svg', './assets/ambient-botanical.svg', './firebase-config.js',
  './js/core/api.js', './js/core/layout.js', './js/core/ui.js', './js/core/auth.js', './js/pages/settings.js',
  './pages/today.html', './pages/plan.html', './pages/reminders.html', './pages/calendar.html', './pages/ai.html', './pages/voice.html',
  './pages/settings.html', './pages/cart.html', './pages/journal.html', './pages/planner.html',
  './pages/expenses.html', './pages/favorites.html', './pages/groups.html', './pages/onboarding.html',
  './js/pages/today.js', './js/pages/planhub.js', './js/pages/reminders.js', './js/pages/calendar.js', './js/pages/ai.js', './js/pages/voice.js',
  './js/pages/cart.js', './js/pages/journal.js', './js/pages/planner.js', './js/pages/expenses.js',
  './js/pages/favorites.js', './js/pages/groups.js', './js/pages/onboarding.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('persona-') && key !== CACHE).map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  const isAppCode = e.request.mode === 'navigate' || /\.(html|css|js|json)$/.test(new URL(e.request.url).pathname);
  if (isAppCode) {
    e.respondWith(fetch(e.request).then(async (response) => {
      if (response.ok) await (await caches.open(CACHE)).put(e.request, response.clone());
      return response;
    }).catch(async () => (await caches.open(CACHE)).match(e.request)));
    return;
  }
  e.respondWith(caches.open(CACHE).then((cache) => cache.match(e.request).then((hit) => hit || fetch(e.request))));
});
let messaging = null;
try {
  if (firebaseConfig.apiKey !== 'PASTE_ME') {
    importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
    importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
    firebase.initializeApp(firebaseConfig);
    messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const n = payload.notification || {};
      self.registration.showNotification(n.title || 'Persona', {
        body: n.body || '', icon: './icons/icon-192.png', badge: './icons/icon-192.png',
        data: payload.data || {},
      });
    });
  }
} catch (e) { /* FCM not configured yet — pushes skipped */ }

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow('./index.html'));
});
