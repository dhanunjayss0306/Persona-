// services/scheduler.js — the alarm clock of Persona.
//
// Two jobs:
//   1. EVERY MINUTE — the nag loop:
//        - 'nag' reminders: due, not done, and (never nagged OR last nag >= 5 min ago)
//          → push "still pending…" and stamp last_nagged_at.
//          The loop ONLY stops when a proof row exists (status='done').
//        - 'once' reminders: due and never fired → push once, status='notified'.
//   2. DAILY (8 AM) — price checks: for each tracked cart item, fetch the
//      price, save history, and if it hit the target → create a one-time
//      reminder (which itself pushes once through job 1).
const cron = require('node-cron');
const supabase = require('../db');
const { sendToUser } = require('./push');
const { fetchPrice } = require('./price');

const NAG_INTERVAL_MIN = 5;

async function nagTick() {
  const now = new Date().toISOString();
  const fiveMinAgo = new Date(Date.now() - NAG_INTERVAL_MIN * 60000).toISOString();

  // Work nags: due + not done + (never nagged OR 5 min since last nag).
  const { data: nags } = await supabase.from('reminders').select('id,user_id,title')
    .eq('type', 'nag').eq('status', 'ringing').lte('due_at', now)
    .or(`last_nagged_at.is.null,last_nagged_at.lte.${fiveMinAgo}`);
  // Freshly due nags move pending -> ringing.
  const { data: fresh } = await supabase.from('reminders').select('id,user_id,title')
    .eq('type', 'nag').eq('status', 'pending').lte('due_at', now);
  for (const r of fresh || []) {
    await supabase.from('reminders').update({ status: 'ringing' }).eq('id', r.id);
  }
  for (const r of [...(fresh || []), ...(nags || [])]) {
    await sendToUser(r.user_id, '⏰ ' + r.title, 'Still pending — tap "I have done that" and add proof to stop this.', { reminder_id: r.id });
    await supabase.from('reminders').update({ last_nagged_at: new Date().toISOString() }).eq('id', r.id);
  }

  // One-time reminders: fire once.
  const { data: once } = await supabase.from('reminders').select('id,user_id,title,details')
    .eq('type', 'once').eq('status', 'pending').lte('due_at', now);
  for (const r of once || []) {
    await sendToUser(r.user_id, '🔔 ' + r.title, r.details || 'Reminder', { reminder_id: r.id });
    await supabase.from('reminders').update({ status: 'notified' }).eq('id', r.id);
  }
}

async function priceTick() {
  const { data: items } = await supabase.from('cart_items').select('*');
  for (const item of items || []) {
    const price = await fetchPrice(item.url);
    if (price == null) continue;
    await supabase.from('price_history').insert({ cart_item_id: item.id, price });
    const hit = item.target_price && price <= Number(item.target_price);
    await supabase.from('cart_items').update({
      last_price: price, last_checked_at: new Date().toISOString(),
      alert_sent: hit ? true : item.alert_sent,
    }).eq('id', item.id);
    if (hit && !item.alert_sent) {
      await supabase.from('reminders').insert({
        user_id: item.user_id, type: 'once', proof_required: false,
        title: `Price drop: ${item.name} is now ₹${price}`, details: item.url,
        due_at: new Date().toISOString(), status: 'pending',
      });
    }
  }
  console.log('[scheduler] price check done');
}

function start() {
  cron.schedule('* * * * *', () => nagTick().catch((e) => console.error('[nag]', e.message)));
  cron.schedule('0 8 * * *', () => priceTick().catch((e) => console.error('[price]', e.message)));
  console.log('[scheduler] nag loop: every minute · price check: daily 8 AM');
}

module.exports = { start, nagTick, priceTick };
