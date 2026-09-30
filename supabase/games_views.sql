-- Startseite: games.views + atomares Hochzaehlen
--
-- Einmal in der Supabase-SQL-Konsole ausfuehren.
--
-- Beliebt sortiert nach dieser Spalte. Jeder Aufruf einer Guide-Seite ruft
-- increment_game_views auf (einmal pro Browser-Tab-Session). Werte koennen
-- zusaetzlich redaktionell gesetzt werden, um Titel nach vorn zu schieben.
--
-- Die Website bleibt ohne diese Migration lauffaehig: Beliebt faellt dann
-- auf created_at zurueck, das Hochzaehlen scheitert still.

alter table public.games
  add column if not exists views integer not null default 0;

comment on column public.games.views is
  'Aufrufe der Guide-Seite. Startseiten-Reihe Beliebt sortiert danach.';

create index if not exists games_spiel_typ_idx
  on public.games (spiel_typ);

create index if not exists games_views_desc_idx
  on public.games (views desc);

create index if not exists games_guide_de_idx
  on public.games ((status ->> 'guide_de'));

create or replace function public.increment_game_views(game_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if game_uuid is null then
    return;
  end if;
  update public.games
  set views = coalesce(views, 0) + 1
  where id = game_uuid;
end;
$$;

comment on function public.increment_game_views(uuid) is
  'Zaehlt games.views um 1 hoch. Fuer anon/authenticated, ohne beliebige Updates.';

revoke all on function public.increment_game_views(uuid) from public;
grant execute on function public.increment_game_views(uuid) to anon, authenticated;
