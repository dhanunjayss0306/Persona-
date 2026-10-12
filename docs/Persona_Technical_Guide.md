# Persona — Technical Guide
*How the app is built, and how to change it yourself.*
*Backend built 2026-10-12 ~21:15 IST — real code at `~/workspace/persona-backend/`. File names below are the REAL ones. Frontend not built yet (waiting on his color palette).*

## The big picture (one line)
Persona is three things talking to each other: a **client** (what you tap) → a **server** (the brain) → a **database** (the memory). Plus a few outside **APIs** (ready-made services).

```
Your phone / browser (frontend)
        │  fetch() with JSON  →  REST API
        ▼
Server (backend, runs 24×7)  →  talks to Firebase, Spotify, Google
        │  SQL queries
        ▼
Database (Postgres via Supabase) — tables of your data
```

## 1. Frontend — the client (NOT BUILT YET — waiting on his color palette)
- **What it will be:** one codebase (HTML + CSS + JavaScript) that becomes two installs: an installable phone app (PWA) and the web app in a browser.
- **Key files you'll touch:**
  - `manifest.json` — the "install me" file: app name, icon, colors. Change the app name/icon here.
  - `service-worker.js` — a background script. Two jobs: (a) shows push notifications even when the app is closed, (b) lets the app install + work offline.
  - `pages/` or `components/` — one folder per screen: Reminders, Planner, AI Chat, Journal (3D book rendered with Three.js), Cart, Expenses, Playlists, Groups.
  - `api.js` — every server call lives here, e.g. `fetch('/api/reminders', {method:'POST', body: JSON.stringify({...})})`.
- **Rule:** anything you *see* (text, color, layout) lives here. If you want to change how it looks, it's always a frontend file.

## 2. Backend — the server (BUILT — `~/workspace/persona-backend/`)
- **What it is:** a program running 24×7 on a hosted machine. It never sleeps (that's why nags arrive on time).
- **Pieces:**
  - **REST API** — endpoints the frontend calls. Examples:
    - `POST /api/reminders` — save a new reminder
    - `GET /api/reminders` — list mine
    - `POST /api/reminders/:id/proof` — upload proof, stop the nag
    - `GET /api/ai/ask?q=...` — personal AI answers from your data
    - `POST /api/playlists` — create Spotify playlist
  - **Scheduler (cron)** — the alarm clock. Every minute it asks the DB: "any reminder due and not proven?" If yes → sends a push. Once a day: re-checks tracked prices.
  - **Push sender** — talks to Firebase Cloud Messaging (FCM); FCM is what actually wakes your phone with the notification.
  - **Auth** — sign-in. Passwords are stored *hashed* (bcrypt — one-way scrambled, never the raw text). After login you get a **JWT** (a signed token = a stamped entry pass) sent with every request.
  - **Integrations** — small modules: `spotify.js` (OAuth login → token → create playlist), `google.js` (sign-in + Calendar event with Meet link), `price.js` (fetches a product page, parses the price out of the HTML).

## 3. Database — the memory
- **Postgres** (via Supabase free tier). Data lives in **tables** (like spreadsheet sheets). Ours:
  - `users` — id, name, email, password_hash
  - `reminders` — id, user_id, title, type ('once' | 'nag'), due_at, proof_required, status
  - `proofs` — id, reminder_id, kind ('photo'|'voice'|'text'), file_url/text
  - `plans`, `journal_entries`, `expenses`, `cart_items`, `price_history`, `playlists`, `groups`, `group_members`
- Example row in `reminders`: `{title: "Submit assignment", type: "nag", due_at: "2026-10-13 09:00", status: "ringing"}`.

## 4. End-to-end: how the 5-minute nag actually works
1. You create a work reminder → frontend `POST /api/reminders` → row saved in DB with `status='pending'`.
2. Due time hits. The scheduler (every minute) finds it: due + not proven → calls FCM → notification pops on your phone.
3. 5 minutes pass, still not proven → scheduler fires again. And again.
4. You tap "I have done that" → app demands proof → you upload a photo → `POST /api/reminders/:id/proof` → server saves it, sets `status='done'`.
5. Next scheduler tick sees `done` → silence. That's the whole trick: the nag is just a loop that only a proof row can break.

## 5. Tomorrow: how to change things yourself
Every feature touches three layers — **UI → API → DB**. Follow the layer:
- **Change text, color, layout** → frontend `pages/` files only.
- **Change nag from 5 min to 10 min** → one constant in the scheduler config on the backend.
- **Add a field** (e.g. reminder priority) → add column in DB → include it in the API → show it in the UI. All three, in that order.
- **Add a new screen** → new file in `pages/` + new API endpoint if it needs data.
- **Debug rule:** open the browser devtools → Network tab shows every API call and what the server answered. 90% of bugs are visible there.

## 6. APIs we plug in (all free)
| API | Job | Needs from you |
|---|---|---|
| Firebase Cloud Messaging | push notifications to your phone | create a Firebase project (~15 min, guided) |
| Spotify Web API | auto-create playlists | your Spotify login (OAuth click) |
| Google (OAuth + Calendar) | sign-in, Meet links | your Google login |
| Web Speech API | voice input + in-app "Hey Persona" | nothing — built into the browser |
| JioSaavn | open/play a song | nothing — link handoff, no API exists |
| Shop pages (Amazon/Flipkart/Croma) | price tracking | nothing — we fetch pages directly; Amazon sometimes blocks |

## 7. Glossary (the only 10 terms you need)
- **Client/frontend** — the app on your phone; what you see.
- **Server/backend** — the 24×7 program that thinks and schedules.
- **REST API** — the menu of things the frontend can ask the server ("give me reminders", "save this proof").
- **JSON** — the format of the asking/answering: `{"title":"Submit assignment"}`.
- **Database/table/row** — the storage; tables are sheets, rows are entries.
- **Cron/scheduler** — a timer that runs code on a schedule (every minute, daily).
- **Push notification (FCM)** — a message from server → Google → your phone screen.
- **Service worker** — the app's background helper on your phone (shows pushes, enables install).
- **OAuth** — "log in with Spotify/Google" — they vouch for you, we never see your password.
- **JWT** — your stamped entry pass after login, sent with every request.
