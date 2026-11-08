-- Startseiten-Kacheln lesen games.fsk mit, ohne die Rail-CTEs anzufassen.
-- STABLE statt IMMUTABLE, weil die Freigabe per PK nachgeschlagen wird.
-- Signatur bleibt gleich, bestehende Aufrufe in tb_get_home_rails gelten weiter.

create or replace function public.tb_home_game_payload(
  p_id uuid,
  p_platform_game_id jsonb,
  p_hardware text,
  p_entwickler text,
  p_spiel_typ text,
  p_status jsonb,
  p_slug text,
  p_created_at timestamptz,
  p_views integer,
  p_spieltitel jsonb,
  p_cover_url jsonb,
  p_home_tags text[] default '{}'::text[],
  p_cover_status text default null
)
returns jsonb
language sql
stable
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
    'cover_url', p_cover_url,
    'cover_status', p_cover_status,
    'fsk', (select g.fsk from public.games g where g.id = p_id)
  );
$$;
