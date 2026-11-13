-- ============================================================================
-- Krankenstation: Sony-bewusster Sprach-, Freigabe- & Creator-Video-Check
-- ============================================================================
-- Prüft veröffentlichte Guides (alle 16 Sprachen) gegen:
-- 1. Sony-Lokalisierungsdaten (game_achievements): Ist ein Spiel laut Sony in
--    der Zielsprache gar nicht übersetzt (Sony liefert nur EN), werden
--    englische Item-/Ortsnamen NICHT als Fehler gemeldet. Auch offizielle
--    englische/fremdsprachige Sony-Trophäennamen werden ignoriert.
-- 2. Admin-Freigabefehler (WRONG_RELEASE_LANG): z. B. Guide auf Spanisch,
--    Polnisch oder Englisch versehentlich als DE freigegeben – oder DE-Guide
--    versehentlich als EN/ES/PL freigegeben.
-- 3. Creator-Bugs (FOREIGN_VIDEO_OUTLIER): Einzelnes Video / Kapitel in einer
--    Fremdsprache (insb. Osteuropäisch: Polnisch, Tschechisch/Slowakisch,
--    Russisch/Ukrainisch/Kyrillisch, Ungarisch, Rumänisch sowie ES/FR/PT/DE)
--    innerhalb einer anderssprachigen Playlist – greift bereits ab 1 Zeile!
-- ============================================================================

BEGIN;

-- 1. Schnelle, deterministische Vorfilter-Funktion für den partiellen Index
CREATE OR REPLACE FUNCTION public.tb_guide_lang_candidate_v2(
  p_item_name jsonb,
  p_video_chapter jsonb,
  p_translation_status jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public'
AS $function$
  SELECT
    -- A1) Nicht-deutsche Fremdsprachen (Osteuropäisch / Kyrillisch / Polnisch / ES / PT / FR) im Video-Chapter
    (
      p_video_chapter IS NOT NULL
      AND (
        p_video_chapter::text ~ '[а-яА-ЯіїєґІЇЄҐ]{2,}|[ąćęłńśźżĄĆĘŁŃŚŹŻčďěňřšťůžČĎĚŇŘŠŤŮŽőűŐŰșțȘȚ¿¡œŒ]'
        OR p_video_chapter::text ~* '\y(poradnik|trofeum|trofea|wszystkie|znajdzki|przejscie|osiagniecia|rozdzial|czesc|návod|trofej|trofeje|všechny|všetky|kapitola|végigjátszás|összes|ghid|guía|trofeo|trofeos|todos los|todas las|coleccionables|capítulo|prólogo|epílogo|logros|cómo conseguir|ubicación|ubicaciones|paso a paso|historia completa|troféu|troféus|todos os|todas as|colecionáveis|detonado|conquistas|localização|história completa|trophée|trophées|guide des|tous les|toutes les|emplacement|emplacements|soluce|histoire complète)\y'
        OR (
          NOT (p_video_chapter ? 'de')
          AND p_video_chapter::text ~* '\y(leitfaden|sammelobjekte|trophäe|trophäen|fundorte|komplettlösung|alle erfolge)\y'
        )
      )
    )
    -- A2) Fremdsprachen in item_name->>'en' (inkl. Deutsch in EN!)
    OR (
      btrim(coalesce(p_item_name->>'en', '')) <> ''
      AND (
        (p_item_name->>'en') ~ '[а-яА-ЯіїєґІЇЄҐ]{2,}|[ąćęłńśźżĄĆĘŁŃŚŹŻčďěňřšťůžČĎĚŇŘŠŤŮŽőűŐŰșțȘȚ¿¡œŒ]'
        OR (p_item_name->>'en') ~* '\y(poradnik|trofeum|trofea|wszystkie|návod|trofej|guía|trofeo|trofeos|todos los|todas las|coleccionables|capítulo|prólogo|epílogo|troféu|troféus|todos os|detonado|trophée|trophées|tous les|soluce|leitfaden|sammelobjekte|trophäe|trophäen|fundorte|komplettlösung|schließe|besiege|erhalte alle|spielverlauf)\y'
      )
    )
    -- A3) Nicht-deutsche / nicht-englische Fremdsprachen in item_name->>'de'
    OR (
      btrim(coalesce(p_item_name->>'de', '')) <> ''
      AND (
        (p_item_name->>'de') ~ '[а-яА-ЯіїєґІЇЄҐ]{2,}|[ąćęłńśźżĄĆĘŁŃŚŹŻčďěňřšťůžČĎĚŇŘŠŤŮŽőűŐŰșțȘȚ¿¡œŒ]'
        OR (p_item_name->>'de') ~* '\y(poradnik|trofeum|trofea|wszystkie|návod|trofej|guía|trofeo|trofeos|todos los|todas las|coleccionables|capítulo|prólogo|epílogo|troféu|troféus|todos os|detonado|trophée|trophées|tous les|soluce)\y'
      )
    )
    -- B) Englisch in DE
    OR (
      btrim(coalesce(p_item_name->>'de', '')) <> ''
      AND (p_item_name->>'de') ~* '\y(the|and|with|from|into|collect|find|defeat|kill|complete|reach|unlock|all|hidden|chapter|first|second|third|ending|secret|location|locations|room|key|door|without|after|before|story|trophies|trophy|obtained|unlocked|earned|finish|finished|choose|destroy|survive|escape|talk|buy|use|open|overview|mechanics|gameplay)\y'
      AND (p_item_name->>'de') !~* '[äöüß]|\y(und|oder|mit|für|von|zum|zur|beim|durch|ohne|kapitel|gegner|sammel|sammeln|finde|besiege|töte|erreiche|schalte|ende|geheim|raum|tür|schlüssel|rätsel|trophäe|trophäen|erhalten|freigeschaltet|beende|abgeschlossen|spielverlauf|level|walkthrough|playthrough|speedrun|quest|hauptquest|nebenquest|boss|bosse|bosskampf|upgrade|upgrades|puzzle|puzzleteil|fail|cringe|bug|glitch|loot|grind|checkpoint|cutscene|dlc|artefakt|artefakte|relikt|relikte|allgemein|teil|runde|finalrunde|schließe|bestehen|indem|antwortest)\y'
    )
    -- C) Englisch oder Deutsch in ES / PL / FR / PT / IT (wenn als Quelle freigegeben oder Video-Chapter in dieser Sprache)
    OR (
      (
        (p_translation_status IS NOT NULL AND NOT (p_translation_status ? 'stage') AND p_translation_status ?| array['es','pl','fr','pt','it','nl','ru','sv','fi'])
        OR (p_video_chapter IS NOT NULL AND NOT (p_video_chapter ? 'de') AND NOT (p_video_chapter ? 'en') AND p_video_chapter ?| array['es','pl','fr','pt','it','nl','ru','sv','fi'])
      )
      AND (
        coalesce(p_item_name->>'es', p_item_name->>'pl', p_item_name->>'fr', p_item_name->>'pt', p_item_name->>'it', '') ~* '\y(the|and|with|from|into|collect|find|defeat|kill|complete|reach|unlock|all|hidden|chapter|first|second|third|ending|secret|location|locations|without|after|before|story|trophies|trophy|obtained|unlocked|earned|finish|finished|walkthrough|achievement|achievements|leitfaden|sammelobjekte|trophäe|trophäen)\y'
      )
    );
$function$;

-- 2. Partielle Indizes für schnelle Vorselektion
CREATE INDEX IF NOT EXISTS idx_games_published_non_quickwin
  ON public.games (id)
  WHERE published_locales IS NOT NULL
    AND published_locales <> '[]'::jsonb
    AND coalesce(spiel_typ, '') !~~* '%Quickwin%';

CREATE INDEX IF NOT EXISTS idx_game_guides_krankenstation_lang_v2
  ON public.game_guides (game_id)
  WHERE coalesce(denglisch_ok, false) = false
    AND public.tb_guide_lang_candidate_v2(item_name, video_chapter, translation_status);

-- 3. Erweiterte View (abwärtskompatibel zu allen bisherigen Spalten + neue Kontextspalten)
CREATE OR REPLACE VIEW public.v_krankenstation_denglisch_guides
WITH (security_invoker = true)
AS
WITH glossary_terms AS MATERIALIZED (
  SELECT
    array_agg(DISTINCT tb_glossary.match_de) FILTER (WHERE tb_glossary.match_de IS NOT NULL AND tb_glossary.match_de <> '') AS match_de_arr,
    array_agg(DISTINCT lower(tb_glossary.de)) FILTER (WHERE tb_glossary.de IS NOT NULL AND tb_glossary.de <> '') AS de_arr
  FROM public.tb_glossary
),
candidate_games AS MATERIALIZED (
  SELECT
    g.id AS game_id,
    COALESCE(NULLIF(btrim(g.spieltitel ->> 'de'), ''), NULLIF(btrim(g.spieltitel ->> 'en'), ''), 'Unbenannt') AS spieltitel,
    lower(btrim(COALESCE(g.spieltitel ->> 'en', ''))) AS title_en_lc,
    lower(btrim(COALESCE(g.spieltitel ->> 'de', ''))) AS title_de_lc,
    g.spiel_typ,
    g.hardware,
    g.slug AS game_slug,
    g.published_locales,
    g.status ? 'refinement_en' AS has_refinement_en,
    CASE
      WHEN jsonb_typeof(g.published_locales) = 'array' AND jsonb_array_length(g.published_locales) = 1
        THEN g.published_locales ->> 0
      ELSE NULL
    END AS single_pub_lang,
    COALESCE(public.tb_source_lang_for_game(g.status), 'de') AS game_source_lang
  FROM public.games g
  WHERE g.published_locales IS NOT NULL
    AND g.published_locales <> '[]'::jsonb
    AND COALESCE(g.spiel_typ, '') !~~* '%Quickwin%'
    AND EXISTS (
      SELECT 1
      FROM public.game_guides gg0
      WHERE gg0.game_id = g.id
        AND COALESCE(gg0.denglisch_ok, false) = false
        AND public.tb_guide_lang_candidate_v2(gg0.item_name, gg0.video_chapter, gg0.translation_status)
    )
),
raw_candidates AS MATERIALIZED (
  SELECT
    gg.id AS row_uuid,
    gg.game_id,
    gg.guide_id,
    btrim(COALESCE(gg.trophy_id, '')) AS trophy_id_clean,
    gg.trophy_id,
    gg.item_name,
    gg.chronological_group,
    gg.video_chapter,
    gg.video_url,
    gg.creator_id,
    cg.spieltitel,
    cg.title_en_lc,
    cg.title_de_lc,
    cg.spiel_typ,
    cg.hardware,
    cg.game_slug,
    cg.published_locales,
    COALESCE(
      CASE
        WHEN gg.translation_status IS NOT NULL AND NOT (gg.translation_status ? 'stage') THEN
          CASE
            WHEN gg.translation_status ->> 'de' = 'SOURCE' THEN 'de'
            WHEN gg.translation_status ->> 'en' = 'SOURCE' THEN 'en'
            WHEN gg.translation_status ->> 'es' = 'SOURCE' THEN 'es'
            WHEN gg.translation_status ->> 'pl' = 'SOURCE' THEN 'pl'
            WHEN gg.translation_status ->> 'fr' = 'SOURCE' THEN 'fr'
            WHEN gg.translation_status ->> 'pt' = 'SOURCE' THEN 'pt'
            WHEN gg.translation_status ->> 'it' = 'SOURCE' THEN 'it'
            WHEN gg.translation_status ->> 'nl' = 'SOURCE' THEN 'nl'
            WHEN gg.translation_status ->> 'ru' = 'SOURCE' THEN 'ru'
            WHEN gg.translation_status ->> 'sv' = 'SOURCE' THEN 'sv'
            WHEN gg.translation_status ->> 'fi' = 'SOURCE' THEN 'fi'
            WHEN gg.translation_status ->> 'ja' = 'SOURCE' THEN 'ja'
            WHEN gg.translation_status ->> 'ko' = 'SOURCE' THEN 'ko'
            WHEN gg.translation_status ->> 'zh-hans' = 'SOURCE' THEN 'zh-hans'
            WHEN gg.translation_status ->> 'zh-hant' = 'SOURCE' THEN 'zh-hant'
            WHEN gg.translation_status ->> 'ar' = 'SOURCE' THEN 'ar'
          END
      END,
      cg.single_pub_lang,
      CASE
        WHEN gg.video_chapter IS NOT NULL THEN
          CASE
            WHEN gg.video_chapter ? 'es' AND NOT (gg.video_chapter ? 'de') AND NOT (gg.video_chapter ? 'en') THEN 'es'
            WHEN gg.video_chapter ? 'pl' AND NOT (gg.video_chapter ? 'de') AND NOT (gg.video_chapter ? 'en') THEN 'pl'
            WHEN gg.video_chapter ? 'fr' AND NOT (gg.video_chapter ? 'de') AND NOT (gg.video_chapter ? 'en') THEN 'fr'
            WHEN gg.video_chapter ? 'pt' AND NOT (gg.video_chapter ? 'de') AND NOT (gg.video_chapter ? 'en') THEN 'pt'
            WHEN gg.video_chapter ? 'it' AND NOT (gg.video_chapter ? 'de') AND NOT (gg.video_chapter ? 'en') THEN 'it'
            WHEN gg.video_chapter ? 'nl' AND NOT (gg.video_chapter ? 'de') AND NOT (gg.video_chapter ? 'en') THEN 'nl'
            WHEN gg.video_chapter ? 'ru' AND NOT (gg.video_chapter ? 'de') AND NOT (gg.video_chapter ? 'en') THEN 'ru'
            WHEN gg.video_chapter ? 'en' AND NOT (gg.video_chapter ? 'de') THEN 'en'
            WHEN gg.video_chapter ? 'de' AND NOT (gg.video_chapter ? 'en') THEN 'de'
          END
      END,
      CASE
        WHEN cg.has_refinement_en AND NOT (COALESCE(gg.video_chapter, '{}'::jsonb) ? 'de') THEN 'en'
      END,
      cg.game_source_lang
    ) AS checked_lang,
    gt.match_de_arr,
    gt.de_arr
  FROM candidate_games cg
  CROSS JOIN glossary_terms gt
  JOIN public.game_guides gg
    ON gg.game_id = cg.game_id
   AND COALESCE(gg.denglisch_ok, false) = false
   AND public.tb_guide_lang_candidate_v2(gg.item_name, gg.video_chapter, gg.translation_status)
),
pre_classified AS MATERIALIZED (
  SELECT
    rc.row_uuid,
    rc.game_id,
    rc.guide_id,
    rc.trophy_id_clean,
    rc.trophy_id,
    rc.item_name,
    rc.chronological_group,
    rc.video_chapter,
    rc.video_url,
    rc.creator_id,
    rc.spieltitel,
    rc.title_en_lc,
    rc.title_de_lc,
    rc.spiel_typ,
    rc.hardware,
    rc.game_slug,
    rc.published_locales,
    rc.checked_lang,
    rc.match_de_arr,
    rc.de_arr,
    btrim(COALESCE(rc.item_name ->> rc.checked_lang, rc.item_name ->> 'de', rc.item_name ->> 'en', '')) AS checked_text,
    btrim(COALESCE(
      NULLIF(btrim(rc.video_chapter ->> rc.checked_lang), ''),
      NULLIF(btrim(rc.video_chapter ->> 'en'), ''),
      NULLIF(btrim(rc.video_chapter ->> 'de'), ''),
      NULLIF(btrim(rc.video_chapter ->> 'es'), ''),
      NULLIF(btrim(rc.video_chapter ->> 'pl'), ''),
      NULLIF(btrim(rc.video_chapter ->> 'fr'), ''),
      NULLIF(btrim(rc.video_chapter ->> 'pt'), ''),
      ''
    )) AS video_title,
    CASE
      WHEN rc.checked_lang <> 'ru'
       AND (
         replace(replace(lower(COALESCE(rc.video_chapter ->> rc.checked_lang, rc.video_chapter ->> 'en', rc.video_chapter ->> 'de', '')), CASE WHEN rc.title_en_lc <> '' THEN rc.title_en_lc ELSE '__none__' END, ' '), CASE WHEN rc.title_de_lc <> '' THEN rc.title_de_lc ELSE '__none__' END, ' ') ~ '[а-яА-ЯіїєґІЇЄҐ]{2,}'
         OR COALESCE(rc.item_name ->> rc.checked_lang, '') ~ '[а-яА-ЯіїєґІЇЄҐ]{2,}'
       )
      THEN 'ru'

      WHEN rc.checked_lang <> 'pl'
       AND (
         replace(replace(lower(COALESCE(rc.video_chapter ->> rc.checked_lang, rc.video_chapter ->> 'en', rc.video_chapter ->> 'de', '')), CASE WHEN rc.title_en_lc <> '' THEN rc.title_en_lc ELSE '__none__' END, ' '), CASE WHEN rc.title_de_lc <> '' THEN rc.title_de_lc ELSE '__none__' END, ' ') ~ '[ąćęłńśźż]|\y(poradnik|trofeum|trofea|wszystkie|znajdzki|przejscie|osiagniecia|rozdzial|czesc)\y'
         OR COALESCE(rc.item_name ->> rc.checked_lang, '') ~ '[ąćęłńśźżĄĆĘŁŃŚŹŻ]'
         OR COALESCE(rc.item_name ->> rc.checked_lang, '') ~* '\y(poradnik|trofeum|trofea|wszystkie|znajdzki|przejscie|osiagniecia|rozdzial|czesc)\y'
       )
      THEN 'pl'

      WHEN rc.checked_lang <> ALL (ARRAY['cs', 'sk', 'hu', 'ro', 'pl'])
       AND (
         replace(replace(lower(COALESCE(rc.video_chapter ->> rc.checked_lang, rc.video_chapter ->> 'en', rc.video_chapter ->> 'de', '')), CASE WHEN rc.title_en_lc <> '' THEN rc.title_en_lc ELSE '__none__' END, ' '), CASE WHEN rc.title_de_lc <> '' THEN rc.title_de_lc ELSE '__none__' END, ' ') ~ '[čďěňřšťůžőűșț]|\y(návod|trofej|trofeje|všechny|všetky|kapitola|végigjátszás|összes|ghid)\y'
         OR COALESCE(rc.item_name ->> rc.checked_lang, '') ~ '[čďěňřšťůžČĎĚŇŘŠŤŮŽőűŐŰșțȘȚ]'
         OR COALESCE(rc.item_name ->> rc.checked_lang, '') ~* '\y(návod|trofej|trofeje|všechny|všetky|kapitola|végigjátszás|összes|ghid)\y'
       )
      THEN 'east_eu'

      WHEN rc.checked_lang <> ALL (ARRAY['es', 'pt', 'it'])
       AND (
         replace(replace(lower(COALESCE(rc.video_chapter ->> rc.checked_lang, rc.video_chapter ->> 'en', rc.video_chapter ->> 'de', '')), CASE WHEN rc.title_en_lc <> '' THEN rc.title_en_lc ELSE '__none__' END, ' '), CASE WHEN rc.title_de_lc <> '' THEN rc.title_de_lc ELSE '__none__' END, ' ') ~* '[¿¡]|\y(guía|trofeo|trofeos|todos los|todas las|coleccionables|capítulo|prólogo|epílogo|logros|cómo conseguir|ubicación|ubicaciones|paso a paso|historia completa)\y'
         OR COALESCE(rc.item_name ->> rc.checked_lang, '') ~* '[¿¡]|\y(guía|trofeo|trofeos|todos los|todas las|coleccionables|capítulo|prólogo|epílogo|logros|cómo conseguir|ubicación|ubicaciones|paso a paso|historia completa)\y'
       )
      THEN 'es'

      WHEN rc.checked_lang <> ALL (ARRAY['pt', 'es'])
       AND (
         replace(replace(lower(COALESCE(rc.video_chapter ->> rc.checked_lang, rc.video_chapter ->> 'en', rc.video_chapter ->> 'de', '')), CASE WHEN rc.title_en_lc <> '' THEN rc.title_en_lc ELSE '__none__' END, ' '), CASE WHEN rc.title_de_lc <> '' THEN rc.title_de_lc ELSE '__none__' END, ' ') ~* '\y(troféu|troféus|todos os|todas as|colecionáveis|detonado|conquistas|localização|história completa)\y'
         OR COALESCE(rc.item_name ->> rc.checked_lang, '') ~* '\y(troféu|troféus|todos os|todas as|colecionáveis|detonado|conquistas|localização|história completa)\y'
       )
      THEN 'pt'

      WHEN rc.checked_lang <> 'fr'
       AND (
         replace(replace(lower(COALESCE(rc.video_chapter ->> rc.checked_lang, rc.video_chapter ->> 'en', rc.video_chapter ->> 'de', '')), CASE WHEN rc.title_en_lc <> '' THEN rc.title_en_lc ELSE '__none__' END, ' '), CASE WHEN rc.title_de_lc <> '' THEN rc.title_de_lc ELSE '__none__' END, ' ') ~* '[œ]|\y(trophée|trophées|guide des|tous les|toutes les|emplacement|emplacements|soluce|histoire complète)\y'
         OR COALESCE(rc.item_name ->> rc.checked_lang, '') ~* '[œŒ]|\y(trophée|trophées|guide des|tous les|toutes les|emplacement|emplacements|soluce|histoire complète)\y'
       )
      THEN 'fr'

      WHEN rc.checked_lang <> 'de'
       AND (
         replace(replace(lower(COALESCE(rc.video_chapter ->> rc.checked_lang, rc.video_chapter ->> 'en', '')), CASE WHEN rc.title_en_lc <> '' THEN rc.title_en_lc ELSE '__none__' END, ' '), CASE WHEN rc.title_de_lc <> '' THEN rc.title_de_lc ELSE '__none__' END, ' ') ~* '\y(leitfaden|sammelobjekte|trophäe|trophäen|fundorte|komplettlösung|alle erfolge|spielverlauf)\y'
         OR COALESCE(rc.item_name ->> rc.checked_lang, '') ~* '\y(leitfaden|sammelobjekte|trophäe|trophäen|fundorte|komplettlösung|schließe|besiege|erhalte alle|spielverlauf)\y'
       )
      THEN 'de'

      WHEN rc.checked_lang <> 'en'
       AND btrim(COALESCE(rc.item_name ->> rc.checked_lang, '')) <> ''
       AND (rc.item_name ->> rc.checked_lang) ~* '\y(the|and|with|from|into|collect|find|defeat|kill|complete|reach|unlock|all|hidden|chapter|first|second|third|ending|secret|location|locations|room|key|door|without|after|before|story|trophies|trophy|obtained|unlocked|earned|finish|finished|choose|destroy|survive|escape|talk|buy|use|open|overview|mechanics|gameplay)\y'
       AND (
         (rc.checked_lang = 'de' AND (rc.item_name ->> 'de') !~* '[äöüß]|\y(und|oder|mit|für|von|zum|zur|beim|durch|ohne|kapitel|gegner|sammel|sammeln|finde|besiege|töte|erreiche|schalte|ende|geheim|raum|tür|schlüssel|rätsel|trophäe|trophäen|erhalten|freigeschaltet|beende|abgeschlossen|spielverlauf|level|walkthrough|playthrough|speedrun|quest|hauptquest|nebenquest|boss|bosse|bosskampf|upgrade|upgrades|puzzle|puzzleteil|fail|cringe|bug|glitch|loot|grind|checkpoint|cutscene|dlc|artefakt|artefakte|relikt|relikte|allgemein|teil|runde|finalrunde|schließe|bestehen|indem|antwortest)\y')
         OR (rc.checked_lang = 'es' AND (rc.item_name ->> 'es') !~* '[áéíóúñ¿¡]|\y(el|la|los|las|del|con|para|por|una|todos|todas|guía|trofeo|trofeos|capítulo|nivel|jefe|secreto|completar|consigue|encuentra|derrota|historia|parte|final)\y')
         OR (rc.checked_lang = 'pl' AND (rc.item_name ->> 'pl') !~* '[ąćęłńóśźż]|\y(oraz|dla|lub|wszystkie|trofeum|trofea|poradnik|rozdział|część|poziom|znajdź|pokonaj|ukończ|koniec|sekret)\y')
         OR (rc.checked_lang <> ALL (ARRAY['de', 'es', 'pl']))
       )
       AND NOT (
         (rc.match_de_arr IS NOT NULL AND lower(btrim(regexp_replace(rc.item_name ->> rc.checked_lang, '[0-9#/:\-\.\(\)\[\]\s]+', '', 'g'))) = ANY (rc.match_de_arr))
         OR (rc.de_arr IS NOT NULL AND lower(btrim(rc.item_name ->> rc.checked_lang)) = ANY (rc.de_arr))
       )
      THEN 'en'

      ELSE NULL
    END AS raw_detected_lang
  FROM raw_candidates rc
),
matched_games AS MATERIALIZED (
  SELECT
    pre_classified.game_id,
    pre_classified.checked_lang,
    count(*)::integer AS pre_hits,
    bool_or(pre_classified.raw_detected_lang <> 'en') AS has_non_en
  FROM pre_classified
  WHERE pre_classified.raw_detected_lang IS NOT NULL
  GROUP BY pre_classified.game_id, pre_classified.checked_lang
),
sony_sampled_games AS MATERIALIZED (
  SELECT
    mg.game_id,
    mg.checked_lang,
    mg.pre_hits,
    mg.has_non_en,
    s.sample_total,
    s.sample_loc
  FROM matched_games mg
  CROSS JOIN LATERAL (
    SELECT
      count(*)::integer AS sample_total,
      count(*) FILTER (
        WHERE mg.checked_lang = 'en'
           OR (
             btrim(COALESCE(sub.trophy_desc ->> mg.checked_lang, '')) <> ''
             AND lower(btrim(COALESCE(sub.trophy_desc ->> mg.checked_lang, ''))) <> lower(btrim(COALESCE(sub.trophy_desc ->> 'en', '')))
           )
      )::integer AS sample_loc
    FROM (
      SELECT ga.trophy_desc
      FROM public.game_achievements ga
      WHERE ga.game_id = mg.game_id
        AND ga.platform_achievement_id::text <> ALL (ARRAY['0', '1'])
      LIMIT 5
    ) sub
  ) s
  WHERE mg.has_non_en
     OR NOT (mg.checked_lang <> 'en' AND s.sample_total > 0 AND s.sample_loc = 0)
),
sony_checked_games AS MATERIALIZED (
  SELECT
    ssg.game_id,
    ssg.checked_lang,
    ssg.sample_total,
    ssg.sample_loc,
    gt.total_rows_in_game
  FROM sony_sampled_games ssg
  CROSS JOIN LATERAL (
    SELECT count(*)::integer AS total_rows_in_game
    FROM public.game_guides gg2
    WHERE gg2.game_id = ssg.game_id
  ) gt
  WHERE ssg.has_non_en OR ssg.pre_hits >= 2 OR gt.total_rows_in_game = 1
),
sony_verified_rows AS (
  SELECT
    pc.row_uuid,
    pc.game_id,
    pc.guide_id,
    pc.trophy_id_clean,
    pc.trophy_id,
    pc.item_name,
    pc.chronological_group,
    pc.video_chapter,
    pc.video_url,
    pc.creator_id,
    pc.spieltitel,
    pc.title_en_lc,
    pc.title_de_lc,
    pc.spiel_typ,
    pc.hardware,
    pc.game_slug,
    pc.published_locales,
    pc.checked_lang,
    pc.match_de_arr,
    pc.de_arr,
    pc.checked_text,
    pc.video_title,
    pc.raw_detected_lang,
    scg.total_rows_in_game,
    CASE
      WHEN pc.checked_lang = 'en' OR scg.sample_total = 0 THEN 100
      ELSE round(scg.sample_loc::numeric * 100.0 / scg.sample_total::numeric)::integer
    END AS sony_localized_pct,
    btrim(COALESCE(ga_row.trophy_name ->> pc.checked_lang, ga_row.trophy_name ->> 'en', '')) AS sony_trophy_name
  FROM pre_classified pc
  JOIN sony_checked_games scg ON scg.game_id = pc.game_id AND scg.checked_lang = pc.checked_lang
  LEFT JOIN public.game_achievements ga_row
    ON pc.trophy_id_clean <> ''
   AND ga_row.game_id = pc.game_id
   AND ga_row.platform_achievement_id::text = pc.trophy_id_clean
  WHERE pc.raw_detected_lang IS NOT NULL
    AND NOT (pc.raw_detected_lang = 'en' AND pc.checked_lang <> 'en' AND scg.sample_total > 0 AND scg.sample_loc = 0)
    AND NOT (
      ga_row.trophy_name IS NOT NULL
      AND btrim(COALESCE(ga_row.trophy_name ->> pc.checked_lang, '')) <> ''
      AND (
        lower(pc.checked_text) = lower(btrim(ga_row.trophy_name ->> pc.checked_lang))
        OR (
          lower(pc.checked_text) ~~ (lower(btrim(ga_row.trophy_name ->> pc.checked_lang)) || '%')
          AND btrim(substr(pc.checked_text, char_length(btrim(ga_row.trophy_name ->> pc.checked_lang)) + 1)) ~* '[äöüß]|\y(schließe|beende|bestehen|indem|erhalte|sammle|besiege|finde)\y'
        )
      )
    )
),
scored AS (
  SELECT
    svr.row_uuid,
    svr.game_id,
    svr.spieltitel,
    svr.spiel_typ,
    svr.hardware,
    svr.published_locales,
    count(*) OVER (PARTITION BY svr.game_id) AS verdachts_zeilen_im_spiel,
    svr.guide_id,
    svr.trophy_id,
    btrim(COALESCE(svr.item_name ->> 'de', '')) AS text_de,
    btrim(COALESCE(svr.item_name ->> 'en', '')) AS text_en,
    btrim(COALESCE(svr.chronological_group ->> 'de', '')) AS group_de,
    btrim(COALESCE(svr.chronological_group ->> 'en', '')) AS group_en,
    svr.checked_lang,
    svr.raw_detected_lang AS detected_lang,
    svr.checked_text,
    svr.video_title,
    svr.video_url,
    svr.sony_trophy_name,
    svr.sony_localized_pct,
    svr.total_rows_in_game,
    cc.channel_name AS creator_name,
    svr.game_slug
  FROM sony_verified_rows svr
  LEFT JOIN public.content_creators cc ON cc.id = svr.creator_id
)
SELECT
  row_uuid,
  game_id,
  spieltitel,
  spiel_typ,
  hardware,
  published_locales,
  verdachts_zeilen_im_spiel,
  guide_id,
  trophy_id,
  text_de,
  text_en,
  group_de,
  group_en,
  CASE
    WHEN verdachts_zeilen_im_spiel::numeric >= GREATEST(2::numeric, ceil(total_rows_in_game::numeric * 0.5))
      OR (total_rows_in_game = 1 AND verdachts_zeilen_im_spiel = 1)
      THEN 'WRONG_RELEASE_LANG'
    WHEN detected_lang <> 'en'
      THEN 'FOREIGN_VIDEO_OUTLIER'
    ELSE 'UNTRANSLATED_TEXT'
  END AS issue_type,
  checked_lang,
  detected_lang,
  checked_text,
  video_title,
  video_url,
  sony_trophy_name,
  sony_localized_pct,
  total_rows_in_game,
  creator_name,
  game_slug
FROM scored
WHERE detected_lang <> 'en'
   OR verdachts_zeilen_im_spiel >= 2
   OR total_rows_in_game = 1
ORDER BY
  (CASE WHEN detected_lang <> 'en' THEN 1 ELSE 0 END) DESC,
  verdachts_zeilen_im_spiel DESC,
  spieltitel,
  (NULLIF(regexp_replace(guide_id, '[^0-9]', '', 'g'), '')::integer);

-- 4. Admin-Lese-RPC mit 30s Statement-Timeout-Puffer
CREATE OR REPLACE FUNCTION public.tb_get_krankenstation_language_audit(
  p_limit integer DEFAULT 1000
)
RETURNS SETOF public.v_krankenstation_denglisch_guides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.tb_is_admin() THEN
    RAISE EXCEPTION 'Nur für Admins erlaubt.';
  END IF;

  PERFORM set_config('statement_timeout', '30s', true);

  RETURN QUERY
  SELECT *
  FROM public.v_krankenstation_denglisch_guides
  LIMIT greatest(1, least(coalesce(p_limit, 1000), 2000));
END;
$function$;

-- 5. Admin-Auflösungs-RPC (generisch für alle 16 Locales + 3-Parameter-Wrapper für Abwärtskompatibilität)
CREATE OR REPLACE FUNCTION public.tb_resolve_krankenstation_language(
  p_game_id uuid,
  p_action text,
  p_row_uuid uuid DEFAULT NULL::uuid,
  p_from_lang text DEFAULT NULL::text,
  p_to_lang text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_action text := upper(coalesce(btrim(p_action), ''));
  v_from text := lower(coalesce(nullif(btrim(p_from_lang), ''), 'de'));
  v_to text := lower(coalesce(nullif(btrim(p_to_lang), ''), 'en'));
  v_valid_langs text[] := array['de','en','fr','es','it','nl','pt','pl','ru','ja','ko','zh-hant','zh-hans','fi','sv','ar'];
  v_affected int := 0;
  v_target_ids uuid[];
BEGIN
  IF NOT public.tb_is_admin() THEN
    RAISE EXCEPTION 'Nur für Admins erlaubt.';
  END IF;

  IF v_action = 'MOVE_DE_TO_EN' THEN
    v_action := 'MOVE_LANG';
    v_from := 'de';
    v_to := 'en';
  ELSIF v_action = 'DELETE_DE' THEN
    v_action := 'DELETE_LANG';
    v_from := 'de';
  END IF;

  IF p_row_uuid IS NOT NULL THEN
    v_target_ids := array[p_row_uuid];
  ELSE
    SELECT array_agg(row_uuid)
    INTO v_target_ids
    FROM public.v_krankenstation_denglisch_guides
    WHERE game_id = p_game_id;
  END IF;

  SET LOCAL tb.stage1_running = '1';

  IF v_action = 'MARK_OK' THEN
    IF v_target_ids IS NULL OR array_length(v_target_ids, 1) IS NULL THEN
      RETURN jsonb_build_object('ok', true, 'affected', 0, 'action', v_action);
    END IF;

    UPDATE public.game_guides
    SET denglisch_ok = true
    WHERE id = ANY(v_target_ids);
    GET DIAGNOSTICS v_affected = ROW_COUNT;

  ELSIF v_action = 'MOVE_LANG' THEN
    IF NOT (v_from = ANY(v_valid_langs)) OR NOT (v_to = ANY(v_valid_langs)) OR v_from = v_to THEN
      RAISE EXCEPTION 'Ungültiges Sprachpaar für Verschiebung: % -> %', v_from, v_to;
    END IF;

    UPDATE public.games SET is_guide_locked = false WHERE id = p_game_id;

    IF p_row_uuid IS NULL THEN
      UPDATE public.game_guides
      SET
        edit_unlocked = true,
        item_name = CASE
          WHEN item_name IS NOT NULL AND btrim(coalesce(item_name ->> v_from, '')) <> ''
          THEN (item_name - v_from) || jsonb_build_object(
            v_to,
            coalesce(nullif(btrim(item_name ->> v_to), ''), item_name ->> v_from)
          )
          ELSE item_name
        END,
        chronological_group = CASE
          WHEN chronological_group IS NOT NULL AND btrim(coalesce(chronological_group ->> v_from, '')) <> ''
          THEN (chronological_group - v_from) || jsonb_build_object(
            v_to,
            coalesce(nullif(btrim(chronological_group ->> v_to), ''), chronological_group ->> v_from)
          )
          ELSE chronological_group
        END,
        category_group = CASE
          WHEN category_group IS NOT NULL AND btrim(coalesce(category_group ->> v_from, '')) <> ''
          THEN (category_group - v_from) || jsonb_build_object(
            v_to,
            coalesce(nullif(btrim(category_group ->> v_to), ''), category_group ->> v_from)
          )
          ELSE category_group
        END,
        boss_group = CASE
          WHEN boss_group IS NOT NULL AND btrim(coalesce(boss_group ->> v_from, '')) <> ''
          THEN (boss_group - v_from) || jsonb_build_object(
            v_to,
            coalesce(nullif(btrim(boss_group ->> v_to), ''), boss_group ->> v_from)
          )
          ELSE boss_group
        END,
        spiel_region = CASE
          WHEN spiel_region IS NOT NULL AND btrim(coalesce(spiel_region ->> v_from, '')) <> ''
          THEN (spiel_region - v_from) || jsonb_build_object(
            v_to,
            coalesce(nullif(btrim(spiel_region ->> v_to), ''), spiel_region ->> v_from)
          )
          ELSE spiel_region
        END,
        video_chapter = CASE
          WHEN video_chapter IS NOT NULL AND btrim(coalesce(video_chapter ->> v_from, '')) <> ''
          THEN (video_chapter - v_from) || jsonb_build_object(
            v_to,
            coalesce(nullif(btrim(video_chapter ->> v_to), ''), video_chapter ->> v_from)
          )
          ELSE video_chapter
        END,
        translation_status = jsonb_build_object(v_to, 'SOURCE')
      WHERE game_id = p_game_id;
      GET DIAGNOSTICS v_affected = ROW_COUNT;
    ELSE
      UPDATE public.game_guides
      SET
        edit_unlocked = true,
        item_name = CASE
          WHEN item_name IS NOT NULL AND btrim(coalesce(item_name ->> v_from, '')) <> ''
          THEN (item_name - v_from) || jsonb_build_object(
            v_to,
            coalesce(nullif(btrim(item_name ->> v_to), ''), item_name ->> v_from)
          )
          ELSE item_name
        END,
        chronological_group = CASE
          WHEN chronological_group IS NOT NULL AND btrim(coalesce(chronological_group ->> v_from, '')) <> ''
          THEN (chronological_group - v_from) || jsonb_build_object(
            v_to,
            coalesce(nullif(btrim(chronological_group ->> v_to), ''), chronological_group ->> v_from)
          )
          ELSE chronological_group
        END
      WHERE id = ANY(v_target_ids);
      GET DIAGNOSTICS v_affected = ROW_COUNT;
    END IF;

    UPDATE public.games
    SET
      is_guide_locked = true,
      status = jsonb_set(
        jsonb_set(
          coalesce(status, '{}'::jsonb),
          ARRAY['guide_' || v_to],
          '"PUBLISHED"'::jsonb,
          true
        ),
        ARRAY['guide_' || v_from],
        '"FERTIG"'::jsonb,
        true
      )
    WHERE id = p_game_id;

    PERFORM public.tb_apply_stage1_sql_for_game(p_game_id);

  ELSIF v_action = 'DELETE_LANG' THEN
    IF NOT (v_from = ANY(v_valid_langs)) THEN
      RAISE EXCEPTION 'Ungültige Sprache: %', v_from;
    END IF;

    IF v_target_ids IS NULL OR array_length(v_target_ids, 1) IS NULL THEN
      RETURN jsonb_build_object('ok', true, 'affected', 0, 'action', v_action);
    END IF;

    UPDATE public.games SET is_guide_locked = false WHERE id = p_game_id;

    UPDATE public.game_guides
    SET
      edit_unlocked = true,
      item_name = item_name - v_from
    WHERE id = ANY(v_target_ids)
      AND (item_name - v_from) <> '{}'::jsonb;
    GET DIAGNOSTICS v_affected = ROW_COUNT;

    UPDATE public.games
    SET
      is_guide_locked = true,
      status = CASE
        WHEN v_affected > 0
          THEN jsonb_set(coalesce(status, '{}'::jsonb), ARRAY['guide_' || v_from], '"FERTIG"'::jsonb, true)
        ELSE status
      END
    WHERE id = p_game_id;

  ELSE
    RAISE EXCEPTION 'Unbekannte Aktion: %', p_action;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'affected', v_affected,
    'action', v_action,
    'from_lang', v_from,
    'to_lang', v_to
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.tb_resolve_denglisch_guide(
  p_game_id uuid,
  p_action text,
  p_row_uuid uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.tb_resolve_krankenstation_language(p_game_id, p_action, p_row_uuid, 'de', 'en');
$function$;

REVOKE ALL ON FUNCTION public.tb_get_krankenstation_language_audit(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tb_resolve_krankenstation_language(uuid, text, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tb_resolve_denglisch_guide(uuid, text, uuid) FROM PUBLIC, anon;

GRANT SELECT ON public.v_krankenstation_denglisch_guides TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tb_get_krankenstation_language_audit(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tb_resolve_krankenstation_language(uuid, text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tb_resolve_denglisch_guide(uuid, text, uuid) TO authenticated, service_role;

COMMIT;
