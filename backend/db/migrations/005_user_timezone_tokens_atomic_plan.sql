alter table users add column if not exists timezone text not null default 'Asia/Kolkata';
alter table users alter column password_hash drop not null;
alter table reminders drop constraint if exists reminders_type_check;
alter table reminders add constraint reminders_type_check check (type in ('once','nag','plain'));
alter table reminders add column if not exists item_type text not null default 'task';
alter table voice_profiles add column if not exists sample_path text;
alter table voice_profiles add column if not exists sample_url text;
update storage.buckets set public = false where id in ('proofs','voice-samples');
create table if not exists oauth_tokens (
 user_id uuid not null references users(id) on delete cascade,
 provider text not null check (provider in ('google','spotify')),
 encrypted_tokens text not null,
 updated_at timestamptz not null default now(),
 primary key(user_id, provider)
);
-- Run these in Storage policies/console as well: buckets proofs and voice-samples must be private.
-- RPC gives plan confirmation one database transaction, including plan days, calendar context and reminders.
create or replace function confirm_persona_plan(p_user uuid, p_plan jsonb, p_days jsonb, p_events jsonb, p_reminders jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
 insert into plans(user_id,title,start_date,end_date,hours_per_day) values(p_user,p_plan->>'title',(p_plan->>'start_date')::date,(p_plan->>'end_date')::date,(p_plan->>'hours_per_day')::numeric) returning id into pid;
 insert into plan_days(plan_id,day,blocks) select pid,(x->>'day')::date,x->'blocks' from jsonb_array_elements(p_days) x;
 insert into calendar_events(user_id,title,details,event_date,start_time) select p_user,x->>'title',coalesce(x->>'details',''),(x->>'event_date')::date,coalesce(x->>'start_time','09:00')::time from jsonb_array_elements(p_events) x;
 insert into fixed_events(user_id,title,event_date,kind) select p_user,x->>'title',(x->>'event_date')::date,x->>'kind' from jsonb_array_elements(coalesce(p_plan->'fixed_events','[]'::jsonb)) x;
 insert into reminders(user_id,title,details,type,due_at,proof_required,status) select p_user,x->>'title',x->>'details',x->>'type',(x->>'due_at')::timestamptz,false,'pending' from jsonb_array_elements(p_reminders) x;
 return pid;
end; $$;
revoke all on function confirm_persona_plan(uuid,jsonb,jsonb,jsonb,jsonb) from public;
grant execute on function confirm_persona_plan(uuid,jsonb,jsonb,jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';
