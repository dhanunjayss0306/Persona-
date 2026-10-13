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
  const { data: devices } = await supabase.from('devices').select('fcm_token').eq('user_id', userId);
  const tokens = (devices || []).map((d) => d.fcm_token);
  if (!tokens.length) {
    console.log(`[push] no devices registered for user ${userId}`);
    return false;
  }
  const msg = {
    notification: { title, body },
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    tokens,
  };
  const res = await admin.messaging().sendEachForMulticast(msg);
  console.log(`[push] sent to ${res.successCount}/${tokens.length} devices`);
  return res.successCount > 0;
}

module.exports = { sendToUser, isReady: () => ready };
