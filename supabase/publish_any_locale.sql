-- Freigabe gilt pro Sprache (status.guide_de, status.guide_en, …).
-- Einmal im Supabase-SQL-Editor ausführen.
-- Danach supabase/home_rails.sql erneut ausführen, sonst bleiben
-- englisch-only Guides von den Startseiten-Reihen ausgeschlossen.
--
-- Ohne dieses Skript sieht die öffentliche Rolle (anon) nur guide_de = PUBLISHED.
-- Sitemap, Suche und die Spielseite können einen rein englischen Guide dann nicht lesen.

create or replace function public.tb_status_has_published_guide(p_status jsonb)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from jsonb_each_text(coalesce(p_status, '{}'::jsonb)) e
    where starts_with(e.key, 'guide_')
      and upper(e.value) = 'PUBLISHED'
  );
$$;

create or replace function public.tb_game_is_published(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.tb_status_has_published_guide(
    (select g.status from public.games g where g.id = p_game_id)
  );
$$;

drop policy if exists games_select on public.games;
create policy games_select
  on public.games
  for select
  to anon, authenticated
  using (
    public.tb_is_admin()
    or public.tb_status_has_published_guide(status)
  );

create or replace function public.tb_slug_on_publish()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.slug is not null and btrim(new.slug) <> '' then
    return new;
  end if;

  if not public.tb_status_has_published_guide(new.status) then
    return new;
  end if;

  new.slug := public.tb_next_game_slug(new);
  return new;
end;
$$;
