-- Beispiel-Schema für TrophyBase Benutzerfeatures (Supabase SQL Editor)
-- RLS: Nur eigene Zeilen lesen/schreiben (auth.uid() = user_id)

create table if not exists public.user_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id text not null,
  progress_percent smallint default 0 check (progress_percent >= 0 and progress_percent <= 100),
  status text not null default 'active',
  last_played_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, game_id)
);

create table if not exists public.user_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text,
  reward_code text,
  is_read boolean not null default false,
  created_at timestamptz default now()
);

alter table public.user_watchlist enable row level security;
alter table public.user_inbox enable row level security;

create policy "watchlist_select_own" on public.user_watchlist
  for select using (auth.uid() = user_id);

create policy "watchlist_insert_own" on public.user_watchlist
  for insert with check (auth.uid() = user_id);

create policy "watchlist_update_own" on public.user_watchlist
  for update using (auth.uid() = user_id);

create policy "inbox_select_own" on public.user_inbox
  for select using (auth.uid() = user_id);

create policy "inbox_update_own" on public.user_inbox
  for update using (auth.uid() = user_id);
