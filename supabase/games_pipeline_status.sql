-- Indizes fuer die Admin-/Intranet-Suche nach Pipeline-Schluesseln
-- in games.status (JSONB). Einmal in der Supabase-SQL-Konsole ausfuehren.
--
-- Ohne diese Indizes laufen Filter wie status->>'discovery' = 'DISCOVERED'
-- ueber die ganze Tabelle und koennen timeouten.

create index if not exists games_status_discovery_idx
  on public.games ((status ->> 'discovery'));

create index if not exists games_status_trophies_idx
  on public.games ((status ->> 'trophies'));

create index if not exists games_status_guides_idx
  on public.games ((status ->> 'guides'));

create index if not exists games_status_guide_de_idx
  on public.games ((status ->> 'guide_de'));

create index if not exists games_status_overall_idx
  on public.games ((status ->> 'overall'));

create index if not exists games_status_igdb_idx
  on public.games ((status ->> 'igdb'));
