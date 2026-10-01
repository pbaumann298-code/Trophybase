-- =============================================================================
-- DLC-Spiele erneut crawlen: status.trophies (PROCESSED) entfernen
-- Einmal in der Supabase-SQL-Konsole, NACH game_achievements_spielname.sql.
-- =============================================================================
--
-- Der Crawler nimmt nur Spiele, bei denen status.trophies fehlt oder
-- NO_TROPHIES ist. PROCESSED loeschen reicht, WENN der Crawler bestehende
-- Achievements nicht mehr ueberspringt (01.2_trophy_crawler_i18n.py).
--
-- Betrifft nur Spiele, die mindestens eine Trophäe ausserhalb von
-- default/all haben. guide_de / PUBLISHED bleiben unangetastet.
--
-- Zuerst die SELECTs, dann den UPDATE-Block entkommentieren.

-- ---------------------------------------------------------------------------
-- 1) Vorschau
-- ---------------------------------------------------------------------------

select
  count(distinct g.id) as spiele_mit_dlc_processed,
  count(distinct a.trophy_gruppe) as verschiedene_gruppen
from public.games g
join public.game_achievements a on a.game_id = g.id
where coalesce(g.status ->> 'trophies', '') = 'PROCESSED'
  and lower(coalesce(nullif(btrim(a.trophy_gruppe), ''), 'default'))
      not in ('default', 'all');

select
  g.id,
  coalesce(g.spieltitel ->> 'de', g.spieltitel ->> 'en') as titel,
  g.hardware,
  g.status ->> 'trophies' as trophies,
  g.status ->> 'guide_de' as guide_de,
  count(*) filter (
    where lower(coalesce(nullif(btrim(a.trophy_gruppe), ''), 'default'))
          not in ('default', 'all')
  ) as dlc_trophaeen
from public.games g
join public.game_achievements a on a.game_id = g.id
where coalesce(g.status ->> 'trophies', '') = 'PROCESSED'
  and exists (
    select 1
    from public.game_achievements x
    where x.game_id = g.id
      and lower(coalesce(nullif(btrim(x.trophy_gruppe), ''), 'default'))
          not in ('default', 'all')
  )
group by g.id, g.spieltitel, g.hardware, g.status
order by titel
limit 40;

-- ---------------------------------------------------------------------------
-- 2) Schreiben (nach der Vorschau entkommentieren)
-- ---------------------------------------------------------------------------

-- begin;
--
-- update public.games g
-- set status = coalesce(g.status, '{}'::jsonb) - 'trophies'
-- where coalesce(g.status ->> 'trophies', '') = 'PROCESSED'
--   and exists (
--     select 1
--     from public.game_achievements a
--     where a.game_id = g.id
--       and lower(coalesce(nullif(btrim(a.trophy_gruppe), ''), 'default'))
--           not in ('default', 'all')
--   );
--
-- commit;

-- ---------------------------------------------------------------------------
-- 3) Kontrolle: diese Zahl muss der Crawler abarbeiten
-- ---------------------------------------------------------------------------
-- select count(*) as offen
-- from public.games
-- where status is null
--    or status ->> 'trophies' is null
--    or status ->> 'trophies' = 'NO_TROPHIES';
