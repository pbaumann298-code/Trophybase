-- Spieldauer in Stunden für den Admin-Spielüberblick.
-- Leer lassen, solange kein Wert gepflegt ist.
-- Nebeninhalte und DLC werden nicht geführt.

alter table public.games
  add column if not exists spielzeit_hauptstory numeric,
  add column if not exists spielzeit_komplettierer numeric;

alter table public.games
  drop column if exists spielzeit_nebeninhalte,
  drop column if exists spielzeit_dlc;

comment on column public.games.spielzeit_hauptstory is 'Stunden, nur Hauptstory.';
comment on column public.games.spielzeit_komplettierer is 'Stunden bis zum Komplettieren.';
