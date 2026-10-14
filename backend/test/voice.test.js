const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createMockSupabase, startApi, request } = require('./helpers/apiHarness');
const { dateInZone, localDateTimeUtc } = require('../src/services/timezone');

function encryptedTokens(key, tokens) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens)), cipher.final(), cipher.getAuthTag()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

test('Google login rejects a malformed OAuth client ID with setup guidance', async (t) => {
  const env = {
    JWT_SECRET: process.env.JWT_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  };
  process.env.JWT_SECRET = 'test-jwt-secret-for-voice-route';
  process.env.GOOGLE_CLIENT_ID = 'broken client.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3001/api/voice/google/callback';
  t.after(() => {
    for (const [name, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  const api = await startApi('voice.js', createMockSupabase());
  t.after(api.close);
  const result = await request(api.base, '/google/login-url', 'POST', {});

  assert.equal(result.status, 503);
  assert.match(result.data.error, /client ID is malformed/i);
});

test('Meet command parser extracts title, requested time, and reminder offset', async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-jwt-secret-for-voice-route';
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });

  const db = createMockSupabase({ users: [{ id: 'user-1', timezone: 'Asia/Kolkata' }] });
  const api = await startApi('voice.js', db);
  t.after(api.close);
  const today = dateInZone(new Date(), 'Asia/Kolkata');
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const date = tomorrow.toISOString().slice(0, 10);

  const result = await request(api.base, '/command/parse', 'POST', {
    text: 'Create a Google Meet link with Alex tomorrow at 5 pm for 45 minutes and remind me 10 minutes before',
  });

  assert.equal(result.status, 200);
  assert.equal(result.data.command.intent, 'meet');
  assert.equal(result.data.command.title, 'Meeting with Alex');
  assert.equal(result.data.command.event_date, date);
  assert.equal(result.data.command.start_time, '17:00');
  assert.equal(result.data.command.minutes, 45);
  assert.equal(result.data.command.reminder_minutes, 10);

  const immediate = await request(api.base, '/command/parse', 'POST', {
    text: 'Create a Google Meet link and keep it as a reminder in calendar',
  });
  assert.equal(immediate.status, 200);
  assert.equal(immediate.data.command.title, 'Persona meeting');
  assert.equal(immediate.data.command.event_date, undefined);
  assert.equal(immediate.data.command.start_time, undefined);
  assert.equal(immediate.data.command.reminder_minutes, 0);
});

test('Creating a Meet saves a Google event, Persona calendar event, and reminder', async (t) => {
  const previousJwt = process.env.JWT_SECRET;
  const previousEncryptionKey = process.env.OAUTH_ENCRYPTION_KEY;
  const previousFetch = global.fetch;
  const key = crypto.randomBytes(32);
  process.env.JWT_SECRET = 'test-jwt-secret-for-voice-route';
  process.env.OAUTH_ENCRYPTION_KEY = key.toString('hex');
  t.after(() => {
    if (previousJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwt;
    if (previousEncryptionKey === undefined) delete process.env.OAUTH_ENCRYPTION_KEY;
    else process.env.OAUTH_ENCRYPTION_KEY = previousEncryptionKey;
    global.fetch = previousFetch;
  });

  const token = { access_token: 'test-access-token', expires_at: Date.now() + 60_000 };
  const db = createMockSupabase({
    users: [{ id: 'user-1', timezone: 'Asia/Kolkata' }],
    oauth_tokens: [{
      user_id: 'user-1',
      provider: 'google',
      encrypted_tokens: encryptedTokens(key, token),
    }],
  });
  const api = await startApi('voice.js', db);
  t.after(api.close);
  let googleEvent;
  global.fetch = async (url, options) => {
    if (!String(url).startsWith('https://www.googleapis.com/calendar/')) return previousFetch(url, options);
    googleEvent = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        hangoutLink: 'https://meet.google.com/abc-defg-hij',
        htmlLink: 'https://calendar.google.com/calendar/event?eid=test',
      }),
    };
  };

  const today = dateInZone(new Date(), 'Asia/Kolkata');
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const eventDate = tomorrow.toISOString().slice(0, 10);
  const start = new Date(localDateTimeUtc(eventDate, 17, 0, 'Asia/Kolkata'));
  const result = await request(api.base, '/meet', 'POST', {
    title: 'Meeting with Alex',
    event_date: eventDate,
    start_time: '17:00',
    minutes: 45,
    reminder_minutes: 10,
  });

  assert.equal(result.status, 200);
  assert.equal(googleEvent.summary, 'Meeting with Alex');
  assert.equal(googleEvent.start.dateTime, start.toISOString());
  assert.deepEqual(googleEvent.reminders.overrides, [{ method: 'popup', minutes: 10 }]);
  assert.equal(db.tables.calendar_events.length, 1);
  assert.equal(db.tables.calendar_events[0].event_date, eventDate);
  assert.match(db.tables.calendar_events[0].details, /https:\/\/meet\.google\.com\/abc-defg-hij/);
  assert.equal(db.tables.reminders.length, 1);
  assert.equal(db.tables.reminders[0].due_at, new Date(start.getTime() - 10 * 60_000).toISOString());
  assert.equal(db.tables.reminders[0].type, 'once');
  assert.equal(result.data.meet_link, 'https://meet.google.com/abc-defg-hij');
  assert.ok(result.data.calendar_event_id);
  assert.ok(result.data.reminder_id);
});
