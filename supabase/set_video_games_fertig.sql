-- =============================================================================
-- HAS_VIDEO / video_url -> guide_de = FERTIG
-- Einmal in der Supabase-SQL-Konsole. Zuerst nur die SELECTs, dann das UPDATE.
-- =============================================================================
--
-- Setzt NICHT auf PUBLISHED. Besucher sehen weiterhin nichts Neues.
-- Admin-Startseite / Suche findet die Spiele danach (FERTIG-Vorschau).
--
-- "Hat Video" = mindestens eines:
--   * status.guides = HAS_VIDEO  (04.3 Creator-Skript)
--   * game_guides.creator_id gesetzt
--   * game_achievements.video_url oder game_guides.video_url nicht leer
--
-- PUBLISHED bleibt unangetastet. Schon FERTIG ebenfalls.

-- ---------------------------------------------------------------------------
-- 1) Vorschau (nur lesen)
-- ---------------------------------------------------------------------------

with video_games as (
  select g.id
  from public.games g
  where coalesce(g.status ->> 'guides', '') = 'HAS_VIDEO'

  union

  select gg.game_id
  from public.game_guides gg
  where gg.creator_id is not null

  union

  select a.game_id
  from public.game_achievements a
  where nullif(btrim(coalesce(a.video_url, '')), '') is not null

  union

  select gg.game_id
  from public.game_guides gg
  where nullif(btrim(coalesce(gg.video_url, '')), '') is not null
)
select
  count(*) as wuerde_fertig,
  count(*) filter (where coalesce(g.spiel_typ, '') = 'Quickwin') as davon_quickwin
from public.games g
join video_games v on v.id = g.id
where coalesce(g.status ->> 'guide_de', '') not in ('FERTIG', 'PUBLISHED');

-- Stichprobe (Titel + bisheriger Status)
with video_games as (
  select g.id
  from public.games g
  where coalesce(g.status ->> 'guides', '') = 'HAS_VIDEO'
  union
  select gg.game_id from public.game_guides gg where gg.creator_id is not null
  union
  select a.game_id
  from public.game_achievements a
  where nullif(btrim(coalesce(a.video_url, '')), '') is not null
  union
  select gg.game_id
  from public.game_guides gg
  where nullif(btrim(coalesce(gg.video_url, '')), '') is not null
)
select
  g.id,
  coalesce(g.spieltitel ->> 'de', g.spieltitel ->> 'en') as titel,
  g.hardware,
  g.spiel_typ,
  g.status ->> 'guides' as status_guides,
  g.status ->> 'guide_de' as status_guide_de
from public.games g
join video_games v on v.id = g.id
where coalesce(g.status ->> 'guide_de', '') not in ('FERTIG', 'PUBLISHED')
order by titel
limit 50;

-- ---------------------------------------------------------------------------
-- 2) Schreiben (nach der Vorschau die naechsten zwei Zeilen entkommentieren)
-- ---------------------------------------------------------------------------

-- begin;
--
-- with video_games as (
--   select g.id
--   from public.games g
--   where coalesce(g.status ->> 'guides', '') = 'HAS_VIDEO'
--   union
--   select gg.game_id from public.game_guides gg where gg.creator_id is not null
--   union
--   select a.game_id
--   from public.game_achievements a
--   where nullif(btrim(coalesce(a.video_url, '')), '') is not null
--   union
--   select gg.game_id
--   from public.game_guides gg
--   where nullif(btrim(coalesce(gg.video_url, '')), '') is not null
-- )
-- update public.games g
-- set status = jsonb_set(
--       coalesce(g.status, '{}'::jsonb),
--       '{guide_de}',
--       '"FERTIG"'::jsonb,
--       true
--     )
-- from video_games v
-- where g.id = v.id
--   and coalesce(g.status ->> 'guide_de', '') not in ('FERTIG', 'PUBLISHED');
--
-- commit;

-- ---------------------------------------------------------------------------
-- 3) Kontrolle
-- ---------------------------------------------------------------------------
-- select
--   count(*) filter (where status ->> 'guide_de' = 'FERTIG') as fertig,
--   count(*) filter (where status ->> 'guide_de' = 'PUBLISHED') as published
-- from public.games;
