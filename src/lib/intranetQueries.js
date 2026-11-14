import {
  TABLES,
  GAME_PK,
  GAME_PLATFORM_ID,
  GAME_STRUCT,
  GAME_I18N,
  GAME_TYPE,
} from './gameSchema';
import { getPlatformGameId } from './gameModel';
import { applyStaffGuideScope, searchWords, validateSearchQuery } from './gameQueries';
import { resolveMatchingHomeTagSlugs } from './homeTagDefs';
import { applyPipelineStatusFilters } from './gamePipelineStatus';
import { SUPPORTED_LOCALES } from '../../shared/countryLocaleMap.js';

export const INTRANET_GAME_LIMIT = 400;

/** Filterwert für spiel_typ null oder leer. */
export const INTRANET_GAME_TYPE_EMPTY = 'empty';

export const INTRANET_GAME_SELECT = [
  GAME_PK,
  GAME_STRUCT.ecosystem,
  GAME_STRUCT.hardware,
  GAME_PLATFORM_ID,
  GAME_STRUCT.releaseYear,
  GAME_STRUCT.upcomingDate,
  GAME_STRUCT.developer,
  GAME_STRUCT.publisher,
  GAME_STRUCT.gameType,
  GAME_STRUCT.trophyCount,
  GAME_STRUCT.homeTags,
  GAME_STRUCT.status,
  GAME_STRUCT.publishedLocales,
  GAME_STRUCT.isGuideLocked,
  GAME_I18N.title,
  GAME_I18N.coverUrl,
  GAME_STRUCT.coverStatus,
  GAME_STRUCT.slug,
  GAME_STRUCT.fsk,
].join(', ');

const INTRANET_GAME_SELECT_WITH_COUNTS = `${INTRANET_GAME_SELECT}, game_guides(count)`;

function quoteFilterValue(pattern) {
  return `"${String(pattern ?? '').replace(/["\\]/g, '')}"`;
}

function buildLocalizedOrFilter(column, pattern) {
  const value = quoteFilterValue(pattern);
  return SUPPORTED_LOCALES.map((lang) => `${column}->>${lang}.ilike.${value}`).join(',');
}

function textFilter(value) {
  return validateSearchQuery(value);
}

function withoutFskColumn(select) {
  return String(select)
    .split(', ')
    .filter((column) => column !== GAME_STRUCT.fsk)
    .join(', ');
}

function isMissingFskColumn(error) {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '').toLowerCase();
  if (!message.includes(GAME_STRUCT.fsk)) return false;
  return (
    code === '42703'
    || code === 'PGRST204'
    || message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('column')
  );
}

export function formatIntranetTitles(spieltitel) {
  if (typeof spieltitel === 'string' || typeof spieltitel === 'number') {
    return String(spieltitel).trim() || '—';
  }
  if (!spieltitel || typeof spieltitel !== 'object' || Array.isArray(spieltitel)) {
    return '—';
  }
  const parts = SUPPORTED_LOCALES.map((locale) => {
    const text = String(spieltitel[locale] ?? '').trim();
    return text ? `${locale.toUpperCase()} ${text}` : null;
  }).filter(Boolean);
  if (parts.length > 0) return parts.join(' · ');
  const fallback = Object.values(spieltitel)
    .map((value) => String(value ?? '').trim())
    .find(Boolean);
  return fallback || '—';
}

export function intranetGameHref(game) {
  const id =
    getPlatformGameId(game) ||
    String(game?.slug ?? '').trim() ||
    String(game?.[GAME_PK] ?? '').trim();
  return id ? `/guide/${encodeURIComponent(id)}?preview=1` : '';
}

/**
 * Interne Spiele-Suche ohne Veröffentlichungsfilter.
 * Ausgefüllte Felder werden UND-verknüpft. Ohne Filter: alle Spiele bis zum Limit.
 */
export async function searchIntranetGames(supabase, filters = {}, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || INTRANET_GAME_LIMIT, 1), 1000);

  const title = textFilter(filters.title);
  const ecosystem = textFilter(filters.ecosystem);
  const hardware = textFilter(filters.hardware);
  // JSONB-Array: nur Containment möglich, deshalb exakte NPWR statt Teilstring.
  const platformId = String(filters.platformGameId ?? '').trim();
  const upcoming = textFilter(filters.upcomingDate);
  const developer = textFilter(filters.developer);
  const genre = textFilter(filters.genre);
  const gameType = String(filters.gameType ?? '').trim();

  const yearRaw = String(filters.releaseYear ?? '').trim();
  const year = /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;

  const run = (select) => {
    let query = supabase.from(TABLES.games).select(select, { count: 'exact' });

    if (title.valid) {
      for (const word of searchWords(title.query)) {
        query = query.or(buildLocalizedOrFilter(GAME_I18N.title, `%${word}%`));
      }
    }
    if (ecosystem.valid) query = query.ilike(GAME_STRUCT.ecosystem, ecosystem.pattern);
    if (hardware.valid) query = query.ilike(GAME_STRUCT.hardware, hardware.pattern);
    // JSON-Syntax als String: ein JS-Array würde zum PostgreSQL-Array-Literal.
    if (platformId) query = query.contains(GAME_PLATFORM_ID, JSON.stringify([platformId]));
    if (year != null) query = query.eq(GAME_STRUCT.releaseYear, year);
    if (upcoming.valid) query = query.ilike(GAME_STRUCT.upcomingDate, upcoming.pattern);
    if (developer.valid) {
      query = query.or(
        [
          `${GAME_STRUCT.developer}.ilike.${quoteFilterValue(developer.pattern)}`,
          `${GAME_STRUCT.publisher}.ilike.${quoteFilterValue(developer.pattern)}`,
        ].join(','),
      );
    }
    if (genre.valid) {
      const matchedSlugs = resolveMatchingHomeTagSlugs(genre.query);
      if (matchedSlugs.length > 0) {
        query = query.overlaps(GAME_STRUCT.homeTags, matchedSlugs);
      } else {
        query = query.contains(GAME_STRUCT.homeTags, [genre.query.toLowerCase()]);
      }
    }
    if (gameType === INTRANET_GAME_TYPE_EMPTY) {
      query = query.or(`${GAME_STRUCT.gameType}.is.null,${GAME_STRUCT.gameType}.eq.""`);
    } else if (Object.values(GAME_TYPE).includes(gameType)) {
      query = query.ilike(GAME_STRUCT.gameType, `%${gameType}%`);
    }
    query = applyPipelineStatusFilters(query, filters);
    query = applyStaffGuideScope(query, filters.guideScope);

    return query
      .order(GAME_STRUCT.releaseYear, { ascending: false, nullsFirst: false })
      .limit(limit);
  };

  let selectWithCounts = INTRANET_GAME_SELECT_WITH_COUNTS;
  let selectPlain = INTRANET_GAME_SELECT;
  let { data, error, count } = await run(selectWithCounts);
  if (error && isMissingFskColumn(error)) {
    selectWithCounts = withoutFskColumn(selectWithCounts);
    selectPlain = withoutFskColumn(selectPlain);
    ({ data, error, count } = await run(selectWithCounts));
  }
  if (error) {
    ({ data, error, count } = await run(selectPlain));
  }
  if (error && isMissingFskColumn(error)) {
    ({ data, error, count } = await run(withoutFskColumn(selectPlain)));
  }

  if (error) return { data: [], count: 0, error };
  return { data: data ?? [], count: count ?? (data ?? []).length, error: null };
}

export const INTRANET_QUICK_FILTERS = [
  { id: 'all', label: 'Alle' },
  { id: 'sichtung', label: '⚡ Sichtung (1-Sprachig FERTIG)' },
  { id: 'de_missing', label: '⚠️ DE fehlt (Nur Intl. Live)' },
  { id: 'live', label: '🌐 Live (Published)' },
  { id: 'locked', label: '🔒 Gesperrt / Servertot' },
];

const LIVE_STATUS_KEYS = [
  ...SUPPORTED_LOCALES.map((lang) => `guide_${lang}`),
  'review_queue',
  'publish_status',
  'guides',
  'rohmaterial',
  'trophies',
  'discovery',
  'overall',
  'refinement',
  'igdb',
  'steam',
  'online_mode',
];

function jsonbTextKey(key) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : `"${key}"`;
}

/**
 * PostgREST kann jsonb/uuid nicht per ilike casten (`::text` zerlegt den Logic-Tree
 * bzw. ilike bleibt auf jsonb). Plattform-IDs treffen deshalb per Containment
 * auf den exakten Eintrag, Status über alle bekannten Keys.
 */
function platformIdClauses(query) {
  if (!/^[A-Za-z0-9_-]{3,}$/.test(query)) return [];
  const clauses = [`${GAME_PLATFORM_ID}.cs.["${query}"]`];
  if (/^\d+$/.test(query)) clauses.push(`${GAME_PLATFORM_ID}.cs.[${query}]`);
  return clauses;
}

/** OR-Filter für die Live-Suche: Titel aller Sprachen, UUID, Plattform-ID, spiel_typ, status. */
export function buildIntranetLiveOrFilter(rawText) {
  const query = String(rawText ?? '').trim();
  if (!query) return '';
  const like = quoteFilterValue(`%${query}%`);
  const parts = SUPPORTED_LOCALES.map(
    (lang) => `${GAME_I18N.title}->>${jsonbTextKey(lang)}.ilike.${like}`,
  );
  parts.push(`${GAME_STRUCT.gameType}.ilike.${like}`);
  for (const key of LIVE_STATUS_KEYS) {
    parts.push(`${GAME_STRUCT.status}->>${jsonbTextKey(key)}.ilike.${like}`);
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query)) {
    parts.push(`${GAME_PK}.eq.${query}`);
  }
  parts.push(...platformIdClauses(query));
  return parts.join(',');
}

export function applyIntranetQuickFilter(query, filterId) {
  if (filterId === 'sichtung') {
    return query
      .eq(GAME_STRUCT.publishedLocales, '[]')
      .or('status->>guide_de.eq.FERTIG,status->>guide_en.eq.FERTIG');
  }
  if (filterId === 'de_missing') {
    return query
      .neq(GAME_STRUCT.publishedLocales, '[]')
      .not(GAME_STRUCT.publishedLocales, 'cs', '["de"]');
  }
  if (filterId === 'live') {
    return query.neq(GAME_STRUCT.publishedLocales, '[]');
  }
  if (filterId === 'locked') {
    return query.or(
      `${GAME_STRUCT.isGuideLocked}.eq.true,${GAME_STRUCT.gameType}.ilike.${quoteFilterValue('%Servertot%')}`,
    );
  }
  return query;
}

async function runIntranetLiveQuery(supabase, { text, quickFilter, head }) {
  let query = supabase
    .from(TABLES.games)
    .select(head ? GAME_PK : INTRANET_GAME_SELECT, { count: 'exact', head });
  query = applyIntranetQuickFilter(query, quickFilter);
  const orFilter = buildIntranetLiveOrFilter(text);
  if (orFilter) query = query.or(orFilter);
  if (!head) {
    query = query
      .order(GAME_STRUCT.releaseYear, { ascending: false, nullsFirst: false })
      .limit(INTRANET_GAME_LIMIT);
  }
  return query;
}

/** Live-Suche über Titel, UUID, Plattform-ID, spiel_typ und status, plus Schnellfilter. */
export async function searchIntranetGamesLive(supabase, { text = '', quickFilter = 'all' } = {}) {
  const { data, error, count } = await runIntranetLiveQuery(supabase, {
    text,
    quickFilter,
    head: false,
  });
  if (error) return { data: [], count: 0, error };
  return { data: data ?? [], count: count ?? (data ?? []).length, error: null };
}

export async function countIntranetQuickFilters(supabase, text = '') {
  const pairs = await Promise.all(
    INTRANET_QUICK_FILTERS.map(async (filter) => {
      const { count, error } = await runIntranetLiveQuery(supabase, {
        text,
        quickFilter: filter.id,
        head: true,
      });
      return [filter.id, error ? null : count ?? 0];
    }),
  );
  return Object.fromEntries(pairs);
}

async function fetchRowsByIds(supabase, table, select, column, ids, chunkSize = 120) {
  const unique = [...new Set((ids ?? []).filter(Boolean))];
  const rows = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase.from(table).select(select).in(column, chunk);
    if (error) return { data: [], error };
    rows.push(...(data ?? []));
  }
  return { data: rows, error: null };
}

/**
 * Lädt Intranet-Zeilen für bekannte Spiel-UUIDs, ohne Veröffentlichungsfilter.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} ids
 */
export async function fetchIntranetGamesByIds(supabase, ids) {
  const unique = [...new Set((ids ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (!unique.length) return { data: [], error: null };

  let withCounts = INTRANET_GAME_SELECT_WITH_COUNTS;
  let plain = INTRANET_GAME_SELECT;
  let result = await fetchRowsByIds(supabase, TABLES.games, withCounts, GAME_PK, unique);
  if (result.error && isMissingFskColumn(result.error)) {
    withCounts = withoutFskColumn(withCounts);
    plain = withoutFskColumn(plain);
    result = await fetchRowsByIds(supabase, TABLES.games, withCounts, GAME_PK, unique);
  }
  if (result.error) {
    result = await fetchRowsByIds(supabase, TABLES.games, plain, GAME_PK, unique);
  }
  if (result.error && isMissingFskColumn(result.error)) {
    result = await fetchRowsByIds(supabase, TABLES.games, withoutFskColumn(plain), GAME_PK, unique);
  }
  if (result.error) return { data: [], error: result.error };

  const byId = new Map((result.data ?? []).map((game) => [game[GAME_PK], game]));
  return {
    data: unique.map((id) => byId.get(id)).filter(Boolean),
    error: null,
  };
}
