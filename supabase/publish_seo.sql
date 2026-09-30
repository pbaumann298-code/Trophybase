-- Voraussetzung: supabase/games_slug.sql wurde bereits ausgefuehrt
-- (Funktion tb_assign_game_slug muss existieren).

--
-- IST: tb_assign_game_slug laeuft nur bei INSERT/UPDATE von
-- spieltitel, hardware, release_jahr, slug. Die Freigabe schreibt nur
-- status.guide_de = PUBLISHED – der Trigger greift also nicht.
--
-- SOLL: Sobald ein Guide PUBLISHED wird und noch keinen Slug hat, wird er
-- erzeugt. Bestehende Slugs bleiben unveraenderlich.

create or replace function public.tb_ensure_game_slug(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_slug text;
begin
  select nullif(btrim(coalesce(slug, '')), '')
    into current_slug
  from public.games
  where id = p_id;

  if current_slug is not null then
    return current_slug;
  end if;

  -- hardware = hardware loest games_assign_slug aus, ohne Inhalte zu aendern.
  update public.games
  set hardware = hardware
  where id = p_id
    and (slug is null or btrim(slug) = '');

  select slug into current_slug from public.games where id = p_id;
  return current_slug;
end;
$$;

comment on function public.tb_ensure_game_slug(uuid) is
  'Erzeugt games.slug falls leer. Aufruf nach Freigabe (status.guide_de = PUBLISHED).';

revoke all on function public.tb_ensure_game_slug(uuid) from public;
grant execute on function public.tb_ensure_game_slug(uuid) to authenticated;

drop trigger if exists games_assign_slug on public.games;
create trigger games_assign_slug
  before insert or update of spieltitel, hardware, release_jahr, slug, status
  on public.games
  for each row
  execute procedure public.tb_assign_game_slug();
