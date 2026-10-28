import { SUPPORTED_LOCALES } from '../../shared/countryLocaleMap.js';
import { TABLES, GAME_PK, GAME_STRUCT, GAME_TYPE, isQuickwinStyleType, computeIsIndexable } from './gameSchema.js';
import { normalizeLocale } from './locale.js';
import { ensureGameSlug, warmPublishedGuidePages } from './publishSeo.js';

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
  DRAFT: 'DRAFT',
};

/**
 * Fallback, wenn ein Spiel noch keine freigegebene Sprache hat.
 * Die Freigabe selbst hängt an status.guide_<lang>, für jede Sprache einzeln.
 */
export const PUBLISH_LOCALE = 'de';

/** Darf in dieser Sprache über die Website freigegeben werden? */
export function canPublishLocale(lang) {
  return SUPPORTED_LOCALES.includes(normalizeLocale(lang));
}

/** Sprachen, deren Guide für Besucher freigegeben ist. */
export function publishedGuideLocales(game) {
  return SUPPORTED_LOCALES.filter((lang) => isGuidePublished(game, lang));
}

export function hasPublishedGuide(game) {
  return publishedGuideLocales(game).length > 0;
}

/** Sprachspezifischer Schlüssel in games.status, z. B. „guide_de". */
export function guideStatusKey(lang) {
  return `guide_${normalizeLocale(lang)}`;
}

/**
 * publishing_status und published_locales aus der Statusmappe.
 * Berücksichtigt alle Sprachen mit PUBLISHED oder FERTIG (sowie optionale bestehende Werte).
 * @param {Record<string, unknown>} statusMap
 * @param {unknown} [existingPublishingStatus]
 * @param {unknown} [existingPublishedLocales]
 */
export function publishingFieldsFromStatus(
  statusMap,
  existingPublishingStatus = null,
  existingPublishedLocales = null,
) {
  const publishingStatus =
    existingPublishingStatus &&
    typeof existingPublishingStatus === 'object' &&
    !Array.isArray(existingPublishingStatus)
      ? { ...existingPublishingStatus }
      : {};
  const localesSet = new Set(
    Array.isArray(existingPublishedLocales)
      ? existingPublishedLocales.map((l) => normalizeLocale(l)).filter(Boolean)
      : [],
  );

  for (const [key, value] of Object.entries(statusMap ?? {})) {
    if (!key.startsWith('guide_')) continue;
    const lang = normalizeLocale(key.slice('guide_'.length));
    if (!lang) continue;
    const upper = String(value ?? '').trim().toUpperCase();
    if (upper === GUIDE_PUBLICATION.PUBLISHED || upper === GUIDE_PUBLICATION.DONE) {
      publishingStatus[lang] = GUIDE_PUBLICATION.PUBLISHED;
      localesSet.add(lang);
    }
  }

  const publishedLocales = [...localesSet].sort();
  return {
    [GAME_STRUCT.publishingStatus]: publishingStatus,
    [GAME_STRUCT.publishedLocales]: publishedLocales,
  };
}

/**
 * Entfernt ein Spiel nach der Guide-Freigabe aus public.game_wiedervorlage.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gameUuid
 */
export async function removeGameFromWiedervorlage(supabase, gameUuid) {
  const id = String(gameUuid ?? '').trim();
  if (!id) return { error: null };
  const { error } = await supabase
    .from(TABLES.gameWiedervorlage)
    .delete()
    .eq(GAME_PK, id);
  return { error: error ?? null };
}

/**
 * Erzeugt das einheitliche Update-Objekt für public.games bei Guide-Freigabe / Direkt-Upload
 * (setzt guide_<lang>, publish_status: 'PUBLISHED', publishing_status, published_locales, is_guide_locked: true).
 * @param {object} params
 * @param {Record<string, unknown>} [params.currentGame] Aktuelle games-Zeile
 * @param {string} params.lang Sprachkürzel ('de' | 'en' | ...)
 * @param {string} [params.guideState] Standardmäßig 'FERTIG' (oder 'PUBLISHED')
 * @param {boolean} [params.hasVideo] Falls true, setzt status.guides = 'HAS_VIDEO'
 * @param {boolean} [params.clearRohmaterial] Falls true, löscht status.rohmaterial
 */
export function buildUnifiedGuidePublishPatch({
  currentGame = null,
  lang,
  guideState = GUIDE_PUBLICATION.DONE,
  hasVideo = false,
  clearRohmaterial = false,
}) {
  const normalizedLang = normalizeLocale(lang);
  const statusMap = { ...parseStatusMap(currentGame?.[GAME_STRUCT.status]) };
  const statusKey = guideStatusKey(normalizedLang);

  if (
    guideState === GUIDE_PUBLICATION.PUBLISHED ||
    String(statusMap[statusKey] ?? '').trim().toUpperCase() !== GUIDE_PUBLICATION.PUBLISHED
  ) {
    statusMap[statusKey] = guideState;
  }

  statusMap.publish_status = GUIDE_PUBLICATION.PUBLISHED;

  if (hasVideo) {
    statusMap.guides = 'HAS_VIDEO';
  }
  if (clearRohmaterial) {
    delete statusMap.rohmaterial;
  }

  const pubFields = publishingFieldsFromStatus(
    statusMap,
    currentGame?.[GAME_STRUCT.publishingStatus],
    currentGame?.[GAME_STRUCT.publishedLocales],
  );

  pubFields[GAME_STRUCT.publishingStatus][normalizedLang] = GUIDE_PUBLICATION.PUBLISHED;
  if (!pubFields[GAME_STRUCT.publishedLocales].includes(normalizedLang)) {
    pubFields[GAME_STRUCT.publishedLocales] = [
      ...pubFields[GAME_STRUCT.publishedLocales],
      normalizedLang,
    ].sort();
  }

  return {
    [GAME_STRUCT.status]: statusMap,
    ...pubFields,
    [GAME_STRUCT.isGuideLocked]: true,
  };
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
 * Ist das Spiel im Video-Roadmap-/Entwurfs-Modus?
 * @param {object|null|undefined} game
 */
export function isGameDraftMode(game) {
  const statusMap = parseStatusMap(game?.[GAME_STRUCT.status] ?? game?.status);
  if (String(statusMap.production_roadmap ?? '').trim().toUpperCase() === 'ACTIVE') {
    return true;
  }
  if (String(statusMap.guide_de ?? '').trim().toUpperCase() === GUIDE_PUBLICATION.DRAFT) {
    return true;
  }
  for (const [key, value] of Object.entries(statusMap)) {
    if (key.startsWith('guide_') && String(value ?? '').trim().toUpperCase() === GUIDE_PUBLICATION.DRAFT) {
      return true;
    }
  }
  return false;
}

/**
 * Schaltet den Video-Roadmap-/Entwurfs-Modus über die Supabase-RPC um.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gameUuid
 * @param {boolean} enable
 */
export async function setGameDraftMode(supabase, gameUuid, enable) {
  const uuid = String(gameUuid ?? '').trim();
  if (!uuid) {
    return { status: null, error: new Error('Kein Spiel-UUID übergeben.') };
  }
  const { data, error } = await supabase.rpc('tb_set_game_draft_mode', {
    p_game_id: uuid,
    p_enable: Boolean(enable),
  });
  if (error) return { status: null, error };
  const parsed = data && typeof data === 'object' ? parseStatusMap(data.status ?? data) : null;
  return { status: parsed, error: null };
}

/**
 * Guide ist redaktionell fertig/im Entwurf (Vorschau für Admins) oder bereits online.
 * @param {object|null|undefined} game
 * @param {string} [lang]
 */
export function isGuideReady(game, lang = PUBLISH_LOCALE) {
  const state = getGuidePublicationState(game, lang);
  return (
    state === GUIDE_PUBLICATION.PUBLISHED ||
    state === GUIDE_PUBLICATION.DONE ||
    state === GUIDE_PUBLICATION.DRAFT ||
    isGameDraftMode(game)
  );
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
  if (!hasPublishedGuide(game)) return false;
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
      error: new Error('Für diese Sprache gibt es keine Freigabe.'),
    };
  }

  const { data: current, error: readError } = await supabase
    .from(TABLES.games)
    .select(
      `${GAME_STRUCT.status}, ${GAME_STRUCT.publishingStatus}, ${GAME_STRUCT.publishedLocales}, ${GAME_STRUCT.slug}, ${GAME_STRUCT.hardware}, ${GAME_STRUCT.gameType}`,
    )
    .eq(GAME_PK, uuid)
    .maybeSingle();

  if (readError) return { status: null, error: readError };

  const update = buildUnifiedGuidePublishPatch({
    currentGame: current,
    lang,
    guideState: published ? GUIDE_PUBLICATION.PUBLISHED : GUIDE_PUBLICATION.DONE,
  });
  const gameType = String(current?.[GAME_STRUCT.gameType] ?? '').trim();
  if (published) {
    update[GAME_STRUCT.isIndexable] = computeIsIndexable(gameType);
  }

  const { data, error } = await supabase
    .from(TABLES.games)
    .update(update)
    .eq(GAME_PK, uuid)
    .select(`${GAME_STRUCT.status}, ${GAME_STRUCT.slug}, ${GAME_STRUCT.hardware}`)
    .maybeSingle();

  if (error) return { status: null, error };

  await removeGameFromWiedervorlage(supabase, uuid);

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
