// routes/planner.js — the 2–3 month planner.
//
// You give: fixed events (exams/deadlines), topics to learn, leisure,
// and hours available per day.
// POST /api/planner/build turns that into day-by-day blocks.
// If you fall behind, POST /api/planner/:id/replan rebuilds the
// remaining days from the unfinished work.
const express = require('express');
const supabase = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// Spread topics across days: simple round-robin, protecting fixed events
// (exam days get revision blocks instead of new topics).
function buildDays({ start, end, hoursPerDay, topics, leisure, events }) {
  const eventDays = new Set((events || []).map((e) => e.event_date));
  const days = [];
  const cur = new Date(start);
  const last = new Date(end);
  let ti = 0;
  while (cur <= last) {
    const iso = cur.toISOString().slice(0, 10);
    const blocks = [];
    const mins = Math.round(hoursPerDay * 60);
    if (eventDays.has(iso)) {
      blocks.push({ title: 'Revision for ' + (events.find((e) => e.event_date === iso) || {}).title, minutes: Math.min(120, mins), kind: 'revision' });
      if (mins > 120) blocks.push({ title: leisure || 'Free time', minutes: mins - 120, kind: 'leisure' });
    } else {
      const per = topics.length ? Math.floor(mins * 0.7 / topics.length) : 0;
      topics.forEach((t) => blocks.push({ title: t, minutes: per, kind: 'study' }));
      const used = per * topics.length;
      if (mins - used > 0) blocks.push({ title: leisure || 'Free time', minutes: mins - used, kind: 'leisure' });
      ti++;
    }
    days.push({ day: iso, blocks });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// POST /api/planner/build {title, start_date, end_date, hours_per_day, topics[], leisure?}
router.post('/build', requireAuth, async (req, res) => {
  const { title, start_date, end_date, hours_per_day, topics, leisure, study_reminders } = req.body || {};
  if (!title || !start_date || !end_date || !hours_per_day || !topics?.length) {
    return res.status(400).json({ error: 'title, start_date, end_date, hours_per_day, topics[] required' });
  }
  if (study_reminders !== undefined && (!Array.isArray(study_reminders) || study_reminders.length > 120 ||
      study_reminders.some((r) => !r || typeof r.due_at !== 'string' || Number.isNaN(Date.parse(r.due_at))))) {
    return res.status(400).json({ error: 'Study reminders must contain valid due_at dates (up to 120).' });
  }
  const { data: events } = await supabase.from('fixed_events').select('title,event_date')
    .eq('user_id', req.user.id).gte('event_date', start_date).lte('event_date', end_date);

  const { data: plan, error } = await supabase.from('plans').insert({
    user_id: req.user.id, title, start_date, end_date, hours_per_day,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });

  const days = buildDays({ start: start_date, end: end_date, hoursPerDay: Number(hours_per_day), topics, leisure, events });
  const rows = days.map((d) => ({ plan_id: plan.id, day: d.day, blocks: d.blocks }));
  const { error: dErr } = await supabase.from('plan_days').insert(rows);
  if (dErr) return res.status(500).json({ error: dErr.message });

  if (study_reminders?.length) {
    const reminders = study_reminders.map(({ due_at }) => ({
      user_id: req.user.id, title: `${title}: study session`,
      details: 'Plan assistant: scheduled from your study plan.',
      type: 'once', due_at, proof_required: false,
    }));
    const { error: reminderError } = await supabase.from('reminders').insert(reminders);
    if (reminderError) return res.status(500).json({ error: 'Plan created, but study reminders could not be saved.' });
  }

  res.status(201).json({ plan, days: days.length, reminders: study_reminders?.length || 0 });
});

// GET /api/planner — my plans with their days.
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('plans').select('*, plan_days(*)')
    .eq('user_id', req.user.id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/planner/:id/replan — rebuild remaining days from unfinished work.
router.post('/:id/replan', requireAuth, async (req, res) => {
  const { data: plan } = await supabase.from('plans').select('*')
    .eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const today = new Date().toISOString().slice(0, 10);
  const { data: days } = await supabase.from('plan_days').select('*').eq('plan_id', plan.id);
  const remaining = (days || []).filter((d) => d.day >= today && !d.done);
  // Collect unfinished study blocks as the new topic list.
  const topics = [...new Set(remaining.flatMap((d) => (d.blocks || [])
    .filter((b) => b.kind === 'study').map((b) => b.title)))];
  if (!topics.length) return res.json({ ok: true, message: 'Nothing unfinished — plan is on track.' });

  const { data: events } = await supabase.from('fixed_events').select('title,event_date')
    .eq('user_id', req.user.id).gte('event_date', today).lte('event_date', plan.end_date);
  const fresh = buildDays({
    start: today, end: plan.end_date, hoursPerDay: Number(plan.hours_per_day),
    topics, leisure: 'Free time', events,
  });
  for (const d of fresh) {
    await supabase.from('plan_days').update({ blocks: d.blocks, done: false })
      .eq('plan_id', plan.id).eq('day', d.day);
  }
  res.json({ ok: true, rebuilt_days: fresh.length });
});

// POST /api/planner/day-done {plan_id, day} — mark a day finished.
router.post('/day-done', requireAuth, async (req, res) => {
  const { plan_id, day } = req.body || {};
  const { error } = await supabase.from('plan_days').update({ done: true })
    .eq('plan_id', plan_id).eq('day', day);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// DELETE /api/planner/:id — delete a whole plan and its days.
router.delete('/:id', requireAuth, async (req, res) => {
  await supabase.from('plans').delete().eq('id', req.params.id).eq('user_id', req.user.id);
  res.json({ ok: true });
});

// Fixed events (exams/deadlines).
router.post('/events', requireAuth, async (req, res) => {
  const { title, event_date, kind } = req.body || {};
  if (!title || !event_date) return res.status(400).json({ error: 'title, event_date required' });
  const { data, error } = await supabase.from('fixed_events')
    .insert({ user_id: req.user.id, title, event_date, kind: kind || 'exam' }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});
router.get('/events', requireAuth, async (req, res) => {
  const { data } = await supabase.from('fixed_events').select('*')
    .eq('user_id', req.user.id).order('event_date');
  res.json(data || []);
});

module.exports = router;
