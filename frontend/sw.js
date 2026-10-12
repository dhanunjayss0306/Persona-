/* sw.js — Persona service worker: app-shell cache + FCM push.
   FCM needs your Firebase web config — paste it into firebaseConfig below
   (Firebase Console > Project settings > Your apps > SDK setup). */
const CACHE = 'persona-v2';
const SHELL = ['./', './index.html', './manifest.json',
  './css/tokens.css', './css/components.css', './css/journal.css',
  './assets/logo-mark.png',
  './js/core/api.js', './js/core/layout.js', './js/core/ui.js', './js/core/auth.js',
  './pages/today.html', './pages/reminders.html', './pages/calendar.html', './pages/ai.html',
  './js/pages/today.js', './js/pages/reminders.js', './js/pages/calendar.js', './js/pages/ai.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});

// ---- FCM push (fill firebaseConfig to enable) ----
const firebaseConfig = {
  apiKey: "PASTE_ME", authDomain: "PASTE_ME", projectId: "PASTE_ME",
  messagingSenderId: "PASTE_ME", appId: "PASTE_ME",
};
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
