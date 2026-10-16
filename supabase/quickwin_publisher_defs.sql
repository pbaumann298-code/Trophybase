-- =============================================================================
-- Quickwin-Publisher-Allowlist
-- Einmal in der Supabase-SQL-Konsole ausfuehren.
--
-- Besucher sehen spaeter nur Publisher mit published = true.
-- Admins sehen weiterhin alle Quickwins.
--
-- Seed: Publisher/Entwickler mit mindestens 30 Quickwin-Spielen.
-- Gleiche Schreibweise (Smobile / SMobile) wird ueber match_key zusammengelegt.
-- Anzeigename = haeufigste Originalschreibweise. Freigabe = true.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tabelle
-- ---------------------------------------------------------------------------
create table if not exists public.quickwin_publisher_defs (
  match_key text primary key,
  publisher text not null,
  published boolean not null default false,
  sort_pos integer not null default 0,
  seed_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.quickwin_publisher_defs is
  'Allowlist fuer die oeffentliche Quickwins-Seite. Nur published = true ist fuer Besucher sichtbar.';

comment on column public.quickwin_publisher_defs.match_key is
  'Normalisierter Vergleichsschluessel (Kleinbuchstaben, nur a-z0-9).';

comment on column public.quickwin_publisher_defs.publisher is
  'Anzeigename in der Quickwins-Liste.';

comment on column public.quickwin_publisher_defs.published is
  'true = fuer Besucher freigegeben. false = nur Admin-Ansicht.';

comment on column public.quickwin_publisher_defs.seed_count is
  'Spielanzahl beim letzten Seed (nur Info, steuert die Freigabe nicht).';

create index if not exists quickwin_publisher_defs_published_idx
  on public.quickwin_publisher_defs (published, sort_pos, publisher);

-- ---------------------------------------------------------------------------
-- 2) RLS (wie home_tag_defs)
-- ---------------------------------------------------------------------------
alter table public.quickwin_publisher_defs enable row level security;

drop policy if exists quickwin_publisher_defs_select on public.quickwin_publisher_defs;
create policy quickwin_publisher_defs_select
  on public.quickwin_publisher_defs
  for select
  to anon, authenticated
  using (true);

drop policy if exists quickwin_publisher_defs_admin_write on public.quickwin_publisher_defs;
create policy quickwin_publisher_defs_admin_write
  on public.quickwin_publisher_defs
  for all
  to authenticated
  using (public.tb_is_admin())
  with check (public.tb_is_admin());

grant select on public.quickwin_publisher_defs to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Vorschau: wer wuerde mit 30+ reinwandern?
--    Wie die Website: publisher, sonst entwickler. Nur spiel_typ = Quickwin.
-- ---------------------------------------------------------------------------
with raw as (
  select
    nullif(
      btrim(coalesce(nullif(btrim(coalesce(publisher, '')), ''), entwickler)),
      ''
    ) as raw_name
  from public.games
  where btrim(coalesce(spiel_typ, '')) = 'Quickwin'
),
named as (
  select
    raw_name,
    lower(regexp_replace(raw_name, '[^a-zA-Z0-9]+', '', 'g')) as match_key
  from raw
  where raw_name is not null
),
counted as (
  select
    match_key,
    count(*) as seed_count,
    (
      select n2.raw_name
      from named n2
      where n2.match_key = named.match_key
      group by n2.raw_name
      order by count(*) desc, length(n2.raw_name), n2.raw_name
      limit 1
    ) as publisher
  from named
  where match_key <> ''
  group by match_key
)
select
  publisher,
  match_key,
  seed_count,
  true as published
from counted
where seed_count >= 30
order by seed_count desc, publisher;

-- ---------------------------------------------------------------------------
-- 4) Seed schreiben
--    Bestehende Zeilen: seed_count / updated_at aktualisieren.
--    publisher und published bleiben unangetastet (manuelle Pflege hat Vorrang).
--    Neue Zeilen: published = true.
-- ---------------------------------------------------------------------------
with raw as (
  select
    nullif(
      btrim(coalesce(nullif(btrim(coalesce(publisher, '')), ''), entwickler)),
      ''
    ) as raw_name
  from public.games
  where btrim(coalesce(spiel_typ, '')) = 'Quickwin'
),
named as (
  select
    raw_name,
    lower(regexp_replace(raw_name, '[^a-zA-Z0-9]+', '', 'g')) as match_key
  from raw
  where raw_name is not null
),
counted as (
  select
    match_key,
    count(*)::integer as seed_count,
    (
      select n2.raw_name
      from named n2
      where n2.match_key = named.match_key
      group by n2.raw_name
      order by count(*) desc, length(n2.raw_name), n2.raw_name
      limit 1
    ) as publisher
  from named
  where match_key <> ''
  group by match_key
),
seed as (
  select
    match_key,
    publisher,
    seed_count,
    true as published,
    (row_number() over (order by seed_count desc, publisher) * 10)::integer as sort_pos
  from counted
  where seed_count >= 30
)
insert into public.quickwin_publisher_defs as d (
  match_key,
  publisher,
  published,
  sort_pos,
  seed_count
)
select
  match_key,
  publisher,
  published,
  sort_pos,
  seed_count
from seed
on conflict (match_key) do update
set
  seed_count = excluded.seed_count,
  updated_at = now();
  -- publisher / published / sort_pos bewusst nicht ueberschreiben

-- ---------------------------------------------------------------------------
-- 5) Kontrolle
-- ---------------------------------------------------------------------------
select
  publisher,
  match_key,
  published,
  seed_count,
  sort_pos
from public.quickwin_publisher_defs
order by published desc, sort_pos, publisher;
