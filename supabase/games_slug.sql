-- Pretty-URLs: games.slug + Trigger
-- Einmal in der Supabase-SQL-Konsole ausführen, BEVOR das Frontend slug selektiert.
--
-- Eindeutigkeit ist (Konsole, Slug), nicht global UNIQUE:
-- /de/ps4/god-of-war und /de/ps5/god-of-war dürfen denselben Slug teilen.
-- Das Jahr wird nur angehängt, wenn derselbe Titel auf derselben Konsole
-- schon vorkommt (tb_hardware_slug(hardware) + slug).

create or replace function public.tb_slugify(input text)
returns text
language plpgsql
immutable
as $$
declare
  s text;
begin
  if input is null then
    return null;
  end if;

  s := lower(input);
  s := replace(s, 'ä', 'ae');
  s := replace(s, 'ö', 'oe');
  s := replace(s, 'ü', 'ue');
  s := replace(s, 'ß', 'ss');
  s := replace(s, '&', ' und ');
  s := translate(
    s,
    'àáâãåāăąèéêëēėęìíîïīįòóôõøōùúûūųýÿçñ',
    'aaaaaaaaeeeeeeeiiiiiiioooooouuuuuyycn'
  );
  s := replace(s, chr(39), '');
  s := replace(s, chr(96), '');
  s := replace(s, chr(8217), '');
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := regexp_replace(s, '^-+|-+$', '', 'g');
  s := regexp_replace(s, '-{2,}', '-', 'g');
  return nullif(s, '');
end;
$$;

create or replace function public.tb_hardware_slug(hardware text)
returns text
language plpgsql
immutable
as $$
declare
  raw text;
  token text;
  n text;
  best text;
  best_rank int := 0;
  rank int;
begin
  raw := btrim(coalesce(hardware, ''));
  if raw = '' then
    return null;
  end if;

  foreach token in array regexp_split_to_array(raw, '[/+,|&]+')
  loop
    n := lower(btrim(token));
    n := replace(n, 'playstation', 'ps');
    n := regexp_replace(n, '[^a-z0-9]', '', 'g');
    if n = '' then
      continue;
    end if;

    rank := 0;
    if position('vita' in n) > 0 then
      n := 'psvita'; rank := 2;
    elsif position('psp' in n) > 0 then
      n := 'psp'; rank := 1;
    elsif position('ps5' in n) > 0 then
      n := 'ps5'; rank := 5;
    elsif position('ps4' in n) > 0 then
      n := 'ps4'; rank := 4;
    elsif position('ps3' in n) > 0 then
      n := 'ps3'; rank := 3;
    else
      continue;
    end if;

    if rank > best_rank then
      best_rank := rank;
      best := n;
    end if;
  end loop;

  return best;
end;
$$;

create or replace function public.tb_title_for_slug(spieltitel jsonb)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(btrim(spieltitel->>'en'), ''),
    nullif(btrim(spieltitel->>'de'), ''),
    nullif(btrim(spieltitel->>'es'), '')
  );
$$;

alter table public.games
  add column if not exists slug text;

comment on column public.games.slug is
  'Stabiler URL-Slug (en-Titel, Jahr-Suffix nur bei Kollision auf derselben Konsole). Nach dem Setzen nicht überschreiben.';

-- Unique pro Konsole + Slug (nicht global). Partial: Zeilen ohne Pretty-URL bleiben frei.
create unique index if not exists games_hardware_slug_idx
  on public.games (public.tb_hardware_slug(hardware), slug)
  where slug is not null
    and public.tb_hardware_slug(hardware) is not null;

create index if not exists games_slug_lookup_idx
  on public.games (slug)
  where slug is not null;

create or replace function public.tb_assign_game_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hw text;
  base text;
  candidate text;
  clash boolean;
  suffix text;
begin
  -- Bestehende Slugs sind unveränderlich (Titelkorrekturen dürfen URLs nicht kippen).
  if tg_op = 'UPDATE' and old.slug is not null and btrim(old.slug) <> '' then
    new.slug := old.slug;
    return new;
  end if;

  if new.slug is not null and btrim(new.slug) <> '' then
    return new;
  end if;

  hw := public.tb_hardware_slug(new.hardware);
  if hw is null then
    return new;
  end if;

  base := public.tb_slugify(public.tb_title_for_slug(new.spieltitel));
  if base is null then
    return new;
  end if;

  candidate := base;

  select exists (
    select 1
    from public.games g
    where g.id is distinct from new.id
      and g.slug = candidate
      and public.tb_hardware_slug(g.hardware) = hw
  ) into clash;

  if clash then
    if new.release_jahr is not null then
      candidate := base || '-' || new.release_jahr::text;
      select exists (
        select 1
        from public.games g
        where g.id is distinct from new.id
          and g.slug = candidate
          and public.tb_hardware_slug(g.hardware) = hw
      ) into clash;
    end if;
  end if;

  if clash then
    suffix := lower(regexp_replace(coalesce(new.platform_game_id, new.id::text), '[^a-z0-9]+', '-', 'g'));
    suffix := regexp_replace(suffix, '^-+|-+$', '', 'g');
    candidate := base || '-' || suffix;
  end if;

  new.slug := candidate;
  return new;
end;
$$;

drop trigger if exists games_assign_slug on public.games;
create trigger games_assign_slug
  before insert or update of spieltitel, hardware, release_jahr, slug
  on public.games
  for each row
  execute procedure public.tb_assign_game_slug();

-- Einmal-Backfill bestehender Zeilen (Trigger füllt slug, wo noch null).
-- Bei Statement-Timeout in Batches wiederholen, z. B. mit zusätzlichem
--   and id in (select id from public.games where slug is null limit 3000)
update public.games
set hardware = hardware
where slug is null
  and public.tb_hardware_slug(hardware) is not null
  and public.tb_title_for_slug(spieltitel) is not null;

-- Danach in Supabase ggf. API-Schema-Cache neu laden (Settings → API).
