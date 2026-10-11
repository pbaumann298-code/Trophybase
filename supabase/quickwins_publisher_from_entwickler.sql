-- =============================================================================
-- Quickwins: Publisher aus entwickler nach games.publisher schieben
-- Einmal in der Supabase-SQL-Konsole. Zuerst die SELECTs, dann das UPDATE.
--
-- Nur spiel_typ = Quickwin.
-- Nur Zeilen ohne Publisher und mit gesetztem entwickler.
-- entwickler wird geleert, der Name liegt danach nur noch in publisher.
-- Andere Spieltypen und Quickwins, die schon einen Publisher haben, bleiben.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Vorschau
-- ---------------------------------------------------------------------------
select
  count(*) filter (
    where nullif(btrim(coalesce(publisher, '')), '') is null
      and nullif(btrim(coalesce(entwickler, '')), '') is not null
  ) as wuerde_umziehen,
  count(*) filter (
    where nullif(btrim(coalesce(publisher, '')), '') is not null
  ) as publisher_schon_gesetzt,
  count(*) filter (
    where nullif(btrim(coalesce(publisher, '')), '') is null
      and nullif(btrim(coalesce(entwickler, '')), '') is null
  ) as beide_leer
from public.games
where btrim(coalesce(spiel_typ, '')) = 'Quickwin';

-- Haeufigste Namen, die umziehen
select
  btrim(entwickler) as entwickler,
  count(*) as spiele
from public.games
where btrim(coalesce(spiel_typ, '')) = 'Quickwin'
  and nullif(btrim(coalesce(publisher, '')), '') is null
  and nullif(btrim(coalesce(entwickler, '')), '') is not null
group by 1
order by spiele desc, entwickler
limit 40;

-- ---------------------------------------------------------------------------
-- 2) Schreiben
-- ---------------------------------------------------------------------------
begin;

update public.games
set
  publisher = btrim(entwickler),
  entwickler = null
where btrim(coalesce(spiel_typ, '')) = 'Quickwin'
  and nullif(btrim(coalesce(publisher, '')), '') is null
  and nullif(btrim(coalesce(entwickler, '')), '') is not null;

-- Danach: wuerde_umziehen = 0, publisher_schon_gesetzt entspricht der alten Zahl.
select
  count(*) filter (
    where nullif(btrim(coalesce(publisher, '')), '') is null
      and nullif(btrim(coalesce(entwickler, '')), '') is not null
  ) as noch_in_entwickler,
  count(*) filter (
    where nullif(btrim(coalesce(publisher, '')), '') is not null
      and nullif(btrim(coalesce(entwickler, '')), '') is null
  ) as nur_publisher
from public.games
where btrim(coalesce(spiel_typ, '')) = 'Quickwin';

commit;
