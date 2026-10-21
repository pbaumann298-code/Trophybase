import { GAME_FIELDS, GAME_I18N, GAME_STRUCT, isServerDeadType } from './gameSchema.js';
import { normalizeLocale } from './locale.js';
import { localizeJsonField } from './translationUtils.js';

function parseCount(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Automatischer Kurztext aus verpassbaren / Online-Trophäen.
 * Leer, wenn Servertot oder keine Zahlen gesetzt sind.
 * @param {object|null|undefined} game
 * @param {string} locale
 */
export function autoStatusExplanation(game, locale = 'de') {
  if (!game || isServerDeadType(game[GAME_STRUCT.gameType] ?? game.spiel_typ)) {
    return '';
  }

  const missable = parseCount(game[GAME_STRUCT.totalMissableTrophies]);
  const online = parseCount(game[GAME_STRUCT.totalOnlineTrophies]);
  if (missable == null && online == null) return '';

  const lang = normalizeLocale(locale);

  if (lang === 'en') {
    if (missable === 0 && online === 0) {
      return 'No missable trophies · Fully obtainable offline';
    }
    const parts = [];
    if (missable != null) {
      parts.push(
        missable === 0
          ? 'No missable trophies'
          : `${missable} missable ${missable === 1 ? 'trophy' : 'trophies'}`,
      );
    }
    if (online != null) {
      parts.push(
        online === 0
          ? 'Fully obtainable offline'
          : `${online} online ${online === 1 ? 'trophy' : 'trophies'}`,
      );
    }
    return parts.join(' · ');
  }

  if (lang === 'es') {
    if (missable === 0 && online === 0) {
      return 'Sin trofeos perdibles · Completamente offline';
    }
    const parts = [];
    if (missable != null) {
      parts.push(
        missable === 0
          ? 'Sin trofeos perdibles'
          : `${missable} ${missable === 1 ? 'trofeo perdible' : 'trofeos perdibles'}`,
      );
    }
    if (online != null) {
      parts.push(
        online === 0
          ? 'Completamente offline'
          : `${online} ${online === 1 ? 'trofeo online' : 'trofeos online'}`,
      );
    }
    return parts.join(' · ');
  }

  if (missable === 0 && online === 0) {
    return 'Keine verpassbaren Trophäen · Komplett offline erspielbar';
  }
  const parts = [];
  if (missable != null) {
    parts.push(
      missable === 0
        ? 'Keine verpassbaren Trophäen'
        : `${missable} verpassbare ${missable === 1 ? 'Trophäe' : 'Trophäen'}`,
    );
  }
  if (online != null) {
    parts.push(
      online === 0
        ? 'Komplett offline erspielbar'
        : `${online} Online-${online === 1 ? 'Trophäe' : 'Trophäen'}`,
    );
  }
  return parts.join(' · ');
}

/**
 * Hinterlegter Text für genau diese Sprache (kein Sprach-Fallback).
 * @param {object|null|undefined} game
 * @param {string} locale
 */
export function storedStatusExplanation(game, locale = 'de') {
  if (!game) return '';
  const lang = normalizeLocale(locale);
  const raw =
    game[GAME_I18N.statusExplanation] ??
    game.status_explanation_localized ??
    game[GAME_FIELDS.statusExplanation];

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return localizeJsonField(raw, lang, undefined, { exact: true });
  }

  // Nach mergeGameRecord: aufgelöster String nur nutzen, wenn Locale passt.
  if (typeof raw === 'string' && raw.trim()) {
    if (!game._locale || normalizeLocale(game._locale) === lang) {
      return raw.trim();
    }
  }

  const merged = String(game[GAME_FIELDS.statusExplanation] ?? '').trim();
  if (merged && (!game._locale || normalizeLocale(game._locale) === lang)) {
    return merged;
  }

  return '';
}

/**
 * Eigener Text oder Auto-Satz (nicht für Servertot-Auto).
 * @param {object|null|undefined} game
 * @param {string} locale
 */
export function resolveStatusExplanation(game, locale = 'de') {
  const stored = storedStatusExplanation(game, locale);
  if (stored) return stored;
  return autoStatusExplanation(game, locale);
}

/**
 * SEO-/Crawler-Fallback, wenn keine Beschreibung vorliegt.
 * @param {string} title
 * @param {string} locale
 */
export function guideDescriptionFallback(title, locale = 'de') {
  const name = String(title ?? '').trim() || 'TrophyBase';
  const lang = normalizeLocale(locale);
  if (lang === 'en') return `${name} – Trophy Guide on TrophyBase.`;
  if (lang === 'es') return `${name} – Guía de trofeos en TrophyBase.`;
  return `${name} – Trophäen-Guide auf TrophyBase.`;
}

/**
 * UI-Labels für den Crawler-Guide (de/en/es).
 * @param {string} locale
 */
export function guidePageLabels(locale = 'de') {
  const lang = normalizeLocale(locale);
  if (lang === 'en') {
    return {
      crumbs: 'Breadcrumb',
      overview: 'Guide overview',
      trophiesTotal: 'Trophies total',
      trophiesMissable: 'Missable trophies',
      trophiesOnline: 'Online trophies',
      playtimeTitle: 'Playtime',
      playtimeStory: 'Main story only',
      playtimeComplete: 'Completionist',
      playtimeHours: (n) => `${n} h`,
      trophies: 'Trophies',
      mainGame: 'Main game',
      walkthrough: 'Walkthrough',
      collectibles: 'Collectibles',
      bosses: 'Bosses',
      footer: 'Independent trophy guide. Not an official Sony product.',
    };
  }
  if (lang === 'es') {
    return {
      crumbs: 'Migas de pan',
      overview: 'Resumen de la guía',
      trophiesTotal: 'Trofeos en total',
      trophiesMissable: 'Trofeos perdibles',
      trophiesOnline: 'Trofeos en línea',
      playtimeTitle: 'Duración',
      playtimeStory: 'Solo historia principal',
      playtimeComplete: 'Completista',
      playtimeHours: (n) => `${n} h`,
      trophies: 'Trofeos',
      mainGame: 'Juego principal',
      walkthrough: 'Walkthrough',
      collectibles: 'Coleccionables',
      bosses: 'Jefes',
      footer: 'Guía de trofeos independiente. No es un producto oficial de Sony.',
    };
  }
  return {
    crumbs: 'Brotkrumen',
    overview: 'Guide-Überblick',
    trophiesTotal: 'Trophäen gesamt',
    trophiesMissable: 'Verpassbare Trophäen',
    trophiesOnline: 'Online-Trophäen',
    playtimeTitle: 'Spieldauer',
    playtimeStory: 'Nur Hauptstory',
    playtimeComplete: 'Komplettierer',
    playtimeHours: (n) => `${n} Std.`,
    trophies: 'Trophäen',
    mainGame: 'Hauptspiel',
    walkthrough: 'Walkthrough',
    collectibles: 'Sammelobjekte',
    bosses: 'Bosse',
    footer: 'Unabhängiger Trophäen-Guide. Kein offizielles Sony-Angebot.',
  };
}

export function formatPlaytimeHours(value, locale = 'de') {
  if (value == null || value === '') return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const lang = normalizeLocale(locale);
  const shown = number.toLocaleString(lang === 'en' ? 'en' : lang === 'es' ? 'es' : 'de', {
    maximumFractionDigits: 1,
  });
  return guidePageLabels(lang).playtimeHours(shown);
}

export function hasPlaytimeValue(value) {
  if (value == null || value === '') return false;
  return Number.isFinite(Number(value));
}
