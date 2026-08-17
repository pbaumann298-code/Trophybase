-- user_watchlist: Schema + RLS (Supabase SQL Editor)
-- game_id → public.games.id (UUID)
-- Für Migration von NPWR-Text-IDs: migrate_user_tables_to_game_uuid.sql

create table if not exists public.user_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  progress_percent smallint not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
  status text not null default 'active',
  last_played_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, game_id)
);

alter table public.user_watchlist
  add column if not exists last_played_at timestamptz default now();

alter table public.user_watchlist
  add column if not exists updated_at timestamptz default now();

alter table public.user_watchlist
  add column if not exists progress_percent smallint not null default 0;

alter table public.user_watchlist
  add column if not exists status text not null default 'active';

create index if not exists idx_user_watchlist_user_id on public.user_watchlist (user_id);
create index if not exists idx_user_watchlist_game_id on public.user_watchlist (game_id);

alter table public.user_watchlist enable row level security;

drop policy if exists "watchlist_select_own" on public.user_watchlist;
drop policy if exists "watchlist_insert_own" on public.user_watchlist;
drop policy if exists "watchlist_update_own" on public.user_watchlist;
drop policy if exists "watchlist_delete_own" on public.user_watchlist;

create policy "watchlist_select_own" on public.user_watchlist
  for select to authenticated
  using (auth.uid() = user_id);

create policy "watchlist_insert_own" on public.user_watchlist
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "watchlist_update_own" on public.user_watchlist
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "watchlist_delete_own" on public.user_watchlist
  for delete to authenticated
  using (auth.uid() = user_id);
