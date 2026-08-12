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

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.profile enable row level security;
alter table public.cards   enable row level security;
alter table public.reviews enable row level security;
alter table public.events  enable row level security;
alter table public.days    enable row level security;
alter table public.inbox   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['profile','cards','reviews','events','days','inbox'] loop
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- No policy is granted to `anon`. An unauthenticated client can read nothing.
