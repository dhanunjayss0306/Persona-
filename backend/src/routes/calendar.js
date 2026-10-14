// Calendar feed combines reminders, study blocks, and calendar-only activities.
// GET /api/calendar?from=2026-10-01&to=2026-10-31
const express = require('express');
const supabase = require('../db');
const { requireAuth } = require('../auth');
const { DEFAULT_TIMEZONE, dateInZone, localDayStartUtc } = require('../services/timezone');

const router = express.Router();
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch((error) => {
  console.error('[calendar] request failed:', error.message);
  if (!res.headersSent) res.status(502).json({ error: 'Calendar database request failed. Check the backend connection and logs.' });
});
const calendarStorageMissing = (error) => ['PGRST205', '42P01'].includes(error?.code) ||
  /could not find the table ['"]public\.calendar_events['"]|relation ['"]public\.calendar_events['"] does not exist/i.test(error?.message || '');
const migrationMessage = 'Run backend/db/migrations/004_calendar_events.sql in Supabase SQL Editor to enable calendar activities.';

router.get('/', requireAuth, asyncRoute(async (req, res) => {
  const { data: profile } = await supabase.from('users').select('timezone').eq('id', req.user.id).maybeSingle();
  const timezone = profile?.timezone || DEFAULT_TIMEZONE;
  const from = req.query.from || dateInZone(new Date(), timezone);
  const to = req.query.to || dateInZone(new Date(Date.now() + 30 * 864e5), timezone);
  const uid = req.user.id;

  const { data: reminders, error: reminderError } = await supabase.from('reminders')
    .select('id,title,details,type,status,due_at').eq('user_id', uid)
    .gte('due_at', localDayStartUtc(from, timezone)).lt('due_at', localDayStartUtc(dateInZone(new Date(new Date(`${to}T12:00:00Z`).getTime()+864e5), timezone), timezone)).order('due_at');
  if (reminderError) throw reminderError;

  const { data: plans, error: planError } = await supabase.from('plans').select('id').eq('user_id', uid);
  if (planError) throw planError;
  const planIds = (plans || []).map((p) => p.id);
  let plan_days = [];
  if (planIds.length) {
    const { data, error } = await supabase.from('plan_days').select('id,plan_id,day,blocks,done')
      .in('plan_id', planIds).gte('day', from).lte('day', to).order('day');
    if (error) throw error;
    plan_days = data || [];
  }

  const { data: fixedEvents, error: fixedError } = await supabase.from('fixed_events').select('*')
    .eq('user_id', uid).gte('event_date', from).lte('event_date', to).order('event_date');
  if (fixedError) throw fixedError;
  const { data: calendarEventsData, error: calendarError } = await supabase.from('calendar_events').select('*')
    .eq('user_id', uid).gte('event_date', from).lte('event_date', to).order('event_date');
  if (calendarError && !calendarStorageMissing(calendarError)) throw calendarError;

  // Merge into per-day buckets the calendar UI can render directly.
  const days = {};
  const put = (date, kind, item) => {
    const key = date.slice(0, 10);
    (days[key] = days[key] || { date: key, reminders: [], plan_blocks: [], events: [] })[kind].push(item);
  };
  (reminders || []).forEach((r) => put(dateInZone(new Date(r.due_at), timezone), 'reminders', r));
  plan_days.forEach((d) => (d.blocks || []).forEach((b) => put(d.day, 'plan_blocks', { ...b, done: d.done, plan_id: d.plan_id, day: d.day })));
  (fixedEvents || []).forEach((e) => put(e.event_date, 'events', { ...e, source: 'fixed' }));
  (calendarEventsData || []).forEach((e) => put(e.event_date, 'events', { ...e, kind: 'activity', source: 'calendar' }));

  res.json({ from, to, days });
}));

router.post('/events', requireAuth, asyncRoute(async (req, res) => {
  const { title, details = '', event_date, start_time } = req.body || {};
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 160) {
    return res.status(400).json({ error: 'Add a title up to 160 characters.' });
  }
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(event_date || '') &&
    !Number.isNaN(Date.parse(`${event_date}T00:00:00Z`)) && new Date(`${event_date}T00:00:00Z`).toISOString().slice(0, 10) === event_date;
  if (!validDate) {
    return res.status(400).json({ error: 'Choose a valid date.' });
  }
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start_time || '')) {
    return res.status(400).json({ error: 'Choose a valid start time.' });
  }
  if (typeof details !== 'string' || details.length > 500) {
    return res.status(400).json({ error: 'Notes must be 500 characters or fewer.' });
  }
  const { data, error } = await supabase.from('calendar_events').insert({
    user_id: req.user.id, title: title.trim(), details: details.trim(), event_date, start_time,
  }).select().single();
  if (error && calendarStorageMissing(error)) return res.status(503).json({ error: migrationMessage });
  if (error) throw error;
  res.status(201).json(data);
}));

router.patch('/events/:id', requireAuth, asyncRoute(async (req, res) => {
  const { title, details = '', event_date, start_time } = req.body || {};
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 160) {
    return res.status(400).json({ error: 'Add a title up to 160 characters.' });
  }
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(event_date || '') &&
    !Number.isNaN(Date.parse(`${event_date}T00:00:00Z`)) && new Date(`${event_date}T00:00:00Z`).toISOString().slice(0, 10) === event_date;
  if (!validDate) return res.status(400).json({ error: 'Choose a valid date.' });
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start_time || '')) return res.status(400).json({ error: 'Choose a valid start time.' });
  if (typeof details !== 'string' || details.length > 500) return res.status(400).json({ error: 'Notes must be 500 characters or fewer.' });
  const { data, error } = await supabase.from('calendar_events').update({
    title: title.trim(), details: details.trim(), event_date, start_time,
  }).eq('id', req.params.id).eq('user_id', req.user.id).select().maybeSingle();
  if (error && calendarStorageMissing(error)) return res.status(503).json({ error: migrationMessage });
  if (error) throw error;
  if (!data) return res.status(404).json({ error: 'Calendar activity not found.' });
  res.json(data);
}));

router.delete('/events/:id', requireAuth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase.from('calendar_events').delete()
    .eq('id', req.params.id).eq('user_id', req.user.id).select('id').maybeSingle();
  if (error && calendarStorageMissing(error)) return res.status(503).json({ error: migrationMessage });
  if (error) throw error;
  if (!data) return res.status(404).json({ error: 'Calendar activity not found.' });
  res.json({ ok: true });
}));

module.exports = router;
