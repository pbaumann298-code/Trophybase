-- Beliebt / Neu: Evergreen und Premium inkl. Kombi-Typen
-- (`Evergreen, easy_platin`, `Premium, easy_platin`).
-- Die Live-Funktion ist plpgsql mit CTE base_published (nicht die ältere
-- SQL-Fassung in home_rails.sql). Dieser Patch ändert nur den Schienen-Filter.

do $$
declare
  src text;
begin
  src := pg_get_functiondef('public.tb_get_home_rails(text)'::regprocedure);
  if src like '%where g.spiel_typ in (''Evergreen'', ''Premium'')%' then
    src := replace(
      src,
      'where g.spiel_typ in (''Evergreen'', ''Premium'')',
      'where (coalesce(g.spiel_typ, '''') ilike ''%Evergreen%'' or coalesce(g.spiel_typ, '''') ilike ''%Premium%'')'
    );
    execute src;
  end if;
end $$;

comment on function public.tb_get_home_rails(text) is
  'Startseiten-Reihen, je max. 12, nur guide_<p_locale>=PUBLISHED. Beliebt/Neu: Evergreen oder Premium inkl. Kombi-Typen. Basis ohne exaktes Quickwin/easy_platin/Servertot.';
