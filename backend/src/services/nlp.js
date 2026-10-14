// services/nlp.js — turns spoken/typed English into calendar items.
//
// Example: "Tomorrow I have a meeting at 8:00, a class from 9:00 to 10:15,
//           and an assignment to submit"
//   → detects date (tomorrow), splits into 3 clauses, extracts times,
//     classifies each (meeting/class/assignment), and returns structured items
//     the route then saves as reminders.
//
// Rule-based and honest: it handles common patterns and always reports what
// it understood, so the app can show "I created these 3 — correct?" for him
// to confirm. Not a full AI — deterministic and debuggable.
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const { DEFAULT_TIMEZONE, dateInZone, localDateTimeUtc } = require('./timezone');

// All dates are interpreted in the USER's timezone (his is Asia/Calcutta).
// JS Date works in the server's zone, so we do day arithmetic on zoned parts.
function zonedToday(timezone) { const [year,month,day]=dateInZone(new Date(),timezone).split('-').map(Number); return new Date(Date.UTC(year,month-1,day,12)); }
function zonedWeekday(timezone) {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long' })
    .format(new Date()).toLowerCase();
}
const isoDay = (d) => d.toISOString().slice(0,10);

function detectDate(text, timezone=DEFAULT_TIMEZONE) {
  const today = zonedToday(timezone);
  if (/day after tomorrow/.test(text)) { const d = new Date(today); d.setDate(d.getDate() + 2); return isoDay(d); }
  if (/tomorrow/.test(text)) { const d = new Date(today); d.setDate(d.getDate() + 1); return isoDay(d); }
  if (/today|tonight/.test(text)) return isoDay(today);
  const wd = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w}\\b`).test(text));
  if (wd >= 0) {
    const cur = WEEKDAYS.indexOf(zonedWeekday(timezone));
    let diff = (wd - cur + 7) % 7;
    if (/next week/.test(text)) diff += 7;
    if (diff === 0) diff = 7;
    const d = new Date(today); d.setDate(d.getDate() + diff);
    return isoDay(d);
  }
  // Only interpret a bare number as a day when it is not part of a spoken time.
  // Previously "meeting at 8" was incorrectly scheduled on the 8th of the month.
  const dateText = text.replace(/\b(?:at|from|to)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?/g, ' ');
  const md = dateText.match(/\b(\d{1,2})(st|nd|rd|th)?\s*(?:of\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december)\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(st|nd|rd|th)?\b|\b(?:on\s+)?the\s+(\d{1,2})(st|nd|rd|th)\b/i);
  if (md) {
    const d = new Date(today);
    d.setDate(Number(md[1] || md[3] || md[5]));
    if (isoDay(d) < isoDay(today)) d.setMonth(d.getMonth() + 1);
    return isoDay(d);
  }
  return isoDay(today); // default: today
}

function toMinutes(h, m, ap) {
  h = Number(h); m = Number(m || 0);
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h * 60 + m;
}

function parseTime(clause) {
  // "from 9:00 to 10:15" or "9:00-10:15" or "9 to 10:15"
  let m = clause.match(/from\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*to\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (m) {
    let [, h1, m1, ap1, h2, m2, ap2] = m;
    ap2 = ap2 || ap1; // "9 to 10:15 pm" → both pm
    return { start: toMinutes(h1, m1, ap2), end: toMinutes(h2, m2, ap2) };
  }
  // "at 8:00" / "at 8pm" / "at 8"
  m = clause.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (m) return { start: toMinutes(m[1], m[2], m[3]), end: null };
  return { start: null, end: null };
}

function classify(clause) {
  if (/assignment|submit|homework|project|deadline/.test(clause)) return 'assignment';
  if (/meeting/.test(clause)) return 'meeting';
  if (/class|lecture|lab|tutorial/.test(clause)) return 'class';
  if (/exam|test|quiz/.test(clause)) return 'exam';
  return 'task';
}

function splitClauses(text) {
  return text
    .replace(/^(tomorrow|today|tonight|day after tomorrow)\b,?\s*/i, '')
    .replace(/^i have\s+/i, '')
    .split(/,\s*(?:and\s+)?|\s+and\s+/)
    .map((s) => s.trim().replace(/^a |^an /, ''))
    .filter((s) => s.length > 1);
}

// Main entry: text → {date, items:[{title, kind, start, end}]}.
function parseToItems(text, timezone=DEFAULT_TIMEZONE) {
  const lower = text.toLowerCase();
  const date = detectDate(lower,timezone); // already an ISO day string
  const items = splitClauses(lower).map((clause) => {
    const { start, end } = parseTime(clause);
    const kind = classify(clause);
    const title = clause.replace(/at\s+\d{1,2}(?::\d{2})?\s*(am|pm)?/, '')
      .replace(/from\s+\d{1,2}(?::\d{2})?\s*(am|pm)?\s*to\s+\d{1,2}(?::\d{2})?\s*(am|pm)?/, '')
      .replace(/\b(today|tomorrow|tonight|day after tomorrow)\b/, '')
      .replace(/\b(?:on\s+)?the\s+\d{1,2}(?:st|nd|rd|th)\b/, '')
      .replace(/\s+/g, ' ').trim() || clause;
    return { title, kind, start, end };
  });
  return { date, items };
}

function stamp(dateISO, minutes, fallbackHour = 18, timezone=DEFAULT_TIMEZONE) {
  const mins = minutes == null ? fallbackHour * 60 : minutes;
  return localDateTimeUtc(dateISO,Math.floor(mins/60),mins%60,timezone);
}

module.exports = { parseToItems, stamp };
