# Persona — Features and Implementation Guide

**Audience:** product and engineering review  
**Review date:** 14 October 2026  
**Purpose:** Explain what Persona does, how it is built, how to run the preview, and what remains before a production release.

## 1. Product summary

Persona is a personal planning app for calendars, reminders, study plans, and daily organization. It is an installable progressive web app (PWA) built with plain HTML, CSS, and JavaScript. An Express API handles account data and scheduled work. Supabase provides Postgres storage and file storage. Firebase Cloud Messaging (FCM) can deliver push notifications to registered devices.

The app has two appearance palettes, a Today agenda, month/week/day/agenda calendar views, sticky reminders, a study planner, an Assistant chat with voice questions, a combined task tracker, and additional personal tools. The design is responsive and uses a bottom navigation bar on small screens.

## 2. Feature inventory

### Calendar and Today

- Month, week, day, and 30-day agenda views with previous/next controls, a Today shortcut, today highlighting, and a selected-day agenda.
- Add calendar activities with title, date, time, notes, and an optional reminder. Day view time slots open the event form; calendar events can be dragged between month/week days.
- Edit or delete activities after creation; event types use distinct palette colors and crowded days show a +N more count.
- The selected-day agenda combines calendar activities, fixed dates such as exams, reminders, and study blocks.
- Today shows the current day’s agenda and offers quick access to reminders and voice entry. It also checks the next 30 days for saved exams and links into the study planner.
- Calendar activities and notification reminders are separate records; the also-remind-me switch opts into an alert.

**Current scope:** Persona has month, week, day, and agenda views with basic event CRUD and drag-to-move. It does not sync with Google Calendar or support recurring events, attendees, or calendar sharing.

### Reminders

- One-time reminders for a single notification.
- Sticky reminders repeat every five minutes after becoming due until marked Done; proof is optional.
- Reminder details can be edited or deleted.
- Optional proof can be a photo, audio file, PDF, or text note. Done stops sticky notifications immediately; Snooze postpones them by ten minutes.
- Date and time are entered separately. The time field uses the device’s native time picker where the browser supports it.
- Tasks from confirmed plans include sticky reminders for assignments, exams, and hackathon work. Today shows active sticky items with Done and Snooze actions.

**Sound behavior:** Settings can send a test push and play a short in-app test tone. Push requests high priority, interaction, vibration, Done/Snooze actions, and Android default sound. A PWA cannot guarantee a looping custom sound while closed or locked, particularly on iOS.

### Study planner, tasks, and AI scheduling

- The study planner keeps the existing topic-and-exam form as a deterministic fallback.
- Plan my month can draft study, assignment, project, exam, and event items from a natural language schedule. It sends the user's prompt, today's date, saved calendar activities, due reminders, and fixed exam dates to the configured OpenAI API. A user can edit, remove, or add draft items before confirming; preview does not write data.
- Confirmation creates plan rows and day blocks, calendar entries or exam dates, and sticky reminders for assignments, exams, and hackathon work. Missed study blocks can be redistributed with Re-plan.
- The Tasks view combines reminders, saved calendar events, fixed dates, and study blocks in Today, Upcoming, Overdue, and Done filters. Marking a study block done completes that plan day.
- Today highlights active sticky reminders with Done and Snooze 10m, shows upcoming saved exams, and includes a weekly completion chart/streak summary.

**AI setup and limits:** set `OPENAI_API_KEY` in the backend environment (optional `OPENAI_MODEL`, default `gpt-4o-mini`). Without a key, the app explains that AI planning is unavailable and keeps the standard planner working. Provider output is schema-checked and shown as an editable draft; users must confirm before it is saved. This is a planning helper, not a continuously running autonomous agent.

### Assistant and voice

- The main Assistant answers questions about today, tomorrow, and upcoming exams using saved reminders, calendar activities, fixed dates, and study blocks. Suggested prompts and speech-to-text are available on the same screen.
- Voice assistant actions include review-before-save spoken reminder capture, confirmed call/music/Google Meet handoffs, Google Maps directions, saved contacts, and voice questions through the Assistant screen.
- Saved songs, playlists, and films are kept in Personal settings rather than a separate Favorites navigation item. Saved songs can be used to request a Spotify playlist.

**Limits:** the browser voice recognition needs a supported browser and an open app; it cannot listen for a wake word after the app is closed or locked. Google and Spotify OAuth credentials are currently held in backend memory, so reconnecting may be needed after a backend restart. A browser cannot reliably play a custom alarm sound while closed or locked; a native Capacitor wrapper would be a separate project for stronger alarm behavior.

### Personal and shared tools

- Groups can assign shared tasks and show progress. Members need their own accounts.
- Personal settings contain profile, appearance, device notification registration and test, backend URL/health check, saved songs/playlists/films, and Spotify playlist creation.
- Journal, manual expense logging, and retailer price tracking have been removed from the app navigation and backend routes. Their existing database rows are retained; retailer price checks were best-effort and are no longer scheduled. Legacy page source remains in the repository because automatic review blocked bulk deletion of modified files; those pages are not linked in app navigation or precached by the service worker.

## 3. Visual system

The palettes are applied through shared CSS variables so Today, Settings, Calendar, cards, forms, controls, status colors, and typography change together. The light theme uses Georgia for editorial headings and Inter/system sans-serif for body text. The dark theme uses midnight black, electric violet, and sun yellow. Slow ambient botanical and linework illustrations animate behind the interface; motion respects reduced-motion preferences.

| Mode | Color | Hex | Main use |
|---|---|---|---|
| Light | Warm Ivory | `#FFF7E8` | Page background |
| Light | Soft Strawberry | `#F6C9D2` | Soft selected surfaces |
| Light | Pink | `#E78CA3` | Supporting accents |
| Light | Vibrant Crimson | `#C9184A` | Action and focus accents, used sparingly |
| Light | Light Green | `#B7D7B0` | Completion and positive status |
| Light | Deep Editorial Blue | `#163A63` | Section labels and editorial details |
| Light | Burnt Orange | `#C65D21` | Calendar/event details |
| Light | Soft Black | `#28231F` | Legible text, used as a neutral |
| Dark | Midnight Black | `#090916` | Page background |
| Dark | Electric Violet | `#A879FF` | Primary action and focus accent |
| Dark | Sun Yellow | `#FFD84D` | Calendar and reminder emphasis |
Both palettes are displayed as swatches in Settings. The appearance switch is device-local. The service-worker cache version has been advanced so a previously installed PWA can fetch the updated shell and palette.

## 4. Architecture and technology

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | HTML, CSS, vanilla JavaScript | Screens, local appearance preference, API calls, PWA shell |
| Backend | Node.js, Express | REST API, authentication, validation, integrations, reminder scheduler |
| Database and storage | Supabase Postgres and Storage | Accounts, reminders, plans, calendar events, entries, uploads, and other user data |
| Authentication | bcryptjs and JWT | Password hashing and authenticated API requests |
| Push notifications | Firebase Admin SDK / FCM | Deliver reminder notifications to registered browsers/devices |
| Voice input | Browser Web Speech API | Speech recognition while the app is open |
| Music integration | Spotify Web API; JioSaavn link handoff | Spotify playlist creation; JioSaavn search/play handoff |
| Google integration | Google OAuth and Calendar API | Google sign-in/Meet event workflow where configured |
| Background jobs | node-cron | Checks due reminders every minute and tracked prices daily |

Key code locations:

- `frontend/css/tokens.css` — shared colors, typography, shadows, and theme variables.
- `frontend/js/core/api.js` — API base URL, authentication header, and request helpers.
- `frontend/js/core/layout.js` — navigation, theme initialization, and page shell.
- `frontend/js/pages/calendar.js`, `reminders.js`, `planner.js`, and `ai.js` — core client features.
- `backend/src/index.js` — Express setup, route mounting, health endpoint, and scheduler start.
- `backend/src/routes/` — authenticated feature APIs.
- `backend/src/services/scheduler.js` — recurring reminder and price-check jobs.
- `backend/db/schema.sql` and `backend/db/migrations/` — database schema and incremental changes.

## 5. Data and service flows

### Calendar activity

1. The browser sends an authenticated request to `/api/calendar/events`.
2. The API saves the event to `calendar_events` in Supabase.
3. `/api/calendar?from=…&to=…` combines calendar activities with reminders, fixed events, and study blocks for the requested date range.

### Study plan alert

1. The user provides the plan dates, topics, hours, exam dates, and desired alert time.
2. The planner creates day blocks in `plans` and `plan_days`.
3. Future days also create one-time rows in `reminders`.
4. The scheduler checks for due reminders and sends through FCM when a device is registered and the push service is configured.

### Strict reminder

1. A due strict reminder enters the repeat loop.
2. The backend scheduler checks it every minute and sends a notification no more often than every five minutes.
3. Proof submission marks it complete and stops future repeats.

## 6. Local preview and backend

The local preview and API are currently running in this workspace:

- Frontend: `http://localhost:8080`
- Backend health: `http://localhost:3001/health`
- Default frontend API URL: `http://localhost:3001`
- Configured frontend CORS origin: `http://localhost:8080`

The backend health endpoint returned HTTP 200 with `database: ok`; this readiness check performs a read-only Supabase query as well as checking the API process. The Settings page and planner preview returned HTTP 200. The connected Supabase project also contains the `calendar_events` table. These checks confirm local connectivity, but do not constitute a full acceptance test of every API or external integration.

To start the services manually later:

```powershell
# Terminal 1
cd backend
npm start

# Terminal 2
cd frontend
python -m http.server 8080
```

Visit `http://localhost:8080`. The local backend loads configuration from `backend/.env`; keep this file and the Firebase service-account JSON private. In Settings, an API URL saved in browser storage overrides the default until it is cleared or changed.

## 7. Database setup

For a fresh Supabase project:

1. Run `backend/db/schema.sql` in the Supabase SQL editor.
2. Run migrations in numeric order, including `backend/db/migrations/004_calendar_events.sql` for calendar-only activities.
3. Create the Storage buckets used by the app, including `proofs` and `voice-samples`, with access rules appropriate to the deployment.
4. Set the Supabase URL and service-role key only in the backend environment.

Set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`) on the backend to enable natural-language month planning. The connected Supabase project already has the calendar table. Other fresh deployments must apply the calendar migration before creating, editing, or deleting calendar-only activities.

## 8. Integrations and operating requirements

- **Supabase:** project URL, service-role key, schema/migrations, and storage buckets.
- **Firebase:** web app configuration, VAPID key, Firebase service-account JSON, and device permission/registration for push delivery.
- **Spotify:** Spotify app credentials and OAuth redirect setup for playlist creation.
- **Google:** OAuth client and redirect setup for Google sign-in and Meet event workflows.
- **Backend uptime:** sticky reminders run only while the backend is online. A sleeping free-tier host can delay jobs.
- **Browser permissions:** push and speech recognition depend on browser support and user-granted permissions.

Credentials must remain in backend environment configuration or the appropriate private provider console. Do not place service-role keys, Firebase private keys, Spotify client secrets, or Google client secrets in frontend assets.

## 9. Known gaps and recommended next work

| Gap | Current state | Recommended next work |
|---|---|---|
| Google Calendar parity | Month/week/day/agenda, event CRUD, and drag-to-move exist; no full sync or recurring events | Add recurrence rules, attendees, calendar sharing, and optional sync if required |
| Planning agent | Optional LLM drafts an editable month plan; Assistant answers a focused set of schedule questions | Configure the provider key; add adaptive replanning, syllabus parsing, and conversational plan edits |
| Background alarms | In-app test tone and push notification options exist; a closed PWA cannot guarantee a loop | Decide whether a Capacitor/native notification package is needed for dependable locked-screen alarms |
| Study schedule quality | Topics and fixed dates generate repeatable day blocks and daily alerts | Add availability windows, topic durations, breaks, exam lead time, missed-day adaptation, and review controls |
| Google integration persistence | Google Calendar OAuth tokens are held in backend memory | Store tokens encrypted and persist refresh state before using multiple instances or restarting the service |
| Retired personal tools | Journal, expenses, and price tracker navigation/routes were disabled; stored rows were retained | Add explicit export or permanent deletion only if requested |
| Full release readiness | Local health and preview respond; provider integrations depend on configuration | Run end-to-end acceptance tests, review storage policies, set production CORS/HTTPS, and verify push on target devices |

## 10. Implementation status

- **Running locally:** frontend preview and Express backend on ports 8080 and 3001.
- **Database dependency:** the currently connected Supabase project has the calendar table; migration 004 remains required for other fresh deployments.
- **AI planning setup:** the local backend has no `OPENAI_API_KEY`; month-plan requests return the documented setup/fallback message until configured.
- **Push delivery:** backend scheduling code exists; real delivery requires valid Firebase configuration and a registered device.
- **Commit status:** calendar/reminder/study planner commit `95977ce` exists locally. GitHub publication was blocked by the automatic approval review because the configured remote destination was not explicitly confirmed. Other previously staged and unstaged workspace changes were preserved.
- **Testing:** Node syntax checks passed for edited JavaScript; two planner unit tests passed; Settings, Plan, Assistant, Calendar, and theme assets returned HTTP 200. Authenticated flows, FCM delivery, Spotify/Google OAuth, and OpenAI plan generation were not end-to-end tested.
