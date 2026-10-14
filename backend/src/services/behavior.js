const { dateInZone, localDayStartUtc, localDateTimeUtc } = require('./timezone');
function reminderRearm(due_at) { return { due_at, status:'pending', last_nagged_at:null }; }
function stickyNag(title, minuteBucket, itemType='task') { const lines=['Take one small step toward finishing it.','You can mark it done whenever you’re ready.','A little progress now can make the rest of your day easier.']; const headline=itemType==='assignment'?`You have an assignment due today: ${title}`:(minuteBucket%2?`Don't forget: ${title}`:`${title} is due today`); return `${headline}\n${lines[minuteBucket%lines.length]}`; }
function normalizeVoiceHeard(input) {
  // Speech-to-text often mishears "Meet" next to "Google/link" — recover it
  // only in that narrow context so real words elsewhere are untouched.
  return String(input || '')
    .replace(/google\s+(nick|neat|meat|mid|meek)\s+link/gi, 'google meet link')
    .replace(/\b(neat|meat)\s+link\b/gi, 'meet link');
}
function meetTitleFrom(details = '') {
  const text = String(details).replace(/^[\s,.:;\-]+/, '').trim();
  if (!text) return undefined;
  const withMatch = text.match(/with\s+([a-zA-Z][a-zA-Z\s]*?)(?=\s+at\s+|\s+on\s+|\s+for\s+|$)/);
  if (withMatch) return `Meeting with ${withMatch[1].trim()}`.slice(0, 120);
  const clean = text.replace(/^(for|about|regarding|called|titled)\s+/i, '').trim();
  if (!clean || /^at\s+\d/i.test(clean)) return undefined;
  return `Meeting ${clean}`.slice(0, 120);
}
function parseVoiceCommand(input) { const raw=String(input||'').trim().replace(/[\s.,!?;:]+$/g,''); const text=normalizeVoiceHeard(raw); const meet=text.match(/^create\s+(?:a\s+)?(?:google\s+)?(?:meet|meeting)\s+link\b(.*)$/i); if(meet)return {intent:'meet',details:(meet[1]||'').trim()}; const current=text.match(/^add\s+this\s+song\s+to\s+my\s+(.+)$/i); if(current)return {intent:'spotify_add',song:null,currentlyPlaying:true,playlist:current[1].trim()}; const add=text.match(/^add\s+(.+?)\s+to\s+(?:my\s+)?(.+)$/i); if(add)return {intent:'spotify_add',song:add[1].trim(),currentlyPlaying:false,playlist:add[2].trim()}; const call=text.match(/^call\s+(.+)$/i);if(call)return{intent:'call',name:call[1].trim()};const place=text.match(/^take\s+me\s+to\s+(.+)$/i);if(place)return{intent:'directions',place:place[1].trim()};return null; }
function askIntent(q) { const text=String(q).toLowerCase().trim().replace(/\s+/g,' '); const tomorrow=/\btomorrow\b|\btmrw\b|\b2morrow\b/.test(text), today=/\btoday\b|\bwhat.?s up\b|\bwhats up\b|\bwhat do i have\b|\bwhat have i got\b|\bmy plan\b|\bmy day\b|\bschedule\b|\bagenda\b|\bwhat.?s on\b|\bwhats on\b/.test(text); return {tomorrow,today,exam:!today&&!tomorrow&&/\bexam\b/.test(text)}; }
function spreadMinutes(start,end,total) { const days=[],d=new Date(`${start}T12:00:00Z`),last=new Date(`${end}T12:00:00Z`);while(d<=last){days.push(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()+1);}const base=Math.floor(total/days.length),extra=total%days.length;return days.map((day,i)=>({day,minutes:base+(i<extra?1:0)})); }
function taskCompletable(task) { return task.kind==='reminder' || task.kind==='plan'; }
module.exports={reminderRearm,stickyNag,normalizeVoiceHeard,meetTitleFrom,parseVoiceCommand,askIntent,spreadMinutes,taskCompletable,dateInZone,localDayStartUtc,localDateTimeUtc};
