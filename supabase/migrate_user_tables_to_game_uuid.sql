-- =============================================================================
-- TrophyBase: Migration NPWR / Text-IDs → games.id (UUID)
-- =============================================================================
-- Voraussetzungen:
--   • Tabelle public.games existiert (PK: id uuid, platform_game_id text)
--   • Spieldaten aus Playstation_Games wurden nach games + game_translations migriert
--
-- Betroffene Tabellen:
--   • user_watchlist.game_id
--   • user_earned_trophies.game_id (+ optional trophy_id → platform_achievement_id)
--   • online_trophies_log.game_id
--   • qa_dashboard.game_id (falls vorhanden)
--   • community_reports.source_identifier (Spiel-Bezug)
--
-- Reihenfolge: Einmal im Supabase SQL Editor ausführen (nicht parallel).
-- Backup empfohlen vor Schritt 5 (Spaltentyp uuid + FK).
-- =============================================================================

begin;

-- ─── 0) Hilfsfunktion: Route-Ref → games.id ───────────────────────────────────
create or replace function public.resolve_game_uuid(ref text)
returns uuid
language sql
stable
set search_path = public
as $$
  select g.id
  from public.games g
  where g.id::text = nullif(trim(ref), '')
     or g.platform_game_id = nullif(trim(ref), '')
  order by case when g.id::text = nullif(trim(ref), '') then 0 else 1 end
  limit 1;
$$;

comment on function public.resolve_game_uuid(text) is
  'Löst games.id (UUID) oder legacy platform_game_id (z. B. NPWR…) auf.';

-- ─── 1) Diagnose: noch nicht auflösbare Referenzen ───────────────────────────
create or replace view public.v_orphan_game_refs as
select 'user_watchlist' as source_table, uw.id::text as row_id, uw.game_id as legacy_ref
from public.user_watchlist uw
where public.resolve_game_uuid(uw.game_id) is null
union all
select 'user_earned_trophies', uet.id::text, uet.game_id
from public.user_earned_trophies uet
where public.resolve_game_uuid(uet.game_id) is null
union all
select 'online_trophies_log', otl.id::text, otl.game_id
from public.online_trophies_log otl
where public.resolve_game_uuid(otl.game_id) is null;

-- Optional qa_dashboard (nur wenn Tabelle existiert):
-- select 'qa_dashboard', qd.game_id, qd.game_id from public.qa_dashboard qd
-- where public.resolve_game_uuid(qd.game_id) is null;

-- STOP-Hinweis: Bei Waisen-Einträgen zuerst games.platform_game_id prüfen.
-- select * from public.v_orphan_game_refs;

-- ─── 2) user_watchlist: game_id → UUID (als Text, dann uuid) ─────────────────
update public.user_watchlist uw
set
  game_id = public.resolve_game_uuid(uw.game_id)::text,
  updated_at = greatest(coalesce(uw.updated_at, now()), now())
where public.resolve_game_uuid(uw.game_id) is not null
  and uw.game_id is distinct from public.resolve_game_uuid(uw.game_id)::text;

-- Duplikate nach Merge (gleicher user + gleiches Spiel): höchsten Fortschritt behalten
delete from public.user_watchlist uw
where uw.id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by user_id, game_id
        order by progress_percent desc nulls last,
                 last_played_at desc nulls last,
                 updated_at desc nulls last,
                 id
      ) as rn
    from public.user_watchlist
  ) ranked
  where rn > 1
);

-- ─── 3) user_earned_trophies: game_id → UUID ─────────────────────────────────
update public.user_earned_trophies uet
set game_id = public.resolve_game_uuid(uet.game_id)::text
where public.resolve_game_uuid(uet.game_id) is not null
  and uet.game_id is distinct from public.resolve_game_uuid(uet.game_id)::text;

-- trophy_id: numerische Legacy-IDs auf platform_achievement_id mappen (falls vorhanden)
update public.user_earned_trophies uet
set trophy_id = ga.platform_achievement_id
from public.game_achievements ga
where ga.game_id::text = uet.game_id
  and ga.platform_achievement_id is not null
  and (
    ga.platform_achievement_id = uet.trophy_id
    or ga.platform_achievement_id = ltrim(uet.trophy_id, '0')
    or ga.platform_achievement_id::text = uet.trophy_id::text
  )
  and uet.trophy_id ~ '^[0-9]+$'
  and uet.trophy_id is distinct from ga.platform_achievement_id;

-- Duplikate nach game_id-Migration entfernen
delete from public.user_earned_trophies uet
where uet.id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by user_id, game_id, trophy_id
        order by earned_at desc nulls last, id
      ) as rn
    from public.user_earned_trophies
  ) ranked
  where rn > 1
);

-- ─── 4) online_trophies_log: game_id → UUID ──────────────────────────────────
update public.online_trophies_log otl
set game_id = public.resolve_game_uuid(otl.game_id)::text
where public.resolve_game_uuid(otl.game_id) is not null
  and otl.game_id is distinct from public.resolve_game_uuid(otl.game_id)::text;

-- trophy_id auf platform_achievement_id angleichen (Badge-Lookup im Frontend)
update public.online_trophies_log otl
set trophy_id = ga.platform_achievement_id
from public.game_achievements ga
where ga.game_id::text = otl.game_id
  and ga.platform_achievement_id is not null
  and otl.trophy_id is not null
  and (
    ga.platform_achievement_id = otl.trophy_id
    or ga.platform_achievement_id = ltrim(otl.trophy_id, '0')
  )
  and otl.trophy_id is distinct from ga.platform_achievement_id;

-- ─── 5) qa_dashboard (optional) ──────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'qa_dashboard'
  ) then
    update public.qa_dashboard qd
    set game_id = public.resolve_game_uuid(qd.game_id)::text
    where public.resolve_game_uuid(qd.game_id) is not null
      and qd.game_id is distinct from public.resolve_game_uuid(qd.game_id)::text;
  end if;
end $$;

-- ─── 6) community_reports: source_identifier (Spiel-Kontext) ─────────────────
update public.community_reports cr
set source_identifier = public.resolve_game_uuid(cr.source_identifier)::text
where public.resolve_game_uuid(cr.source_identifier) is not null
  and cr.source_identifier is distinct from public.resolve_game_uuid(cr.source_identifier)::text
  and cr.content_type in ('trophy', 'guide_step', 'item_name', 'boss', 'game');

-- ─── 7) Spaltentyp uuid + Foreign Keys (nur wenn keine Waisen mehr existieren) ─
do $$
declare
  orphan_count bigint;
begin
  select count(*) into orphan_count from public.v_orphan_game_refs;
  if orphan_count > 0 then
    raise notice 'Überspringe FK/UUID-Cast: % verwaiste Referenz(en). Siehe v_orphan_game_refs.', orphan_count;
    return;
  end if;

  -- Nur casten wenn Spalte noch text/varchar ist
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_watchlist'
      and column_name = 'game_id' and data_type in ('text', 'character varying')
  ) then
    alter table public.user_watchlist
      alter column game_id type uuid using game_id::uuid;
  end if;

  alter table public.user_watchlist
    drop constraint if exists user_watchlist_game_id_fkey;

  alter table public.user_watchlist
    add constraint user_watchlist_game_id_fkey
    foreign key (game_id) references public.games (id) on delete cascade;

  -- user_earned_trophies
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_earned_trophies'
      and column_name = 'game_id' and data_type in ('text', 'character varying')
  ) then
    alter table public.user_earned_trophies
      alter column game_id type uuid using game_id::uuid;
  end if;

  alter table public.user_earned_trophies
    drop constraint if exists user_earned_trophies_game_id_fkey;

  alter table public.user_earned_trophies
    add constraint user_earned_trophies_game_id_fkey
    foreign key (game_id) references public.games (id) on delete cascade;

  -- online_trophies_log
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'online_trophies_log'
      and column_name = 'game_id' and data_type in ('text', 'character varying', 'character')
  ) then
    alter table public.online_trophies_log
      alter column game_id type uuid using game_id::uuid;
  end if;

  alter table public.online_trophies_log
    drop constraint if exists online_trophies_log_game_id_fkey;

  alter table public.online_trophies_log
    add constraint online_trophies_log_game_id_fkey
    foreign key (game_id) references public.games (id) on delete cascade;

  raise notice 'FK-Constraints auf games.id gesetzt.';
end $$;

-- ─── 8) Indizes neu setzen ───────────────────────────────────────────────────
drop index if exists public.idx_user_watchlist_game_id;
create index if not exists idx_user_watchlist_game_id on public.user_watchlist (game_id);

drop index if exists public.idx_user_earned_trophies_user_game;
create index if not exists idx_user_earned_trophies_user_game
  on public.user_earned_trophies (user_id, game_id);

drop index if exists public.idx_user_earned_trophies_game_trophy;
create index if not exists idx_user_earned_trophies_game_trophy
  on public.user_earned_trophies (game_id, trophy_id);

drop index if exists public.idx_online_trophies_log_game;
create index if not exists idx_online_trophies_log_game on public.online_trophies_log (game_id);

commit;

-- ─── Verifikation (manuell nach COMMIT) ──────────────────────────────────────
-- select count(*) from public.v_orphan_game_refs;
-- select game_id, count(*) from public.user_watchlist group by 1 having count(*) > 1;
-- select conname from pg_constraint where conname like '%game_id_fkey%';
