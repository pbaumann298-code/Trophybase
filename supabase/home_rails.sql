-- =============================================================================
-- Startseiten-Reihen in einem Roundtrip (Netflix-Muster, kleiner Katalog)
-- Einmal in der Supabase-SQL-Konsole ausfuehren (als Postgres / SQL-Editor).
-- =============================================================================
--
-- Voraussetzung: supabase/rls_production.sql (tb_is_admin).
-- Zuerst supabase/home_tags.sql (games.home_tags + Allowlist).
-- Optional: supabase/games_views.sql (Spalte views, sonst 0).
--
-- IST: Die SPA feuert ~60 ilike-Suchen gegen games. Als Admin sieht Postgres
--      den ganzen Katalog, als Besucher nur PUBLISHED – beides ist unnoetig
--      viele Roundtrips nach Frankfurt.
--
-- SOLL: Eine Funktion liefert alle Reihen auf einmal. Zuerst nur
--      PUBLISHED (bzw. FERTIG+PUBLISHED fuer Admins), danach Sortierung in
--      die Rails. Neue Freigaben und Aufrufe sind beim naechsten Laden da.
--      Keine Snapshot-Tabelle – bei wenigen hundert sichtbaren Guides reicht
--      Live-SQL, Netflix cached dasselbe nur wegen Millionen Titeln.
--
-- Nach dem Ausfuehren: Website hart neu laden. Ohne diese Funktion bleibt
-- die alte Mehrfach-Suche als Fallback aktiv.

create or replace function public.tb_home_game_payload(
  p_id uuid,
  p_platform_game_id jsonb,
  p_hardware text,
  p_entwickler text,
  p_genre text,
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
    'genre', p_genre,
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
  uuid, jsonb, text, text, text, text, jsonb, text, timestamptz, integer, jsonb, jsonb
) is
  'Schlankes games-JSON fuer Startseiten-Kacheln (ohne beschreibung).';

revoke all on function public.tb_home_game_payload(
  uuid, jsonb, text, text, text, text, jsonb, text, timestamptz, integer, jsonb, jsonb
) from public;
grant execute on function public.tb_home_game_payload(
  uuid, jsonb, text, text, text, text, jsonb, text, timestamptz, integer, jsonb, jsonb
) to anon, authenticated;

create or replace function public.tb_get_home_rails()
returns table (
  rail_id text,
  sort_pos integer,
  game jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  with catalog as (
    select
      g.id,
      g.platform_game_id,
      g.hardware,
      g.entwickler,
      g.genre,
      g.spiel_typ,
      g.status,
      g.slug,
      g.created_at,
      coalesce(nullif(to_jsonb(g) ->> 'views', '')::integer, 0) as views,
      coalesce(g.home_tags, '{}'::text[]) as home_tags,
      g.spieltitel,
      g.cover_url,
      (g.spiel_typ in ('Evergreen', 'Premium')) as featured,
      lower(coalesce(g.entwickler, '')) as entwickler_l,
      lower(coalesce(g.genre, '')) as genre_l,
      (
        select lower(string_agg(e.value, ' '))
        from jsonb_each_text(coalesce(g.spieltitel, '{}'::jsonb)) e
      ) as titles
    from public.games g
    where
      (g.status ->> 'guide_de') = 'PUBLISHED'
      or (
        public.tb_is_admin()
        and (g.status ->> 'guide_de') = 'FERTIG'
      )
  ),
  scored as (
    select
      c.*,
      public.tb_home_game_payload(
        c.id,
        c.platform_game_id,
        c.hardware,
        c.entwickler,
        c.genre,
        c.spiel_typ,
        c.status,
        c.slug,
        c.created_at,
        c.views,
        c.spieltitel,
        c.cover_url
      ) as payload,
      -- Themenreihen: Tag gewinnt, solange home_tags leer sind gilt der alte ilike.
      (
        'soulslike' = any(c.home_tags)
        or (
          cardinality(c.home_tags) = 0
          and (
            c.genre_l like '%soulslike%'
            or c.genre_l like '%souls%'
            or c.entwickler_l like '%fromsoftware%'
            or c.titles like '%elden ring%'
            or c.titles like '%dark souls%'
            or c.titles like '%sekiro%'
            or c.titles like '%bloodborne%'
            or c.titles like '%wuchang%'
            or c.titles like '%lies of p%'
            or c.titles like '%nioh%'
          )
        )
      ) as rail_souls,
      (
        'open_world' = any(c.home_tags)
        or (
          cardinality(c.home_tags) = 0
          and (
            c.genre_l like '%open world%'
            or c.genre_l like '%open-world%'
            or c.titles like '%open world%'
          )
        )
      ) as rail_openworld,
      (
        c.entwickler_l like '%ubisoft%'
        or c.titles like '%assassin%'
        or c.titles like '%far cry%'
        or c.titles like '%watch dogs%'
        or c.titles like '%ghost recon%'
        or c.titles like '%rainbow six%'
      ) as rail_ubisoft,
      (
        c.entwickler_l like '%rockstar%'
        or c.titles like '%grand theft auto%'
        or c.titles like '%gta%'
        or c.titles like '%red dead%'
        or c.titles like '%bully%'
        or c.titles like '%max payne%'
      ) as rail_rockstar,
      (
        'family' = any(c.home_tags)
        or (
          cardinality(c.home_tags) = 0
          and (
            c.genre_l like '%familie%'
            or c.genre_l like '%kinder%'
            or c.genre_l like '%party%'
            or c.titles like '%astro bot%'
            or c.titles like '%spongebob%'
            or c.titles like '%lego%'
            or c.titles like '%sackboy%'
            or c.titles like '%ratchet%'
            or c.titles like '%littlebigplanet%'
            or c.titles like '%crash bandicoot%'
            or c.titles like '%disney%'
          )
        )
      ) as rail_family,
      (
        'indie' = any(c.home_tags)
        or (
          cardinality(c.home_tags) = 0
          and (
            c.genre_l like '%indie%'
            or c.titles like '%hollow knight%'
            or c.titles like '%hades%'
            or c.titles like '%stray%'
            or c.titles like '%celeste%'
            or c.titles like '%stardew%'
            or c.titles like '%cuphead%'
            or c.titles like '%ori%'
            or c.titles like '%shovel knight%'
            or c.titles like '%dead cells%'
          )
        )
      ) as rail_indie,
      (
        'racing' = any(c.home_tags)
        or (
          cardinality(c.home_tags) = 0
          and (
            c.genre_l like '%renn%'
            or c.genre_l like '%racing%'
            or c.genre_l like '%sport%'
            or c.titles like '%gran turismo%'
            or c.titles like '%need for speed%'
            or c.titles like '%f1%'
            or c.titles like '%dirt%'
            or c.titles like '%wrc%'
            or c.titles like '%asphalt%'
            or c.titles like '%burnout%'
            or c.titles like '%driveclub%'
          )
        )
      ) as rail_racing,
      (c.titles like '%god of war%') as rail_godofwar,
      (
        c.titles like '%tomb raider%'
        or c.titles like '%lara croft%'
      ) as rail_tombraider
    from catalog c
  ),
  exploded as (
    select 'beliebt'::text as rail_id, s.views, s.created_at, s.payload
    from scored s
    where s.featured
    union all
    select 'neu', s.views, s.created_at, s.payload
    from scored s
    where s.featured
    union all
    select 'souls', s.views, s.created_at, s.payload
    from scored s
    where s.rail_souls
    union all
    select 'openworld', s.views, s.created_at, s.payload
    from scored s
    where s.rail_openworld
    union all
    select 'ubisoft', s.views, s.created_at, s.payload
    from scored s
    where s.rail_ubisoft
    union all
    select 'rockstar', s.views, s.created_at, s.payload
    from scored s
    where s.rail_rockstar
    union all
    select 'family', s.views, s.created_at, s.payload
    from scored s
    where s.rail_family
    union all
    select 'indie', s.views, s.created_at, s.payload
    from scored s
    where s.rail_indie
    union all
    select 'racing', s.views, s.created_at, s.payload
    from scored s
    where s.rail_racing
    union all
    select 'godofwar', s.views, s.created_at, s.payload
    from scored s
    where s.rail_godofwar
    union all
    select 'tombraider', s.views, s.created_at, s.payload
    from scored s
    where s.rail_tombraider
  ),
  ranked as (
    select
      e.rail_id,
      e.payload,
      row_number() over (
        partition by e.rail_id
        order by
          case when e.rail_id = 'beliebt' then e.views else 0 end desc,
          e.created_at desc nulls last,
          e.views desc
      ) as pos
    from exploded e
  )
  select r.rail_id, r.pos::integer, r.payload
  from ranked r
  where r.pos <= 12
  order by r.rail_id, r.pos;
$$;

comment on function public.tb_get_home_rails() is
  'Alle Startseiten-Reihen in einem Call. Admin (JWT) sieht FERTIG+PUBLISHED.';

revoke all on function public.tb_get_home_rails() from public;
grant execute on function public.tb_get_home_rails() to anon, authenticated;
