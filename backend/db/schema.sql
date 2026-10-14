-- Persona database schema — run this once in Supabase > SQL Editor.
-- Every table belongs to a user (user_id), so one account never sees another's data.

-- ---------- USERS ----------
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  phone text,
  password_hash text not null,
  created_at timestamptz default now()
);

-- Phone push tokens: one row per device the user installs the app on.
create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  fcm_token text unique not null,
  label text,
  created_at timestamptz default now()
);

-- Favorite contacts for the "call" voice action.
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text not null,
  phone text not null,
  created_at timestamptz default now()
);

-- ---------- REMINDERS ----------
-- type: 'once'  -> notify a single time (birthdays, small things)
-- type: 'nag'   -> notify every 5 min until a proof row exists (work)
-- status: 'pending' -> 'ringing' -> 'done' | 'notified' (once-type after firing)
create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  title text not null,
  details text,
  type text not null check (type in ('once','nag')),
  due_at timestamptz not null,
  proof_required boolean default true,
  status text not null default 'pending',
  last_nagged_at timestamptz,
  created_at timestamptz default now()
);

-- Proof that kills a nag: photo/file upload or voice/text note.
create table if not exists proofs (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid references reminders(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  kind text not null check (kind in ('photo','file','voice','text')),
  file_url text,
  text text,
  created_at timestamptz default now()
);

-- ---------- PLANNER ----------
create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  title text not null,
  start_date date not null,
  end_date date not null,
  hours_per_day numeric not null,
  created_at timestamptz default now()
);

create table if not exists plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references plans(id) on delete cascade,
  day date not null,
  blocks jsonb not null default '[]',  -- [{title, minutes, kind}]
  done boolean default false
);

-- Exams / deadlines the planner must respect.
create table if not exists fixed_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  title text not null,
  event_date date not null,
  kind text default 'exam',
  created_at timestamptz default now()
);

-- Calendar-only activities. They do not create or behave like reminders.
create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  title text not null,
  details text,
  event_date date not null,
  start_time time not null,
  created_at timestamptz default now()
);

-- ---------- JOURNAL ----------
create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  entry_date date not null,
  title text,
  body text not null,
  mood text,
  theme text default 'sunset',
  created_at timestamptz default now(),
  unique(user_id, entry_date)
);

-- ---------- EXPENSES (UPI log) ----------
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  amount numeric not null,
  paid_to text,
  upi_app text,              -- GPay / PhonePe / Paytm / ...
  category text,
  note text,
  spent_at timestamptz default now()
);

-- ---------- CART + PRICE TRACKER ----------
create table if not exists cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text not null,
  url text not null,
  shop text,                 -- amazon / flipkart / croma
  target_price numeric,
  last_price numeric,
  last_price_source text not null default 'legacy',
  last_checked_at timestamptz,
  alert_sent boolean default false,
  created_at timestamptz default now()
);

create table if not exists price_history (
  id uuid primary key default gen_random_uuid(),
  cart_item_id uuid references cart_items(id) on delete cascade,
  price numeric not null,
  checked_at timestamptz default now(),
  source text not null default 'legacy'
);

-- ---------- PLAYLISTS ----------
create table if not exists playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text not null,
  service text not null,      -- 'spotify'
  service_playlist_id text,
  songs jsonb not null default '[]',  -- ["song — artist", ...]
  created_at timestamptz default now()
);

-- ---------- GROUPS (phase 2) ----------
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

-- Storage bucket for proof uploads (create in Supabase > Storage, or via SQL):
-- insert into storage.buckets (id, name, public) values ('proofs','proofs', true);
