-- Persona migration 2 — frontend round 2 (2026-10-12).
-- Run AFTER supabase/schema.sql, in Supabase > SQL Editor.

-- Richer profile: work, field of study, degrees, bio, Google sign-in.
alter table users add column if not exists work text;
alter table users add column if not exists field_of_study text;
alter table users add column if not exists degrees text;
alter table users add column if not exists bio text;
alter table users add column if not exists google_id text unique;
alter table users add column if not exists onboarding jsonb default '{}';
alter table users alter column password_hash drop not null;  -- Google-only users have no password

-- Journal share links.
alter table journal_entries add column if not exists share_token text unique;

-- Favorites: songs, playlists, movies.
create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  kind text not null check (kind in ('song','playlist','movie')),
  title text not null,
  meta jsonb default '{}',
  created_at timestamptz default now()
);

-- Voice enrollment: his sample + chosen wake word.
create table if not exists voice_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  wake_word text default 'Hey Persona',
  sample_url text,
  created_at timestamptz default now()
);

-- Storage bucket for voice samples (proofs bucket already in schema.sql):
-- insert into storage.buckets (id, name, public) values ('voice-samples','voice-samples', false);
