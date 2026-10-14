const DEFAULT_TIMEZONE = 'Asia/Kolkata';
function dateInZone(date = new Date(), timezone = DEFAULT_TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function validTimezone(value) { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }
function localDayStartUtc(day, timezone = DEFAULT_TIMEZONE) {
  // Find UTC instant corresponding to local midnight; iterate across DST offsets.
  const target = Date.parse(`${day}T00:00:00Z`); let guess = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23' }).formatToParts(new Date(guess));
    const v = Object.fromEntries(parts.map(p => [p.type,p.value]));
    const shown = Date.UTC(+v.year,+v.month-1,+v.day,+v.hour,+v.minute,+v.second);
    guess += target - shown;
  }
  return new Date(guess).toISOString();
}
function localDateTimeUtc(day, hour, minute=0, timezone=DEFAULT_TIMEZONE) {
  const [year,month,date]=day.split('-').map(Number), desired=Date.UTC(year,month-1,date,Number(hour),Number(minute)); let guess=desired;
  for(let i=0;i<3;i++){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));const shown=Date.UTC(+v.year,+v.month-1,+v.day,+v.hour,+v.minute,+v.second);guess+=desired-shown;}
  return new Date(guess).toISOString();
}
module.exports = { DEFAULT_TIMEZONE, dateInZone, validTimezone, localDayStartUtc, localDateTimeUtc };
