import {
  GAME_PK,
  GAME_PLATFORM_ID,
  GAME_I18N,
  GAME_FIELDS,
  ACHIEVEMENT_PK,
  ACHIEVEMENT_STRUCT,
  ACHIEVEMENT_I18N,
  FALLBACK_LANGUAGE,
} from './gameSchema';
import {
  localizeJsonField,
  parsePercentValue,
  pickLocalized,
  PRIMARY_LANGUAGE,
} from './translationUtils';

/**
 * Mergt eine games-Zeile (JSONB-Sprachmaps) zu einem flachen UI-Objekt.
 * Die JSONB-Spalten werden dabei durch die aufgelösten Strings ersetzt, damit
 * kein Rohobjekt in die UI gelangt.
 * @param {Record<string, unknown>} gameRow
 * @param {string} locale
 * @param {string} [fallbackLocale]
 */
export function mergeGameRecord(gameRow, locale, fallbackLocale = FALLBACK_LANGUAGE) {
  if (!gameRow) return null;

  const titlePick = pickLocalized(gameRow[GAME_I18N.title], locale, fallbackLocale);
  const description = localizeJsonField(gameRow[GAME_I18N.description], locale, fallbackLocale);
  const cover = localizeJsonField(gameRow[GAME_I18N.coverUrl], locale, fallbackLocale);
  const statusExplanation = localizeJsonField(
    gameRow[GAME_I18N.statusExplanation],
    locale,
    fallbackLocale,
  );

  return {
    ...gameRow,
    [GAME_FIELDS.title]: titlePick.text,
    [GAME_FIELDS.description]: description,
    [GAME_FIELDS.cover]: cover,
    [GAME_FIELDS.statusExplanation]: statusExplanation,
    [GAME_I18N.title]: titlePick.text,
    [GAME_I18N.description]: description,
    [GAME_I18N.statusExplanation]: statusExplanation,
    _locale: titlePick.locale,
    _translationFallback: titlePick.usedFallback,
  };
}

/** ist_versteckt ist Text ('Ja'/'Nein'), nicht boolean. */
export function toBoolFlag(value) {
  if (typeof value === 'boolean') return value;
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return false;
  return ['ja', 'yes', 'true', '1', 'si', 'sí'].includes(raw);
}

/**
 * Mergt eine game_achievements-Zeile (JSONB-Sprachmaps) zu einem flachen
 * UI-Objekt.
 * @param {Record<string, unknown>} row
 * @param {string} locale
 * @param {string} [fallbackLocale]
 */
export function mergeAchievementRecord(row, locale, fallbackLocale = FALLBACK_LANGUAGE) {
  if (!row) return null;

  const platformId = String(row[ACHIEVEMENT_PK] ?? '');
  const namePick = pickLocalized(row[ACHIEVEMENT_I18N.name], locale, fallbackLocale);
  const trophy_desc = localizeJsonField(row[ACHIEVEMENT_I18N.desc], locale, fallbackLocale);
  const guide_tip = localizeJsonField(row[ACHIEVEMENT_I18N.guideTip], locale, fallbackLocale);
  const icon_url = localizeJsonField(row[ACHIEVEMENT_I18N.iconUrl], locale, fallbackLocale);
  const rarity = localizeJsonField(row[ACHIEVEMENT_I18N.rarity], locale, fallbackLocale);

  return {
    ...row,
    [ACHIEVEMENT_PK]: platformId,
    trophy_id: platformId,
    id: platformId,
    trophy_name: namePick.text,
    trophy_desc,
    trophy_description: trophy_desc,
    guide_tip,
    icon_url,
    global_seltenheit: rarity,
    rarity_percent: parsePercentValue(rarity),
    trophy_type: row[ACHIEVEMENT_STRUCT.trophyType] ?? '',
    trophy_gruppe: row[ACHIEVEMENT_STRUCT.trophyGroup] ?? 'default',
    ist_versteckt: row[ACHIEVEMENT_STRUCT.isHidden] ?? '',
    is_hidden: toBoolFlag(row[ACHIEVEMENT_STRUCT.isHidden]),
    is_missable: Boolean(row[ACHIEVEMENT_STRUCT.isMissable]),
    is_story_related: Boolean(row[ACHIEVEMENT_STRUCT.isStoryRelated]),
    is_unachievable: Boolean(row[ACHIEVEMENT_STRUCT.isUnachievable]),
    video_url: row[ACHIEVEMENT_STRUCT.videoUrl] ?? '',
    _locale: namePick.locale,
    _translationFallback: namePick.usedFallback,
  };
}

/**
 * @param {Array<Record<string, unknown>>} gameRows
 * @param {string} locale
 */
export function mergeGameRows(gameRows, locale) {
  return (gameRows ?? []).map((row) => mergeGameRecord(row, locale)).filter(Boolean);
}

/**
 * @param {object|string|null|undefined} game
 */
export function getGameUuid(game) {
  if (!game) return '';
  if (typeof game === 'string') return isUuid(game) ? game : '';
  return String(game[GAME_PK] ?? game.game_id ?? '').trim();
}

export function getPlatformGameId(game) {
  if (!game || typeof game === 'string') return '';
  return String(game[GAME_PLATFORM_ID] ?? '').trim();
}

/** URL-Segment: Plattform-ID bevorzugt, sonst UUID */
export function getRouteSlug(gameOrId) {
  if (!gameOrId) return '';
  if (typeof gameOrId === 'string') return gameOrId.trim();
  return getPlatformGameId(gameOrId) || getGameUuid(gameOrId);
}

/**
 * Liest ein lokalisiertes games-Feld unabhängig davon, ob die Zeile noch die
 * rohe JSONB-Sprachmap enthält oder bereits durch mergeGameRecord lief.
 * Gibt garantiert einen String zurück – niemals ein Objekt.
 * @param {object|null|undefined} game
 * @param {string} jsonbColumn JSONB-Spalte auf games (z. B. spieltitel)
 * @param {string|null} mergedField Feld auf dem gemergten UI-Objekt
 * @param {string} locale
 * @returns {string}
 */
function readLocalizedGameField(game, jsonbColumn, mergedField, locale) {
  if (!game || typeof game !== 'object') return '';

  const fromColumn = localizeJsonField(game[jsonbColumn], locale);
  if (fromColumn) return fromColumn;

  if (mergedField && mergedField !== jsonbColumn) {
    return localizeJsonField(game[mergedField], locale);
  }

  return '';
}

/**
 * @param {object|null|undefined} game
 * @param {string} [locale]
 * @returns {string}
 */
export function getGameTitle(game, locale = PRIMARY_LANGUAGE) {
  return readLocalizedGameField(game, GAME_I18N.title, GAME_FIELDS.title, locale);
}

/**
 * @param {object|null|undefined} game
 * @param {string} [locale]
 * @returns {string}
 */
export function getGameCover(game, locale = PRIMARY_LANGUAGE) {
  return readLocalizedGameField(game, GAME_I18N.coverUrl, GAME_FIELDS.cover, locale);
}

/**
 * @param {object|null|undefined} game
 * @param {string} [locale]
 * @returns {string}
 */
export function getGameDescription(game, locale = PRIMARY_LANGUAGE) {
  return readLocalizedGameField(game, GAME_I18N.description, GAME_FIELDS.description, locale);
}

/**
 * @param {object|null|undefined} game
 * @param {string} [locale]
 * @returns {string}
 */
export function getGameStatusExplanation(game, locale = PRIMARY_LANGUAGE) {
  return readLocalizedGameField(
    game,
    GAME_I18N.statusExplanation,
    GAME_FIELDS.statusExplanation,
    locale,
  );
}

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID_PATTERN.test(String(value ?? '').trim());
}
