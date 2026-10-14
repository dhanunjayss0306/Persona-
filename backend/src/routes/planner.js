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
const { buildDays } = require('../services/planBuilder');
const { DEFAULT_TIMEZONE, dateInZone, localDateTimeUtc } = require('../services/timezone');
const { spreadMinutes } = require('../services/behavior');

const router = express.Router();

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

// AI month planning is a preview-only operation until the user confirms.
router.post('/preview', requireAuth, async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt || prompt.length > 5000) return res.status(400).json({ error: 'Describe your schedule in 1 to 5,000 characters.' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'AI planning is not configured. Add OPENAI_API_KEY to the backend environment, or use the existing study planner.' });
  const { data: profile } = await supabase.from('users').select('timezone').eq('id', req.user.id).maybeSingle();
  const today = dateInZone(new Date(), profile?.timezone || DEFAULT_TIMEZONE), uid = req.user.id;
  const [calendar, reminders, exams] = await Promise.all([
    supabase.from('calendar_events').select('title,event_date,start_time').eq('user_id', uid).gte('event_date', today).limit(100),
    supabase.from('reminders').select('title,due_at,status').eq('user_id', uid).neq('status', 'done').gte('due_at', `${today}T00:00:00`).limit(100),
    supabase.from('fixed_events').select('title,event_date,kind').eq('user_id', uid).gte('event_date', today).limit(100),
  ]);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature: 0.2, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: `Plan a realistic schedule. Today is ${today}. Respect existing commitments. Return JSON only: {"items":[{"title":"...","type":"study|assignment|project|exam|event","start_date":"YYYY-MM-DD","end_date":null,"due_date":null,"duration_minutes":60,"priority":"high|medium|low","notes":"..."}]}. Do not invent fixed commitments or dates in the past. Limit 80 items.` },
        { role: 'user', content: JSON.stringify({ request: prompt, existing: { calendar: calendar.data || [], reminders: reminders.data || [], exams: exams.data || [] } }) },
      ] }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || `Provider returned ${response.status}`);
    const result = JSON.parse(payload.choices?.[0]?.message?.content || '{}');
    const allowed = new Set(['study','assignment','project','exam','event']);
    const items = (Array.isArray(result.items) ? result.items : []).slice(0, 80).filter((x) => x && typeof x.title === 'string' && x.title.trim() && allowed.has(x.type) && /^\d{4}-\d{2}-\d{2}$/.test(x.start_date) && Number(x.duration_minutes) > 0 && Number(x.duration_minutes) <= 1440 && ['high','medium','low'].includes(x.priority));
    return res.json({ items, today });
  } catch (error) {
    console.error('[planner] preview failed:', error.message);
    return res.status(502).json({ error: 'I could not create a plan preview. Nothing was saved; try again or use the standard study planner.' });
  }
});

// Save only a user-reviewed AI plan. Existing records are never changed by preview.
router.post('/confirm', requireAuth, async (req, res) => {
  const items = req.body?.items, allowed = new Set(['study','assignment','project','exam','event']);
  const validDate = (value) => { try { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value; } catch { return false; } };
  if (!Array.isArray(items) || !items.length || items.length > 80 || items.some((x) => !x || typeof x.title !== 'string' || !x.title.trim() || x.title.length > 160 || !allowed.has(x.type) || !validDate(x.start_date) || (x.due_date && (!validDate(x.due_date)||x.due_date<x.start_date)) || (x.end_date && !validDate(x.end_date)) || ((x.end_date||x.due_date) && (x.end_date||x.due_date) < x.start_date) || Number(x.duration_minutes) <= 0 || Number(x.duration_minutes) > 1440 || (x.notes && (typeof x.notes !== 'string' || x.notes.length > 500)))) return res.status(400).json({ error: 'Confirm a valid list of 1 to 80 reviewed items.' });
  const uid = req.user.id, start = items.map((x) => x.start_date).sort()[0], end = items.map((x) => x.end_date || x.due_date || x.start_date).sort().at(-1);
  const { data: profile } = await supabase.from('users').select('timezone').eq('id', uid).maybeSingle();
  const timezone=profile?.timezone||DEFAULT_TIMEZONE;
  const byDay = new Map(), calendarRows = [], fixedEvents = [], reminderRows = [];
  for (const item of items) {
    const date = item.due_date || item.end_date || item.start_date;
    const endDate = item.end_date || item.due_date || item.start_date;
    if (['exam','event'].includes(item.type)) {
      fixedEvents.push({ title:item.title, event_date:date, kind:item.type });
    }
    const spread = ['study','project'].includes(item.type), distribution = spread ? spreadMinutes(item.start_date, endDate, Number(item.duration_minutes)) : [{day:date,minutes:Number(item.duration_minutes)}], dates=distribution.map(x=>x.day);
    if (spread) {
      distribution.forEach(({day,minutes}) => { const blocks=byDay.get(day)||[]; blocks.push({ title:item.title, minutes, kind:item.type, priority:item.priority }); byDay.set(day,blocks); });
    }
    if (!['exam','event'].includes(item.type)) dates.forEach((day) => calendarRows.push({ title:item.title, details:item.notes||'', event_date:day, start_time:item.type==='study'?'17:00:00':'09:00:00' }));
    if (['assignment','exam'].includes(item.type) || /hackathon/i.test(item.title)) {
      reminderRows.push({ title:item.title, item_type:item.type, details:`You have an assignment due today: ${item.title}`, type:'nag', due_at:localDateTimeUtc(date,9,0,timezone) });
    }
  }
  const dayRows = [...byDay].map(([day, blocks]) => ({ day, blocks }));
  const { data: planId, error } = await supabase.rpc('confirm_persona_plan', { p_user:uid, p_plan:{title:'Persona month plan',start_date:start,end_date:end,hours_per_day:Math.max(1,...items.map(x=>Number(x.duration_minutes)/60)),fixed_events:fixedEvents}, p_days:dayRows, p_events:calendarRows, p_reminders:reminderRows });
  if (error) return res.status(500).json({ error: 'Could not save the plan. No plan data was committed; check that migration 005 is installed.' });
  return res.status(201).json({ ok:true, plan_id:planId, saved:items.length });
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
