-- =============================================================================
-- Produktions-RLS fuer TrophyBase
-- Einmal in der Supabase-SQL-Konsole ausfuehren (als Postgres / SQL-Editor).
-- =============================================================================
--
-- IST-ZUSTAND (geprueft 2026-09-30, Anon-Key):
--   RLS ist auf den Katalogtabellen praktisch nicht wirksam. Anon konnte
--   games patchen/loeschen (0-Zeilen-204), community_reports einfuegen und
--   loeschen, invite_keys lesen (100 Schluessel) und community_reports lesen.
--   Das ist Pipeline-Modus, kein oeffentlicher Betrieb.
--
-- ZIEL:
--   * Besucher lesen nur PUBLISHED-Spiele plus deren Trophäen/Guides
--   * Admin (master@trophybase.app) liest und schreibt alles
--   * Nutzerdaten nur eigene Zeilen
--   * invite_keys nicht oeffentlich
--   * community_reports: Insert fuer Meldungen, Lesen nur Admin
--
-- games.views wird weiter ueber increment_game_views() (SECURITY DEFINER)
-- hochgezaehlt. Diese Funktion muss existieren, sonst zaehlt Beliebt nicht.
--
-- Nach dem Ausfuehren: Website hart neu laden. Als Admin einloggen und
-- Intranet-Suche pruefen (muss weiter alle Spiele zeigen). Als Gast
-- Startseite/Suche nur PUBLISHED.

begin;

-- ---------------------------------------------------------------------------
-- Admin-Erkennung (JWT-E-Mail). Muss mit ALLOWED_ADMINS im Frontend stimmen.
-- ---------------------------------------------------------------------------
create or replace function public.tb_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in ('master@trophybase.app');
$$;

comment on function public.tb_is_admin() is
  'Redaktioneller Vollzugriff. Spiegelt ALLOWED_ADMINS im Frontend.';

revoke all on function public.tb_is_admin() from public;
grant execute on function public.tb_is_admin() to anon, authenticated;

create or replace function public.tb_game_is_published(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select g.status ->> 'guide_de' from public.games g where g.id = p_game_id),
    ''
  ) = 'PUBLISHED';
$$;

revoke all on function public.tb_game_is_published(uuid) from public;
grant execute on function public.tb_game_is_published(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Hilfen
-- ---------------------------------------------------------------------------
create or replace function public.tb_drop_policies(p_table text)
returns void
language plpgsql
as $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = p_table
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, p_table);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- games
-- ---------------------------------------------------------------------------
alter table public.games enable row level security;
select public.tb_drop_policies('games');

create policy games_select
  on public.games
  for select
  to anon, authenticated
  using (
    public.tb_is_admin()
    or coalesce(status ->> 'guide_de', '') = 'PUBLISHED'
  );

create policy games_admin_write
  on public.games
  for all
  to authenticated
  using (public.tb_is_admin())
  with check (public.tb_is_admin());

-- ---------------------------------------------------------------------------
-- game_achievements / game_guides
-- ---------------------------------------------------------------------------
alter table public.game_achievements enable row level security;
select public.tb_drop_policies('game_achievements');

create policy game_achievements_select
  on public.game_achievements
  for select
  to anon, authenticated
  using (public.tb_is_admin() or public.tb_game_is_published(game_id));

create policy game_achievements_admin_write
  on public.game_achievements
  for all
  to authenticated
  using (public.tb_is_admin())
  with check (public.tb_is_admin());

alter table public.game_guides enable row level security;
select public.tb_drop_policies('game_guides');

create policy game_guides_select
  on public.game_guides
  for select
  to anon, authenticated
  using (public.tb_is_admin() or public.tb_game_is_published(game_id));

create policy game_guides_admin_write
  on public.game_guides
  for all
  to authenticated
  using (public.tb_is_admin())
  with check (public.tb_is_admin());

-- ---------------------------------------------------------------------------
-- Oeffentliche Stammdaten (nur lesen)
-- ---------------------------------------------------------------------------
alter table public.content_creators enable row level security;
select public.tb_drop_policies('content_creators');

create policy content_creators_select
  on public.content_creators
  for select
  to anon, authenticated
  using (true);

create policy content_creators_admin_write
  on public.content_creators
  for all
  to authenticated
  using (public.tb_is_admin())
  with check (public.tb_is_admin());

alter table public.game_creator_map enable row level security;
select public.tb_drop_policies('game_creator_map');

create policy game_creator_map_select
  on public.game_creator_map
  for select
  to anon, authenticated
  using (true);

create policy game_creator_map_admin_write
  on public.game_creator_map
  for all
  to authenticated
  using (public.tb_is_admin())
  with check (public.tb_is_admin());

-- ---------------------------------------------------------------------------
-- invite_keys: nur Admin (Beta-Redeem ueber den Client geht danach nicht mehr)
-- ---------------------------------------------------------------------------
alter table public.invite_keys enable row level security;
select public.tb_drop_policies('invite_keys');

create policy invite_keys_admin
  on public.invite_keys
  for all
  to authenticated
  using (public.tb_is_admin())
  with check (public.tb_is_admin());

-- ---------------------------------------------------------------------------
-- community_reports: Insert oeffentlich, Rest nur Admin
-- ---------------------------------------------------------------------------
alter table public.community_reports enable row level security;
select public.tb_drop_policies('community_reports');

create policy community_reports_insert
  on public.community_reports
  for insert
  to anon, authenticated
  with check (
    (auth.uid() is null and user_id is null)
    or (auth.uid() is not null and user_id = auth.uid())
  );

create policy community_reports_admin
  on public.community_reports
  for all
  to authenticated
  using (public.tb_is_admin())
  with check (public.tb_is_admin());

-- ---------------------------------------------------------------------------
-- Nutzerdaten
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
select public.tb_drop_policies('profiles');

create policy profiles_own
  on public.profiles
  for all
  to authenticated
  using (id = auth.uid() or public.tb_is_admin())
  with check (id = auth.uid() or public.tb_is_admin());

alter table public.user_watchlist enable row level security;
select public.tb_drop_policies('user_watchlist');

create policy user_watchlist_own
  on public.user_watchlist
  for all
  to authenticated
  using (user_id = auth.uid() or public.tb_is_admin())
  with check (user_id = auth.uid() or public.tb_is_admin());

alter table public.user_inbox enable row level security;
select public.tb_drop_policies('user_inbox');

create policy user_inbox_own
  on public.user_inbox
  for all
  to authenticated
  using (user_id = auth.uid() or public.tb_is_admin())
  with check (user_id = auth.uid() or public.tb_is_admin());

drop function if exists public.tb_drop_policies(text);

commit;

-- Kontrolle (nur lesen):
-- select relname, relrowsecurity from pg_class
-- where relname in (
--   'games','game_achievements','game_guides','invite_keys','community_reports'
-- );
--
-- select tablename, policyname, cmd from pg_policies
-- where schemaname = 'public'
-- order by tablename, policyname;
