-- =============================================================================
-- Nutzerzustand (Watchlist, Guide-/Trophäen-Fortschritt, Spiel-Sichtbarkeit)
-- PostgreSQL / Supabase – einmal im SQL-Editor ausführen.
-- =============================================================================
-- Design:
--   * Pro User+Spiel maximal EINE Fortschrittszeile (kein 1-Haken-1-Zeile-Bloat).
--   * completed_steps: text[] mit Guide-UUIDs und/oder Trophäen-platform_achievement_ids.
--   * RLS: jeder liest/schreibt nur eigene Zeilen (auth.uid() = user_id).
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- profiles – Basisdaten, 1:1 zu auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Minimale Auth-Verknüpfung; keine Checklisten hier.';

-- ---------------------------------------------------------------------------
-- user_watchlist – Merkliste (eine Zeile pro User+Spiel)
-- ---------------------------------------------------------------------------
create table if not exists public.user_watchlist (
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

create index if not exists user_watchlist_user_id_idx
  on public.user_watchlist (user_id);

create index if not exists user_watchlist_game_id_idx
  on public.user_watchlist (game_id);

comment on table public.user_watchlist is
  'Watchlist; entspricht lokal tb_watchlist_ids.';

-- ---------------------------------------------------------------------------
-- user_guide_progress – Guide- + manuelle Trophäen-Häkchen in EINER Zeile
-- ---------------------------------------------------------------------------
create table if not exists public.user_guide_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  -- text[] statt int[]: Guide-Keys sind UUIDs, Trophäen-IDs sind platform_achievement_id-Strings
  completed_steps text[] not null default '{}',
  is_platinum boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

create index if not exists user_guide_progress_user_id_idx
  on public.user_guide_progress (user_id);

create index if not exists user_guide_progress_game_id_idx
  on public.user_guide_progress (game_id);

comment on table public.user_guide_progress is
  'Ein Fortschrittssatz pro User+Spiel. completed_steps = abgehakte Guide-UUIDs und manuelle Trophäen-IDs (kein Zeilen-Bloat).';

comment on column public.user_guide_progress.completed_steps is
  'Array der erledigten Checklisten-Keys (game_guides.id und/oder platform_achievement_id).';

comment on column public.user_guide_progress.is_platinum is
  'Optional: Platin manuell / abgeleitet markiert.';

-- ---------------------------------------------------------------------------
-- user_game_settings – ausgeblendete Spiele (Header Ein-/Ausblenden)
-- ---------------------------------------------------------------------------
create table if not exists public.user_game_settings (
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  is_hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

create index if not exists user_game_settings_user_id_idx
  on public.user_game_settings (user_id);

create index if not exists user_game_settings_user_hidden_idx
  on public.user_game_settings (user_id)
  where is_hidden = true;

comment on table public.user_game_settings is
  'Pro-Spiel-UI-Flags; is_hidden entspricht lokal tb_hidden_ids (game:…).';

-- ---------------------------------------------------------------------------
-- updated_at-Trigger
-- ---------------------------------------------------------------------------
create or replace function public.tb_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.tb_set_updated_at();

drop trigger if exists user_guide_progress_set_updated_at on public.user_guide_progress;
create trigger user_guide_progress_set_updated_at
  before update on public.user_guide_progress
  for each row execute function public.tb_set_updated_at();

drop trigger if exists user_game_settings_set_updated_at on public.user_game_settings;
create trigger user_game_settings_set_updated_at
  before update on public.user_game_settings
  for each row execute function public.tb_set_updated_at();

-- ---------------------------------------------------------------------------
-- Profil automatisch bei Sign-up
-- ---------------------------------------------------------------------------
create or replace function public.tb_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profiles on auth.users;
create trigger on_auth_user_created_profiles
  after insert on auth.users
  for each row execute function public.tb_handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_watchlist enable row level security;
alter table public.user_guide_progress enable row level security;
alter table public.user_game_settings enable row level security;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_delete_own on public.profiles;

create policy profiles_select_own
  on public.profiles for select to authenticated
  using (auth.uid() = id);

create policy profiles_insert_own
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

create policy profiles_update_own
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy profiles_delete_own
  on public.profiles for delete to authenticated
  using (auth.uid() = id);

drop policy if exists user_watchlist_select_own on public.user_watchlist;
drop policy if exists user_watchlist_insert_own on public.user_watchlist;
drop policy if exists user_watchlist_update_own on public.user_watchlist;
drop policy if exists user_watchlist_delete_own on public.user_watchlist;
-- ältere Sammel-Policy aus rls_production.sql (falls vorhanden)
drop policy if exists user_watchlist_own on public.user_watchlist;

create policy user_watchlist_select_own
  on public.user_watchlist for select to authenticated
  using (auth.uid() = user_id);

create policy user_watchlist_insert_own
  on public.user_watchlist for insert to authenticated
  with check (auth.uid() = user_id);

create policy user_watchlist_update_own
  on public.user_watchlist for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy user_watchlist_delete_own
  on public.user_watchlist for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_guide_progress_select_own on public.user_guide_progress;
drop policy if exists user_guide_progress_insert_own on public.user_guide_progress;
drop policy if exists user_guide_progress_update_own on public.user_guide_progress;
drop policy if exists user_guide_progress_delete_own on public.user_guide_progress;

create policy user_guide_progress_select_own
  on public.user_guide_progress for select to authenticated
  using (auth.uid() = user_id);

create policy user_guide_progress_insert_own
  on public.user_guide_progress for insert to authenticated
  with check (auth.uid() = user_id);

create policy user_guide_progress_update_own
  on public.user_guide_progress for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy user_guide_progress_delete_own
  on public.user_guide_progress for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_game_settings_select_own on public.user_game_settings;
drop policy if exists user_game_settings_insert_own on public.user_game_settings;
drop policy if exists user_game_settings_update_own on public.user_game_settings;
drop policy if exists user_game_settings_delete_own on public.user_game_settings;

create policy user_game_settings_select_own
  on public.user_game_settings for select to authenticated
  using (auth.uid() = user_id);

create policy user_game_settings_insert_own
  on public.user_game_settings for insert to authenticated
  with check (auth.uid() = user_id);

create policy user_game_settings_update_own
  on public.user_game_settings for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy user_game_settings_delete_own
  on public.user_game_settings for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.user_watchlist to authenticated;
grant select, insert, update, delete on public.user_guide_progress to authenticated;
grant select, insert, update, delete on public.user_game_settings to authenticated;

commit;
