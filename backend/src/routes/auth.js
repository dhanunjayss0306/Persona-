// routes/auth.js — sign-up, sign-in, "who am I".
const express = require('express');
const supabase = require('../db');
const { signToken, requireAuth, hashPassword, checkPassword } = require('../auth');
const { sendToUser, isReady: pushReady } = require('../services/push');

const router = express.Router();
const signinAttempts = new Map();
function limited(req, res) { const key = req.ip || 'unknown', now = Date.now(), slot = signinAttempts.get(key) || { count: 0, until: now + 15 * 60_000 }; if (slot.until < now) { slot.count = 0; slot.until = now + 15 * 60_000; } slot.count++; signinAttempts.set(key, slot); return slot.count > 10 ? res.status(429).json({ error: 'Too many sign-in attempts. Try again later.' }) : null; }

// POST /api/auth/signup  {name, email, phone?, password, work?, field_of_study?, degrees?, bio?}
router.post('/signup', async (req, res) => {
  const { name, email, phone, password, work, field_of_study, degrees, bio } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (!phone && !email) return res.status(400).json({ error: 'email or phone required' });
  const { data: existing } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const { data, error } = await supabase.from('users').insert({
    name, email, phone: phone || null, password_hash: await hashPassword(password),
    work: work || null, field_of_study: field_of_study || null,
    degrees: degrees || null, bio: bio || null,
  }).select('id, name, email').single();
  if (error) return res.status(500).json({ error: error.message });

  res.json({ user: data, token: signToken(data) });
});

// POST /api/auth/signin  {login (email OR phone), password} — no OTP, as requested.
router.post('/signin', async (req, res) => {
  if (limited(req, res)) return;
  const { login, email, password } = req.body || {};
  const id = login || email;
  if (!id || !password) return res.status(400).json({ error: 'email/phone and password are required' });

  const isPhone = /^[+\d][\d\s-]{5,}$/.test(id);
  const { data: user } = await supabase.from('users').select('*')
    .eq(isPhone ? 'phone' : 'email', id).maybeSingle();
  if (!user || !user.password_hash || !(await checkPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'Wrong credentials' });
  }
  const safe = { id: user.id, name: user.name, email: user.email };
  res.json({ user: safe, token: signToken(safe) });
});

// POST /api/auth/google  {id_token} — Sign in with Google.
// The app gets id_token from Google Sign-In on the phone; we verify it with
// Google and create/find the user. No password needed.
router.post('/google', async (req, res) => {
  const { id_token } = req.body || {};
  if (!id_token) return res.status(400).json({ error: 'id_token required' });
  let info;
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${id_token}`);
    info = await r.json();
    if (info.error || !info.email) throw new Error('bad token');
  } catch {
    return res.status(401).json({ error: 'Invalid Google token' });
  }
  let { data: user } = await supabase.from('users').select('id,name,email')
    .eq('google_id', info.sub).maybeSingle();
  if (!user) {
    const { data: byEmail } = await supabase.from('users').select('id,name,email')
      .eq('email', info.email).maybeSingle();
    if (byEmail) {
      await supabase.from('users').update({ google_id: info.sub }).eq('id', byEmail.id);
      user = byEmail;
    } else {
      const { data: created, error } = await supabase.from('users').insert({
        name: info.name || info.email.split('@')[0], email: info.email,
        google_id: info.sub, password_hash: null,
      }).select('id,name,email').single();
      if (error) return res.status(500).json({ error: error.message });
      user = created;
    }
  }
  res.json({ user, token: signToken(user) });
});

// GET /api/auth/onboarding/questions — the questions the app asks after signup.
const ONBOARDING_QUESTIONS = [
  { key: 'work', question: 'What do you do? (student, job, business…)' },
  { key: 'field_of_study', question: 'What are you studying or working in?' },
  { key: 'degrees', question: 'Your degrees so far? (e.g. B.Tech 2nd year)' },
  { key: 'hours_per_day', question: 'How many hours a day can you give to planned work?' },
  { key: 'interests', question: 'Anything else I should know about you? (goals, hobbies…)' },
];
router.get('/onboarding/questions', requireAuth, (req, res) => res.json(ONBOARDING_QUESTIONS));

// POST /api/auth/onboarding/answers  {work?, field_of_study?, degrees?, hours_per_day?, interests?}
router.post('/onboarding/answers', requireAuth, async (req, res) => {
  const a = req.body || {};
  const patch = { onboarding: a };
  for (const k of ['work', 'field_of_study', 'degrees', 'bio']) {
    if (a[k] !== undefined) patch[k] = a[k];
  }
  const { error } = await supabase.from('users').update(patch).eq('id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// PATCH /api/auth/me — update my profile.
// {name?, phone?, work?, field_of_study?, degrees?, bio?}
router.patch('/me', requireAuth, async (req, res) => {
  const allowed = ['name', 'phone', 'work', 'field_of_study', 'degrees', 'bio', 'timezone'];
  const patch = {};
  for (const k of allowed) if (req.body?.[k] !== undefined) patch[k] = req.body[k];
  if (patch.timezone) { try { new Intl.DateTimeFormat('en', { timeZone: patch.timezone }); } catch { return res.status(400).json({ error: 'Invalid timezone.' }); } }
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' });
  const { data, error } = await supabase.from('users').update(patch)
    .eq('id', req.user.id).select('id,name,email,phone,work,field_of_study,degrees,bio').single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ user: data });
});

// GET /api/auth/me — proves your token works.
router.get('/me', requireAuth, async (req, res) => {
  const { data } = await supabase.from('users')
    .select('id,name,email,phone,work,field_of_study,degrees,bio,timezone').eq('id', req.user.id).single();
  res.json({ user: data || req.user });
});

// POST /api/auth/devices  {fcm_token, label?} — register this phone for pushes.
router.post('/devices', requireAuth, async (req, res) => {
  const { fcm_token, label } = req.body || {};
  if (!fcm_token) return res.status(400).json({ error: 'fcm_token required' });
  const { error } = await supabase.from('devices')
    .upsert({ user_id: req.user.id, fcm_token, label: label || null }, { onConflict: 'fcm_token' });
  if (error) return res.status(500).json({ error: error.message });
  console.log('[push] device registered');
  res.json({ ok: true });
});

router.post('/devices/test', requireAuth, async (req, res) => {
  if (!pushReady()) return res.status(503).json({ error: 'Push delivery is not configured on the backend.' });
  const { data: devices, error } = await supabase.from('devices').select('id').eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  if (!devices?.length) return res.status(409).json({ error: 'This device is not registered. Enable notifications in Settings first.' });
  const delivered = await sendToUser(req.user.id, 'Persona test notification', 'Notifications are reaching this device.', { kind: 'test' });
  if (!delivered) return res.status(502).json({ error: 'Firebase could not deliver the test. Refresh device registration and check your browser notification permission.' });
  res.json({ ok: true });
});

module.exports = router;
