-- user_earned_trophies: PSN-Sync – welche Trophäen ein User wirklich verdient hat.
-- game_id → public.games.id (UUID)
-- trophy_id → game_achievements.platform_achievement_id (text)
-- Für Migration: migrate_user_tables_to_game_uuid.sql

create table if not exists public.user_earned_trophies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  trophy_id text not null,
  earned_at timestamptz not null default now(),
  unique (user_id, game_id, trophy_id)
);

alter table public.user_earned_trophies
  add column if not exists earned_at timestamptz not null default now();

create index if not exists idx_user_earned_trophies_user_game
  on public.user_earned_trophies (user_id, game_id);

create index if not exists idx_user_earned_trophies_game_trophy
  on public.user_earned_trophies (game_id, trophy_id);

alter table public.user_earned_trophies enable row level security;

drop policy if exists "earned_trophies_select_own" on public.user_earned_trophies;

create policy "earned_trophies_select_own" on public.user_earned_trophies
  for select to authenticated
  using (auth.uid() = user_id);

-- Schreibzugriff nur für Service-Role / Backend-Sync (kein Client-Insert)
