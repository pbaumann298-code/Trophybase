import { GAME_PK, HOME_TAGS, isQuickwinStyleType, isServerDeadType } from './gameSchema';
import { getGameTitle, getRouteSlug, mergeGameRows } from './gameModel';
import {
  SEARCH_RESULT_CAP,
  fetchNewGuideGames,
  fetchPopularGames,
  searchGamesByColumn,
  searchGamesByHomeTag,
  searchGamesByStudio,
  GAME_SEARCH_LOCALIZED_COLUMNS,
} from './gameQueries';
import { getLocale } from './locale';
import { isGuidePublished } from './guidePublication';

const LIMIT = 12;

/**
 * Optimierte `tb_get_home_rails` (supabase/home_rails.sql).
 * Bei Timeout: einmal retry, dann Legacy mit begrenzter Parallelität
 * (kein Stampede – der hat Chrome/DB totgeschlagen).
 */
const HOME_RAILS_RPC_ENABLED = true;
const HOME_RAILS_LEGACY_CONCURRENCY = 2;
const HOME_RAILS_CACHE_MS = 30_000;

/** @type {Promise<Record<string, object[]>|null>|null} */
let homeRailsInflight = null;

/** @type {{ locale: string, at: number, rails: Record<string, object[]> }|null} */
let homeRailsCache = null;

/**
 * Eindeutige Spiele nach games.id (Fallback: Route-Slug, dann Titel).
 * Der Schlüssel muss ein Primitive sein, sonst greift die Map-Deduplizierung
 * nicht.
 * @param {Array<Record<string, unknown>>} games
 * @param {string} [locale]
 */
export function dedupeGames(games, locale = getLocale()) {
  const map = new Map();
  for (const game of games) {
    const key = game[GAME_PK] || getRouteSlug(game) || getGameTitle(game, locale);
    if (key && !map.has(key)) map.set(key, game);
  }
  return [...map.values()];
}

async function runQueries(queries) {
  const settled = await Promise.allSettled(queries);
  const rows = [];
  for (const res of settled) {
    if (res.status === 'fulfilled' && res.value?.data) rows.push(...res.value.data);
  }
  return rows;
}

function catalogOptions(includeReady, excludeQuickwins = false) {
  const catalog = includeReady ? { includeReady: true } : { publishedOnly: true };
  if (excludeQuickwins) catalog.excludeQuickwins = true;
  return catalog;
}

function withoutServerDead(games) {
  return (games ?? []).filter((game) => !isServerDeadType(game?.spiel_typ));
}

function withoutQuickwins(games) {
  return withoutServerDead(games).filter((game) => !isQuickwinStyleType(game?.spiel_typ));
}

function titleLike(supabase, pattern, locale, includeReady, limit = LIMIT, excludeQuickwins = false) {
  if (!pattern) return Promise.resolve({ data: [], error: new Error('Suchmuster fehlt') });
  return searchGamesByColumn(
    supabase,
    GAME_SEARCH_LOCALIZED_COLUMNS.title,
    pattern,
    limit,
    locale,
    catalogOptions(includeReady, excludeQuickwins),
  );
}

async function mergeRailRows(queries, locale, { dropQuickwins = false, limit = LIMIT } = {}) {
  const rows = await runQueries(queries);
  const filtered = dropQuickwins ? withoutQuickwins(rows) : withoutServerDead(rows);
  const unique = dedupeGames(filtered, locale);
  return unique.slice(0, limit);
}

function emptyRails() {
  return Object.fromEntries(HOME_CATEGORIES.map((cat) => [cat.id, []]));
}

/** Nur Guides, die in dieser Sprache wirklich freigegeben sind. Servertot nie. */
function railsForLocale(byId, locale) {
  const next = {};
  for (const [id, games] of Object.entries(byId ?? {})) {
    next[id] = withoutServerDead(games ?? []).filter((game) => {
      const status = game?.status;
      if (!status || typeof status !== 'object' || Array.isArray(status)) {
        return locale === 'de';
      }
      return isGuidePublished(game, locale);
    });
  }
  return next;
}

function isMissingHomeRailsRpc(error) {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '').toLowerCase();
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    message.includes('could not find the function') ||
    (message.includes('tb_get_home_rails') &&
      !message.includes('timeout') &&
      !message.includes('canceling statement'))
  );
}

function shouldFallbackHomeRailsRpc(error) {
  if (isMissingHomeRailsRpc(error)) return true;
  const message = String(error?.message ?? '').toLowerCase();
  const code = String(error?.code ?? '');
  // Timeout / Statement abgebrochen → Legacy-Schienen statt leerer Startseite
  return (
    code === '57014' ||
    message.includes('timeout') ||
    message.includes('canceling statement') ||
    message.includes('statement timeout')
  );
}

function parseHomeRailsRpcRows(data, locale) {
  const byId = emptyRails();
  const grouped = new Map();
  for (const row of data ?? []) {
    const railId = String(row?.rail_id ?? '');
    if (!railId || !Object.prototype.hasOwnProperty.call(byId, railId)) continue;
    const game = row?.game && typeof row.game === 'object' ? row.game : null;
    if (!game) continue;
    const list = grouped.get(railId) ?? [];
    list.push({ pos: Number(row.sort_pos) || 0, game });
    grouped.set(railId, list);
  }

  for (const [railId, items] of grouped) {
    items.sort((a, b) => a.pos - b.pos);
    byId[railId] = mergeGameRows(
      items.map((item) => item.game),
      locale,
    );
  }
  return byId;
}

/**
 * Eine RPC statt ~60 ilike-Suchen. Admin/Besucher entscheidet die Funktion
 * am JWT, nicht am Client-Flag.
 * StrictMode/Doppel-Mount teilen sich denselben In-Flight-Call.
 * @returns {Promise<Record<string, object[]>|null>} null = RPC fehlt/timeout, Legacy nutzen
 */
async function fetchHomeRailsViaRpc(supabase, locale) {
  if (homeRailsInflight) return homeRailsInflight;

  homeRailsInflight = (async () => {
    const runOnce = () => supabase.rpc('tb_get_home_rails');

    let { data, error } = await runOnce();
    if (error && shouldFallbackHomeRailsRpc(error)) {
      // Kurzer Retry: oft hilft das nach Admin-Doppel-Mount / kalter Verbindung
      await new Promise((r) => setTimeout(r, 250));
      ({ data, error } = await runOnce());
    }

    if (error) {
      if (shouldFallbackHomeRailsRpc(error) || isMissingHomeRailsRpc(error)) {
        console.warn('Startseite tb_get_home_rails → Legacy:', error.message);
        return null;
      }
      console.error('Startseite tb_get_home_rails:', error.message);
      return emptyRails();
    }

    return parseHomeRailsRpcRows(data, locale);
  })().finally(() => {
    homeRailsInflight = null;
  });

  return homeRailsInflight;
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function pump() {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await worker(items[i], i);
    }
  }
  const n = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: n }, () => pump()));
  return results;
}

async function fetchHomeRailsLegacy(supabase, locale, includeReady) {
  const entries = await mapPool(
    HOME_CATEGORIES,
    HOME_RAILS_LEGACY_CONCURRENCY,
    async (cat) => {
      try {
        const games = await cat.fetch(supabase, locale, includeReady);
        return [cat.id, games];
      } catch (err) {
        console.error(`Kategorie ${cat.id}:`, err);
        return [cat.id, []];
      }
    },
  );
  return Object.fromEntries(entries);
}

/**
 * Kuratierte Startseiten-Reihen (Netflix-Prinzip).
 * search.kind: tag | studio | souls | titles — derselbe Filter gilt für Schiene und Klick.
 */
export const HOME_CATEGORIES = [
  {
    id: 'beliebt',
    emoji: '🔥',
    title: 'Beliebt',
    accent: '#ff6b35',
    fetch: async (supabase, locale = getLocale(), includeReady = false) => {
      const { data, error } = await fetchPopularGames(supabase, LIMIT, locale, includeReady);
      if (error) {
        console.error('Kategorie beliebt:', error.message);
        return [];
      }
      return dedupeGames(data || [], locale);
    },
  },
  {
    id: 'neu',
    emoji: '✨',
    title: 'Neue Guides',
    accent: '#a3e635',
    fetch: async (supabase, locale = getLocale(), includeReady = false) => {
      const { data, error } = await fetchNewGuideGames(supabase, LIMIT, locale, includeReady);
      if (error) {
        console.error('Kategorie neu:', error.message);
        return [];
      }
      return dedupeGames(data || [], locale);
    },
  },
  {
    id: 'souls',
    emoji: '💀',
    title: 'Souls / Soulslike',
    searchMatch: /^(souls(\s*\/\s*soulslike)?|soulslike)$/i,
    search: { kind: 'souls' },
    accent: '#a855f7',
    fetch: (supabase, locale, includeReady) =>
      fetchCategoryList({ search: { kind: 'souls' } }, supabase, locale, includeReady, LIMIT),
  },
  {
    id: 'openworld',
    emoji: '🗺️',
    title: 'Open World',
    searchMatch: /^(open[_\s-]?world)$/i,
    search: { kind: 'tag', tag: HOME_TAGS.OPEN_WORLD },
    accent: '#34d399',
    fetch: (supabase, locale, includeReady) =>
      fetchCategoryList(
        { search: { kind: 'tag', tag: HOME_TAGS.OPEN_WORLD } },
        supabase,
        locale,
        includeReady,
        LIMIT,
      ),
  },
  {
    id: 'ubisoft',
    emoji: '🦅',
    title: 'Ubisoft-Welten',
    searchMatch: /^(ubisoft([- ]welten)?)$/i,
    search: { kind: 'studio', studio: 'Ubisoft', dropQuickwins: true },
    accent: '#38bdf8',
    fetch: (supabase, locale, includeReady) =>
      fetchCategoryList(
        { search: { kind: 'studio', studio: 'Ubisoft', dropQuickwins: true } },
        supabase,
        locale,
        includeReady,
        LIMIT,
      ),
  },
  {
    id: 'rockstar',
    emoji: '⭐️',
    title: 'Rockstar Games',
    searchMatch: /^(rockstar(\s+games)?)$/i,
    search: { kind: 'studio', studio: 'Rockstar', dropQuickwins: true },
    accent: '#facc15',
    fetch: (supabase, locale, includeReady) =>
      fetchCategoryList(
        { search: { kind: 'studio', studio: 'Rockstar', dropQuickwins: true } },
        supabase,
        locale,
        includeReady,
        LIMIT,
      ),
  },
  {
    id: 'family',
    emoji: '🧸',
    title: 'Familienspaß & Easy Platin',
    searchMatch: /^(familienspa[sß].*|easy platin)$/i,
    search: { kind: 'tag', tag: HOME_TAGS.FAMILY },
    accent: '#4ade80',
    fetch: (supabase, locale, includeReady) =>
      fetchCategoryList(
        { search: { kind: 'tag', tag: HOME_TAGS.FAMILY } },
        supabase,
        locale,
        includeReady,
        LIMIT,
      ),
  },
  {
    id: 'indie',
    emoji: '🕹️',
    title: 'Indie-Perlen',
    searchMatch: /^(indie([- ]perlen)?)$/i,
    search: { kind: 'tag', tag: HOME_TAGS.INDIE },
    accent: '#f472b6',
    fetch: (supabase, locale, includeReady) =>
      fetchCategoryList(
        { search: { kind: 'tag', tag: HOME_TAGS.INDIE } },
        supabase,
        locale,
        includeReady,
        LIMIT,
      ),
  },
  {
    id: 'racing',
    emoji: '⏱️',
    title: 'Highspeed & Asphalt',
    searchMatch: /^(highspeed.*|asphalt|racing)$/i,
    search: { kind: 'tag', tag: HOME_TAGS.RACING },
    accent: '#22d3ee',
    fetch: (supabase, locale, includeReady) =>
      fetchCategoryList(
        { search: { kind: 'tag', tag: HOME_TAGS.RACING } },
        supabase,
        locale,
        includeReady,
        LIMIT,
      ),
  },
  {
    id: 'godofwar',
    emoji: '⚔️',
    title: 'God of War',
    searchMatch: /^god of war$/i,
    search: { kind: 'titles', titles: ['%God of War%'] },
    accent: '#c4a35a',
    fetch: (supabase, locale, includeReady) =>
      fetchCategoryList(
        { search: { kind: 'titles', titles: ['%God of War%'] } },
        supabase,
        locale,
        includeReady,
        LIMIT,
      ),
  },
  {
    id: 'tombraider',
    emoji: '🏹',
    title: 'Tomb Raider',
    searchMatch: /^tomb raider$/i,
    search: { kind: 'titles', titles: ['%Tomb Raider%', '%Lara Croft%'] },
    accent: '#14b8a6',
    fetch: (supabase, locale, includeReady) =>
      fetchCategoryList(
        { search: { kind: 'titles', titles: ['%Tomb Raider%', '%Lara Croft%'] } },
        supabase,
        locale,
        includeReady,
        LIMIT,
      ),
  },
];

async function fetchCategoryList(category, supabase, locale, includeReady, limit) {
  const { data, error } = await searchHomeCategory(supabase, category, locale, includeReady, limit);
  if (error) {
    console.error(`Kategorie ${category.search?.kind}:`, error.message);
    return [];
  }
  return data;
}

/**
 * Dieselbe Menge wie die Startseiten-Schiene, ohne das 12er-Limit.
 */
export async function searchHomeCategory(
  supabase,
  category,
  locale = getLocale(),
  includeReady = false,
  limit = SEARCH_RESULT_CAP,
  excludeQuickwins,
) {
  const spec = category?.search;
  if (!spec) return { data: [], error: null };

  const forceExclude = excludeQuickwins === true;
  const forceInclude = excludeQuickwins === false;
  const opts = catalogOptions(includeReady, forceExclude);
  const fetchLimit = Math.max(Number(limit) || SEARCH_RESULT_CAP, 1);

  const dropRows = (rows, specDrops) => {
    if (forceInclude) return withoutServerDead(rows);
    if (forceExclude || specDrops) return withoutQuickwins(rows);
    return withoutServerDead(rows);
  };

  if (spec.kind === 'tag') {
    const { data, error } = await searchGamesByHomeTag(
      supabase,
      spec.tag,
      fetchLimit,
      locale,
      opts,
    );
    if (error) return { data: [], error };
    return { data: dropRows(data, true).slice(0, fetchLimit), error: null };
  }

  if (spec.kind === 'studio') {
    const { data, error } = await searchGamesByStudio(
      supabase,
      spec.studio,
      fetchLimit,
      locale,
      opts,
    );
    if (error) return { data: [], error };
    return { data: dropRows(data, spec.dropQuickwins).slice(0, fetchLimit), error: null };
  }

  if (spec.kind === 'souls') {
    const rows = await mergeRailRows(
      [
        searchGamesByHomeTag(supabase, HOME_TAGS.SOULSLIKE, fetchLimit, locale, opts),
        searchGamesByStudio(supabase, 'FromSoftware', fetchLimit, locale, opts),
      ],
      locale,
      { dropQuickwins: !forceInclude, limit: fetchLimit },
    );
    return { data: rows, error: null };
  }

  if (spec.kind === 'titles') {
    const rows = await mergeRailRows(
      (spec.titles ?? []).map((pattern) =>
        titleLike(supabase, pattern, locale, includeReady, fetchLimit, forceExclude),
      ),
      locale,
      { dropQuickwins: forceExclude, limit: fetchLimit },
    );
    return { data: rows, error: null };
  }

  return { data: [], error: null };
}

export function findHomeCategoryForQuery(query) {
  const q = String(query ?? '').trim();
  if (!q) return null;
  return (
    HOME_CATEGORIES.find((cat) => {
      if (cat.searchMatch?.test(q)) return true;
      return cat.search && cat.title.toLowerCase() === q.toLowerCase();
    }) ?? null
  );
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} [locale]
 * @param {boolean} [includeReady] nur Legacy-Fallback (RPC ist immer PUBLISHED)
 */
export async function fetchAllHomeCategories(supabase, locale = getLocale(), includeReady = false) {
  if (
    homeRailsCache &&
    homeRailsCache.locale === locale &&
    Date.now() - homeRailsCache.at < HOME_RAILS_CACHE_MS
  ) {
    return railsForLocale(homeRailsCache.rails, locale);
  }

  const viaRpc = HOME_RAILS_RPC_ENABLED
    ? await fetchHomeRailsViaRpc(supabase, locale)
    : null;
  const rails = viaRpc ?? (await fetchHomeRailsLegacy(supabase, locale, includeReady));

  if (viaRpc) {
    homeRailsCache = { locale, at: Date.now(), rails: viaRpc };
  }

  return railsForLocale(rails, locale);
}
