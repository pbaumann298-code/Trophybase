-- =============================================================================
-- ScorpioOfShadows: Rest als Quickwin markieren und online stellen
-- Einmal in der Supabase-SQL-Konsole. Zuerst nur die SELECTs.
-- =============================================================================
--
-- Trifft NUR Spiele, deren Guide auf diesen Creator zeigt (game_guides.creator_id).
-- Andere Guides, andere Creator: unangetastet.
--
-- Pro Spiel:
--   spiel_typ     = Quickwin
--   is_indexable  = false   (wie die anderen Quickwins: online, aber noindex)
--   guide_de      = PUBLISHED
--   slug          kommt vom bestehenden Trigger bei der Freigabe
--
-- Schon fertige Zeilen (Quickwin + PUBLISHED + noindex) bleiben liegen.
-- Evergreen/Premium wuerden mit umgeschrieben – deshalb Schritt 2 prüfen.

-- ---------------------------------------------------------------------------
-- 1) Creator finden
-- ---------------------------------------------------------------------------
select
  id,
  channel_name,
  youtube_url
from public.content_creators
where lower(regexp_replace(coalesce(channel_name, ''), '[^a-z0-9]+', '', 'g'))
      like '%scorpioofshadows%';

-- ---------------------------------------------------------------------------
-- 2) Ist-Zustand: alle gemappten Spiele nach Typ / Freigabe
--    Hier sieht man, wie viele schon online sind und was noch fehlt.
-- ---------------------------------------------------------------------------
with scorpio as (
  select c.id
  from public.content_creators c
  where lower(regexp_replace(coalesce(c.channel_name, ''), '[^a-z0-9]+', '', 'g'))
        like '%scorpioofshadows%'
),
mapped as (
  select distinct gg.game_id
  from public.game_guides gg
  join scorpio s on s.id = gg.creator_id
  where gg.game_id is not null
)
select
  count(*) as spiele,
  count(*) filter (where coalesce(g.spiel_typ, '') = 'Quickwin') as schon_quickwin,
  count(*) filter (where coalesce(g.status ->> 'guide_de', '') = 'PUBLISHED') as schon_online,
  count(*) filter (
    where coalesce(g.spiel_typ, '') = 'Quickwin'
      and coalesce(g.status ->> 'guide_de', '') = 'PUBLISHED'
      and g.is_indexable is not distinct from false
  ) as schon_fertig,
  count(*) filter (where coalesce(g.spiel_typ, '') in ('Evergreen', 'Premium')) as evergreen_premium
from public.games g
join mapped m on m.game_id = g.id;

-- Aufschlüsselung
with scorpio as (
  select c.id
  from public.content_creators c
  where lower(regexp_replace(coalesce(c.channel_name, ''), '[^a-z0-9]+', '', 'g'))
        like '%scorpioofshadows%'
),
mapped as (
  select distinct gg.game_id
  from public.game_guides gg
  join scorpio s on s.id = gg.creator_id
  where gg.game_id is not null
)
select
  coalesce(nullif(btrim(g.spiel_typ), ''), '(leer)') as spiel_typ,
  coalesce(g.status ->> 'guide_de', '(kein guide_de)') as guide_de,
  count(*) as anzahl
from public.games g
join mapped m on m.game_id = g.id
group by 1, 2
order by anzahl desc;

-- ---------------------------------------------------------------------------
-- 3) Der Rest (Vorschau, max. 100 Zeilen)
--    Wenn hier Evergreen/Premium auftauchen: STOP, nicht schreiben.
-- ---------------------------------------------------------------------------
with scorpio as (
  select c.id
  from public.content_creators c
  where lower(regexp_replace(coalesce(c.channel_name, ''), '[^a-z0-9]+', '', 'g'))
        like '%scorpioofshadows%'
),
mapped as (
  select distinct gg.game_id
  from public.game_guides gg
  join scorpio s on s.id = gg.creator_id
  where gg.game_id is not null
)
select
  g.id,
  coalesce(g.spieltitel ->> 'de', g.spieltitel ->> 'en') as titel,
  g.hardware,
  g.spiel_typ,
  g.status ->> 'guide_de' as guide_de,
  g.status ->> 'guides' as status_guides,
  g.is_indexable,
  g.slug is not null as hat_slug,
  exists (select 1 from public.game_achievements a where a.game_id = g.id) as hat_troph,
  exists (select 1 from public.game_guides gg where gg.game_id = g.id) as hat_guide
from public.games g
join mapped m on m.game_id = g.id
where not (
  coalesce(g.spiel_typ, '') = 'Quickwin'
  and coalesce(g.status ->> 'guide_de', '') = 'PUBLISHED'
  and g.is_indexable is not distinct from false
)
order by coalesce(g.spieltitel ->> 'de', g.spieltitel ->> 'en')
limit 100;

-- ---------------------------------------------------------------------------
-- 4) Schreiben (nach der Vorschau entkommentieren)
-- ---------------------------------------------------------------------------
-- begin;
--
-- with scorpio as (
--   select c.id
--   from public.content_creators c
--   where lower(regexp_replace(coalesce(c.channel_name, ''), '[^a-z0-9]+', '', 'g'))
--         like '%scorpioofshadows%'
-- ),
-- mapped as (
--   select distinct gg.game_id
--   from public.game_guides gg
--   join scorpio s on s.id = gg.creator_id
--   where gg.game_id is not null
-- )
-- update public.games g
-- set
--   spiel_typ = 'Quickwin',
--   is_indexable = false,
--   status = jsonb_set(
--     coalesce(g.status, '{}'::jsonb),
--     '{guide_de}',
--     '"PUBLISHED"'::jsonb,
--     true
--   )
-- from mapped m
-- where g.id = m.game_id
--   and coalesce(g.spiel_typ, '') not in ('Evergreen', 'Premium')
--   and not (
--     coalesce(g.spiel_typ, '') = 'Quickwin'
--     and coalesce(g.status ->> 'guide_de', '') = 'PUBLISHED'
--     and g.is_indexable is not distinct from false
--   );
--
-- commit;

-- ---------------------------------------------------------------------------
-- 5) Kontrolle
-- ---------------------------------------------------------------------------
-- with scorpio as (
--   select c.id
--   from public.content_creators c
--   where lower(regexp_replace(coalesce(c.channel_name, ''), '[^a-z0-9]+', '', 'g'))
--         like '%scorpioofshadows%'
-- )
-- select
--   count(*) as gemappt,
--   count(*) filter (where g.spiel_typ = 'Quickwin') as quickwin,
--   count(*) filter (where g.status ->> 'guide_de' = 'PUBLISHED') as online,
--   count(*) filter (
--     where g.status ->> 'guide_de' = 'PUBLISHED' and (g.slug is null or btrim(g.slug) = '')
--   ) as online_ohne_slug,
--   count(*) filter (where g.is_indexable is not distinct from false) as noindex
-- from public.games g
-- where exists (
--   select 1
--   from public.game_guides gg
--   join scorpio s on s.id = gg.creator_id
--   where gg.game_id = g.id
-- );
