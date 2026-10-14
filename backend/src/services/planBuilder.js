function buildDays({ start, end, hoursPerDay, topics, leisure, events = [] }) {
  const eventDays = new Set(events.map((event) => event.event_date));
  const days = [];
  const cur = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cur <= last) {
    const iso = cur.toISOString().slice(0, 10), minutes = Math.round(Number(hoursPerDay) * 60), blocks = [];
    if (eventDays.has(iso)) {
      const event = events.find((item) => item.event_date === iso);
      blocks.push({ title: `Revision for ${event.title}`, minutes: Math.min(120, minutes), kind: 'revision' });
      if (minutes > 120) blocks.push({ title: leisure || 'Free time', minutes: minutes - 120, kind: 'leisure' });
    } else {
      const perTopic = topics.length ? Math.floor(minutes * 0.7 / topics.length) : 0;
      topics.forEach((title) => blocks.push({ title, minutes: perTopic, kind: 'study' }));
      const used = perTopic * topics.length;
      if (minutes - used > 0) blocks.push({ title: leisure || 'Free time', minutes: minutes - used, kind: 'leisure' });
    }
    days.push({ day: iso, blocks });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}
module.exports = { buildDays };
