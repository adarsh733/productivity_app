-- SPEAK — Supabase schema
--
-- This is sync and backup only. The app reads from IndexedDB; nothing in a
-- session waits on this database.
--
-- Every table carries user_id and every policy checks auth.uid(), from day one,
-- even though there is exactly one user today. Retrofitting multi-tenancy onto
-- a schema whose primary key is a date is a rewrite — and a second signup would
-- silently overwrite the first user's history in the meantime.

create extension if not exists "pgcrypto";

-- ── profile ─────────────────────────────────────────────────────────────────
create table if not exists public.profile (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  baseline_wpm  int,
  target_wpm    int,
  updated_at    timestamptz not null default now()
);

-- Phase 1 — personal audio calibration. Absolute dB off a phone mic is
-- meaningless, so every band in the app is expressed relative to baseline_db,
-- measured on his own device. `add column if not exists` so an already-created
-- project can be brought forward by re-running this file.
alter table public.profile add column if not exists baseline_db          numeric;
alter table public.profile add column if not exists calibration_samples  int not null default 0;
alter table public.profile add column if not exists target_band_min_db   numeric;
alter table public.profile add column if not exists target_band_max_db   numeric;
alter table public.profile add column if not exists calibrated_at        timestamptz;

-- ── cards ───────────────────────────────────────────────────────────────────
create table if not exists public.cards (
  user_id     uuid not null references auth.users(id) on delete cascade,
  id          text not null,
  type        text not null,
  lang        text not null default 'en',
  tags        text[] not null default '{}',
  source      text not null default 'seed',
  status      text not null default 'active',
  payload     jsonb not null,
  batch_id    text,
  seed_id     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists cards_user_status_idx on public.cards (user_id, status);
-- Lets a bad generation batch be deleted wholesale. See PLAN.md §6b.
create index if not exists cards_batch_idx on public.cards (user_id, batch_id);

-- ── reviews (SM-2 state) ────────────────────────────────────────────────────
create table if not exists public.reviews (
  user_id        uuid not null references auth.users(id) on delete cascade,
  card_id        text not null,
  state          text not null default 'new',
  due            date not null,
  interval_days  int  not null default 0,
  ease           numeric(4,2) not null default 2.50,
  reps           int  not null default 0,
  lapses         int  not null default 0,
  last_grade     text,
  last_seen_at   timestamptz,
  primary key (user_id, card_id)
);
create index if not exists reviews_due_idx on public.reviews (user_id, due);

-- ── events (one row per graded card) ────────────────────────────────────────
create table if not exists public.events (
  user_id    uuid not null references auth.users(id) on delete cascade,
  id         text not null,
  card_id    text not null,
  card_type  text not null,
  at         timestamptz not null,
  grade      text not null,
  ms_spent   int  not null default 0,
  mode       text not null,
  measure    numeric,
  primary key (user_id, id)
);
create index if not exists events_at_idx on public.events (user_id, at desc);

-- ── days (the streak) ───────────────────────────────────────────────────────
create table if not exists public.days (
  user_id          uuid not null references auth.users(id) on delete cascade,
  date             date not null,
  core_three_done  boolean not null default false,
  cards_completed  int not null default 0,
  seconds_active   int not null default 0,
  urges_redirected int not null default 0,
  best_mpt_sec     numeric,
  primary key (user_id, date)
);

-- ── inbox (the 3AM box) ─────────────────────────────────────────────────────
create table if not exists public.inbox (
  user_id            uuid not null references auth.users(id) on delete cascade,
  id                 text not null,
  created_at         timestamptz not null default now(),
  text               text not null,
  status             text not null default 'raw',
  processed_at       timestamptz,
  generated_card_ids text[],
  primary key (user_id, id)
);
create index if not exists inbox_status_idx on public.inbox (user_id, status);

-- ── lab_sessions (Phase 1 — the Speaking Lab) ───────────────────────────────
create table if not exists public.lab_sessions (
  user_id            uuid not null references auth.users(id) on delete cascade,
  id                 text not null,
  date               date not null,
  started_at         timestamptz not null,
  ended_at           timestamptz,
  completed_step_ids text[] not null default '{}',
  -- The number that says whether the session was real. A session with zero
  -- transfer reps ran the timers and trained nothing.
  transfer_reps      int not null default 0,
  avg_db             numeric,
  aborted            boolean not null default false,
  primary key (user_id, id)
);
create index if not exists lab_sessions_date_idx on public.lab_sessions (user_id, date desc);

-- ── voice_samples (the charted numbers) ─────────────────────────────────────
-- Deliberately not derived from `events`. These are the twelve-week trend
-- lines; reconstructing them by filtering an event log is how a metric quietly
-- changes meaning when the event log changes.
create table if not exists public.voice_samples (
  user_id    uuid not null references auth.users(id) on delete cascade,
  id         text not null,
  at         timestamptz not null,
  date       date not null,
  kind       text not null,
  value      numeric not null,
  session_id text,
  primary key (user_id, id)
);
create index if not exists voice_samples_kind_idx on public.voice_samples (user_id, kind, at desc);

-- Phase 1 — the Lab does not feed the streak (core_three_done stays the only
-- thing that does), but the day still records that it happened.
alter table public.days add column if not exists lab_session_done boolean not null default false;
alter table public.days add column if not exists lab_seconds      int not null default 0;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.profile       enable row level security;
alter table public.cards         enable row level security;
alter table public.reviews       enable row level security;
alter table public.events        enable row level security;
alter table public.days          enable row level security;
alter table public.inbox         enable row level security;
alter table public.lab_sessions  enable row level security;
alter table public.voice_samples enable row level security;

do $$
declare t text;
begin
  foreach t in array array['profile','cards','reviews','events','days','inbox',
                           'lab_sessions','voice_samples'] loop
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- No policy is granted to `anon`. An unauthenticated client can read nothing.
