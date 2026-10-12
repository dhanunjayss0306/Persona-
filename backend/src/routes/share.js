// routes/share.js — PUBLIC links (no login needed).
// The journal "share" button creates a token link; anyone opening it sees
// that one entry rendered book-style by the frontend.
// GET /api/share/journal/:token
const express = require('express');
const supabase = require('../db');

const router = express.Router();

router.get('/journal/:token', async (req, res) => {
  const { data } = await supabase.from('journal_entries')
    .select('title,body,mood,theme,entry_date,users(name)')
    .eq('share_token', req.params.token).maybeSingle();
  if (!data) return res.status(404).json({ error: 'Link invalid or expired' });
  res.json({ title: data.title, body: data.body, mood: data.mood, theme: data.theme, date: data.entry_date, author: data.users?.name || 'Someone' });
});

module.exports = router;
