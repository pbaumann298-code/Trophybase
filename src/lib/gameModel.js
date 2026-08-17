import {
  GAME_PK,
  GAME_PLATFORM_ID,
  GAME_STRUCT,
  GAME_I18N,
  GAME_FIELDS,
  ACHIEVEMENT_PK,
  ACHIEVEMENT_STRUCT,
  ACHIEVEMENT_I18N,
  FALLBACK_LANGUAGE,
} from './gameSchema';
import { localizeJsonField, parsePercentValue, pickLocalized } from './translationUtils';

/**
 * Mergt eine games-Zeile (JSONB-Sprachmaps) zu einem flachen UI-Objekt.
 * @param {Record<string, unknown>} gameRow
 * @param {string} locale
 * @param {string} [fallbackLocale]
 */
export function mergeGameRecord(gameRow, locale, fallbackLocale = FALLBACK_LANGUAGE) {
  if (!gameRow) return null;

  const titlePick = pickLocalized(gameRow[GAME_I18N.title], locale, fallbackLocale);
  const description = localizeJsonField(gameRow[GAME_I18N.description], locale, fallbackLocale);
  const cover_url = localizeJsonField(gameRow[GAME_I18N.coverUrl], locale, fallbackLocale);
  const statusExplanation = localizeJsonField(
    gameRow[GAME_I18N.statusExplanation],
    locale,
    fallbackLocale,
  );

  const merged = {
    ...gameRow,
    [GAME_FIELDS.title]: titlePick.text,
    [GAME_FIELDS.description]: description,
    [GAME_FIELDS.cover]: cover_url,
    // JSONB-Spalten durch aufgelöste Strings ersetzen
    [GAME_I18N.title]: titlePick.text,
    [GAME_I18N.description]: description,
    [GAME_I18N.statusExplanation]: statusExplanation,
    status_explanation: statusExplanation,
    _locale: titlePick.locale,
    _translationFallback: titlePick.usedFallback,
  };

  return applyLegacyGameAliases(merged);
}

/** Aliase für bestehende UI-Bindings (Spieltitel, Cover_URL, …) */
export function applyLegacyGameAliases(game) {
  if (!game) return game;

  const title = game[GAME_FIELDS.title] ?? game.Spieltitel ?? '';
  const cover = game[GAME_FIELDS.cover] ?? game.Cover_URL ?? '';
  const description = game[GAME_FIELDS.description] ?? game.Beschreibung_de ?? '';
  const year = game[GAME_STRUCT.releaseYear] ?? game.Release_Jahr ?? null;
  const developer = game[GAME_STRUCT.developer] ?? game.Entwickler ?? '';

  return {
    ...game,
    NPWR_ID: game[GAME_PLATFORM_ID] ?? game.NPWR_ID,
    npwr_id: game[GAME_PLATFORM_ID] ?? game.npwr_id,
    Spieltitel: title,
    Cover_URL: cover,
    cover_url: cover,
    Konsole: game[GAME_STRUCT.hardware] ?? game.Konsole,
    konsole: game[GAME_STRUCT.hardware] ?? game.konsole,
    Release_Jahr: year,
    release_jahr: year,
    /** @deprecated Spalte heißt release_jahr */
    release_year: year,
    Entwickler: developer,
    entwickler: developer,
    /** @deprecated Spalte heißt entwickler */
    developer,
    Genre: game[GAME_STRUCT.genre] ?? game.Genre,
    beschreibung: description,
    beschreibung_de: description,
    Beschreibung_de: description,
    Status: game[GAME_STRUCT.status] ?? game.Status,
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
  return String(game[GAME_PLATFORM_ID] ?? game.NPWR_ID ?? game.npwr_id ?? '').trim();
}

/** URL-Segment: Plattform-ID bevorzugt, sonst UUID */
export function getRouteSlug(gameOrId) {
  if (!gameOrId) return '';
  if (typeof gameOrId === 'string') return gameOrId.trim();
  return getPlatformGameId(gameOrId) || getGameUuid(gameOrId);
}

export function getGameTitle(game) {
  if (!game) return '';
  return String(game[GAME_FIELDS.title] ?? game.Spieltitel ?? '').trim();
}

export function getGameCover(game) {
  if (!game) return '';
  return String(game[GAME_FIELDS.cover] ?? game.Cover_URL ?? '').trim();
}

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID_PATTERN.test(String(value ?? '').trim());
}
