// routes/expenses.js — manual UPI expense log.
// (Auto-reading UPI apps is impossible — they share no APIs. So: quick-add,
// 5 seconds per payment, and the backend turns it into totals + charts data.)
const express = require('express');
const supabase = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// POST /api/expenses {amount, paid_to?, upi_app?, category?, note?}
router.post('/', requireAuth, async (req, res) => {
  const { amount, paid_to, upi_app, category, note, spent_at } = req.body || {};
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'amount required' });
  const { data, error } = await supabase.from('expenses').insert({
    user_id: req.user.id, amount: Number(amount),
    paid_to: paid_to || null, upi_app: upi_app || null,
    category: category || null, note: note || null,
    spent_at: spent_at || new Date().toISOString(),
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// GET /api/expenses?from=&to= — raw list.
router.get('/', requireAuth, async (req, res) => {
  let q = supabase.from('expenses').select('*').eq('user_id', req.user.id).order('spent_at', { ascending: false });
  if (req.query.from) q = q.gte('spent_at', req.query.from);
  if (req.query.to) q = q.lte('spent_at', req.query.to);
  const { data, error } = await q.limit(200);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /api/expenses/:id — fix an entry. {amount?, paid_to?, upi_app?, category?, note?}
router.patch('/:id', requireAuth, async (req, res) => {
  const allowed = ['amount', 'paid_to', 'upi_app', 'category', 'note', 'spent_at'];
  const patch = {};
  for (const k of allowed) if (req.body?.[k] !== undefined) patch[k] = req.body[k];
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' });
  const { data, error } = await supabase.from('expenses').update(patch)
    .eq('id', req.params.id).eq('user_id', req.user.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

// DELETE /api/expenses/:id
router.delete('/:id', requireAuth, async (req, res) => {
  await supabase.from('expenses').delete().eq('id', req.params.id).eq('user_id', req.user.id);
  res.json({ ok: true });
});

// GET /api/expenses/summary?month=2026-10 — totals for charts.
router.get('/summary', requireAuth, async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const from = `${month}-01`;
  const to = new Date(new Date(from).setMonth(new Date(from).getMonth() + 1)).toISOString().slice(0, 10);
  const { data } = await supabase.from('expenses').select('amount,category,upi_app')
    .eq('user_id', req.user.id).gte('spent_at', from).lt('spent_at', to);
  const rows = data || [];
  const total = rows.reduce((s, e) => s + Number(e.amount), 0);
  const byCategory = {}, byApp = {};
  rows.forEach((e) => {
    byCategory[e.category || 'other'] = (byCategory[e.category || 'other'] || 0) + Number(e.amount);
    byApp[e.upi_app || 'unknown'] = (byApp[e.upi_app || 'unknown'] || 0) + Number(e.amount);
  });
  res.json({ month, total, count: rows.length, byCategory, byApp });
});

module.exports = router;
