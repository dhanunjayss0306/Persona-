# Persona

Persona is a vanilla JavaScript PWA with an Express API, Supabase persistence and optional Firebase push notifications.

## Run locally

1. Install backend dependencies: `cd backend && npm install`.
2. Copy `env/backend.env.example` to `backend/.env` and fill in Supabase keys, a strong `JWT_SECRET`, and a 32-byte hex `OAUTH_ENCRYPTION_KEY` (64 hex characters).
3. Copy `frontend/firebase-config.local.example.js` to `frontend/firebase-config.local.js` and add Firebase web config and the VAPID public key if push notifications are enabled. This local file is ignored by Git.
4. Apply the SQL files in `backend/db/schema.sql` and `backend/db/migrations/` in order in Supabase. Migration 005 adds timezone/token storage and the transactional plan confirm RPC; it also makes `proofs` and `voice-samples` buckets private. Create those buckets if they do not exist.
5. Run `npm start` in `backend` and serve `frontend/` from localhost over HTTP or HTTPS.
6. Run backend unit tests with `cd backend && npm test`.

The default user timezone is `Asia/Kolkata`; `/api/auth/me` and `PATCH /api/auth/me` expose/change it. Set `FRONTEND_URL` to comma-separated exact origins in production. Startup fails without `JWT_SECRET` and production CORS origins.

Firebase web API keys and VAPID keys are public client configuration, not server secrets. The committed frontend config now contains placeholders; restrict the Firebase API key to the deployed web origins and required APIs in Google Cloud Console. Rotate it there if the repository was public or its access was broader than intended. Keep Supabase service-role keys, OAuth secrets, JWT secrets, and Firebase service-account JSON only in ignored server-side files or a secret manager.

## Reminders and alarms

Sticky reminders repeat every five minutes until marked Done; proof uploads are optional. The in-app looping alarm only runs while Persona is open and audio has been unlocked by a user tap. Browser PWAs cannot guarantee alarms while closed or suspended. iOS may suspend service workers and does not provide dependable closed-app web alarms. For reliable native alarms, wrap the web app with Capacitor and implement native local notifications/alarm scheduling, including notification actions for Done and Snooze.

## Project map

- `frontend/`: static PWA pages, styles and browser JavaScript.
- `backend/src/routes/`: Express API routes.
- `backend/src/services/`: scheduling, timezone, NLP and planning logic.
- `backend/db/`: initial schema and ordered Supabase migrations.
- `backend/test/`: Node test runner tests.
