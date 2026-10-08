-- =============================================================================
-- Trophäen-Icons neu holen: status.trophies = PROCESSED entfernen,
-- wenn mindestens eine Trophäe keine Bild-URL hat.
-- =============================================================================
--
-- Eine Abfrage über alle Spiele läuft in der SQL-Konsole in den Timeout.
-- Deshalb sechzehn Läufe, einer pro erstem Zeichen der Spiel-UUID.
-- In BEIDEN Abfragen dasselbe Zeichen einsetzen: 0-9, dann a-f.
--
-- Der Crawler nimmt Spiele, bei denen status.trophies fehlt oder
-- NO_TROPHIES ist. guide_* und PUBLISHED bleiben stehen.
--
-- Leer = im Icon-Text kommt kein http vor (null, {}, leere Sprachmap).
-- Eine gesetzte URL, auch ein Fallback-Bild, bleibt PROCESSED.

-- ---------------------------------------------------------------------------
-- 1) Vorschau für dieses Zeichen
-- ---------------------------------------------------------------------------

select
  g.id,
  coalesce(g.spieltitel ->> 'de', g.spieltitel ->> 'en') as titel,
  g.hardware,
  g.status ->> 'guide_de' as guide_de
from public.games g
where g.status ->> 'trophies' = 'PROCESSED'
  and g.id::text like '0%'
  and exists (
    select 1
    from public.game_achievements a
    where a.game_id = g.id
      and position('http' in lower(coalesce(a.icon_url::text, ''))) = 0
  )
order by g.id
limit 20;

-- ---------------------------------------------------------------------------
-- 2) Schreiben für dasselbe Zeichen
-- ---------------------------------------------------------------------------

update public.games g
set status = g.status - 'trophies'
where g.status ->> 'trophies' = 'PROCESSED'
  and g.id::text like '0%'
  and exists (
    select 1
    from public.game_achievements a
    where a.game_id = g.id
      and position('http' in lower(coalesce(a.icon_url::text, ''))) = 0
  );
