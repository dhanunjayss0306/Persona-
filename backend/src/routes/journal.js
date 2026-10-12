// routes/journal.js — daily journal. The frontend renders these
// entries as the 3D rotating book; the backend just stores them
// (one entry per day) with a theme + mood.
const express = require('express');
const supabase = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// POST /api/journal {entry_date?, title?, body, mood?, theme?}
router.post('/', requireAuth, async (req, res) => {
  const { entry_date, title, body, mood, theme } = req.body || {};
  if (!body) return res.status(400).json({ error: 'body required' });
  const day = entry_date || new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.from('journal_entries').upsert({
    user_id: req.user.id, entry_date: day, title: title || null,
    body, mood: mood || null, theme: theme || 'sunset',
  }, { onConflict: 'user_id,entry_date' }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// GET /api/journal?from=2026-10-01&to=2026-10-31 — entries as book pages.
router.get('/', requireAuth, async (req, res) => {
  let q = supabase.from('journal_entries').select('*').eq('user_id', req.user.id).order('entry_date');
  if (req.query.from) q = q.gte('entry_date', req.query.from);
  if (req.query.to) q = q.lte('entry_date', req.query.to);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/journal/today
router.get('/today', requireAuth, async (req, res) => {
  const day = new Date().toISOString().slice(0, 10);
  const { data } = await supabase.from('journal_entries').select('*')
    .eq('user_id', req.user.id).eq('entry_date', day).maybeSingle();
  res.json(data || null);
});

// DELETE /api/journal/:id
router.delete('/:id', requireAuth, async (req, res) => {
  await supabase.from('journal_entries').delete().eq('id', req.params.id).eq('user_id', req.user.id);
  res.json({ ok: true });
});

// POST /api/journal/:id/share — create a public share link for one entry.
router.post('/:id/share', requireAuth, async (req, res) => {
  const token = require('crypto').randomBytes(16).toString('hex');
  const { error } = await supabase.from('journal_entries').update({ share_token: token })
    .eq('id', req.params.id).eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ share_url: `/api/share/journal/${token}`, token });
});

// DELETE /api/journal/:id/share — revoke the link.
router.delete('/:id/share', requireAuth, async (req, res) => {
  await supabase.from('journal_entries').update({ share_token: null })
    .eq('id', req.params.id).eq('user_id', req.user.id);
  res.json({ ok: true });
});

module.exports = router;
