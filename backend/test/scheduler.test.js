const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { createMockSupabase } = require('./helpers/apiHarness');

function loadScheduler(db, sendToUser) {
  const schedulerPath = path.resolve(__dirname, '../src/services/scheduler.js');
  delete require.cache[schedulerPath];
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent?.filename === schedulerPath && request === '../db') return db;
    if (parent?.filename === schedulerPath && request === './push') return { sendToUser };
    return originalLoad.apply(this, arguments);
  };
  try {
    return require(schedulerPath);
  } finally {
    Module._load = originalLoad;
  }
}

test('scheduler sends due one-time reminders and marks successful delivery', async () => {
  const dueAt = new Date(Date.now() - 60_000).toISOString();
  const db = createMockSupabase({
    reminders: [{
      id: 'meeting-reminder-1',
      user_id: 'user-1',
      title: 'Meeting with Alex',
      details: 'Google Meet: https://meet.google.com/abc-defg-hij',
      type: 'once',
      status: 'pending',
      due_at: dueAt,
    }],
  });
  const sent = [];
  const scheduler = loadScheduler(db, async (...args) => {
    sent.push(args);
    return true;
  });

  await scheduler.nagTick();

  assert.equal(sent.length, 1);
  assert.equal(sent[0][1], '🔔 Meeting with Alex');
  assert.match(sent[0][2], /https:\/\/meet\.google\.com\/abc-defg-hij/);
  assert.equal(db.tables.reminders[0].status, 'notified');
});
