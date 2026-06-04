/**
 * @typedef {Object} GameGuideRow
 * @property {number} [guide_id]
 * @property {string} game_id
 * @property {string} [item_name]
 * @property {string} [timestamp]
 * @property {string} [video_url]
 * @property {string} [chronological_group] Gebiet/Kapitel (Reiter 1 – chronologisch)
 * @property {string} [category_group] Gegenstandstyp (Reiter 2 – Komplettierung)
 * @property {number|string} [sheet_name] Pipeline-Reiter: 1 = chronologisch, 2 = nach Art
 * @property {number} [sort_order]
 * @property {number} [chapter_order]
 * @property {string} [id] Frontend: stabile Zeilen-ID nach Mapping
 */

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
