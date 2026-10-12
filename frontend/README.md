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

`sw.js` has a `firebaseConfig` placeholder — paste your Firebase web config
there (see `../env/frontend.firebase-config.example.js`).

## Design

Professional system style (Apple/Samsung): white `#FFFFFF`, ink `#1D1D1F`,
grey `#6E6E73`/`#F5F5F7`, blue `#0071E3`, red `#FF3B30`, green `#34C759`.
Flat, no gradients. Font: Inter throughout.
