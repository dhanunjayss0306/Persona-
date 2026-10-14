const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDays } = require('../src/services/planBuilder');

test('planner includes every date in the requested range and balances study with breaks', () => {
  const days = buildDays({ start:'2026-10-20', end:'2026-10-22', hoursPerDay:4, topics:['Java','AI agents'], leisure:'Walk', events:[] });
  assert.deepEqual(days.map((day) => day.day), ['2026-10-20','2026-10-21','2026-10-22']);
  assert.deepEqual(days[0].blocks.map((block) => block.kind), ['study','study','leisure']);
  assert.equal(days[0].blocks.reduce((sum, block) => sum + block.minutes, 0), 240);
});

test('fixed exam dates get revision instead of new topics', () => {
  const days = buildDays({ start:'2026-10-20', end:'2026-10-21', hoursPerDay:3, topics:['Java'], events:[{event_date:'2026-10-21',title:'Math exam'}] });
  assert.deepEqual(days[1].blocks, [{ title:'Revision for Math exam', minutes:120, kind:'revision' }, { title:'Free time', minutes:60, kind:'leisure' }]);
  assert.equal(days[0].blocks[0].kind,'study');
});
