// routes/calendar.js — one merged calendar feed for the frontend:
// reminders + planner days + fixed events, in a date range.
// GET /api/calendar?from=2026-10-01&to=2026-10-31
const express = require('express');
const supabase = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const from = req.query.from || new Date().toISOString().slice(0, 10);
  const to = req.query.to || new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const uid = req.user.id;

  const { data: reminders } = await supabase.from('reminders')
    .select('id,title,details,type,status,due_at').eq('user_id', uid)
    .gte('due_at', from).lte('due_at', to + 'T23:59:59').order('due_at');

  const { data: plans } = await supabase.from('plans').select('id').eq('user_id', uid);
  const planIds = (plans || []).map((p) => p.id);
  let plan_days = [];
  if (planIds.length) {
    const { data } = await supabase.from('plan_days').select('day,blocks,done')
      .in('plan_id', planIds).gte('day', from).lte('day', to).order('day');
    plan_days = data || [];
  }

  const { data: events } = await supabase.from('fixed_events').select('*')
    .eq('user_id', uid).gte('event_date', from).lte('event_date', to).order('event_date');

  // Merge into per-day buckets the calendar UI can render directly.
  const days = {};
  const put = (date, kind, item) => {
    const key = date.slice(0, 10);
    (days[key] = days[key] || { date: key, reminders: [], plan_blocks: [], events: [] })[kind].push(item);
  };
  (reminders || []).forEach((r) => put(r.due_at, 'reminders', r));
  plan_days.forEach((d) => (d.blocks || []).forEach((b) => put(d.day, 'plan_blocks', { ...b, done: d.done })));
  (events || []).forEach((e) => put(e.event_date, 'events', e));

  res.json({ from, to, days });
});

module.exports = router;
