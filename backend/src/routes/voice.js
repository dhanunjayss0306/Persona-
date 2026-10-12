// routes/voice.js — voice actions: calls, JioSaavn, Google Meet.
//
// "Hey Persona" listening itself happens on the phone (Web Speech API /
// native hotword). When the phone hears a command, it calls THESE endpoints.
//   - call: the phone dials directly (tel: link / native intent). The backend
//           just resolves "mom" -> phone number from contacts.
//   - jiosaavn: backend returns a JioSaavn search link for the song; the app opens it.
//   - meet: backend creates a Google Calendar event WITH a Meet link and
//           returns the join URL (needs Google OAuth — see /api/voice/google/*).
const express = require('express');
const multer = require('multer');
const supabase = require('../db');
const { requireAuth } = require('../auth');
const { parseToItems, stamp } = require('../services/nlp');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/voice/parse {text} — "Tomorrow I have a meeting at 8:00, a class
// from 9:00 to 10:15, and an assignment to submit" → creates arranged items.
// Assignments → strict (nag) reminders; meetings/classes → calendar reminders.
// Always returns what it understood so the app can show a confirm screen.
router.post('/parse', requireAuth, async (req, res) => {
  const { text, dry_run } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });

  const { date, items } = parseToItems(text);
  const created = [];
  if (!dry_run) {
    for (const it of items) {
      const isWork = it.kind === 'assignment';
      const due_at = stamp(date, it.start, isWork ? 23 - 1 : 9); // assignments due 22:00 if no time
      const title = it.end != null
        ? `${it.title} (${Math.floor(it.start / 60)}:${String(it.start % 60).padStart(2, '0')}–${Math.floor(it.end / 60)}:${String(it.end % 60).padStart(2, '0')})`
        : it.title;
      const { data, error } = await supabase.from('reminders').insert({
        user_id: req.user.id,
        title: title.charAt(0).toUpperCase() + title.slice(1),
        details: `From voice: "${text}"`,
        type: isWork ? 'nag' : 'once',
        due_at,
      }).select().single();
      if (!error) created.push(data);
    }
  }
  res.json({
    understood: { date, items },
    created: created.map((c) => ({ id: c.id, title: c.title, type: c.type, due_at: c.due_at })),
    message: `Arranged ${items.length} item(s) for ${date}.`,
  });
});

// ---------- voice enrollment ----------
// POST /api/voice/profile {wake_word?} + optional voice sample file.
// The app records his voice once ("voice verification") and lets him choose
// what to call the assistant. Honest limit: this stores his sample and
// preference; strict "reject other voices" speaker verification is advanced
// ML and not implemented — the sample personalizes, it doesn't lock.
router.post('/profile', requireAuth, upload.single('sample'), async (req, res) => {
  const { wake_word } = req.body || {};
  let sample_url = null;
  if (req.file) {
    const path = `${req.user.id}/sample-${Date.now()}.webm`;
    const { error } = await supabase.storage.from('voice-samples').upload(path, req.file.buffer, {
      contentType: req.file.mimetype, upsert: true,
    });
    if (!error) sample_url = supabase.storage.from('voice-samples').getPublicUrl(path).data.publicUrl;
  }
  const row = { user_id: req.user.id, wake_word: wake_word || 'Hey Persona' };
  if (sample_url) row.sample_url = sample_url;
  const { error } = await supabase.from('voice_profiles').upsert(row, { onConflict: 'user_id' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, wake_word: row.wake_word, sample_saved: !!sample_url });
});

router.get('/profile', requireAuth, async (req, res) => {
  const { data } = await supabase.from('voice_profiles').select('wake_word,sample_url')
    .eq('user_id', req.user.id).maybeSingle();
  res.json(data || { wake_word: 'Hey Persona', sample_url: null });
});

// ---------- contacts ----------
router.post('/contacts', requireAuth, async (req, res) => {
  const { name, phone } = req.body || {};
  if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });
  const { data, error } = await supabase.from('contacts')
    .insert({ user_id: req.user.id, name, phone }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});
router.get('/contacts', requireAuth, async (req, res) => {
  const { data } = await supabase.from('contacts').select('*')
    .eq('user_id', req.user.id).order('name');
  res.json(data || []);
});

// GET /api/voice/call?name=mom → {phone, tel_link} — the app then dials.
router.get('/call', requireAuth, async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'name required' });
  const { data } = await supabase.from('contacts').select('name,phone')
    .eq('user_id', req.user.id).ilike('name', `%${name}%`).limit(1).maybeSingle();
  if (!data) return res.status(404).json({ error: `No contact matching "${name}"` });
  res.json({ name: data.name, phone: data.phone, tel_link: `tel:${data.phone}` });
});

// GET /api/voice/jiosaavn?song=... → JioSaavn search link for the app to open.
router.get('/jiosaavn', requireAuth, (req, res) => {
  const { song } = req.query;
  if (!song) return res.status(400).json({ error: 'song required' });
  res.json({
    song,
    // JioSaavn web search URL — the app opens this; user taps play.
    url: 'https://www.jiosaavn.com/search/song/' + encodeURIComponent(song).replace(/%20/g, '+'),
  });
});

// ---------- Google Meet via Calendar ----------
const googleTokens = new Map(); // userId -> tokens; use DB/Redis in production.

router.get('/google/login', requireAuth, (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'Google not configured (see .env)' });
  const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar.events');
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' +
    `client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.GOOGLE_REDIRECT_URI)}` +
    `&response_type=code&scope=${scope}&access_type=offline&state=${req.user.id}`);
});

router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI, grant_type: 'authorization_code',
    }),
  });
  const tok = await r.json();
  if (!tok.access_token) return res.status(400).send('Google login failed');
  googleTokens.set(state, tok);
  res.send('Google connected! You can close this tab and go back to Persona.');
});

// POST /api/voice/meet {title?, minutes?} → creates event + Meet link.
router.post('/meet', requireAuth, async (req, res) => {
  const tok = googleTokens.get(req.user.id);
  if (!tok) return res.status(400).json({ error: 'Connect Google first (GET /api/voice/google/login)' });
  const { title, minutes } = req.body || {};
  const start = new Date(Date.now() + 5 * 60000);
  const end = new Date(start.getTime() + (Number(minutes) || 30) * 60000);
  const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: title || 'Persona meeting',
      start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() },
      conferenceData: { createRequest: { requestId: 'persona-' + Date.now() } },
    }),
  });
  const ev = await r.json();
  if (!r.ok) return res.status(500).json({ error: 'Could not create meeting' });
  res.json({ meet_link: ev.hangoutLink, event: ev.htmlLink });
});

module.exports = router;
