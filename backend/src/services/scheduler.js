// services/scheduler.js — the alarm clock of Persona.
//
// One job:
//   EVERY MINUTE — the sticky reminder loop:
//        - 'nag' reminders: due, not done, and (never nagged OR last nag >= 5 min ago)
//          → push "still pending…" and stamp last_nagged_at.
//          Marking status='done' stops the loop; proof is optional.
//        - 'once' reminders: due and never fired → push once, status='notified'.
const cron = require('node-cron');
const supabase = require('../db');
const { sendToUser } = require('./push');
const { stickyNag } = require('./behavior');

const NAG_INTERVAL_MIN = 5;

async function selectNags(status) {
  const now = new Date().toISOString();
  const fiveMinAgo = new Date(Date.now() - NAG_INTERVAL_MIN * 60000).toISOString();
  let q = supabase.from('reminders').select('id,user_id,title,item_type')
    .eq('type', 'nag').eq('status', status).lte('due_at', now);
  if (status === 'ringing') q = q.or(`last_nagged_at.is.null,last_nagged_at.lte.${fiveMinAgo}`);
  const first = await q;
  if (!first.error) return first.data;
  if (!/item_type/i.test(first.error.message)) throw new Error(first.error.message);
  // Database predates migration 005 — same query without the new column.
  let legacy = supabase.from('reminders').select('id,user_id,title')
    .eq('type', 'nag').eq('status', status).lte('due_at', now);
  if (status === 'ringing') legacy = legacy.or(`last_nagged_at.is.null,last_nagged_at.lte.${fiveMinAgo}`);
  const second = await legacy;
  if (second.error) throw new Error(second.error.message);
  return (second.data || []).map((r) => ({ ...r, item_type: 'task' }));
}

async function nagTick() {
  const now = new Date().toISOString();
  // Work nags: due + not done + (never nagged OR 5 min since last nag).
  const nags = await selectNags('ringing');
  // Freshly due nags move pending -> ringing.
  const fresh = await selectNags('pending');
  for (const r of fresh || []) {
    await supabase.from('reminders').update({ status: 'ringing' }).eq('id', r.id);
  }
  for (const r of [...(fresh || []), ...(nags || [])]) {
    const nudge = stickyNag(r.title, Math.floor(Date.now() / (NAG_INTERVAL_MIN * 60000)), r.item_type);
    const delivered = await sendToUser(r.user_id, '⏰ ' + r.title, nudge, { reminder_id: r.id });
    if (delivered) await supabase.from('reminders').update({ last_nagged_at: new Date().toISOString() }).eq('id', r.id);
  }

  // One-time reminders: fire once.
  const { data: once } = await supabase.from('reminders').select('id,user_id,title,details')
    .eq('type', 'once').eq('status', 'pending').lte('due_at', now);
  for (const r of once || []) {
    const delivered = await sendToUser(r.user_id, '🔔 ' + r.title, r.details || 'Reminder', { reminder_id: r.id });
    // Keep it pending when no device accepted the message so registering a
    // device later can still deliver the reminder instead of losing it.
    if (delivered) await supabase.from('reminders').update({ status: 'notified' }).eq('id', r.id);
  }
}

function start() {
  cron.schedule('* * * * *', () => nagTick().catch((e) => console.error('[nag]', e.message)));
  console.log('[scheduler] sticky reminder loop: every minute');
}

module.exports = { start, nagTick };
