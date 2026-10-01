-- =============================================================================
-- Startseiten-Tags (Allowlist + Override)
-- Einmal in der Supabase-SQL-Konsole ausfuehren, DANN home_rails.sql neu.
-- =============================================================================
--
-- games.genre bleibt Rohtext (Suche / aehnliche Spiele).
-- games.spiel_typ bleibt Quickwin / Evergreen / Premium.
-- games.home_tags ist die kuratierte Stimmung fuer Themenreihen.
--
-- Lokales Modell: nur Slugs aus home_tag_defs, 0-3 Stueck, via
--   select public.tb_set_home_tags_from_model('<uuid>', array['soulslike','open_world']);
-- Gesperrte Zeilen (home_tags_locked) ruehrt das Modell nicht an.
-- Redaktion: tb_set_home_tags_editorial(..., true) setzt Tags und sperrt.

create table if not exists public.home_tag_defs (
  slug text primary key,
  rail_id text,
  label text not null,
  sort_pos integer not null default 0
);

comment on table public.home_tag_defs is
  'Allowlist fuer games.home_tags. rail_id leer = Tag ohne eigene Startseiten-Reihe.';

insert into public.home_tag_defs (slug, rail_id, label, sort_pos) values
  ('soulslike', 'souls', 'Soulslike', 10),
  ('open_world', 'openworld', 'Open World', 20),
  ('family', 'family', 'Familie', 30),
  ('indie', 'indie', 'Indie', 40),
  ('racing', 'racing', 'Rennen', 50)
on conflict (slug) do update
set
  rail_id = excluded.rail_id,
  label = excluded.label,
  sort_pos = excluded.sort_pos;

alter table public.games
  add column if not exists home_tags text[] not null default '{}';

alter table public.games
  add column if not exists home_tags_locked boolean not null default false;

comment on column public.games.home_tags is
  'Stimmungstags aus der Allowlist home_tag_defs. Mehrere Werte erlaubt.';

comment on column public.games.home_tags_locked is
  'true = Redaktion hat Vorrang, lokales Modell darf nicht ueberschreiben.';

create index if not exists games_home_tags_gin
  on public.games using gin (home_tags);

create or replace function public.tb_normalize_home_tags(p_tags text[])
returns text[]
language sql
immutable
as $$
  select coalesce(
    (
      select array_agg(slug order by slug)
      from (
        select distinct lower(btrim(t)) as slug
        from unnest(coalesce(p_tags, '{}'::text[])) as t
        where btrim(coalesce(t, '')) <> ''
      ) s
    ),
    '{}'::text[]
  );
$$;

create or replace function public.tb_home_tags_allowed(p_tags text[])
returns boolean
language sql
stable
set search_path = public
as $$
  select public.tb_normalize_home_tags(p_tags) <@ coalesce(
    (select array_agg(slug) from public.home_tag_defs),
    '{}'::text[]
  );
$$;

create or replace function public.tb_games_home_tags_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.home_tags := public.tb_normalize_home_tags(new.home_tags);
  if not public.tb_home_tags_allowed(new.home_tags) then
    raise exception 'home_tags enthaelt Werte ausserhalb von home_tag_defs';
  end if;
  new.home_tags_locked := coalesce(new.home_tags_locked, false);
  return new;
end;
$$;

drop trigger if exists games_home_tags_guard on public.games;
create trigger games_home_tags_guard
  before insert or update of home_tags, home_tags_locked
  on public.games
  for each row
  execute procedure public.tb_games_home_tags_guard();

-- Modell / Pipeline: schreibt nur, wenn nicht gesperrt. Rueckgabe false = skip.
create or replace function public.tb_set_home_tags_from_model(p_id uuid, p_tags text[])
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  locked boolean;
begin
  if p_id is null then
    return false;
  end if;

  select g.home_tags_locked into locked
  from public.games g
  where g.id = p_id;

  if not found then
    return false;
  end if;
  if locked then
    return false;
  end if;

  update public.games
  set home_tags = public.tb_normalize_home_tags(p_tags)
  where id = p_id;

  return true;
end;
$$;

comment on function public.tb_set_home_tags_from_model(uuid, text[]) is
  'Lokales Modell: Tags setzen, ausser home_tags_locked. Kein anon-Zugriff.';

revoke all on function public.tb_set_home_tags_from_model(uuid, text[]) from public;

-- Redaktion (Admin-JWT): setzt Tags und sperrt standardmaessig.
create or replace function public.tb_set_home_tags_editorial(
  p_id uuid,
  p_tags text[],
  p_lock boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_id is null then
    return false;
  end if;
  if not public.tb_is_admin() then
    raise exception 'Nur Admins duerfen home_tags redaktionell setzen';
  end if;

  update public.games
  set
    home_tags = public.tb_normalize_home_tags(p_tags),
    home_tags_locked = coalesce(p_lock, true)
  where id = p_id;

  return found;
end;
$$;

comment on function public.tb_set_home_tags_editorial(uuid, text[], boolean) is
  'Admin: Tags setzen und in der Regel sperren.';

revoke all on function public.tb_set_home_tags_editorial(uuid, text[], boolean) from public;
grant execute on function public.tb_set_home_tags_editorial(uuid, text[], boolean)
  to authenticated;

alter table public.home_tag_defs enable row level security;

drop policy if exists home_tag_defs_select on public.home_tag_defs;
create policy home_tag_defs_select
  on public.home_tag_defs
  for select
  to anon, authenticated
  using (true);

drop policy if exists home_tag_defs_admin_write on public.home_tag_defs;
create policy home_tag_defs_admin_write
  on public.home_tag_defs
  for all
  to authenticated
  using (public.tb_is_admin())
  with check (public.tb_is_admin());

grant select on public.home_tag_defs to anon, authenticated;
