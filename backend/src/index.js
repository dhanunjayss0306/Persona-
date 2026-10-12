// index.js — Persona backend entry point.
// Wires everything together: Express app + routes + scheduler.
//
// Run:  npm install
//       cp .env.example .env   (then fill it)
//       npm start               (http://localhost:3001)
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ origin: (process.env.FRONTEND_URL || '').split(',').filter(Boolean) || '*' }));
app.use(express.json({ limit: '2mb' }));

// Health check — visit /health to see if the server is alive.
app.get('/health', (req, res) => res.json({ ok: true, app: 'persona-backend', time: new Date().toISOString() }));

// All feature areas, one router each.
app.use('/api/auth', require('./routes/auth'));
app.use('/api/reminders', require('./routes/reminders'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/planner', require('./routes/planner'));
app.use('/api/journal', require('./routes/journal'));
app.use('/api/share', require('./routes/share')); // public links, no auth
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/cart', require('./routes/cart'));
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
