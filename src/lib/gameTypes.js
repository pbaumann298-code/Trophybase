/**
 * JSONB-Sprachmap, z. B. { de: 'Titel', en: 'Title', es: 'Título' }.
 * Altdaten können noch ein reiner String sein.
 * @typedef {Record<string, string>|string|null} LocalizedText
 */

/**
 * public.games
 * @typedef {Object} GameRow
 * @property {string} id UUID (PK)
 * @property {string} platform_game_id Route-Slug (NPWR…)
 * @property {string} ecosystem
 * @property {string} hardware
 * @property {string} [igdb_id]
 * @property {number} [release_jahr]
 * @property {string} [upcoming_date]
 * @property {string} [entwickler]
 * @property {string} [genre]
 * @property {string} [spiel_typ]
 * @property {string} [fortschritt]
 * @property {string} [status]
 * @property {string} [server_status]
 * @property {boolean} [has_online_trophies]
 * @property {boolean} [has_missable_trophies]
 * @property {number} [total_online_trophies]
 * @property {number} [total_missable_trophies]
 * @property {boolean} [platinum_achievable]
 * @property {number} [anzahl_trophaeen]
 * @property {boolean} [is_sony_fallback]
 * @property {boolean} [is_auto_translated]
 * @property {string} [original_locale]
 * @property {LocalizedText} [spieltitel]
 * @property {LocalizedText} [cover_url]
 * @property {LocalizedText} [beschreibung]
 * @property {LocalizedText} [status_explanation_localized]
 */

/**
 * games-Zeile nach mergeGameRecord: JSONB-Felder sind aufgelöste Strings,
 * plus Alt-Aliase (Spieltitel, Cover_URL, Release_Jahr, …).
 * @typedef {GameRow & Object} NormalizedGame
 * @property {string} [title]
 * @property {string} [description]
 * @property {string} [cover_url]
 * @property {string} [_locale] Tatsächlich benutzte Sprache
 * @property {boolean} [_translationFallback] true = Fallback-Sprache benutzt
 */

/**
 * public.game_achievements
 * @typedef {Object} GameAchievementRow
 * @property {string} game_id UUID → games.id
 * @property {string} platform_achievement_id
 * @property {string} [platform_game_id]
 * @property {string} trophy_type
 * @property {string} trophy_gruppe 'default' = Hauptspiel, sonst DLC
 * @property {string} [ist_versteckt]
 * @property {boolean} [is_missable]
 * @property {boolean} [is_story_related]
 * @property {boolean} [is_unachievable]
 * @property {string} [video_url]
 * @property {string} [timestamp]
 * @property {boolean} [is_auto_translated]
 * @property {string} [original_locale]
 * @property {LocalizedText} [trophy_name]
 * @property {LocalizedText} [trophy_desc]
 * @property {LocalizedText} [icon_url]
 * @property {LocalizedText} [global_seltenheit]
 * @property {LocalizedText} [guide_tip]
 * @property {Record<string, unknown>} [ai_translation]
 */

/**
 * @typedef {GameAchievementRow & Object} NormalizedAchievement
 * @property {string} [trophy_id] Alias → platform_achievement_id
 * @property {string} [trophy_name]
 * @property {string} [trophy_desc]
 * @property {string} [trophy_description]
 * @property {string} [icon_url]
 * @property {number|null} [rarity_percent] Zahl aus global_seltenheit
 */

/**
 * public.game_guides – Walkthrough, Sammelobjekte und Bosse in einer Tabelle.
 * @typedef {Object} GameGuideRow
 * @property {string} id UUID (PK)
 * @property {string} game_id UUID → games.id
 * @property {string} [platform_game_id]
 * @property {string} [local_id] Laufende Nummer aus der Quelltabelle („B_12" bei Bossen)
 * @property {number[]} sheet_type JSONB-Array der Reiter, z. B. [1], [1,2], [3].
 *   1=Walkthrough, 2=Sammelobjekte, 3=Bosse. Mehrere Werte = der Eintrag stand
 *   in mehreren Excel-Reitern und wurde beim Upload zusammengefasst.
 * @property {LocalizedText} [item_name]
 * @property {LocalizedText} [chronological_group]
 * @property {LocalizedText} [category_group]
 * @property {LocalizedText} [video_chapter]
 * @property {string} [timestamp]
 * @property {string} [video_url]
 * @property {string} [trophy_id]
 * @property {string} [is_trophy_relevant] 'Ja' | 'Nein'
 */

/**
 * game_guides-Zeile nach mergeGuideRow (Sprache aufgelöst).
 * @typedef {Object} GameGuideEntryRow
 * @property {string} guide_id UUID (= game_guides.id)
 * @property {string} game_id
 * @property {string} [local_id]
 * @property {number[]} sheet_types Alle Reiter des Eintrags – maßgeblich für Filter
 * @property {1|2|3|number} sheet_type Primärer Reiter (sheet_types[0]), nur Abwärtskompatibilität
 * @property {string} [item_name]
 * @property {string} [chronological_group]
 * @property {string} [category_group]
 * @property {string} [video_chapter]
 * @property {string} [timestamp]
 * @property {string} [video_url]
 * @property {string|null} [trophy_id]
 * @property {number} [sort_order] Aus local_id bzw. Ladereihenfolge
 * @property {string} [id] Stabile Frontend-ID nach mapGuideRows
 */

/** @typedef {GameGuideEntryRow} GameChapterRow */

/**
 * Boss-Sicht auf eine game_guides-Zeile (sheet_type === 3).
 * @typedef {GameGuideEntryRow & Object} GameBossRow
 * @property {string} [boss_id] Alias → guide_id
 * @property {string} [boss_name] Alias → item_name
 * @property {'Ja'|'Nein'|string} [is_trophy_relevant]
 */

export const GUIDE_REITER = {
  TROPHIES: 0,
  WALKTHROUGH: 1,
  COLLECTIBLES: 2,
  BOSSES: 3,
};
