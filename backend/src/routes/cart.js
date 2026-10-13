// routes/cart.js — shopping cart + price tracker.
//
// Flow: add product with its link + optional target price.
// The scheduler re-checks prices daily (services/price.js). "Check now"
// hits the shop page immediately. A drop to/below target fires a reminder.
const express = require('express');
const supabase = require('../db');
const { requireAuth } = require('../auth');
const { fetchPrice } = require('../services/price');

const router = express.Router();

function shopOf(url) {
  const u = (url || '').toLowerCase();
  if (u.includes('amazon')) return 'amazon';
  if (u.includes('flipkart')) return 'flipkart';
  if (u.includes('croma')) return 'croma';
  if (u.includes('myntra')) return 'myntra';
  if (u.includes('ajio')) return 'ajio';
  return 'other';
}

// POST /api/cart {name, url, target_price?}
router.post('/', requireAuth, async (req, res) => {
  const { name, url, target_price } = req.body || {};
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });
  const { data, error } = await supabase.from('cart_items').insert({
    user_id: req.user.id, name, url, shop: shopOf(url),
    target_price: target_price ? Number(target_price) : null,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// GET /api/cart — items with latest price.
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('cart_items').select('*')
    .eq('user_id', req.user.id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /api/cart/:id — update target price or name. {name?, target_price?}
router.patch('/:id', requireAuth, async (req, res) => {
  const patch = {};
  if (req.body?.name !== undefined) patch.name = req.body.name;
  if (req.body?.target_price !== undefined) {
    patch.target_price = req.body.target_price == null ? null : Number(req.body.target_price);
    patch.alert_sent = false; // re-arm the alert when the target changes
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' });
  const { data, error } = await supabase.from('cart_items').update(patch)
    .eq('id', req.params.id).eq('user_id', req.user.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

// DELETE /api/cart/:id
router.delete('/:id', requireAuth, async (req, res) => {
  await supabase.from('cart_items').delete().eq('id', req.params.id).eq('user_id', req.user.id);
  res.json({ ok: true });
});

// POST /api/cart/:id/check — "check price now".
router.post('/:id/check', requireAuth, async (req, res) => {
  const { data: item } = await supabase.from('cart_items').select('*')
    .eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
  if (!item) return res.status(404).json({ error: 'Not found' });

  const price = await fetchPrice(item.url);
  if (price == null) return res.status(502).json({ error: 'Could not read price (shop may block automated checks)' });

  await supabase.from('price_history').insert({ cart_item_id: item.id, price });
  const hit = item.target_price && price <= Number(item.target_price);
  await supabase.from('cart_items').update({
    last_price: price, last_checked_at: new Date().toISOString(),
    alert_sent: hit ? true : item.alert_sent,
  }).eq('id', item.id);

  // A hit becomes a one-time reminder so it nags through the normal channel.
  if (hit && !item.alert_sent) {
    await supabase.from('reminders').insert({
      user_id: req.user.id, type: 'once', proof_required: false,
      title: `Price drop: ${item.name} is now ₹${price}`,
      details: item.url, due_at: new Date().toISOString(), status: 'pending',
    });
  }
  res.json({ price, target_hit: !!hit });
});

// GET /api/cart/:id/history — price chart data.
router.get('/:id/history', requireAuth, async (req, res) => {
  const { data: item, error: itemError } = await supabase.from('cart_items').select('id')
    .eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
  if (itemError) return res.status(500).json({ error: itemError.message });
  if (!item) return res.status(404).json({ error: 'Not found' });
  const { data } = await supabase.from('price_history').select('price,checked_at')
    .eq('cart_item_id', item.id).order('checked_at');
  res.json(data || []);
});

module.exports = router;
