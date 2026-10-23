import { GAME_FIELDS, GAME_I18N, GAME_STRUCT, isServerDeadType } from './gameSchema.js';
import { normalizeLocale } from './locale.js';
import { localizeJsonField } from './translationUtils.js';
import { t } from './uiStrings.js';

function parseCount(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const CLOUD_SAVE_REGEX = /\b(cloud|savegame|speicherstand|usb-stick|backup|ps\+\s*cloud|cloud-save|save\s*scum)\b/i;

function extractTrophyText(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    return Object.values(val).filter((v) => typeof v === 'string').join(' ');
  }
  return '';
}

function detectCloudSaveInTrophies(trophies) {
  if (!Array.isArray(trophies) || trophies.length === 0) return false;
  for (const row of trophies) {
    if (!row) continue;
    const tip = extractTrophyText(row.guide_tip);
    const tipLong = extractTrophyText(row.guide_tip_long ?? row['Guide-Tip-lang']);
    if (CLOUD_SAVE_REGEX.test(tip) || CLOUD_SAVE_REGEX.test(tipLong)) {
      return true;
    }
  }
  return false;
}

/**
 * Baut kompakte Platin-Eckdaten (Online/PS+-Status, Verpassbare Trophäen,
 * Durchgänge, Cloud-Save-Backup) für den Kopfbereich der Überblick-Kachel.
 *
 * @param {object|null|undefined} game
 * @param {Array<object>|null|undefined} trophies
 * @param {object|null|undefined} radarProfile
 * @param {string} [locale]
 * @returns {Array<{ key: string, icon: string, text: string, tone?: 'green'|'amber'|'blue'|'neutral' }>}
 */
export function buildPlatinumQuickFacts(game, trophies = [], radarProfile = null, locale = 'de') {
  if (!game || isServerDeadType(game[GAME_STRUCT.gameType] ?? game.spiel_typ)) {
    return [];
  }

  const lang = normalizeLocale(locale);
  const facts = [];

  const trophyList = Array.isArray(trophies) ? trophies : [];
  const dbOnline = parseCount(game[GAME_STRUCT.totalOnlineTrophies]);
  const dbMissable = parseCount(game[GAME_STRUCT.totalMissableTrophies]);

  const onlineCount = dbOnline != null
    ? dbOnline
    : trophyList.length > 0
      ? trophyList.filter((tr) => Boolean(tr?.is_online)).length
      : (game[GAME_STRUCT.hasOnlineTrophies] === false ? 0 : null);

  const missableCount = dbMissable != null
    ? dbMissable
    : trophyList.length > 0
      ? trophyList.filter((tr) => Boolean(tr?.is_missable)).length
      : (game[GAME_STRUCT.hasMissableTrophies] === false ? 0 : null);

  const rawOnlineMode = String(
    radarProfile?.online_requirement ??
    game?.status?.online_mode ??
    '',
  ).trim().toLowerCase();

  // 1. Online & PS+ Status
  if (rawOnlineMode === 'offline' || ( !rawOnlineMode && onlineCount === 0 )) {
    const text = lang === 'de'
      ? 'Komplett offline erspielbar (kein PS+ nötig)'
      : lang === 'es'
        ? 'Completamente offline (sin necesidad de PS+)'
        : lang === 'pt'
          ? 'Totalmente possível offline (sem necessidade de PS+)'
          : lang === 'fr'
            ? 'Entièrement réalisable hors ligne (sans PS+)'
            : lang === 'it'
              ? 'Completamente ottenibile offline (senza PS+)'
              : 'Fully obtainable offline (no PS+ required)';
    facts.push({ key: 'online', icon: '🟢', text, tone: 'green' });
  } else if (rawOnlineMode === 'internet_no_psplus') {
    const text = lang === 'de'
      ? 'Internetverbindung nötig, aber kein PS+ Abo erforderlich'
      : lang === 'es'
        ? 'Requiere conexión a internet, pero no suscripción a PS+'
        : lang === 'pt'
          ? 'Requer conexão com a internet, mas sem assinatura PS+'
          : lang === 'fr'
            ? 'Connexion internet requise, mais sans abonnement PS+'
            : lang === 'it'
              ? 'Connessione internet richiesta, ma senza abbonamento PS+'
              : 'Internet connection required, but no PS+ subscription needed';
    facts.push({ key: 'online', icon: '🌐', text, tone: 'blue' });
  } else if (rawOnlineMode === 'psplus_required') {
    const text = lang === 'de'
      ? 'PS+ Abo für Online-Trophäen erforderlich'
      : lang === 'es'
        ? 'Suscripción a PS+ obligatoria para trofeos online'
        : lang === 'pt'
          ? 'Assinatura PS+ necessária para troféus online'
          : lang === 'fr'
            ? 'Abonnement PS+ requis pour les trophées en ligne'
            : lang === 'it'
              ? 'Abbonamento PS+ richiesto per i trofei online'
              : 'PS+ subscription required for online trophies';
    facts.push({ key: 'online', icon: '🌐', text, tone: 'amber' });
  } else if (onlineCount != null && onlineCount > 0) {
    const text = lang === 'de'
      ? `${onlineCount} Online-${onlineCount === 1 ? 'Trophäe' : 'Trophäen'} erforderlich`
      : lang === 'es'
        ? `${onlineCount} ${onlineCount === 1 ? 'trofeo online requerido' : 'trofeos online requeridos'}`
        : lang === 'pt'
          ? `${onlineCount} ${onlineCount === 1 ? 'troféu online necessário' : 'troféus online necessários'}`
          : lang === 'fr'
            ? `${onlineCount} ${onlineCount === 1 ? 'trophée en ligne requis' : 'trophées en ligne requis'}`
            : lang === 'it'
              ? `${onlineCount} ${onlineCount === 1 ? 'trofeo online richiesto' : 'trofei online richiesti'}`
              : `${onlineCount} online ${onlineCount === 1 ? 'trophy' : 'trophies'} required`;
    facts.push({ key: 'online', icon: '🌐', text, tone: 'amber' });
  }

  // 2. Verpassbare Trophäen
  if (missableCount === 0) {
    const text = lang === 'de'
      ? 'Keine verpassbaren Trophäen'
      : lang === 'es'
        ? 'Sin trofeos perdibles'
        : lang === 'pt'
          ? 'Sem troféus perdíveis'
          : lang === 'fr'
            ? 'Aucun trophée manquable'
            : lang === 'it'
              ? 'Nessun trofeo mancabile'
              : 'No missable trophies';
    facts.push({ key: 'missable', icon: '✅', text, tone: 'green' });
  } else if (missableCount != null && missableCount > 0) {
    const text = lang === 'de'
      ? `${missableCount} verpassbare ${missableCount === 1 ? 'Trophäe' : 'Trophäen'}`
      : lang === 'es'
        ? `${missableCount} ${missableCount === 1 ? 'trofeo perdible' : 'trofeos perdibles'}`
        : lang === 'pt'
          ? `${missableCount} ${missableCount === 1 ? 'troféu perdível' : 'troféus perdíveis'}`
          : lang === 'fr'
            ? `${missableCount} ${missableCount === 1 ? 'trophée manquable' : 'trophées manquables'}`
            : lang === 'it'
              ? `${missableCount} ${missableCount === 1 ? 'trofeo mancabile' : 'trofei mancabili'}`
              : `${missableCount} missable ${missableCount === 1 ? 'trophy' : 'trophies'}`;
    facts.push({ key: 'missable', icon: '⚠️', text, tone: 'amber' });
  }

  // 3. Durchgänge (Playthroughs)
  const playthroughs = radarProfile?.playthroughs ?? game?.status?.playthroughs ?? null;
  if (playthroughs != null && String(playthroughs).trim() !== '') {
    const rawPt = String(playthroughs).trim();
    const numPt = Number(rawPt);
    let text = '';
    if (Number.isFinite(numPt) && numPt > 0) {
      text = lang === 'de'
        ? `${numPt} ${numPt === 1 ? 'Durchgang' : 'Durchgänge'}`
        : lang === 'es'
          ? `${numPt} ${numPt === 1 ? 'pasada' : 'pasadas'}`
          : lang === 'pt'
            ? `${numPt} ${numPt === 1 ? 'jogada' : 'jogadas'}`
            : lang === 'fr'
              ? `${numPt} ${numPt === 1 ? 'partie' : 'parties'}`
              : lang === 'it'
                ? `${numPt} ${numPt === 1 ? 'run' : 'run'}`
                : `${numPt} ${numPt === 1 ? 'playthrough' : 'playthroughs'}`;
    } else if (lang === 'de' || !/[äöüß]|Durchg/i.test(rawPt)) {
      text = rawPt;
    }
    if (text) {
      facts.push({ key: 'playthroughs', icon: '🔁', text, tone: 'neutral' });
    }
  }

  // 4. Cloud-Save-Abkürzung
  const hasCloudShortcut =
    radarProfile?.cloud_save_shortcut === true ||
    game?.status?.cloud_save_shortcut === true ||
    detectCloudSaveInTrophies(trophyList);

  if (hasCloudShortcut) {
    const text = lang === 'de'
      ? 'Durchgänge per Cloud-Save-Backup abkürzbar'
      : lang === 'es'
        ? 'Pasadas reducibles mediante guardado en la nube'
        : lang === 'pt'
          ? 'Jogadas reduzíveis via backup na nuvem'
          : lang === 'fr'
            ? 'Parties réductibles via sauvegarde Cloud'
            : lang === 'it'
              ? 'Run riducibili tramite backup Cloud Save'
              : 'Playthroughs can be shortened via Cloud Save backup';
    facts.push({ key: 'cloud_save', icon: '☁️', text, tone: 'blue' });
  }

  return facts;
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

  if (lang === 'de') {
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

  if (lang === 'pt') {
    if (missable === 0 && online === 0) {
      return 'Sem troféus perdíveis · Totalmente possível offline';
    }
    const parts = [];
    if (missable != null) {
      parts.push(
        missable === 0
          ? 'Sem troféus perdíveis'
          : `${missable} ${missable === 1 ? 'troféu perdível' : 'troféus perdíveis'}`,
      );
    }
    if (online != null) {
      parts.push(
        online === 0
          ? 'Totalmente possível offline'
          : `${online} ${online === 1 ? 'troféu online' : 'troféus online'}`,
      );
    }
    return parts.join(' · ');
  }

  if (lang === 'fr') {
    if (missable === 0 && online === 0) {
      return 'Aucun trophée manquable · Entièrement réalisable hors ligne';
    }
    const parts = [];
    if (missable != null) {
      parts.push(
        missable === 0
          ? 'Aucun trophée manquable'
          : `${missable} ${missable === 1 ? 'trophée manquable' : 'trophées manquables'}`,
      );
    }
    if (online != null) {
      parts.push(
        online === 0
          ? 'Entièrement réalisable hors ligne'
          : `${online} ${online === 1 ? 'trophée en ligne' : 'trophées en ligne'}`,
      );
    }
    return parts.join(' · ');
  }

  if (lang === 'it') {
    if (missable === 0 && online === 0) {
      return 'Nessun trofeo mancabile · Completamente ottenibile offline';
    }
    const parts = [];
    if (missable != null) {
      parts.push(
        missable === 0
          ? 'Nessun trofeo mancabile'
          : `${missable} ${missable === 1 ? 'trofeo mancabile' : 'trofei mancabili'}`,
      );
    }
    if (online != null) {
      parts.push(
        online === 0
          ? 'Completamente ottenibile offline'
          : `${online} ${online === 1 ? 'trofeo online' : 'trofei online'}`,
      );
    }
    return parts.join(' · ');
  }

  // Finaler Fallback auf Englisch (damit keine internationale Seite Deutsch erhält)
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
  if (lang === 'de') return `${name} – Trophäen-Guide auf TrophyBase.`;
  if (lang === 'es') return `${name} – Guía de trofeos en TrophyBase.`;
  if (lang === 'pt') return `${name} – Guia de troféus na TrophyBase.`;
  if (lang === 'fr') return `${name} – Guide des trophées sur TrophyBase.`;
  if (lang === 'it') return `${name} – Guida ai trofei su TrophyBase.`;
  return `${name} – Trophy Guide on TrophyBase.`;
}

/**
 * UI-Labels für den Crawler-Guide.
 * @param {string} locale
 */
export function guidePageLabels(locale = 'de') {
  return {
    crumbs: t(locale, 'breadcrumbNav'),
    overview: t(locale, 'gameOverview').replace('{title}', '').trim(),
    trophiesTotal: t(locale, 'trophiesTotal'),
    trophiesMissable: t(locale, 'trophiesMissable'),
    trophiesOnline: t(locale, 'trophiesOnline'),
    playtimeTitle: t(locale, 'playtimeTitle'),
    playtimeStory: t(locale, 'playtimeStory'),
    playtimeComplete: t(locale, 'playtimeComplete'),
    playtimeHours: (n) => t(locale, 'playtimeHours').replace('{n}', String(n)),
    trophies: t(locale, 'trophies'),
    mainGame: t(locale, 'mainGame'),
    walkthrough: t(locale, 'fullGameplay'),
    collectibles: t(locale, 'completion'),
    bosses: t(locale, 'bosses'),
    footer: t(locale, 'fairUseNote'),
  };
}

export function formatPlaytimeHours(value, locale = 'de') {
  if (value == null || value === '') return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const lang = normalizeLocale(locale);
  const shown = number.toLocaleString(lang, {
    maximumFractionDigits: 1,
  });
  return t(locale, 'playtimeHours').replace('{n}', shown);
}

export function hasPlaytimeValue(value) {
  if (value == null || value === '') return false;
  return Number.isFinite(Number(value));
}
