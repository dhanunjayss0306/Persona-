// routes/favorites.js — "My favorites": songs, playlists, movies to watch.
// Simple named lists; Spotify playlists can also be auto-created via /api/playlists.
const express = require('express');
const supabase = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// POST /api/favorites {kind: 'song'|'playlist'|'movie', title, meta?}
router.post('/', requireAuth, async (req, res) => {
  const { kind, title, meta } = req.body || {};
  if (!kind || !title) return res.status(400).json({ error: 'kind and title required' });
  if (!['song', 'playlist', 'movie'].includes(kind)) return res.status(400).json({ error: 'bad kind' });
  const { data, error } = await supabase.from('favorites')
    .insert({ user_id: req.user.id, kind, title, meta: meta || {} }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// GET /api/favorites?kind=song
router.get('/', requireAuth, async (req, res) => {
  let q = supabase.from('favorites').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
  if (req.query.kind) q = q.eq('kind', req.query.kind);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/favorites/:id
router.delete('/:id', requireAuth, async (req, res) => {
  await supabase.from('favorites').delete().eq('id', req.params.id).eq('user_id', req.user.id);
  res.json({ ok: true });
});

module.exports = router;
