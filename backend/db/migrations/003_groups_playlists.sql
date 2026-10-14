-- Restore missing app tables and add calendar-only activities plus verified
-- price provenance. Run once in Supabase SQL Editor. Safe to rerun.
-- Run once in Supabase SQL Editor. Safe to rerun.

create table if not exists playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text not null,
  service text not null,
  service_playlist_id text,
  songs jsonb not null default '[]',
  created_at timestamptz default now()
);

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists group_members (
  group_id uuid references groups(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

create table if not exists group_tasks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade,
  assignee_id uuid references users(id) on delete set null,
  title text not null,
  due_at timestamptz,
  status text not null default 'pending',
  created_at timestamptz default now()
);

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  title text not null,
  details text,
  event_date date not null,
  start_time time not null,
  created_at timestamptz default now()
);

alter table cart_items add column if not exists last_price_source text not null default 'legacy';
alter table price_history add column if not exists source text not null default 'legacy';

notify pgrst, 'reload schema';
