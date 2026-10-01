import { TABLES, GAME_PK, GAME_STRUCT } from './gameSchema';
import { normalizeLocale } from './locale';
import { ensureGameSlug, warmPublishedGuidePages } from './publishSeo';

/**
 * Freigabe-Zustände eines Guides in games.status.
 *
 * Die Upload-Pipeline setzt beim Hochladen FERTIG (siehe 10.1_Upload_Guide_i18n.py).
 * PUBLISHED wird ausschliesslich redaktionell über die Website gesetzt und
 * entscheidet, ob die Guide-Reiter für normale Besucher sichtbar sind.
 */
export const GUIDE_PUBLICATION = {
  DONE: 'FERTIG',
  PUBLISHED: 'PUBLISHED',
};

/**
 * Redaktionell freigegeben wird vorerst nur Deutsch. Andere Sprachen (EN, ES, …)
 * brauchen einen eigenen status.guide_<lang> = PUBLISHED, sonst erscheinen sie
 * nicht im Sprachwähler und nicht in Sitemap/Hreflang.
 */
export const PUBLISH_LOCALE = 'de';

/** Darf in dieser Sprache über die Website freigegeben werden? */
export function canPublishLocale(lang) {
  return normalizeLocale(lang) === PUBLISH_LOCALE;
}

/** Sprachspezifischer Schlüssel in games.status, z. B. „guide_de". */
export function guideStatusKey(lang) {
  return `guide_${normalizeLocale(lang)}`;
}

/**
 * games.status ist JSONB. Altbestand kann noch ein JSON-String oder ein reiner
 * Textstatus sein – beides darf nicht zu einem Absturz führen.
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
export function parseStatusMap(value) {
  if (value == null) return {};
  if (typeof value === 'object' && !Array.isArray(value)) {
    return /** @type {Record<string, unknown>} */ (value);
  }
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw.startsWith('{')) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Freigabe-Zustand einer einzelnen Guide-Sprache.
 * @param {object|null|undefined} game Gemergtes Spiel-Objekt oder games-Zeile
 * @param {string} lang
 */
export function getGuidePublicationState(game, lang) {
  const statusMap = parseStatusMap(game?.[GAME_STRUCT.status]);
  const raw = statusMap[guideStatusKey(lang)];
  return String(raw ?? '').trim().toUpperCase();
}

/**
 * Ist der Guide in dieser Sprache für normale Besucher freigegeben?
 * @param {object|null|undefined} game
 * @param {string} lang
 */
export function isGuidePublished(game, lang) {
  return getGuidePublicationState(game, lang) === GUIDE_PUBLICATION.PUBLISHED;
}

/**
 * Guide ist redaktionell fertig (Vorschau für Admins) oder bereits online.
 * @param {object|null|undefined} game
 * @param {string} [lang]
 */
export function isGuideReady(game, lang = PUBLISH_LOCALE) {
  const state = getGuidePublicationState(game, lang);
  return state === GUIDE_PUBLICATION.PUBLISHED || state === GUIDE_PUBLICATION.DONE;
}

/**
 * Darf die Spielseite in den Suchindex?
 *
 * Zwei Bedingungen, beide müssen erfüllt sein:
 *  - der Guide ist freigegeben (sonst wäre es eine halbleere Seite)
 *  - games.is_indexable ist nicht ausdrücklich false (Quickwins sind online
 *    und über die Website-Suche auffindbar, aber bewusst nicht indexiert)
 *
 * @param {object|null|undefined} game
 */
export function isGameIndexable(game) {
  if (!isGuidePublished(game, PUBLISH_LOCALE)) return false;
  return game?.[GAME_STRUCT.isIndexable] !== false;
}

/**
 * Setzt bzw. entfernt die Freigabe für genau eine Sprache.
 *
 * Der bestehende status-Wert wird vorher gelesen und gemerged, damit weder die
 * anderen Sprachen noch Pipeline-Keys wie „guides", „overall" oder „trophies"
 * verloren gehen – games.status ist die gemeinsame Statusmappe der ganzen
 * Pipeline, nicht nur der Guides.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gameUuid games.id
 * @param {string} lang
 * @param {boolean} published
 * @returns {Promise<{ status: Record<string, unknown>|null, slug?: string|null, hardware?: string|null, error: unknown }>}
 */
export async function setGuidePublished(supabase, gameUuid, lang, published) {
  const uuid = String(gameUuid ?? '').trim();
  if (!uuid) {
    return { status: null, error: new Error('Kein Spiel-UUID für die Freigabe übergeben.') };
  }

  if (!canPublishLocale(lang)) {
    return {
      status: null,
      error: new Error(
        `Freigabe über die Website ist nur für ${PUBLISH_LOCALE.toUpperCase()} vorgesehen.`,
      ),
    };
  }

  const { data: current, error: readError } = await supabase
    .from(TABLES.games)
    .select(`${GAME_STRUCT.status}, ${GAME_STRUCT.slug}, ${GAME_STRUCT.hardware}`)
    .eq(GAME_PK, uuid)
    .maybeSingle();

  if (readError) return { status: null, error: readError };

  const statusMap = parseStatusMap(current?.[GAME_STRUCT.status]);
  const nextStatus = {
    ...statusMap,
    [guideStatusKey(lang)]: published ? GUIDE_PUBLICATION.PUBLISHED : GUIDE_PUBLICATION.DONE,
  };

  const { data, error } = await supabase
    .from(TABLES.games)
    .update({ [GAME_STRUCT.status]: nextStatus })
    .eq(GAME_PK, uuid)
    .select(`${GAME_STRUCT.status}, ${GAME_STRUCT.slug}, ${GAME_STRUCT.hardware}`)
    .maybeSingle();

  if (error) return { status: null, error };

  let slug = String(data?.[GAME_STRUCT.slug] ?? current?.[GAME_STRUCT.slug] ?? '').trim() || null;
  const hardware = data?.[GAME_STRUCT.hardware] ?? current?.[GAME_STRUCT.hardware] ?? null;

  if (published && !slug) {
    const ensured = await ensureGameSlug(supabase, uuid);
    if (!ensured.error) slug = ensured.slug;
  }

  if (published && slug) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    warmPublishedGuidePages({ origin, hardware, slug, locales: [normalizeLocale(lang)] });
  }

  return {
    status: parseStatusMap(data?.[GAME_STRUCT.status]),
    slug,
    hardware,
    error: null,
  };
}
