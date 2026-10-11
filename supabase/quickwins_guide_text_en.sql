-- =============================================================================
-- Quickwins: item_name und chronological_group von "de" nach "en"
-- Einmal in der Supabase-SQL-Konsole. Zuerst die SELECTs, dann das UPDATE.
--
-- Nur game_guides von Spielen mit spiel_typ = Quickwin.
-- Der Text liegt unter de, ist aber Englisch.
--   de gesetzt, en leer     -> de wird en, de faellt weg
--   de und en gleicher Text -> de faellt weg, en bleibt
--   de und en verschieden   -> unangetastet (steht in der Vorschau)
-- Andere Spalten und andere Spieltypen bleiben.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Vorschau
-- ---------------------------------------------------------------------------
with quickwin_guides as (
  select
    gg.id,
    gg.item_name,
    gg.chronological_group
  from public.game_guides gg
  join public.games g on g.id = gg.game_id
  where btrim(coalesce(g.spiel_typ, '')) = 'Quickwin'
)
select
  count(*) filter (
    where btrim(coalesce(item_name ->> 'de', '')) <> ''
      and btrim(coalesce(item_name ->> 'en', '')) = ''
  ) as item_name_de_nach_en,
  count(*) filter (
    where btrim(coalesce(item_name ->> 'de', '')) <> ''
      and btrim(item_name ->> 'de') = btrim(item_name ->> 'en')
  ) as item_name_de_doppelt,
  count(*) filter (
    where btrim(coalesce(item_name ->> 'de', '')) <> ''
      and btrim(coalesce(item_name ->> 'en', '')) <> ''
      and btrim(item_name ->> 'de') is distinct from btrim(item_name ->> 'en')
  ) as item_name_konflikt,
  count(*) filter (
    where btrim(coalesce(chronological_group ->> 'de', '')) <> ''
      and btrim(coalesce(chronological_group ->> 'en', '')) = ''
  ) as gruppe_de_nach_en,
  count(*) filter (
    where btrim(coalesce(chronological_group ->> 'de', '')) <> ''
      and btrim(chronological_group ->> 'de') = btrim(chronological_group ->> 'en')
  ) as gruppe_de_doppelt,
  count(*) filter (
    where btrim(coalesce(chronological_group ->> 'de', '')) <> ''
      and btrim(coalesce(chronological_group ->> 'en', '')) <> ''
      and btrim(chronological_group ->> 'de') is distinct from btrim(chronological_group ->> 'en')
  ) as gruppe_konflikt
from quickwin_guides;

-- Ein paar Beispiele, die umziehen
select
  gg.item_name ->> 'de' as item_name_de,
  gg.chronological_group ->> 'de' as gruppe_de
from public.game_guides gg
join public.games g on g.id = gg.game_id
where btrim(coalesce(g.spiel_typ, '')) = 'Quickwin'
  and btrim(coalesce(gg.item_name ->> 'de', '')) <> ''
  and btrim(coalesce(gg.item_name ->> 'en', '')) = ''
limit 15;

-- ---------------------------------------------------------------------------
-- 2) Schreiben
-- ---------------------------------------------------------------------------
begin;

update public.game_guides gg
set
  item_name = case
    when btrim(coalesce(gg.item_name ->> 'de', '')) <> ''
     and btrim(coalesce(gg.item_name ->> 'en', '')) = ''
      then (gg.item_name - 'de') || jsonb_build_object('en', gg.item_name -> 'de')
    when btrim(coalesce(gg.item_name ->> 'de', '')) <> ''
     and btrim(gg.item_name ->> 'de') = btrim(gg.item_name ->> 'en')
      then gg.item_name - 'de'
    else gg.item_name
  end,
  chronological_group = case
    when btrim(coalesce(gg.chronological_group ->> 'de', '')) <> ''
     and btrim(coalesce(gg.chronological_group ->> 'en', '')) = ''
      then (gg.chronological_group - 'de') || jsonb_build_object('en', gg.chronological_group -> 'de')
    when btrim(coalesce(gg.chronological_group ->> 'de', '')) <> ''
     and btrim(gg.chronological_group ->> 'de') = btrim(gg.chronological_group ->> 'en')
      then gg.chronological_group - 'de'
    else gg.chronological_group
  end
from public.games g
where g.id = gg.game_id
  and btrim(coalesce(g.spiel_typ, '')) = 'Quickwin'
  and (
    (
      btrim(coalesce(gg.item_name ->> 'de', '')) <> ''
      and (
        btrim(coalesce(gg.item_name ->> 'en', '')) = ''
        or btrim(gg.item_name ->> 'de') = btrim(gg.item_name ->> 'en')
      )
    )
    or (
      btrim(coalesce(gg.chronological_group ->> 'de', '')) <> ''
      and (
        btrim(coalesce(gg.chronological_group ->> 'en', '')) = ''
        or btrim(gg.chronological_group ->> 'de') = btrim(gg.chronological_group ->> 'en')
      )
    )
  );

-- Danach sollten die *_de_nach_en-Zaehler 0 sein.
-- Konflikte bleiben stehen.
select
  count(*) filter (
    where btrim(coalesce(gg.item_name ->> 'de', '')) <> ''
      and btrim(coalesce(gg.item_name ->> 'en', '')) = ''
  ) as item_name_noch_falsch,
  count(*) filter (
    where btrim(coalesce(gg.chronological_group ->> 'de', '')) <> ''
      and btrim(coalesce(gg.chronological_group ->> 'en', '')) = ''
  ) as gruppe_noch_falsch
from public.game_guides gg
join public.games g on g.id = gg.game_id
where btrim(coalesce(g.spiel_typ, '')) = 'Quickwin';

commit;
