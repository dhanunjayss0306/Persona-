// index.js — Persona backend entry point.
// Wires everything together: Express app + routes + scheduler.
//
// Run:  npm install
//       cp .env.example .env   (then fill it)
//       npm start               (http://localhost:3001)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const supabase = require('./db');

const app = express();
const frontendOrigins = (process.env.FRONTEND_URL || '').split(',').map((origin) => origin.trim()).filter(Boolean);
app.use(cors({ origin: frontendOrigins.length ? frontendOrigins : '*' }));
app.use(express.json({ limit: '2mb' }));

// Readiness check — confirms both the API process and database connection.
app.get('/health', async (req, res) => {
  const { error } = await supabase.from('users').select('id', { count: 'exact', head: true }).limit(1);
  const ready = !error;
  res.status(ready ? 200 : 503).json({
    ok: ready, app: 'persona-backend', database: ready ? 'ok' : 'unavailable', time: new Date().toISOString(),
  });
});

// All feature areas, one router each.
app.use('/api/auth', require('./routes/auth'));
app.use('/api/reminders', require('./routes/reminders'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/planner', require('./routes/planner'));
// Retired screens stay out of the running app; existing database rows are retained.
app.use('/api/playlists', require('./routes/playlists'));
app.use('/api/favorites', require('./routes/favorites'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/voice', require('./routes/voice'));
app.use('/api/calendar', require('./routes/calendar'));

app.use((req, res) => res.status(404).json({ error: 'No such endpoint' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[persona] backend listening on :${PORT}`);
  require('./services/scheduler').start();
});
