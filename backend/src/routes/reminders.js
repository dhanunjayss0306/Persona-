// routes/reminders.js — the heart of Persona.
//
// Two types:
//   'once' — notify a single time, then status='notified' (birthdays, small things).
//   'nag'  — repeat every 5 minutes until the user marks it done; proof is optional.
const express = require('express');
const multer = require('multer');
const supabase = require('../db');
const { requireAuth } = require('../auth');
const { reminderRearm } = require('../services/behavior');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch((error) => {
  console.error('[reminders] request failed:', error.message);
  if (!res.headersSent) res.status(502).json({ error: 'Reminder database request failed. Check the backend connection and logs.' });
});

// POST /api/reminders  {title, details?, type: 'once'|'nag'|'plain', due_at, proof_required?}
router.post('/', requireAuth, asyncRoute(async (req, res) => {
  const { title, details, type, due_at, proof_required } = req.body || {};
  if (!title || !type || !due_at) return res.status(400).json({ error: 'title, type, due_at required' });
  if (!['once', 'nag', 'plain'].includes(type)) return res.status(400).json({ error: "type must be 'once', 'nag', or 'plain'" });

  const { data, error } = await supabase.from('reminders').insert({
    user_id: req.user.id, title, details: details || null, type, due_at,
    proof_required: proof_required !== false,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
}));

// GET /api/reminders?status=pending — list mine, newest first.
router.get('/', requireAuth, asyncRoute(async (req, res) => {
  let q = supabase.from('reminders').select('*').eq('user_id', req.user.id).order('due_at');
  if (req.query.status) q = q.eq('status', req.query.status);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
}));

// GET /api/reminders/:id
router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('reminders').select('*')
    .eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

// PATCH /api/reminders/:id — update a task: title, details, due date,
// type, or mark status. {title?, details?, type?, due_at?, proof_required?, status?}
router.patch('/:id', requireAuth, async (req, res) => {
  const allowed = ['title', 'details', 'type', 'due_at', 'proof_required', 'status'];
  const patch = {};
  for (const k of allowed) if (req.body?.[k] !== undefined) patch[k] = req.body[k];
  if (patch.due_at !== undefined) Object.assign(patch, reminderRearm(patch.due_at));
  if (patch.type && !['once', 'nag', 'plain'].includes(patch.type)) {
    return res.status(400).json({ error: "type must be 'once', 'nag', or 'plain'" });
  }
  if (patch.status && !['pending', 'ringing', 'notified', 'done'].includes(patch.status)) {
    return res.status(400).json({ error: 'status must be pending, ringing, notified, or done' });
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' });
  const { data, error } = await supabase.from('reminders').update(patch)
    .eq('id', req.params.id).eq('user_id', req.user.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

// DELETE /api/reminders/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabase.from('reminders').delete()
    .eq('id', req.params.id).eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// POST /api/reminders/:id/proof — THE OFF SWITCH.
// Accepts either a file (photo/voice/file) OR a text note.
// Creates the proof row and flips the reminder to 'done'. The scheduler
// only nags reminders with no proof — so this is what brings silence.
router.post('/:id/proof', requireAuth, upload.single('file'), async (req, res) => {
  const { kind, text } = req.body || {}; // kind: 'photo'|'file'|'voice'|'text'
  if (!kind || !['photo', 'file', 'voice', 'text'].includes(kind)) {
    return res.status(400).json({ error: "kind must be photo|file|voice|text" });
  }

  const { data: reminder } = await supabase.from('reminders').select('id,status')
    .eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
  if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
  if (reminder.status === 'done') return res.json({ ok: true, already: true });

  let file_url = null;
  if (req.file) {
    const path = `${req.user.id}/${reminder.id}/${Date.now()}-${req.file.originalname}`;
    const { error: upErr } = await supabase.storage.from('proofs').upload(path, req.file.buffer, {
      contentType: req.file.mimetype, upsert: true,
    });
    if (upErr) return res.status(500).json({ error: 'Upload failed: ' + upErr.message });
    file_url = path;
  }
  if (kind === 'text' && !text) return res.status(400).json({ error: 'text proof needs text' });

  const { error: pErr } = await supabase.from('proofs').insert({
    reminder_id: reminder.id, user_id: req.user.id, kind,
    file_url, text: text || null,
  });
  if (pErr) return res.status(500).json({ error: pErr.message });

  await supabase.from('reminders').update({ status: 'done' }).eq('id', reminder.id);
  res.json({ ok: true, message: 'Proof accepted. Nagging stopped.' });
});

// GET /api/reminders/:id/proofs — see the evidence.
router.get('/:id/proofs', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('proofs').select('*')
    .eq('reminder_id', req.params.id).eq('user_id', req.user.id).order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  const signed = await Promise.all((data||[]).map(async (proof) => {
    if (!proof.file_url) return proof;
    const result = await supabase.storage.from('proofs').createSignedUrl(proof.file_url, 300);
    return { ...proof, file_url: result.data?.signedUrl || null };
  }));
  res.json(signed);
});

module.exports = router;
