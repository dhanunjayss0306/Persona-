# Persona — App Requirements Spec (draft, 2026-10-12)

Everything he has said so far, structured so he only needs to fill the open questions.
Full FRONTEND build is on hold until he gives the color palette + remaining requirements (his call, 2026-10-12 ~20:55 IST).
**Backend: BUILT 2026-10-12 ~21:15 IST** — real code at `~/workspace/persona-backend/` (Node.js + Express + Supabase; boots, `/health` ok).
**Frontend: BUILT 2026-10-12 ~23:45 IST** — real PWA at `~/workspace/persona-frontend/` (vanilla HTML/CSS/JS, 14 screens, installable, all 53 API calls verified wired to backend endpoints). Design: Awwwards Gallery palette light-first + Samsung-apps glassmorphism (NOT Good Lock), monumental grotesque type.

## Frontend round 2 — confirmed 2026-10-12 ~21:45 IST (backend extended same night)
- **Signup profile:** name, work (student/…), field of study, degrees, bio + email/phone + password, no OTP. Then the app asks onboarding questions (work, field, degrees, hours/day, interests).
- **Google sign-in** option added (`POST /api/auth/google` — verifies ID token, creates/links user).
- **Phone-number login** works alongside email login.
- **Calendar view:** `GET /api/calendar?from&to` merges reminders + planner days + fixed events per day.
- **Voice input (no typing):** `POST /api/voice/parse` — "Tomorrow I have a meeting at 8:00, a class from 9:00 to 10:15, and an assignment to submit" → tested: creates meeting (once, 8:00), class (once, 9:00–10:15), assignment (strict nag, due 22:00). Rule-based English parser, returns what it understood for a confirm screen.
- **Favorites:** songs, playlists, movies lists (`/api/favorites`).
- **Journal share links:** `POST /api/journal/:id/share` → public `/api/share/journal/:token` opens book-style, revocable.
- **Cart:** paste link → auto-added with shop detected (Myntra, Ajio, Flipkart + Amazon best-effort), price checked, asks target price / when to alert.
- **Voice enrollment:** record sample + choose wake word (`/api/voice/profile`). Honest limit: sample stored for personalization; strict reject-other-voices verification is advanced ML, not implemented.
- UI language: English.

## Frontend round 3 — confirmed 2026-10-12 ~21:50 IST (backend completed same night)
- **Update task:** every area now has full edit support — reminders (`PATCH /api/reminders/:id`: title, due date, type, status), group tasks (`PATCH /api/groups/tasks/:taskId`: title, due date, assignee, status), profile (`PATCH /api/auth/me`), expenses, cart target prices, plus deletes everywhere. Nothing is create-only anymore.
- **Group tasks:** fully built (was phase 2, now in) — create group, add members by email, assign tasks, group tasks mirror as personal nag reminders for assignees, per-member done/progress board.
- **Backend status: COMPLETE** — ~60 endpoints, full CRUD on all 14 tables, syntax-checked, boots, `/health` ok. Only remaining work is his Supabase/Firebase setup + the frontend (palette pending).
App name: **Persona**. Platform: full mobile (installable, real push) + web app, both booting separately, sharing the same data.

Last updated: 2026-10-12 ~20:20 IST — includes later additions (daily journal, expense tracking).

## Confirmed features

### 1. Reminders — two types
- **One-time** (birthdays, small things): notification comes once, that's it.
- **Work nag** (e.g. assignment due tomorrow): notification repeats **every 5 minutes** until dismissed. Dismissal requires TWO things: tap "I have done that" **AND** give proof — upload something (photo/file) or say something (voice/text). Until proof, the nag keeps popping.

### 2. Personal AI
- Answers from HIS data only: "what is tomorrow's topic?", "what did I do last time?", "where am I this week?", "what's today's plan and by which time?"
- Example flow: he sets "I'm learning Java — today's topic, tomorrow's topic, day-after's topic" and the AI answers from that.

### 3. Shopping cart + real-time price tracker
- Add product with link (Amazon / Flipkart / Croma) + optional target price ("tell me when below ₹1,500").
- Price history + drop alerts as reminders.
- **Honest caveats:** automatic checks need the backend (path 2); Amazon actively blocks automated checks — best-effort with retries, manual price-paste fallback. Flipkart/Croma usually easier.

### 4. Planner (2–3 months)
- Inputs: exam dates, deadlines, topics to learn, leisure (movies etc.), hours available per day.
- Output: day-by-day schedule — study blocks per topic, revision before exams, free time protected.
- Re-plans remaining days when he falls behind.
- Connects: tomorrow's study block becomes a work reminder (with the 5-min nag); AI answers "what should I study today?" from the plan.

### 5. Voice wake word
- "Hey Persona, what's today?" works **while the app is open** (phone open).
- **Hard limit:** no third-party app can wake from a locked phone like Siri/Google — that's Apple/Google-only.
- **Voice actions — INCLUDED (added back ~20:50 IST):** (a) phone calls — dialer intent / direct call in native build; (b) play a specific song in JioSaavn — handoff via JioSaavn link, may need one tap to play; (c) Google Meet link — created via Google Calendar API once he signs in with Google. WhatsApp messaging via voice: REMOVED at his request (2026-10-12 ~20:45 IST).
- Background listening when app is closed: only possible in a native build (foreground service, persistent notification, battery cost) — not on the web/PWA path.

### 6. Platform & sign-in
- Full mobile app (PWA install + real push) + separate web app, same account/data.
- Sign-in required (for groups and shared data). **He said he will specify which details to ask for — open below.**

### 7. Group tasks — PROPOSED PHASE 2 (his call, awaiting confirm)
- Create group, add people, split work; reminders nag only members who haven't finished.
- Each member's proof only clears their own task; group sees a progress board (who's done/pending).
- Needs: every member has the app + an account; group push needs the same Firebase setup.

### 8. Daily journal — 3D rotating book
- A daily journal that renders as a **3D rotating book** with **colorful themes** and a **personalized cover**.
- Design open: which themes, what the cover personalization options are — open question below.

### 9. Expense tracking (UPI)
- **Honest limits (already stated to him):** automatic tracking across UPI apps is impossible — no UPI app exposes transaction APIs. What CAN be done: manual quick-add expense log + charts of spending. SMS-parsing of transaction alerts is only possible in a fully native build, not the web/PWA path.
- Decide: manual log + charts (both paths), or go native for SMS parsing.

### 10. Music playlists (added 2026-10-12 ~20:45 IST)
- He tells the app his favorite songs; it creates a playlist.
- **Spotify:** yes — official API, auto-creates the playlist (needs his Spotify login).
- **JioSaavn:** no auto-create — JioSaavn offers no public playlist API. The app can still open/play individual songs in JioSaavn via links.
- Decide: Spotify only, or also a manual song list for JioSaavn.

## Web app vs mobile app split (his rule, 2026-10-12 ~20:50 IST)
Web app contains ONLY what a browser can do; everything else is mobile-only.
- **Both:** reminders (one-time + nag while app open), proof upload (photo/file/voice/text), personal AI chat, planner, 3D journal book, manual expense log + charts, cart + manual "check price now", Spotify playlists, group tasks + progress board, sign-in, in-app voice input + "Hey Persona" while open.
- **Mobile-only:** nags while phone asleep (push), background "Hey Persona" listening when app closed (native build only), direct phone calls, auto price checks on schedule, SMS-based expense auto-reading (native only).

## Known setup needed from him (not built yet)
- Firebase project + push setup (~15 min, guided) — required for: nags while phone asleep, auto price checks, group push.
- Nothing needed for the web-only path (nags/price checks work only while app is open).

## Open questions for him
1. **Sign-in details:** which fields to ask at sign-up? (name, email/phone, password — what else?)
2. **Group tasks:** confirm as phase 2? Anyone else to add to phase 2?
3. **Proof formats:** photo + voice + text enough, or also files/links?
4. **Planner inputs:** which fixed events first — exams next month? Which dates?
5. **Price tracker:** first products to track (earbuds?) and target prices?
6. **Visual style:** any look he wants (Virun used MakeMyTrip-clean; no direction given yet)?
7. **Journal:** which colorful themes; what should the personalized cover show (name? photo? design)?
8. **Expenses:** manual log + charts fine, or does he want the native build for SMS parsing?
9. Anything else before the build restarts.
10. **Playlists:** Spotify auto-playlist (needs your login) fine? Want a JioSaavn song list too?

## Build order (agreed-ish, confirm at restart)
Phase 1: reminders (both types) + proof-to-dismiss + personal AI + planner + journal + voice + sign-in → Phase 2: group tasks + expense log + price tracker → background push + auto price checks after his Firebase setup.
