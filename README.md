# Persona — personal reminder & planner app

**Start here: `STRUCTURE.md`** — the full map of where everything lives and
which file to open for every change.

| Folder | What's inside |
|---|---|
| `frontend/` | The app UI — installable PWA. Every page is its own file: `pages/*.html` + `js/pages/*.js`. |
| `backend/` | The API server — Node.js + Express + Supabase + Firebase push. `src/routes/` one file per feature, `db/` for the database. |
| `env/` | **Templates only — no real keys.** `backend.env.example`, `API_KEYS_GUIDE.md` (where each key comes from). |
| `docs/` | Spec, technical guide, brand board. |
| `STRUCTURE.md` | "I want to change X → open Y" map. |

## Run it

```bash
cd backend && npm install && cp ../env/backend.env.example .env  # fill in keys
npm start                      # → http://localhost:3001
cd ../frontend && python3 -m http.server 8080   # → http://localhost:8080
```

First-time setup (Supabase tables, Firebase, Google, Spotify): `docs/Persona_Technical_Guide.md`
and `env/API_KEYS_GUIDE.md`. Database tables explained: `backend/db/TABLES.md`.
Manager-facing feature inventory, architecture, setup, and known gaps: `docs/Persona_Features_Guide.md`.
Deploy: `backend/deploy/ORACLE.md`.
