import {
  TABLES,
  GAME_PK,
  GAME_PLATFORM_ID,
  GAME_STRUCT,
  GAME_I18N,
  HOME_FEATURED_GAME_TYPES,
} from './gameSchema';
import { GUIDE_PUBLICATION } from './guidePublication';
import { getLocale } from './locale';
import { SUPPORTED_LOCALES } from '../../shared/countryLocaleMap.js';
import { getGameUuid, isUuid, mergeGameRecord, mergeGameRows } from './gameModel';
import { mergeLocalizedValue } from './translationUtils';
import { hardwareToUrlSegment } from './gameSlug';
import { NPWR_ID_PATTERN } from './routeUtils';

export const GAME_SELECT = [
  GAME_PK,
  GAME_PLATFORM_ID,
  GAME_STRUCT.ecosystem,
  GAME_STRUCT.hardware,
  GAME_STRUCT.igdbId,
  GAME_STRUCT.releaseYear,
  GAME_STRUCT.upcomingDate,
  GAME_STRUCT.developer,
  GAME_STRUCT.genre,
  GAME_STRUCT.gameType,
  GAME_STRUCT.progress,
  GAME_STRUCT.status,
  GAME_STRUCT.serverStatus,
  GAME_STRUCT.hasOnlineTrophies,
  GAME_STRUCT.hasMissableTrophies,
  GAME_STRUCT.totalOnlineTrophies,
  GAME_STRUCT.totalMissableTrophies,
  GAME_STRUCT.platinumAchievable,
  GAME_STRUCT.trophyCount,
  GAME_STRUCT.isSonyFallback,
  GAME_STRUCT.isAutoTranslated,
  GAME_STRUCT.originalLocale,
  GAME_STRUCT.createdAt,
  GAME_STRUCT.slug,
  GAME_STRUCT.isIndexable,
  GAME_I18N.title,
  GAME_I18N.coverUrl,
  GAME_I18N.description,
  GAME_I18N.statusExplanation,
].join(', ');

/** Lokalisierte Suchspalten (JSONB-Sprachmaps auf games) */
export const GAME_SEARCH_LOCALIZED_COLUMNS = {
  title: GAME_I18N.title,
};

/** Skalare Suchspalten auf games */
export const GAME_SEARCH_STRUCT_COLUMNS = {
  genre: GAME_STRUCT.genre,
  developer: GAME_STRUCT.developer,
  hardware: GAME_STRUCT.hardware,
};

/**
 * @param {unknown} ref Route-Segment: games.id (UUID) oder platform_game_id
 */
export function parseRouteGameRef(ref) {
  const id = String(ref ?? '').trim();
  if (!id) {
    return { valid: false, ref: null, kind: null, error: 'Spiel-ID fehlt' };
  }
  if (isUuid(id)) {
    return { valid: true, ref: id, kind: 'uuid', error: null };
  }
  if (NPWR_ID_PATTERN.test(id)) {
    return { valid: true, ref: id, kind: 'platform', error: null };
  }
  return {
    valid: false,
    ref: id,
    kind: null,
    error: `Ungültige Spiel-ID: „${id}"`,
  };
}

/**
 * @param {unknown} gameIds
 */
export function validateGameIdList(gameIds) {
  const raw = Array.isArray(gameIds) ? gameIds : [];
  const ids = [...new Set(raw.map((entry) => String(entry ?? '').trim()).filter(Boolean))];

  if (ids.length === 0) {
    return { valid: false, ids: [], error: 'Keine Spiel-IDs angegeben' };
  }

  const invalid = ids.filter((id) => !parseRouteGameRef(id).valid);
  if (invalid.length > 0) {
    return {
      valid: false,
      ids: [],
      error: `Ungültige Spiel-IDs: ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '…' : ''}`,
    };
  }

  return { valid: true, ids, error: null };
}

export function validateSearchQuery(query, options = {}) {
  const minLength = options.minLength ?? 1;
  const maxLength = options.maxLength ?? 80;
  const q = String(query ?? '').trim();

  if (!q) {
    return { valid: false, pattern: null, query: '', error: 'Suchbegriff fehlt' };
  }
  if (q.length < minLength) {
    return { valid: false, pattern: null, query: q, error: 'Suchbegriff ist zu kurz' };
  }
  if (q.length > maxLength) {
    return { valid: false, pattern: null, query: q, error: 'Suchbegriff ist zu lang' };
  }

  const sanitized = q.replace(/[%_\\]/g, '');
  if (!sanitized) {
    return { valid: false, pattern: null, query: q, error: 'Suchbegriff enthält nur Sonderzeichen' };
  }

  return { valid: true, pattern: `%${sanitized}%`, query: q, error: null };
}

function validateSearchColumn(column, allowed) {
  const col = String(column ?? '').trim();
  if (!col || !allowed.has(col)) {
    return { valid: false, column: null, error: `Unbekannte Suchspalte „${col}"` };
  }
  return { valid: true, column: col, error: null };
}

/**
 * games.platform_game_id ist JSONB. Übergibt man .contains() ein JS-Array,
 * baut supabase-js daraus ein PostgreSQL-Array-Literal (`cs.{a,b}`), woran der
 * JSON-Parser scheitert. Als String gereicht bleibt der Wert unverändert, wir
 * liefern also JSON-Syntax (`cs.["a"]`).
 * @param {string[]} values
 */
function jsonbArrayFilter(values) {
  return JSON.stringify(values);
}

async function fetchGameStructByRef(supabase, ref) {
  const parsed = parseRouteGameRef(ref);
  if (!parsed.valid) {
    return { data: null, error: new Error(parsed.error) };
  }

  let query = supabase.from(TABLES.games).select(GAME_SELECT);

  if (parsed.kind === 'uuid') {
    query = query.eq(GAME_PK, parsed.ref);
  } else {
    query = query.contains(GAME_PLATFORM_ID, jsonbArrayFilter([parsed.ref]));
  }

  const { data, error } = await query.limit(1).maybeSingle();
  return { data, error };
}

/**
 * Spiel über Pretty-URL /:locale/:hardware/:slug laden.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} hardware URL-Segment (ps5, ps4, …)
 * @param {string} slug
 * @param {string} [locale]
 */
export async function fetchGameBySlug(supabase, hardware, slug, locale = getLocale()) {
  const wantedSlug = String(slug ?? '').trim().toLowerCase();
  const wantedHw = String(hardware ?? '').trim().toLowerCase();
  if (!wantedSlug || !wantedHw) {
    return { data: null, error: new Error('Pretty-URL unvollständig') };
  }

  const { data, error } = await supabase
    .from(TABLES.games)
    .select(GAME_SELECT)
    .eq(GAME_STRUCT.slug, wantedSlug)
    .limit(20);

  if (error) return { data: null, error };

  const rows = data ?? [];
  const match =
    rows.find((row) => hardwareToUrlSegment(row[GAME_STRUCT.hardware]) === wantedHw) ??
    (rows.length === 1 ? rows[0] : null);

  if (!match) return { data: null, error: null };
  return { data: mergeGameRecord(match, locale), error: null };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {unknown} routeRef UUID oder platform_game_id
 * @param {string} [locale]
 */
export async function fetchGameByRouteRef(supabase, routeRef, locale = getLocale()) {
  const { data: gameRow, error } = await fetchGameStructByRef(supabase, routeRef);
  if (error) return { data: null, error };
  if (!gameRow) return { data: null, error: null };

  return { data: mergeGameRecord(gameRow, locale), error: null };
}

/** @deprecated Alias */
export const fetchGameByNpwrId = fetchGameByRouteRef;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} ids UUIDs und/oder platform_game_ids (Watchlist-Altdaten)
 * @param {string} [locale]
 */
export async function fetchGamesByIds(supabase, ids, locale = getLocale()) {
  const check = validateGameIdList(ids);
  if (!check.valid) {
    return { data: [], error: new Error(check.error) };
  }

  const uuids = check.ids.filter((id) => isUuid(id));
  const platformIds = check.ids.filter((id) => !isUuid(id));

  const queries = [];
  if (uuids.length) {
    queries.push(supabase.from(TABLES.games).select(GAME_SELECT).in(GAME_PK, uuids));
  }
  if (platformIds.length) {
    // JSONB-Array: pro ID ein Containment-Test, .in() gibt es dafür nicht.
    const orFilter = platformIds
      .map((id) => `${GAME_PLATFORM_ID}.cs.["${id}"]`)
      .join(',');
    queries.push(supabase.from(TABLES.games).select(GAME_SELECT).or(orFilter));
  }

  const results = await Promise.all(queries);
  const error = results.find((r) => r.error)?.error;
  if (error) return { data: [], error };

  const rows = [];
  const seen = new Set();
  for (const res of results) {
    for (const row of res.data ?? []) {
      const key = String(row[GAME_PK]);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }

  return { data: mergeGameRows(rows, locale), error: null };
}

/** @deprecated */
export const fetchGamesByNpwrIds = fetchGamesByIds;

/** PostgREST-Default pro Request; darüber wird in Batches nachgeladen. */
export const SEARCH_FETCH_BATCH = 1000;
/** Harte Obergrenze, damit eine sehr kurze Suche den Client nicht sprengt. */
export const SEARCH_RESULT_CAP = 5000;

function quoteFilterValue(pattern) {
  return `"${String(pattern ?? '').replace(/["\\]/g, '')}"`;
}

function capSearchLimit(limit, fallback = SEARCH_RESULT_CAP) {
  return Math.min(Math.max(Number(limit) || fallback, 1), SEARCH_RESULT_CAP);
}

/**
 * Titel liegen als JSONB-Sprachmap (spieltitel->>de …), daher ilike über alle
 * unterstützten Sprachen.
 */
function buildLocalizedOrFilter(column, pattern) {
  const value = quoteFilterValue(pattern);
  return SUPPORTED_LOCALES.map((lang) => `${column}->>${lang}.ilike.${value}`).join(',');
}

/**
 * Führt eine games-Suche aus und lädt bei Bedarf weitere Seiten nach, bis
 * `limit` erreicht ist oder keine Zeilen mehr kommen.
 * @param {() => object} makeQuery supabase-Query ohne limit/range
 * @param {number} limit
 */
async function fetchSearchRows(makeQuery, limit) {
  const cap = capSearchLimit(limit);
  const all = [];
  let from = 0;

  while (from < cap) {
    const to = Math.min(from + SEARCH_FETCH_BATCH - 1, cap - 1);
    const { data, error } = await makeQuery().range(from, to);
    if (error) return { data: all, error };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < to - from + 1) break;
    from += SEARCH_FETCH_BATCH;
  }

  return { data: all, error: null };
}

function applyPublishedGuideFilter(query) {
  return query.filter(`${GAME_STRUCT.status}->>guide_de`, 'eq', GUIDE_PUBLICATION.PUBLISHED);
}

async function searchLocalizedColumn(supabase, column, pattern, limit, publishedOnly) {
  return fetchSearchRows(
    () => {
      let query = supabase
        .from(TABLES.games)
        .select(GAME_SELECT)
        .or(buildLocalizedOrFilter(column, pattern));
      if (publishedOnly) query = applyPublishedGuideFilter(query);
      return query;
    },
    limit,
  );
}

async function searchStructColumn(supabase, column, pattern, limit, publishedOnly) {
  return fetchSearchRows(
    () => {
      let query = supabase.from(TABLES.games).select(GAME_SELECT).ilike(column, pattern);
      if (publishedOnly) query = applyPublishedGuideFilter(query);
      return query;
    },
    limit,
  );
}

/**
 * Freitext über Titel, Genre und Entwickler (ODER).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} pattern bereits validiertes ilike-Muster, z. B. %LEGO%
 * @param {number} [limit]
 * @param {string} [locale]
 */
export async function searchGamesByFreeText(
  supabase,
  pattern,
  limit = SEARCH_RESULT_CAP,
  locale = getLocale(),
) {
  const orFilter = [
    buildLocalizedOrFilter(GAME_I18N.title, pattern),
    `${GAME_STRUCT.genre}.ilike.${quoteFilterValue(pattern)}`,
    `${GAME_STRUCT.developer}.ilike.${quoteFilterValue(pattern)}`,
  ].join(',');

  const { data, error } = await fetchSearchRows(
    () =>
      supabase
        .from(TABLES.games)
        .select(GAME_SELECT)
        .or(orFilter)
        .order(GAME_STRUCT.releaseYear, { ascending: false, nullsFirst: false }),
    limit,
  );
  if (error) return { data: [], error };
  return { data: mergeGameRows(data, locale), error: null };
}

/**
 * Sucht in einer JSONB-Sprachmap (spieltitel->>de …) oder einer skalaren
 * Textspalte (genre, entwickler). Die Spalte muss in einer der beiden
 * Allowlists stehen, damit kein beliebiger Filter durchgereicht wird.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} column
 * @param {string} pattern
 * @param {number} [limit]
 * @param {string} [locale]
 * @param {{ publishedOnly?: boolean }} [options]
 */
export async function searchGamesByColumn(
  supabase,
  column,
  pattern,
  limit = 60,
  locale = getLocale(),
  options = {},
) {
  const safeLimit = capSearchLimit(limit, 60);

  const localizedColumns = new Set(Object.values(GAME_SEARCH_LOCALIZED_COLUMNS));
  const structColumns = new Set(Object.values(GAME_SEARCH_STRUCT_COLUMNS));

  const colCheck = validateSearchColumn(
    column,
    new Set([...localizedColumns, ...structColumns]),
  );
  if (!colCheck.valid) {
    return { data: [], error: new Error(colCheck.error) };
  }

  const runSearch = localizedColumns.has(colCheck.column)
    ? searchLocalizedColumn
    : searchStructColumn;

  const { data, error } = await runSearch(
    supabase,
    colCheck.column,
    pattern,
    safeLimit,
    Boolean(options.publishedOnly),
  );
  if (error) return { data: [], error };

  return { data: mergeGameRows(data, locale), error: null };
}

/**
 * Erweiterte Suche: ausgefüllte Felder werden UND-verknüpft.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ title?: string, developer?: string, genre?: string, console?: string, hardware?: string }} filters
 * @param {{ limit?: number, locale?: string }} [options]
 */
export async function searchGamesAdvanced(supabase, filters = {}, options = {}) {
  const limit = capSearchLimit(options.limit, SEARCH_RESULT_CAP);
  const locale = options.locale ?? getLocale();

  const title = validateSearchQuery(filters.title);
  const developer = validateSearchQuery(filters.developer);
  const genre = validateSearchQuery(filters.genre);
  const hardware = validateSearchQuery(filters.hardware ?? filters.console);

  if (!title.valid && !developer.valid && !genre.valid && !hardware.valid) {
    return { data: [], error: new Error('Mindestens ein Suchfeld ausfüllen') };
  }

  const { data, error } = await fetchSearchRows(() => {
    let query = supabase.from(TABLES.games).select(GAME_SELECT);

    if (title.valid) {
      query = query.or(buildLocalizedOrFilter(GAME_I18N.title, title.pattern));
    }
    if (developer.valid) {
      query = query.ilike(GAME_STRUCT.developer, developer.pattern);
    }
    if (genre.valid) {
      query = query.ilike(GAME_STRUCT.genre, genre.pattern);
    }
    if (hardware.valid) {
      query = query.ilike(GAME_STRUCT.hardware, hardware.pattern);
    }

    return query.order(GAME_STRUCT.releaseYear, { ascending: false, nullsFirst: false });
  }, limit);

  if (error) return { data: [], error };
  return { data: mergeGameRows(data ?? [], locale), error: null };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} [limit]
 * @param {string} [locale]
 */
export async function fetchRecentGames(supabase, limit = 12, locale = getLocale()) {
  const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 50);

  const { data, error } = await supabase
    .from(TABLES.games)
    .select(GAME_SELECT)
    .order(GAME_STRUCT.releaseYear, { ascending: false, nullsFirst: false })
    .order(GAME_STRUCT.createdAt, { ascending: false })
    .limit(safeLimit);

  if (error) return { data: [], error };

  return { data: mergeGameRows(data ?? [], locale), error: null };
}

function capHomeLimit(limit) {
  return Math.min(Math.max(Number(limit) || 12, 1), 50);
}

/**
 * Startseiten-Reihe: Evergreen/Premium, nur redaktionell freigegebene Guides.
 * `orderColumn` zuerst, danach created_at als Tie-Breaker.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ types?: string[], orderColumn: string, limit?: number, locale?: string }} options
 */
async function fetchFeaturedHomeGames(supabase, options) {
  const types = options.types?.length ? options.types : HOME_FEATURED_GAME_TYPES;
  const limit = capHomeLimit(options.limit);
  const locale = options.locale ?? getLocale();
  const orderColumn = options.orderColumn;

  const run = (column) =>
    applyPublishedGuideFilter(
      supabase
        .from(TABLES.games)
        .select(GAME_SELECT)
        .in(GAME_STRUCT.gameType, types),
    )
      .order(column, { ascending: false, nullsFirst: false })
      .order(GAME_STRUCT.createdAt, { ascending: false })
      .limit(limit);

  let { data, error } = await run(orderColumn);
  if (error && orderColumn === GAME_STRUCT.views) {
    ({ data, error } = await run(GAME_STRUCT.createdAt));
  }
  if (error) return { data: [], error };
  return { data: mergeGameRows(data ?? [], locale), error: null };
}

/**
 * Beliebt: meistaufgerufene Evergreen-/Premium-Guides (games.views).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} [limit]
 * @param {string} [locale]
 */
export async function fetchPopularGames(supabase, limit = 12, locale = getLocale()) {
  return fetchFeaturedHomeGames(supabase, {
    types: HOME_FEATURED_GAME_TYPES,
    orderColumn: GAME_STRUCT.views,
    limit,
    locale,
  });
}

/**
 * Neue Guides: jüngste freigegebene Evergreen-/Premium-Guides.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} [limit]
 * @param {string} [locale]
 */
export async function fetchNewGuideGames(supabase, limit = 12, locale = getLocale()) {
  return fetchFeaturedHomeGames(supabase, {
    types: HOME_FEATURED_GAME_TYPES,
    orderColumn: GAME_STRUCT.createdAt,
    limit,
    locale,
  });
}

const VIEWED_SESSION_PREFIX = 'tb_viewed:';

/**
 * Zählt einen Guide-Aufruf. Pro Browser-Tab-Session nur einmal, damit
 * React-Strict-Mode nicht doppelt zählt. Fehlt die Spalte oder die RPC,
 * schluckt der Aufruf den Fehler – die Seite bleibt nutzbar.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {unknown} gameUuid
 */
export async function incrementGameViews(supabase, gameUuid) {
  const uuid = String(gameUuid ?? '').trim();
  if (!uuid || !isUuid(uuid)) return;

  try {
    if (typeof sessionStorage !== 'undefined') {
      const key = `${VIEWED_SESSION_PREFIX}${uuid}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    }
  } catch {
    // sessionStorage kann in restriktiven Browsern fehlen
  }

  const { error } = await supabase.rpc('increment_game_views', { game_uuid: uuid });
  if (error) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(`${VIEWED_SESSION_PREFIX}${uuid}`);
      }
    } catch {
      // ignore
    }
  }
}

/**
 * Beliebige Spielreferenz zu games.id (UUID) auflösen.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {unknown} gameOrRef
 */
export async function resolveGameUuid(supabase, gameOrRef) {
  if (gameOrRef && typeof gameOrRef === 'object') {
    const direct = getGameUuid(gameOrRef);
    if (direct) return { uuid: direct, error: null };
  }

  const ref = typeof gameOrRef === 'string' ? gameOrRef : getGameUuid(gameOrRef);
  if (!ref) return { uuid: null, error: new Error('Spielreferenz fehlt') };

  if (isUuid(ref)) return { uuid: ref, error: null };

  const { data, error } = await fetchGameStructByRef(supabase, ref);
  if (error) return { uuid: null, error };
  return { uuid: data?.[GAME_PK] ?? null, error: null };
}

/**
 * Schreibt lokalisierte games-Felder, ohne die anderen Sprachen der
 * JSONB-Sprachmap zu überschreiben.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gameUuid
 * @param {string} locale
 * @param {Partial<Record<'title'|'coverUrl'|'description', string>>} values
 */
export async function updateGameLocalizedFields(supabase, gameUuid, locale, values) {
  const columns = {
    title: GAME_I18N.title,
    coverUrl: GAME_I18N.coverUrl,
    description: GAME_I18N.description,
  };

  const entries = Object.entries(values ?? {}).filter(
    ([key, value]) => columns[key] && String(value ?? '').trim(),
  );
  if (entries.length === 0) return { error: null };

  const { data: current, error: readError } = await supabase
    .from(TABLES.games)
    .select(Object.values(columns).join(', '))
    .eq(GAME_PK, gameUuid)
    .maybeSingle();

  if (readError) return { error: readError };

  const patch = {};
  for (const [key, value] of entries) {
    const column = columns[key];
    patch[column] = mergeLocalizedValue(current?.[column], locale, String(value).trim());
  }

  const { error } = await supabase.from(TABLES.games).update(patch).eq(GAME_PK, gameUuid);
  return { error };
}
