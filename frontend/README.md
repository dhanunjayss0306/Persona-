# Persona Frontend

The app UI — an installable PWA. **Every page is its own file.** To change a
screen, open its page; to change what it does, open its JS file. See
`../STRUCTURE.md` for the full map.

```
index.html              → login (the app starts here)
pages/                  → one HTML file per screen (today, reminders, …)
js/core/                → shared code: api.js (backend calls),
                          layout.js (top bar + tab bar), ui.js (popups),
                          auth.js (login/signup)
js/pages/               → one JS file per screen (same name as the page)
css/tokens.css          → colors, fonts — edit the look here
css/components.css      → buttons, cards, nav, sheets
css/journal.css         → the 3D journal book only
assets/                 → logo files
icons/                  → PWA icons
manifest.json, sw.js     → install + push notifications
```

## Run it

```bash
python3 -m http.server 8080
# open http://localhost:8080  (backend default: http://localhost:3001)
```

In the app: Settings page → Backend URL → your backend address. Saved on device.

## Add a new page (example: `pages/notes.html`)

1. Copy `pages/today.html` → `pages/notes.html`, change the body + title.
2. Copy `js/pages/today.js` → `js/pages/notes.js`, rename `initToday` → `initNotes`,
   change the guard to `page-notes`.
3. Add it to the `MORE` list in `js/core/layout.js` (or `TABS` for the bottom bar).

## Push notifications

`firebase-config.js` holds the Firebase **web app config** and the public Web
Push VAPID key used by the login flow and service worker. Add the Web Push
certificate key in Firebase Console to `PERSONA_VAPID_KEY`; without it, sign-in
continues normally and Settings explains what is missing. The private Firebase
service-account JSON belongs only in the backend and must never be copied here.
The service worker is registered centrally by `js/core/api.js` and provides the
offline shell plus background FCM handling.

## Design

Warm ivory surfaces, deep green ink, botanical line art, and restrained teal,
clay, and ochre accents. Keep the interface calm and clear; avoid purple
gradients and decorative emoji as navigation icons. Font: Inter with system
fallbacks. The service worker registers from the shared API script and updates
the app shell cache when the shell version changes.
