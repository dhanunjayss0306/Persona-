// Assistant answers focused schedule questions from the signed-in user's data.
const express = require('express');
const supabase = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

router.get('/ask', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim().replace(/\s+/g, ' ');
  if (!q) return res.status(400).json({ error: 'Ask what is on your day.' });
  const uid = req.user.id;
  if (/exam|exams|test|semester/.test(q)) {
    const from = new Date().toISOString().slice(0,10), until = new Date(); until.setDate(until.getDate()+90);
    const { data, error } = await supabase.from('fixed_events').select('title,event_date,kind').eq('user_id',uid).gte('event_date',from).lte('event_date',until.toISOString().slice(0,10)).order('event_date').limit(12);
    if (error) return res.status(502).json({ error: 'Could not read your upcoming exams.' });
    const answer = data?.length ? `Upcoming exams and dates:\n${data.map((item)=>`- ${item.title}: ${new Date(`${item.event_date}T12:00:00`).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}`).join('\n')}\nMake room for a study session today; open Plan > Study plan to schedule it.` : 'No exam dates are saved for the next three months. Add one in Plan > Study plan, and I can help you make room to study.';
    return res.json({ answer });
  }
  const tomorrow = /tomorrow|tmrw|2morrow/.test(q);
  const todayIntent = /today|what.?s up|whats up|what do i have|what have i got|my plan|my day|schedule|agenda|what.?s on|whats on/.test(q);
  if (!todayIntent && !tomorrow) return res.json({ answer: 'I can check your day, tomorrow, or upcoming exams. Try asking: what is up for today?' });
  const target = new Date(); if (tomorrow) target.setDate(target.getDate()+1);
  const day = `${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}-${String(target.getDate()).padStart(2,'0')}`;
  const next = new Date(target); next.setDate(next.getDate()+1);
  const nextDay = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`;
  const { data: reminders, error: reminderError } = await supabase.from('reminders').select('id,title,type,status,due_at').eq('user_id',uid).gte('due_at',`${day}T00:00:00`).lt('due_at',`${nextDay}T00:00:00`).neq('status','done');
  if (reminderError) return res.status(502).json({ error: 'Could not read your reminders.' });
  const { data: events, error: eventError } = await supabase.from('calendar_events').select('title,start_time').eq('user_id',uid).eq('event_date',day);
  if (eventError && !['PGRST205','42P01'].includes(eventError.code)) return res.status(502).json({ error: 'Could not read your calendar.' });
  const { data: fixed, error: fixedError } = await supabase.from('fixed_events').select('title,kind').eq('user_id',uid).eq('event_date',day);
  if (fixedError) return res.status(502).json({ error: 'Could not read your fixed dates.' });
  const { data: plans, error: plansError } = await supabase.from('plans').select('id').eq('user_id',uid);
  if (plansError) return res.status(502).json({ error: 'Could not read your plan.' });
  let blocks=[];
  if(plans?.length){const result=await supabase.from('plan_days').select('blocks,done').in('plan_id',plans.map((plan)=>plan.id)).eq('day',day);if(result.error)return res.status(502).json({error:'Could not read your study blocks.'});blocks=(result.data||[]).flatMap((entry)=>(entry.blocks||[]).map((block)=>({title:block.title,time:'',status:entry.done?'done':'planned',source:'Plan'})));}
  const now=Date.now();
  const items=[...(reminders||[]).map((item)=>({title:item.title,time:item.due_at,status:item.status==='ringing'?'active reminder':'reminder',source:'Reminder'})),...(events||[]).map((item)=>({title:item.title,time:`${day}T${item.start_time||'00:00'}`,status:'event',source:'Calendar'})),...(fixed||[]).map((item)=>({title:item.title,time:'',status:item.kind||'fixed date',source:'Calendar'})),...blocks].filter((item)=>item.status!=='done');
  items.sort((a,b)=>{const at=a.time?new Date(a.time).getTime():Infinity,bt=b.time?new Date(b.time).getTime():Infinity,ao=at<now,bo=bt<now;return ao===bo?at-bt:ao?-1:1;});
  const label=target.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'});
  const answer=items.length?`${tomorrow?'Tomorrow':'Today'} (${label}):\n${items.map((item)=>`- ${item.title}${item.time?` at ${new Date(item.time).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'})}`:''} (${item.source}${item.status==='active reminder'?', active':''})`).join('\n')}`:`Your ${tomorrow?'tomorrow':'day'} is clear so far. Want to add a plan or reminder?`;
  return res.json({answer});
});
module.exports = router;
