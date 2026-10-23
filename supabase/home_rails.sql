-- =============================================================================
-- Startseiten-Reihen in einem Roundtrip (Netflix-Muster, kleiner Katalog)
-- Einmal in der Supabase-SQL-Konsole ausfuehren (als Postgres / SQL-Editor).
-- =============================================================================
--
-- Voraussetzung: Index auf (status->>'guide_<lang>') – siehe games_views.sql /
--   games_pipeline_status.sql. Zuerst home_tags.sql.
-- Optional: games_views.sql (views), games_publisher.sql (publisher).
-- Parallel empfohlen: games_rls_select_split.sql (Anon-Indexfreundliche RLS).
--
-- Performance:
--   - security definer (kein RLS-Doppelcheck im Hot-Path)
--   - nur guide_<locale> = PUBLISHED (oeffentliche Startseite, kein Admin-FERTIG)
--   - Pro Schiene ORDER BY … LIMIT 12, Payload nur fuer diese Zeilen
--
-- Nach dem Ausfuehren: Website hart neu laden (Chrome: Strg+Shift+R).

create or replace function public.tb_home_game_payload(
  p_id uuid,
  p_platform_game_id jsonb,
  p_hardware text,
  p_entwickler text,
  p_home_tags text[],
  p_spiel_typ text,
  p_status jsonb,
  p_slug text,
  p_created_at timestamptz,
  p_views integer,
  p_spieltitel jsonb,
  p_cover_url jsonb
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', p_id,
    'platform_game_id', p_platform_game_id,
    'hardware', p_hardware,
    'entwickler', p_entwickler,
    'home_tags', coalesce(p_home_tags, '{}'::text[]),
    'spiel_typ', p_spiel_typ,
    'status', p_status,
    'slug', p_slug,
    'created_at', p_created_at,
    'views', coalesce(p_views, 0),
    'spieltitel', p_spieltitel,
    'cover_url', p_cover_url
  );
$$;

comment on function public.tb_home_game_payload(
  uuid, jsonb, text, text, text[], text, jsonb, text, timestamptz, integer, jsonb, jsonb
) is
  'Schlankes games-JSON fuer Startseiten-Kacheln (ohne beschreibung).';

revoke all on function public.tb_home_game_payload(
  uuid, jsonb, text, text, text[], text, jsonb, text, timestamptz, integer, jsonb, jsonb
) from public;
grant execute on function public.tb_home_game_payload(
  uuid, jsonb, text, text, text[], text, jsonb, text, timestamptz, integer, jsonb, jsonb
) to anon, authenticated;

-- Alte Signatur ohne Locale entfernen (sonst bleibt die Overload-Variante stehen).
drop function if exists public.tb_get_home_rails();

create or replace function public.tb_get_home_rails(p_locale text default 'de')
returns table (
  rail_id text,
  sort_pos integer,
  game jsonb
)
language sql
stable
security definer
set search_path = public
set statement_timeout = '8s'
as $$
  with params as (
    select lower(coalesce(nullif(trim(p_locale), ''), 'de')) as lang
  ),
  rail_beliebt as (
    select
      'beliebt'::text as rail_id,
      row_number() over (order by g.views desc, g.created_at desc nulls last)::integer as sort_pos,
      public.tb_home_game_payload(
        g.id, g.platform_game_id, g.hardware, g.entwickler, g.home_tags, g.spiel_typ,
        g.status, g.slug, g.created_at, coalesce(g.views, 0), g.spieltitel, g.cover_url
      ) as game
    from public.games g, params p
    where
      g.status ->> ('guide_' || p.lang) = 'PUBLISHED'
      and g.spiel_typ in ('Evergreen', 'Premium')
    order by g.views desc, g.created_at desc nulls last
    limit 12
  ),
  rail_neu as (
    select
      'neu'::text as rail_id,
      row_number() over (order by g.created_at desc nulls last, g.views desc)::integer as sort_pos,
      public.tb_home_game_payload(
        g.id, g.platform_game_id, g.hardware, g.entwickler, g.home_tags, g.spiel_typ,
        g.status, g.slug, g.created_at, coalesce(g.views, 0), g.spieltitel, g.cover_url
      ) as game
    from public.games g, params p
    where
      g.status ->> ('guide_' || p.lang) = 'PUBLISHED'
      and g.spiel_typ in ('Evergreen', 'Premium')
    order by g.created_at desc nulls last, g.views desc
    limit 12
  ),
  rail_souls as (
    select
      'souls'::text as rail_id,
      row_number() over (order by g.created_at desc nulls last, g.views desc)::integer as sort_pos,
      public.tb_home_game_payload(
        g.id, g.platform_game_id, g.hardware, g.entwickler, g.home_tags, g.spiel_typ,
        g.status, g.slug, g.created_at, coalesce(g.views, 0), g.spieltitel, g.cover_url
      ) as game
    from public.games g, params p
    where
      g.status ->> ('guide_' || p.lang) = 'PUBLISHED'
      and coalesce(g.spiel_typ, '') not in ('Quickwin', 'easy_platin', 'Servertot')
      and (
        'soulslike' = any(coalesce(g.home_tags, '{}'::text[]))
        or lower(coalesce(g.entwickler, '')) like '%fromsoftware%'
        or lower(coalesce(g.publisher, '')) like '%fromsoftware%'
      )
    order by g.created_at desc nulls last, g.views desc
    limit 12
  ),
  rail_capcom as (
    select
      'capcom'::text as rail_id,
      row_number() over (order by g.created_at desc nulls last, g.views desc)::integer as sort_pos,
      public.tb_home_game_payload(
        g.id, g.platform_game_id, g.hardware, g.entwickler, g.home_tags, g.spiel_typ,
        g.status, g.slug, g.created_at, coalesce(g.views, 0), g.spieltitel, g.cover_url
      ) as game
    from public.games g, params p
    where
      g.status ->> ('guide_' || p.lang) = 'PUBLISHED'
      and coalesce(g.spiel_typ, '') not in ('Quickwin', 'easy_platin', 'Servertot')
      and (
        lower(coalesce(g.entwickler, '')) like '%capcom%'
        or lower(coalesce(g.publisher, '')) like '%capcom%'
      )
    order by g.created_at desc nulls last, g.views desc
    limit 12
  ),
  rail_openworld as (
    select
      'openworld'::text as rail_id,
      row_number() over (order by g.created_at desc nulls last, g.views desc)::integer as sort_pos,
      public.tb_home_game_payload(
        g.id, g.platform_game_id, g.hardware, g.entwickler, g.home_tags, g.spiel_typ,
        g.status, g.slug, g.created_at, coalesce(g.views, 0), g.spieltitel, g.cover_url
      ) as game
    from public.games g, params p
    where
      g.status ->> ('guide_' || p.lang) = 'PUBLISHED'
      and coalesce(g.spiel_typ, '') not in ('Quickwin', 'easy_platin', 'Servertot')
      and 'open_world' = any(coalesce(g.home_tags, '{}'::text[]))
    order by g.created_at desc nulls last, g.views desc
    limit 12
  ),
  rail_ubisoft as (
    select
      'ubisoft'::text as rail_id,
      row_number() over (order by g.created_at desc nulls last, g.views desc)::integer as sort_pos,
      public.tb_home_game_payload(
        g.id, g.platform_game_id, g.hardware, g.entwickler, g.home_tags, g.spiel_typ,
        g.status, g.slug, g.created_at, coalesce(g.views, 0), g.spieltitel, g.cover_url
      ) as game
    from public.games g, params p
    where
      g.status ->> ('guide_' || p.lang) = 'PUBLISHED'
      and coalesce(g.spiel_typ, '') not in ('Quickwin', 'easy_platin', 'Servertot')
      and (
        lower(coalesce(g.entwickler, '')) like '%ubisoft%'
        or lower(coalesce(g.publisher, '')) like '%ubisoft%'
      )
    order by g.created_at desc nulls last, g.views desc
    limit 12
  ),
  rail_rockstar as (
    select
      'rockstar'::text as rail_id,
      row_number() over (order by g.created_at desc nulls last, g.views desc)::integer as sort_pos,
      public.tb_home_game_payload(
        g.id, g.platform_game_id, g.hardware, g.entwickler, g.home_tags, g.spiel_typ,
        g.status, g.slug, g.created_at, coalesce(g.views, 0), g.spieltitel, g.cover_url
      ) as game
    from public.games g, params p
    where
      g.status ->> ('guide_' || p.lang) = 'PUBLISHED'
      and coalesce(g.spiel_typ, '') not in ('Quickwin', 'easy_platin', 'Servertot')
      and (
        lower(coalesce(g.entwickler, '')) like '%rockstar%'
        or lower(coalesce(g.publisher, '')) like '%rockstar%'
      )
    order by g.created_at desc nulls last, g.views desc
    limit 12
  ),
  rail_family as (
    select
      'family'::text as rail_id,
      row_number() over (order by g.created_at desc nulls last, g.views desc)::integer as sort_pos,
      public.tb_home_game_payload(
        g.id, g.platform_game_id, g.hardware, g.entwickler, g.home_tags, g.spiel_typ,
        g.status, g.slug, g.created_at, coalesce(g.views, 0), g.spieltitel, g.cover_url
      ) as game
    from public.games g, params p
    where
      g.status ->> ('guide_' || p.lang) = 'PUBLISHED'
      and coalesce(g.spiel_typ, '') not in ('Quickwin', 'easy_platin', 'Servertot')
      and 'family' = any(coalesce(g.home_tags, '{}'::text[]))
    order by g.created_at desc nulls last, g.views desc
    limit 12
  ),
  rail_indie as (
    select
      'indie'::text as rail_id,
      row_number() over (order by g.created_at desc nulls last, g.views desc)::integer as sort_pos,
      public.tb_home_game_payload(
        g.id, g.platform_game_id, g.hardware, g.entwickler, g.home_tags, g.spiel_typ,
        g.status, g.slug, g.created_at, coalesce(g.views, 0), g.spieltitel, g.cover_url
      ) as game
    from public.games g, params p
    where
      g.status ->> ('guide_' || p.lang) = 'PUBLISHED'
      and coalesce(g.spiel_typ, '') not in ('Quickwin', 'easy_platin', 'Servertot')
      and 'indie' = any(coalesce(g.home_tags, '{}'::text[]))
    order by g.created_at desc nulls last, g.views desc
    limit 12
  ),
  rail_racing as (
    select
      'racing'::text as rail_id,
      row_number() over (order by g.created_at desc nulls last, g.views desc)::integer as sort_pos,
      public.tb_home_game_payload(
        g.id, g.platform_game_id, g.hardware, g.entwickler, g.home_tags, g.spiel_typ,
        g.status, g.slug, g.created_at, coalesce(g.views, 0), g.spieltitel, g.cover_url
      ) as game
    from public.games g, params p
    where
      g.status ->> ('guide_' || p.lang) = 'PUBLISHED'
      and coalesce(g.spiel_typ, '') not in ('Quickwin', 'easy_platin', 'Servertot')
      and 'racing' = any(coalesce(g.home_tags, '{}'::text[]))
    order by g.created_at desc nulls last, g.views desc
    limit 12
  ),
  rail_godofwar as (
    select
      'godofwar'::text as rail_id,
      row_number() over (order by g.created_at desc nulls last, g.views desc)::integer as sort_pos,
      public.tb_home_game_payload(
        g.id, g.platform_game_id, g.hardware, g.entwickler, g.home_tags, g.spiel_typ,
        g.status, g.slug, g.created_at, coalesce(g.views, 0), g.spieltitel, g.cover_url
      ) as game
    from public.games g, params p
    where
      g.status ->> ('guide_' || p.lang) = 'PUBLISHED'
      and coalesce(g.spiel_typ, '') not in ('Quickwin', 'easy_platin', 'Servertot')
      and lower(coalesce(g.spieltitel::text, '')) like '%god of war%'
    order by g.created_at desc nulls last, g.views desc
    limit 12
  ),
  rail_tombraider as (
    select
      'tombraider'::text as rail_id,
      row_number() over (order by g.created_at desc nulls last, g.views desc)::integer as sort_pos,
      public.tb_home_game_payload(
        g.id, g.platform_game_id, g.hardware, g.entwickler, g.home_tags, g.spiel_typ,
        g.status, g.slug, g.created_at, coalesce(g.views, 0), g.spieltitel, g.cover_url
      ) as game
    from public.games g, params p
    where
      g.status ->> ('guide_' || p.lang) = 'PUBLISHED'
      and coalesce(g.spiel_typ, '') not in ('Quickwin', 'easy_platin', 'Servertot')
      and (
        lower(coalesce(g.spieltitel::text, '')) like '%tomb raider%'
        or lower(coalesce(g.spieltitel::text, '')) like '%lara croft%'
      )
    order by g.created_at desc nulls last, g.views desc
    limit 12
  )
  select * from rail_beliebt
  union all select * from rail_neu
  union all select * from rail_souls
  union all select * from rail_capcom
  union all select * from rail_openworld
  union all select * from rail_ubisoft
  union all select * from rail_rockstar
  union all select * from rail_family
  union all select * from rail_indie
  union all select * from rail_racing
  union all select * from rail_godofwar
  union all select * from rail_tombraider
  order by 1, 2;
$$;

comment on function public.tb_get_home_rails(text) is
  'Startseiten-Reihen, je max. 12, nur guide_<p_locale>=PUBLISHED; ohne Quickwin/easy_platin/Servertot.';

revoke all on function public.tb_get_home_rails(text) from public;
grant execute on function public.tb_get_home_rails(text) to anon, authenticated;
