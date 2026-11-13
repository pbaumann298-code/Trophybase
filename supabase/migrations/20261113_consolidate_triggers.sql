-- =============================================================================
-- TrophyBase – Trigger-Konsolidierung & Reihenfolge-Härtung (11/2026)
-- =============================================================================
-- Einmalig im Supabase SQL-Editor ausführen.
--
-- Hinweis: Die neuen Funktionskörper (tb_sync_publishing_columns_trigger,
-- trg_clean_spieltitel, tb_assign_game_slug) sowie der komplette Altdaten-
-- Heillauf über alle verdrifteten Spiele (319x publishing_status + 465x
-- de_published_at -> jetzt 0 Drift!) sind bereits LIVE eingespielt.
--
-- Dieses Skript räumt jetzt die überflüssigen Trigger-Hüllen ab, bringt die
-- BEFORE-Trigger auf games, game_guides und game_guides_rohmaterial in eine
-- deterministische alphabetische Reihenfolge und löscht die ungenutzte
-- Platzhalter-Tabelle user_game_trophies.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. public.games: 4 konkurrierende Status-Trigger -> 1 Single-Source-of-Truth
--    + Titel-Bereinigung (games_01_clean_spieltitel) garantiert VOR Slug-Vergabe
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_auto_publish_backlog_locales ON public.games;
DROP TRIGGER IF EXISTS trg_games_guide_de_published_at ON public.games;
DROP TRIGGER IF EXISTS trg_sync_game_publish_state ON public.games;
DROP TRIGGER IF EXISTS games_sync_publishing_columns ON public.games;

DROP FUNCTION IF EXISTS public.tb_auto_publish_backlog_locales();
DROP FUNCTION IF EXISTS public.fn_stamp_guide_de_published();
DROP FUNCTION IF EXISTS public.tb_sync_game_publish_state();

-- Überschreibt auch versehentliche manuelle Schreibzugriffe auf abgeleitete Spalten sofort sauber:
CREATE TRIGGER games_sync_publishing_columns
  BEFORE INSERT OR UPDATE OF status, publishing_status, published_locales, is_published
  ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.tb_sync_publishing_columns_trigger();

-- Reihenfolge-Fix beim INSERT: games_01_clean_spieltitel läuft alphabetisch VOR games_assign_slug
DROP TRIGGER IF EXISTS trg_clean_games_spieltitel ON public.games;
DROP TRIGGER IF EXISTS games_01_clean_spieltitel ON public.games;

CREATE TRIGGER games_01_clean_spieltitel
  BEFORE INSERT OR UPDATE OF spieltitel, slug
  ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_clean_spieltitel();

DROP TRIGGER IF EXISTS games_assign_slug ON public.games;
CREATE TRIGGER games_assign_slug
  BEFORE INSERT OR UPDATE OF spieltitel, hardware, release_jahr, slug, status
  ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.tb_assign_game_slug();

-- ---------------------------------------------------------------------------
-- 2. public.game_guides: Deterministische BEFORE-Trigger-Kette (g_01 .. g_06)
--    Behebt zwei subtile Reihenfolge-Bugs:
--    a) Schreibschutz (g_01) prüft ZUERST, bevor Auto-Translate (g_03) Gruppen
--       übersetzt (verhindert Fehl-Blockaden bei erlaubten item_name-Edits).
--    b) clean_sheet_type (g_05, jetzt inkl. boss_group) läuft VOR
--       spiel_region_tab (g_06), statt wie bisher alphabetisch dahinter.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_protect_published_guides ON public.game_guides;
DROP TRIGGER IF EXISTS game_guides_clean_trophy_id ON public.game_guides;
DROP TRIGGER IF EXISTS trg_auto_translate_numbered_guide_fields ON public.game_guides;
DROP TRIGGER IF EXISTS trg_auto_derive_sheet_type ON public.game_guides;
DROP TRIGGER IF EXISTS trg_game_guides_clean_sheet_type ON public.game_guides;
DROP TRIGGER IF EXISTS trg_auto_derive_spiel_region_tab ON public.game_guides;

DROP TRIGGER IF EXISTS g_01_protect_published_guides ON public.game_guides;
DROP TRIGGER IF EXISTS g_02_clean_trophy_id ON public.game_guides;
DROP TRIGGER IF EXISTS g_03_translate_numbered_fields ON public.game_guides;
DROP TRIGGER IF EXISTS g_04_auto_derive_sheet_type ON public.game_guides;
DROP TRIGGER IF EXISTS g_05_clean_sheet_type ON public.game_guides;
DROP TRIGGER IF EXISTS g_06_auto_derive_spiel_region_tab ON public.game_guides;

CREATE TRIGGER g_01_protect_published_guides
  BEFORE DELETE OR UPDATE
  ON public.game_guides
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_published_guide_lock();

CREATE TRIGGER g_02_clean_trophy_id
  BEFORE INSERT OR UPDATE OF trophy_id
  ON public.game_guides
  FOR EACH ROW
  EXECUTE FUNCTION public.tb_clean_trophy_id_trigger();

CREATE TRIGGER g_03_translate_numbered_fields
  BEFORE INSERT OR UPDATE OF item_name, chronological_group, category_group, boss_group, spiel_region
  ON public.game_guides
  FOR EACH ROW
  EXECUTE FUNCTION public.tb_trg_translate_numbered_guide_fields();

CREATE TRIGGER g_04_auto_derive_sheet_type
  BEFORE INSERT OR UPDATE OF chronological_group, category_group, boss_group
  ON public.game_guides
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_derive_guide_sheet_type();

CREATE TRIGGER g_05_clean_sheet_type
  BEFORE INSERT OR UPDATE OF sheet_type, chronological_group, category_group, boss_group
  ON public.game_guides
  FOR EACH ROW
  EXECUTE FUNCTION public.tb_trg_enforce_clean_sheet_type();

CREATE TRIGGER g_06_auto_derive_spiel_region_tab
  BEFORE INSERT OR UPDATE OF spiel_region, spiel_region_tab, sheet_type
  ON public.game_guides
  FOR EACH ROW
  EXECUTE FUNCTION public.tb_auto_derive_spiel_region_tab();

-- ---------------------------------------------------------------------------
-- 3. public.game_guides_rohmaterial: Gleiche Reihenfolge-Korrektur (r_01 .. r_03)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_auto_derive_sheet_type_roh ON public.game_guides_rohmaterial;
DROP TRIGGER IF EXISTS trg_rohmaterial_clean_sheet_type ON public.game_guides_rohmaterial;
DROP TRIGGER IF EXISTS trg_auto_derive_spiel_region_tab_roh ON public.game_guides_rohmaterial;

DROP TRIGGER IF EXISTS r_01_auto_derive_sheet_type ON public.game_guides_rohmaterial;
DROP TRIGGER IF EXISTS r_02_clean_sheet_type ON public.game_guides_rohmaterial;
DROP TRIGGER IF EXISTS r_03_auto_derive_spiel_region_tab ON public.game_guides_rohmaterial;

CREATE TRIGGER r_01_auto_derive_sheet_type
  BEFORE INSERT OR UPDATE OF chronological_group, category_group, boss_group
  ON public.game_guides_rohmaterial
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_derive_guide_sheet_type();

CREATE TRIGGER r_02_clean_sheet_type
  BEFORE INSERT OR UPDATE OF sheet_type, chronological_group, category_group, boss_group
  ON public.game_guides_rohmaterial
  FOR EACH ROW
  EXECUTE FUNCTION public.tb_trg_enforce_clean_sheet_type();

CREATE TRIGGER r_03_auto_derive_spiel_region_tab
  BEFORE INSERT OR UPDATE OF spiel_region, spiel_region_tab, sheet_type
  ON public.game_guides_rohmaterial
  FOR EACH ROW
  EXECUTE FUNCTION public.tb_auto_derive_spiel_region_tab();

-- ---------------------------------------------------------------------------
-- 4. Ungenutzte Platzhalter-Tabelle user_game_trophies entfernen (0 Zeilen)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.user_game_trophies;

COMMIT;
