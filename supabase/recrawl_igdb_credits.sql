-- =============================================================================
-- IGDB-Credits neu ziehen (mehrere Entwickler / Quickwins / ohne Publisher)
-- Nach games_publisher.sql. Zuerst Vorschau, dann UPDATE entkommentieren.
-- Danach 04.1_Twich_vervollstaendiger.py laufen lassen.
-- =============================================================================
--
-- Setzt status.igdb zurueck, nicht guide_de. 04.1 holt dann Studio + Publisher
-- getrennt und schreibt nur noch EINEN entwickler.
--
-- Standard: nur unordentliche Listen und Quickwins (nicht der ganze Katalog).
-- Alle ohne Publisher: die AND-Zeile mit publisher unten mit einkommentieren.

-- 1) Vorschau
select
  count(*) as wuerde_neu_laufen
from public.games
where coalesce(status ->> 'igdb', '') = 'COMPLETED'
  and (
    position(',' in coalesce(entwickler, '')) > 0
    or coalesce(spiel_typ, '') = 'Quickwin'
    -- or publisher is null
    -- or btrim(publisher) = ''
  );

-- 2) Schreiben
-- begin;
--
-- update public.games
-- set status = coalesce(status, '{}'::jsonb) - 'igdb'
-- where coalesce(status ->> 'igdb', '') = 'COMPLETED'
--   and (
--     position(',' in coalesce(entwickler, '')) > 0
--     or coalesce(spiel_typ, '') = 'Quickwin'
--     -- or publisher is null
--     -- or btrim(publisher) = ''
--   );
--
-- commit;
