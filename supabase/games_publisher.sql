-- =============================================================================
-- games.publisher (IGDB-Publisher, getrennt von entwickler)
-- Einmal in der Supabase-SQL-Konsole, bevor die Website und 04.1 die Spalte
-- erwarten. Ohne diese Spalte faellt die SPA intern auf entwickler zurueck.
-- =============================================================================

alter table public.games
  add column if not exists publisher text;

comment on column public.games.publisher is
  'Haupt-Publisher laut IGDB. Oeffentliche Studio-Zeile nutzt entwickler, bei Quickwins oft publisher.';
