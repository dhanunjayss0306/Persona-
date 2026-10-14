# Persona Backend

The brain of the Persona app: Express API + scheduler + push notifications.
The frontend (phone/web UI) talks to this over REST + JSON.

## What lives where

| Path | Job |
|---|---|
| `src/index.js` | Entry point â€” mounts all routes, starts the scheduler |
| `src/db.js` | Supabase client (Postgres + Storage) |
| `src/auth.js` | bcrypt password hashing, JWT tokens, `requireAuth` middleware |
| `src/routes/auth.js` | Sign-up, sign-in, device (push token) registration |
| `src/routes/reminders.js` | Reminders CRUD + **proof upload â€” the nag off-switch** |
| `src/routes/ai.js` | Personal AI â€” answers from YOUR data only |
| `src/routes/planner.js` | 2â€“3 month planner: build, re-plan, fixed events |
| `src/routes/journal.js` | Daily journal entries (frontend renders the 3D book) |
| `src/routes/expenses.js` | Manual UPI expense log + monthly summaries |
| `src/routes/cart.js` | Cart + price tracker (check-now, history, drop alerts) |
| `src/routes/playlists.js` | Spotify OAuth + auto playlist creation |
| `src/routes/groups.js` | Phase 2: group tasks (mirror as personal nag reminders) |
| `src/routes/voice.js` | Contacts, JioSaavn links, Google Meet via Calendar |
| `src/services/scheduler.js` | **The nag loop** (every minute) + daily price checks |
| `src/services/push.js` | Firebase Cloud Messaging sender |
| `src/services/price.js` | Best-effort price reader (no official shop APIs exist) |
| `db/schema.sql` | All tables â€” run once in Supabase SQL Editor |

## Setup (your 3 guided steps)

### 1. Database â€” Supabase (free)
1. Create a project at supabase.com.
2. Open SQL Editor, paste `db/schema.sql`, run it.
3. Storage > create a bucket named `proofs` (public) for proof uploads.
4. Settings > API: copy the Project URL and the **service_role** key.

### 2. Push â€” Firebase (free)
1. Create a project at console.firebase.google.com, add an Android/web app.
2. Project settings > Service accounts > Generate new private key â†’ save the JSON file next to this folder.
3. The phone app will later send its FCM token to `POST /api/auth/devices`.

### 3. Run it
```bash
npm install
cp .env.example .env   # then fill in your keys
npm start              # â†’ http://localhost:3001  (/health to check)
```

To keep it awake 24Ã—7 (nags must fire on time), deploy to Render / Railway /
Fly.io with `npm start` as the start command and your `.env` values as
environment variables. Free tiers sleep when idle â€” that delays nags.

## Key flows

**Nag loop:** `POST /api/reminders` (type `nag`) â†’ row is `pending` â†’ due time
hits â†’ scheduler (every minute) pushes via FCM every 5 min â†’ user taps
"I have done that" + `POST /api/reminders/:id/proof` (photo/voice/text) â†’
status `done` â†’ scheduler goes quiet. Proof is optional; marking the reminder done stops the loop.

**Price drop:** `POST /api/cart` (link + target) â†’ scheduler checks daily (or
`POST /api/cart/:id/check` now) â†’ price â‰¤ target â†’ a one-time reminder is
created â†’ you get notified through the normal channel.

**Meet link:** open Voice and choose **Connect Google Calendar**. The app uses
`POST /api/voice/google/login-url` for the signed OAuth flow; then
`POST /api/voice/meet` returns a `meet_link`. You can also say, “Create a Google
Meet link with Alex tomorrow at 5 pm and remind me 10 minutes before.” After
confirmation, Persona creates a Google Calendar event with a Meet link, a
matching Persona calendar entry, and a one-time reminder. If no date or time is
given, the meeting is scheduled five minutes from now and the reminder fires at
the start. Google OAuth settings must be configured in the backend environment,
and the OAuth client’s authorized redirect URI must exactly match
`GOOGLE_REDIRECT_URI`. Tokens are stored encrypted in Supabase using
`OAUTH_ENCRYPTION_KEY`.

**Spotify playlist:** connect once (`GET /api/playlists/spotify/login`), then
`POST /api/playlists` with `{name, songs[]}` creates it on your account.
