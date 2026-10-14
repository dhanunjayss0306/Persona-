// services/push.js — sending notifications to phones via Firebase (FCM).
//
// The phone registers its FCM token with POST /api/auth/devices.
// When the scheduler decides "nag now", it calls sendToUser() here,
// Firebase delivers to the phone, the service worker shows the notification.
// If Firebase isn't configured yet, pushes are skipped with a warning
// (everything else keeps working).
const admin = require('firebase-admin');
const fs = require('fs');
const nodePath = require('path');
const supabase = require('../db');

let ready = false;
(function init() {
  try {
    const raw = process.env.FCM_SERVICE_ACCOUNT_PATH;
    const path = raw ? nodePath.resolve(raw) : null;
    if (path && fs.existsSync(path)) {
      admin.initializeApp({ credential: admin.credential.cert(require(path)) });
      ready = true;
      console.log('[push] FCM ready');
    } else {
      console.warn('[push] FCM not configured — set FCM_SERVICE_ACCOUNT_PATH in .env');
    }
  } catch (e) {
    console.warn('[push] FCM init failed:', e.message);
  }
})();

async function sendToUser(userId, title, body, data = {}) {
  if (!ready) {
    console.log(`[push:skipped] ${title} — ${body}`);
    return false;
  }
  try {
    const { data: devices, error } = await supabase.from('devices').select('fcm_token').eq('user_id', userId);
    if (error) throw error;
    const tokens = (devices || []).map((d) => d.fcm_token);
    if (!tokens.length) {
      console.log(`[push] no devices registered for user ${userId}; reminder will retry`);
      return false;
    }
    const msg = {
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      webpush: { headers: { Urgency: 'high' }, notification: { title, body, requireInteraction: true, vibrate: [250, 120, 250], tag: data.reminder_id || 'persona-reminder', renotify: true, actions: data.reminder_id ? [{ action: 'done', title: 'Done' }, { action: 'snooze', title: 'Snooze 10m' }] : [] } },
      android: { priority: 'high', notification: { sound: 'default', channelId: 'persona-reminders' } },
      tokens,
    };
    const res = await admin.messaging().sendEachForMulticast(msg);
    console.log(`[push] sent to ${res.successCount}/${tokens.length} devices`);
    return res.successCount > 0;
  } catch (error) {
    console.error('[push] delivery failed:', error.message);
    return false;
  }
}

module.exports = { sendToUser, isReady: () => ready };
