-- =============================================================================
-- Quickwins: status.igdb zuruecksetzen, damit 04.1 die Credits neu zieht
-- Einmal in der Supabase-SQL-Konsole. Zuerst das SELECT, dann das UPDATE.
--
-- Nur spiel_typ = Quickwin und nur wenn igdb schon COMPLETED ist.
-- Der Schluessel igdb fliegt aus status. guide_de und alle anderen
-- Schluessel bleiben. publisher und entwickler bleiben, bis das Skript
-- sie ueberschreibt.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Vorschau
-- ---------------------------------------------------------------------------
select
  count(*) filter (where coalesce(status ->> 'igdb', '') = 'COMPLETED') as wuerde_zuruecksetzen,
  count(*) filter (where coalesce(status ->> 'igdb', '') is distinct from 'COMPLETED') as bleibt_liegen,
  count(*) as quickwins
from public.games
where btrim(coalesce(spiel_typ, '')) = 'Quickwin';

-- ---------------------------------------------------------------------------
-- 2) Schreiben
-- ---------------------------------------------------------------------------
begin;

update public.games
set status = coalesce(status, '{}'::jsonb) - 'igdb'
where btrim(coalesce(spiel_typ, '')) = 'Quickwin'
  and coalesce(status ->> 'igdb', '') = 'COMPLETED';

select
  count(*) filter (where coalesce(status ->> 'igdb', '') = 'COMPLETED') as noch_completed
from public.games
where btrim(coalesce(spiel_typ, '')) = 'Quickwin';

commit;
