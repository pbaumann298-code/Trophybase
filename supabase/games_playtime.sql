-- Spieldauer in Stunden für den Admin-Spielüberblick.
-- Leer lassen, solange kein Wert gepflegt ist.
alter table public.games
  add column if not exists spielzeit_hauptstory numeric,
  add column if not exists spielzeit_nebeninhalte numeric,
  add column if not exists spielzeit_komplettierer numeric,
  add column if not exists spielzeit_dlc numeric;

comment on column public.games.spielzeit_hauptstory is 'Stunden, nur Hauptstory.';
comment on column public.games.spielzeit_nebeninhalte is 'Stunden, mit Nebeninhalten.';
comment on column public.games.spielzeit_komplettierer is 'Stunden bis zum Komplettieren.';
comment on column public.games.spielzeit_dlc is 'Stunden für den DLC.';
