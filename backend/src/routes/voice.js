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
const jwt = require('jsonwebtoken');
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
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'text required' });
  if (text.length > 4000) return res.status(413).json({ error: 'Voice notes must be under 4,000 characters' });

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
      if (error) return res.status(500).json({ error: `Could not create "${it.title}": ${error.message}`, created: created.map((c) => ({ id: c.id, title: c.title })) });
      created.push(data);
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
    if (error) return res.status(500).json({ error: `Voice sample upload failed: ${error.message}` });
    sample_url = supabase.storage.from('voice-samples').getPublicUrl(path).data.publicUrl;
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
const googleTokens = new Map(); // Move to encrypted persistent storage before running multiple backend instances.
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';

router.get('/google/status', requireAuth, (req, res) => res.json({ connected: googleTokens.has(req.user.id) }));

router.post('/google/login-url', requireAuth, (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
    return res.status(503).json({ error: 'Google Calendar is not configured on the backend.' });
  }
  const state = jwt.sign({ sub: req.user.id, purpose: 'google-calendar' }, jwtSecret, { expiresIn: '10m' });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
});

router.get('/google/callback', async (req, res) => {
  let identity;
  try { identity = jwt.verify(String(req.query.state || ''), jwtSecret); }
  catch { return res.status(400).send('Google connection expired or invalid. Return to Persona and try again.'); }
  if (identity.purpose !== 'google-calendar' || !identity.sub) return res.status(400).send('Invalid Google connection request.');
  if (req.query.error) return res.status(400).send('Google connection was cancelled. You can close this tab.');
  if (typeof req.query.code !== 'string' || !req.query.code) return res.status(400).send('Google did not return an authorization code.');
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: req.query.code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI, grant_type: 'authorization_code',
      }),
    });
    const tokens = await response.json();
    if (!response.ok || !tokens.access_token) return res.status(400).send('Google login failed. Return to Persona and try again.');
    const previous = googleTokens.get(identity.sub);
    googleTokens.set(identity.sub, { ...tokens, refresh_token: tokens.refresh_token || previous?.refresh_token, expires_at: Date.now() + Number(tokens.expires_in || 3600) * 1000 });
    res.send('<!doctype html><meta name="viewport" content="width=device-width"><title>Connected · Persona</title><main style="font:16px system-ui;max-width:420px;margin:15vh auto;padding:24px;color:#172033"><h1>Google Calendar connected</h1><p>You can close this tab and return to Persona.</p></main>');
  } catch { res.status(502).send('Could not reach Google. Return to Persona and try again.'); }
});

// POST /api/voice/meet {title?, minutes?} → creates event + Meet link.
router.post('/meet', requireAuth, async (req, res) => {
  let tok = googleTokens.get(req.user.id);
  if (!tok) return res.status(400).json({ error: 'Connect Google Calendar first.' });
  if (tok.expires_at < Date.now() + 30000) {
    if (!tok.refresh_token) { googleTokens.delete(req.user.id); return res.status(401).json({ error: 'Google session expired. Connect Google Calendar again.' }); }
    try {
      const refresh = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: tok.refresh_token, grant_type: 'refresh_token' }),
      });
      const next = await refresh.json();
      if (!refresh.ok || !next.access_token) { googleTokens.delete(req.user.id); return res.status(401).json({ error: 'Google session expired. Connect Google Calendar again.' }); }
      tok = { ...tok, ...next, refresh_token: tok.refresh_token, expires_at: Date.now() + Number(next.expires_in || 3600) * 1000 };
      googleTokens.set(req.user.id, tok);
    } catch { return res.status(502).json({ error: 'Could not refresh Google connection. Try again.' }); }
  }
  const { title, minutes } = req.body || {};
  const duration = minutes === undefined ? 30 : Number(minutes);
  if (!Number.isFinite(duration) || duration < 1 || duration > 480) return res.status(400).json({ error: 'Meeting length must be between 1 and 480 minutes.' });
  if (title !== undefined && (typeof title !== 'string' || title.length > 200)) return res.status(400).json({ error: 'Meeting title must be under 200 characters.' });
  const start = new Date(Date.now() + 5 * 60000);
  const end = new Date(start.getTime() + duration * 60000);
  let r, ev;
  try {
    r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: title || 'Persona meeting',
        start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() },
        conferenceData: { createRequest: { requestId: 'persona-' + Date.now() } },
      }),
    });
    ev = await r.json();
  } catch { return res.status(502).json({ error: 'Could not reach Google Calendar. Try again.' }); }
  if (!r.ok || !ev.hangoutLink) return res.status(502).json({ error: 'Google Calendar could not create a Meet link.' });
  res.json({ meet_link: ev.hangoutLink, event: ev.htmlLink });
});

module.exports = router;
