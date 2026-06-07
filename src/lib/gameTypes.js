/**
 * @typedef {Object} GameGuideEntryRow
 * Identische Spalten in game_chapters (Reiter 1) und game_guides (Reiter 2).
 * @property {number} [guide_id]
 * @property {string} game_id
 * @property {string} [item_name] Anzeigename in CollectibleKacheln
 * @property {string} [timestamp]
 * @property {string} [video_url]
 * @property {string} [chronological_group] Gruppierung Reiter 1 (z. B. „Bahnhof Krat“)
 * @property {string} [category_group] Gruppierung Reiter 2 (z. B. „Waffen“)
 * @property {number} [sort_order]
 * @property {string} [id] Frontend: stabile Zeilen-ID nach Mapping
 */

/** @typedef {GameGuideEntryRow} GameChapterRow */
/** @typedef {GameGuideEntryRow} GameGuideRow */

/**
 * @typedef {Object} GameBossRow
 * @property {number} [boss_id]
 * @property {string} game_id
 * @property {string} [boss_name]
 * @property {string} [timestamp]
 * @property {string} [video_url]
 * @property {'Ja'|'Nein'|string} [is_trophy_relevant]
 * @property {number|string} [trophy_id]
 * @property {string} [id] Frontend: stabile Zeilen-ID nach Mapping
 */

/**
 * @typedef {Object} GameTrophyRow
 * @property {number|string} [trophy_id]
 * @property {string} game_id
 * @property {string} [trophy_name]
 * @property {string} [trophy_description]
 * @property {string} [trophy_type]
 * @property {string} [icon_url]
 * @property {string} [guide_tip]
 * @property {string} [video_url]
 * @property {string} [category_group]
 */

export const GUIDE_REITER = {
  TROPHIES: 0,
  CHRONOLOGICAL: 1,
  BY_TYPE: 2,
  BOSSES: 3,
};
