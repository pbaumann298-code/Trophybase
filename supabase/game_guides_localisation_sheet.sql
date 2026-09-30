-- localisation gilt nicht automatisch in jedem Excel-Reiter
--
-- Ein Guide-Eintrag kann in mehreren Reitern stehen (sheet_type z. B. [1, 2]).
-- localisation ist trotzdem nur EINE Sprachmap auf derselben Zeile. Ohne
-- eigene Spalte rutscht das Walkthrough-Gebiet (Reiter 1) in die
-- Sammelobjekte (Reiter 2) mit – genau das ist bei Astro Bot passiert.
--
-- localisation_sheet spiegelt sheet_type: JSONB-Array der Reiter, in denen
-- die Gebiets-Ebene angezeigt wird.
--
--   0 = Trophäen (game_achievements, kommt hier nicht vor)
--   1 = Walkthrough
--   2 = Sammelobjekte
--   3 = Bosse
--
-- Beispiel: Walkthrough-Galaxie, Sammelobjekt-Zeile bleibt flach
--   sheet_type:          [1, 2]
--   localisation:        {"de": "2. Tentakel-System:"}
--   localisation_sheet:  [1]
--
-- Das Frontend fällt ohne diese Spalte auf Walkthrough+Bosse zurück und
-- ignoriert localisation in den Sammelobjekten – Astro Bot muss also nicht
-- nachträglich befüllt werden. Neue Uploads sollen das Array trotzdem setzen.

alter table public.game_guides
  add column if not exists localisation_sheet jsonb;

comment on column public.game_guides.localisation_sheet is
  'Excel-Reiter, in denen localisation gilt: [1] Walkthrough, [2] Sammelobjekte, [3] Bosse. Wie sheet_type, aber nur fuer die Gebiets-Ebene.';

-- Optional: Walkthrough-Gebiet fuer alle Zeilen mit gefuellter localisation,
-- die in Reiter 1 vorkommen. Laesst Reiter 2 bewusst draussen.
--
-- update public.game_guides
-- set localisation_sheet = '[1]'::jsonb
-- where localisation_sheet is null
--   and localisation is not null
--   and localisation <> '{}'::jsonb
--   and (
--     sheet_type @> '1'::jsonb
--     or sheet_type @> '[1]'::jsonb
--   );
