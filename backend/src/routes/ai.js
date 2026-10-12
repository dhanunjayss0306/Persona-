// routes/ai.js — the personal AI. It answers ONLY from YOUR data:
// reminders, plans, journal, expenses. No general knowledge, no guessing.
//
// GET /api/ai/ask?q=what is tomorrow's topic
// It figures out the intent from keywords, queries your tables, and answers
// in plain words. (Later, an LLM can be plugged in front of these same
// data functions for smarter phrasing — the data layer stays identical.)
const express = require('express');
const supabase = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

function dayBounds(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const start = new Date(d); start.setHours(0, 0, 0, 0);
  const end = new Date(d); end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString(), label: d.toDateString() };
}
function weekAgo() {
  const d = new Date(); d.setDate(d.getDate() - 7);
  return d.toISOString();
}
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');

router.get('/ask', requireAuth, async (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.status(400).json({ error: 'Ask something, e.g. ?q=what is due tomorrow' });
  const uid = req.user.id;

  const dueBetween = async (a, b) => {
    const { data } = await supabase.from('reminders').select('title,details,type,status,due_at')
      .eq('user_id', uid).gte('due_at', a).lte('due_at', b).order('due_at');
    return data || [];
  };
  const fmt = (r) => `• ${r.title} (${new Date(r.due_at).toLocaleString('en-IN')}) [${r.status}]`;

  // --- "what is tomorrow's topic / what do I have to do tomorrow"
  if (q.includes('tomorrow')) {
    const { start, end } = dayBounds(1);
    const rows = await dueBetween(start, end);
    const { data: days } = await supabase.from('plan_days').select('day,blocks')
      .eq('day', new Date(Date.now() + 864e5).toISOString().slice(0, 10));
    const plan = (days || []).flatMap((d) => d.blocks || []).map((b) => `• ${b.title} — ${b.minutes} min`);
    const parts = [];
    if (rows.length) parts.push("Reminders for tomorrow:\n" + rows.map(fmt).join('\n'));
    if (plan.length) parts.push("Planned study:\n" + plan.join('\n'));
    return res.json({ answer: parts.length ? parts.join('\n\n') : 'Nothing scheduled for tomorrow. Enjoy the free day.' });
  }

  // --- "what do I have to do today / what's today"
  if (q.includes('today') || q === "what's today" || q === 'what is today') {
    const { start, end } = dayBounds(0);
    const rows = await dueBetween(start, end);
    return res.json({
      answer: rows.length
        ? "Today:\n" + rows.map(fmt).join('\n')
        : 'Nothing due today.',
    });
  }

  // --- "what did I do last time / last week's progress / where am I"
  if (q.includes('last week') || q.includes('progress') || q.includes('last time') || q.includes('where am i')) {
    const { data: done } = await supabase.from('reminders').select('title,due_at')
      .eq('user_id', uid).eq('status', 'done').gte('due_at', weekAgo()).order('due_at');
    const { data: exp } = await supabase.from('expenses').select('amount')
      .eq('user_id', uid).gte('spent_at', weekAgo());
    const spent = (exp || []).reduce((s, e) => s + Number(e.amount), 0);
    const lines = ['Last 7 days:'];
    lines.push(`Completed: ${(done || []).length} task(s).`);
    (done || []).slice(0, 10).forEach((d) => lines.push(`• ${d.title}`));
    lines.push(`Spent: ${inr(spent)}.`);
    return res.json({ answer: lines.join('\n') });
  }

  // --- "how much did I spend ..."
  if (q.includes('spend') || q.includes('spent') || q.includes('expense')) {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const { data } = await supabase.from('expenses').select('amount,category,paid_to')
      .eq('user_id', uid).gte('spent_at', monthStart.toISOString());
    const total = (data || []).reduce((s, e) => s + Number(e.amount), 0);
    const byCat = {};
    (data || []).forEach((e) => { byCat[e.category || 'other'] = (byCat[e.category || 'other'] || 0) + Number(e.amount); });
    const lines = [`This month you spent ${inr(total)} across ${(data || []).length} payments.`];
    Object.entries(byCat).forEach(([c, v]) => lines.push(`• ${c}: ${inr(v)}`));
    return res.json({ answer: lines.join('\n') });
  }

  // --- "price" — cheapest tracked item / drops
  if (q.includes('price') || q.includes('drop')) {
    const { data } = await supabase.from('cart_items')
      .select('name,last_price,target_price,url').eq('user_id', uid).order('last_price');
    if (!data || !data.length) return res.json({ answer: 'Your cart is empty.' });
    const lines = ['Tracked prices:'];
    data.slice(0, 10).forEach((c) => {
      const flag = c.target_price && c.last_price <= c.target_price ? ' ← TARGET HIT' : '';
      lines.push(`• ${c.name}: ${c.last_price ? inr(c.last_price) : 'not checked yet'} (target ${c.target_price ? inr(c.target_price) : '—'})${flag}`);
    });
    return res.json({ answer: lines.join('\n') });
  }

  // --- fallback: search reminders by keyword
  const { data: found } = await supabase.from('reminders').select('title,status,due_at')
    .eq('user_id', uid).ilike('title', `%${q}%`).order('due_at').limit(5);
  if (found && found.length) {
    return res.json({ answer: 'Found:\n' + found.map(fmt).join('\n') });
  }
  return res.json({
    answer: 'I can answer from your data — try: "what is due tomorrow", "last week progress", "how much did I spend", "price drops".',
  });
});

module.exports = router;
