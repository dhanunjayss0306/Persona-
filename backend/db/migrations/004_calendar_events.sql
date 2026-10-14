-- Calendar-only activities that can be created, edited, and removed in Persona.
-- Run once in Supabase SQL Editor. Safe to rerun.

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  title text not null,
  details text,
  event_date date not null,
  start_time time not null,
  created_at timestamptz default now()
);

create index if not exists calendar_events_user_date_idx on calendar_events(user_id, event_date);

notify pgrst, 'reload schema';
