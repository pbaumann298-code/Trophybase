-- =============================================================================
-- FIX + „inkl. nur Trophäen“ fuer eingeloggte User (ohne RLS zu vergiften)
-- Einmal in der Supabase-SQL-Konsole ausfuehren.
-- =============================================================================
--
-- WICHTIG: Die frueheren Policies
--   games_select_authenticated / game_achievements_select_authenticated
-- mit `auth.uid() is not null` machen fuer JEDEN Login die ganze games-Tabelle
-- sichtbar. Der Planner verliert den guide_de-Index → Timeouts auf der
-- Startseite. Deshalb zuerst droppen.
--
-- Stattdessen: SECURITY-DEFINER-RPCs nur fuer die Trophäen-Suche / Trophäen-Laden.
-- Anon / Googlebot bleibt bei PUBLISHED.

-- ---------------------------------------------------------------------------
-- 1) Giftige Policies sofort entfernen (Admin wieder online)
-- ---------------------------------------------------------------------------
drop policy if exists games_select_authenticated on public.games;
drop policy if exists game_achievements_select_authenticated on public.game_achievements;

-- ---------------------------------------------------------------------------
-- 2) Suche: Spiele ohne Guide-Statusfilter (nur authentifiziert)
-- ---------------------------------------------------------------------------
create or replace function public.tb_search_games_trophies_only(
  p_words text[],
  p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set statement_timeout = '8s'
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 500));
  v_words text[] := coalesce(p_words, '{}'::text[]);
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if coalesce(cardinality(v_words), 0) = 0 then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(row_to_json(g)::jsonb), '[]'::jsonb)
  into v_result
  from (
    select
      g.id,
      g.platform_game_id,
      g.ecosystem,
      g.hardware,
      g.igdb_id,
      g.release_jahr,
      g.upcoming_date,
      g.entwickler,
      g.publisher,
      g.spiel_typ,
      g.fortschritt,
      g.status,
      g.has_online_trophies,
      g.has_missable_trophies,
      g.total_online_trophies,
      g.total_missable_trophies,
      g.platinum_achievable,
      g.anzahl_trophaeen,
      g.is_sony_fallback,
      g.is_auto_translated,
      g.original_locale,
      g.created_at,
      g.slug,
      g.is_indexable,
      g.home_tags,
      g.spieltitel,
      g.cover_url,
      g.beschreibung,
      g.status_explanation_localized
    from public.games g
    where
      coalesce(g.spiel_typ, '') is distinct from 'Servertot'
      and (
        select bool_and(
          lower(coalesce(g.spieltitel::text, '')) like '%' || lower(w) || '%'
          or lower(coalesce(array_to_string(g.home_tags, ' '), '')) like '%' || lower(w) || '%'
          or lower(coalesce(g.entwickler, '')) like '%' || lower(w) || '%'
          or lower(coalesce(g.publisher, '')) like '%' || lower(w) || '%'
        )
        from unnest(v_words) as w
      )
    order by g.release_jahr desc nulls last, g.created_at desc nulls last
    limit v_limit
  ) g;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

comment on function public.tb_search_games_trophies_only(text[], integer) is
  'Login-Suche ohne PUBLISHED-Filter (Trophäen-Katalog). SECURITY DEFINER, kein RLS-OR.';

revoke all on function public.tb_search_games_trophies_only(text[], integer) from public;
grant execute on function public.tb_search_games_trophies_only(text[], integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Trophäen eines Spiels fuer Login-User (auch ohne PUBLISHED-Guide)
-- ---------------------------------------------------------------------------
create or replace function public.tb_fetch_achievements_for_auth(p_game_id uuid)
returns setof public.game_achievements
language plpgsql
stable
security definer
set search_path = public
set statement_timeout = '8s'
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_game_id is null then
    return;
  end if;

  return query
  select a.*
  from public.game_achievements a
  where a.game_id = p_game_id;
end;
$$;

comment on function public.tb_fetch_achievements_for_auth(uuid) is
  'Trophäenzeilen fuer eingeloggte User, auch ohne PUBLISHED-Guide.';

revoke all on function public.tb_fetch_achievements_for_auth(uuid) from public;
grant execute on function public.tb_fetch_achievements_for_auth(uuid) to authenticated;
