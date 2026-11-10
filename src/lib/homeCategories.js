import { GAME_PK, HOME_TAGS, isQuickwinStyleType, isServerDeadType } from './gameSchema';
import { getGameTitle, getRouteSlug, mergeGameRows } from './gameModel';
import {
  SEARCH_RESULT_CAP,
  fetchNewGuideGames,
  fetchPopularGames,
  searchGamesByColumn,
  searchGamesByHomeTag,
  searchGamesBySubGenre,
  searchGamesByStudio,
  GAME_SEARCH_LOCALIZED_COLUMNS,
} from './gameQueries';
import { getLocale } from './locale';
import { hasPublishedGuide } from './guidePublication';
import { translateHomeTag } from './homeTagDefs';

const LIMIT = 12;

/** Schienen, die `tb_get_home_rails` wirklich füllt (Original-Startseite). */
export const HOME_RAILS_RPC_IDS = new Set([
  'beliebt',
  'neu',
  'souls',
  'capcom',
  'openworld',
  'ubisoft',
  'rockstar',
  'family',
  'indie',
  'racing',
  'godofwar',
  'tombraider',
]);

function tagRail({ id, emoji, title, titleKey, tag, accent, searchMatch }) {
  const search = { kind: 'tag', tag };
  return {
    id,
    emoji,
    title,
    titleKey,
    tagSlug: tag,
    searchMatch,
    search,
    accent,
    fetch: (supabase, locale, includeReady, limit = LIMIT) =>
      fetchCategoryList({ search }, supabase, locale, includeReady, limit),
  };
}

/**
 * Optimierte `tb_get_home_rails` (supabase/home_rails.sql).
 * Bei Timeout: einmal retry, dann Legacy mit begrenzter Parallelität
 * (kein Stampede – der hat Chrome/DB totgeschlagen).
 */
const HOME_RAILS_RPC_ENABLED = true;
const HOME_RAILS_LEGACY_CONCURRENCY = 2;
const HOME_RAILS_CACHE_MS = 30_000;

/** @type {{ locale: string, promise: Promise<Record<string, object[]>|null> }|null} */
let homeRailsInflight = null;

/** @type {{ locale: string, at: number, rails: Record<string, object[]> }|null} */
let homeRailsCache = null;

/**
 * Aktualisiert ein Spiel im In-Memory-Startseiten-Cache (z. B. nach Cover-Verifizierung),
 * damit beim Wechsel zwischen Ansichten oder Kacheln der neue Status sofort erhalten bleibt.
 * @param {string} gameId
 * @param {Record<string, unknown>} patch
 */
export function patchHomeRailsCacheGame(gameId, patch) {
  const id = String(gameId ?? '').trim();
  if (!id || !patch || typeof patch !== 'object') return;
  if (homeRailsCache?.rails && typeof homeRailsCache.rails === 'object') {
    const nextRails = {};
    for (const [railId, list] of Object.entries(homeRailsCache.rails)) {
      nextRails[railId] = Array.isArray(list)
        ? list.map((g) => (String(g?.[GAME_PK] ?? g?.id ?? '') === id ? { ...g, ...patch } : g))
        : list;
    }
    homeRailsCache = { ...homeRailsCache, rails: nextRails };
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent('tb:game-cover-updated', { detail: { gameId: id, patch } }),
    );
  }
}

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

function catalogOptions(includeReady, excludeQuickwins = false, locale = getLocale()) {
  const catalog = includeReady
    ? { includeReady: true, locale }
    : { publishedOnly: true, locale };
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
    catalogOptions(includeReady, excludeQuickwins, locale),
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

/** Globale Startseiten-Rails: jedes veröffentlichte Spiel, Servertot nie. */
function railsForLocale(byId, locale) {
  void locale;
  const next = {};
  for (const [id, games] of Object.entries(byId ?? {})) {
    next[id] = withoutServerDead(games ?? []).filter((game) => hasPublishedGuide(game));
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
  if (homeRailsInflight?.locale === locale) return homeRailsInflight.promise;

  const promise = (async () => {
    const runOnce = () => supabase.rpc('tb_get_home_rails', { p_locale: locale });

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
    if (homeRailsInflight?.promise === promise) homeRailsInflight = null;
  });

  homeRailsInflight = { locale, promise };
  return promise;
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

async function fetchHomeRailsLegacy(supabase, locale, includeReady, categoryIds = null) {
  const wanted = Array.isArray(categoryIds) && categoryIds.length
    ? new Set(categoryIds)
    : HOME_RAILS_RPC_IDS;
  const cats = HOME_CATEGORIES.filter((cat) => wanted.has(cat.id));
  const entries = await mapPool(
    cats,
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
 * Kuratierte Startseiten-Kategorie-Reihen.
 * search.kind: tag | studio | souls | titles — derselbe Filter gilt für Schiene und Klick.
 */
export const HOME_CATEGORIES = [
  {
    id: 'beliebt',
    emoji: '🔥',
    title: 'Beliebt',
    titleKey: 'homeCatBeliebt',
    accent: '#ff6b35',
    fetch: async (supabase, locale = getLocale(), includeReady = false, limit = LIMIT) => {
      const { data, error } = await fetchPopularGames(supabase, limit, locale, includeReady);
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
    titleKey: 'homeCatNeu',
    accent: '#a3e635',
    fetch: async (supabase, locale = getLocale(), includeReady = false, limit = LIMIT) => {
      const { data, error } = await fetchNewGuideGames(supabase, limit, locale, includeReady);
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
    titleKey: 'homeCatSouls',
    tagSlug: HOME_TAGS.SOULSLIKE,
    searchMatch: /^(souls(\s*\/\s*soulslike)?|soulslike)$/i,
    search: { kind: 'souls' },
    accent: '#a855f7',
    fetch: (supabase, locale, includeReady, limit = LIMIT) =>
      fetchCategoryList({ search: { kind: 'souls' } }, supabase, locale, includeReady, limit),
  },
  {
    id: 'capcom',
    emoji: '🎮',
    title: 'Capcom',
    titleKey: 'homeCatCapcom',
    searchMatch: /^capcom$/i,
    search: { kind: 'studio', studio: 'Capcom', dropQuickwins: true },
    accent: '#ef4444',
    fetch: (supabase, locale, includeReady, limit = LIMIT) =>
      fetchCategoryList(
        { search: { kind: 'studio', studio: 'Capcom', dropQuickwins: true } },
        supabase,
        locale,
        includeReady,
        limit,
      ),
  },
  tagRail({
    id: 'openworld',
    emoji: '🗺️',
    title: 'Open World',
    titleKey: 'homeCatOpenWorld',
    tag: HOME_TAGS.OPEN_WORLD,
    searchMatch: /^(open[_\s-]?world)$/i,
    accent: '#34d399',
  }),
  tagRail({
    id: 'rpg',
    emoji: '🐉',
    title: 'Rollenspiele (RPG)',
    titleKey: 'homeCatRpg',
    tag: HOME_TAGS.RPG,
    searchMatch: /^(rpg|rollenspiele?)$/i,
    accent: '#c084fc',
  }),
  tagRail({
    id: 'lootshooter',
    emoji: '🎯',
    title: 'Loot-Shooter',
    titleKey: 'homeCatLootShooter',
    tag: HOME_TAGS.LOOT_SHOOTER,
    searchMatch: /^(loot[- ]?shooter|looter[- ]?shooter)$/i,
    accent: '#fb923c',
  }),
  tagRail({
    id: 'fps',
    emoji: '🔫',
    title: 'Ego-Shooter (FPS)',
    titleKey: 'homeCatFps',
    tag: HOME_TAGS.FPS,
    searchMatch: /^(ego[- ]?shooter|fps|first[- ]person[- ]shooter)$/i,
    accent: '#f87171',
  }),
  tagRail({
    id: 'tps',
    emoji: '🕹️',
    title: 'Third-Person-Shooter',
    titleKey: 'homeCatTps',
    tag: HOME_TAGS.TPS,
    searchMatch: /^(third[- ]person[- ]shooter|tps)$/i,
    accent: '#60a5fa',
  }),
  tagRail({
    id: 'coop',
    emoji: '🤝',
    title: 'Koop & Multiplayer',
    titleKey: 'homeCatCoop',
    tag: HOME_TAGS.COOP_MP,
    searchMatch: /^(koop|co-?op|multiplayer|koop\s*&\s*multiplayer)$/i,
    accent: '#38bdf8',
  }),
  tagRail({
    id: 'horror',
    emoji: '🩸',
    title: 'Horror & Survival',
    titleKey: 'homeCatHorror',
    tag: HOME_TAGS.SURVIVAL_HORROR,
    searchMatch: /^(horror|survival[- ]?horror|horror\s*&\s*survival)$/i,
    accent: '#dc2626',
  }),
  tagRail({
    id: 'tactics',
    emoji: '♟️',
    title: 'Strategie & Taktik',
    titleKey: 'homeCatTactics',
    tag: HOME_TAGS.TACTICS,
    searchMatch: /^(strategie|taktik|strategie\s*&\s*taktik|tactics)$/i,
    accent: '#eab308',
  }),
  {
    id: 'ubisoft',
    emoji: '🦅',
    title: 'Ubisoft-Welten',
    titleKey: 'homeCatUbisoft',
    searchMatch: /^(ubisoft([- ]welten)?)$/i,
    search: { kind: 'studio', studio: 'Ubisoft', dropQuickwins: true },
    accent: '#38bdf8',
    fetch: (supabase, locale, includeReady, limit = LIMIT) =>
      fetchCategoryList(
        { search: { kind: 'studio', studio: 'Ubisoft', dropQuickwins: true } },
        supabase,
        locale,
        includeReady,
        limit,
      ),
  },
  {
    id: 'rockstar',
    emoji: '⭐️',
    title: 'Rockstar Games',
    titleKey: 'homeCatRockstar',
    searchMatch: /^(rockstar(\s+games)?)$/i,
    search: { kind: 'studio', studio: 'Rockstar', dropQuickwins: true },
    accent: '#facc15',
    fetch: (supabase, locale, includeReady, limit = LIMIT) =>
      fetchCategoryList(
        { search: { kind: 'studio', studio: 'Rockstar', dropQuickwins: true } },
        supabase,
        locale,
        includeReady,
        limit,
      ),
  },
  tagRail({
    id: 'family',
    emoji: '🧸',
    title: 'Familienspaß & Easy Platin',
    titleKey: 'homeCatFamily',
    tag: HOME_TAGS.FAMILY,
    searchMatch: /^(familienspa[sß].*|easy platin)$/i,
    accent: '#4ade80',
  }),
  tagRail({
    id: 'indie',
    emoji: '🕹️',
    title: 'Indie-Perlen',
    titleKey: 'homeCatIndie',
    tag: HOME_TAGS.INDIE,
    searchMatch: /^(indie([- ]perlen)?)$/i,
    accent: '#f472b6',
  }),
  {
    id: 'racing',
    emoji: '⏱️',
    title: 'Highspeed & Asphalt',
    titleKey: 'homeCatRacing',
    tagSlug: HOME_TAGS.RACING,
    searchTerm: 'Racing',
    searchMatch: /^(highspeed.*|asphalt|racing|rennspiel(e)?)$/i,
    search: { kind: 'genre', genre: 'Racing', tag: HOME_TAGS.RACING },
    accent: '#22d3ee',
    fetch: (supabase, locale, includeReady, limit = LIMIT) =>
      fetchCategoryList(
        { search: { kind: 'genre', genre: 'Racing', tag: HOME_TAGS.RACING } },
        supabase,
        locale,
        includeReady,
        limit,
      ),
  },
  {
    id: 'godofwar',
    emoji: '⚔️',
    title: 'God of War',
    titleKey: 'homeCatGodOfWar',
    searchMatch: /^god of war$/i,
    search: { kind: 'titles', titles: ['%God of War%'] },
    accent: '#c4a35a',
    fetch: (supabase, locale, includeReady, limit = LIMIT) =>
      fetchCategoryList(
        { search: { kind: 'titles', titles: ['%God of War%'] } },
        supabase,
        locale,
        includeReady,
        limit,
      ),
  },
  {
    id: 'tombraider',
    emoji: '🏹',
    title: 'Tomb Raider',
    titleKey: 'homeCatTombRaider',
    searchMatch: /^tomb raider$/i,
    search: { kind: 'titles', titles: ['%Tomb Raider%', '%Lara Croft%'] },
    accent: '#14b8a6',
    fetch: (supabase, locale, includeReady, limit = LIMIT) =>
      fetchCategoryList(
        { search: { kind: 'titles', titles: ['%Tomb Raider%', '%Lara Croft%'] } },
        supabase,
        locale,
        includeReady,
        limit,
      ),
  },
  tagRail({
    id: 'action_adventure',
    emoji: '🧭',
    title: 'Action-Adventure',
    tag: HOME_TAGS.ACTION_ADVENTURE,
    searchMatch: /^(action[- ]?adventure|action[- ]?abenteuer)$/i,
    accent: '#fb7185',
  }),
  tagRail({
    id: 'roguelike',
    emoji: '🎲',
    title: 'Roguelike / Roguelite',
    tag: HOME_TAGS.ROGUELIKE,
    searchMatch: /^(rogue[- ]?like|rogue[- ]?lite)$/i,
    accent: '#f59e0b',
  }),
  tagRail({
    id: 'platformer',
    emoji: '🦘',
    title: 'Jump ’n’ Run / Platformer',
    tag: HOME_TAGS.PLATFORMER,
    searchMatch: /^(platformer|jump\s*['’]?\s*n\s*['’]?\s*run|jump.?n.?run)$/i,
    accent: '#4ade80',
  }),
  tagRail({
    id: 'fighting',
    emoji: '🥊',
    title: 'Beat ’em up / Kampfspiel',
    tag: HOME_TAGS.FIGHTING,
    searchMatch: /^(fighting|kampfspiel|beat[- ]?em[- ]?up)$/i,
    accent: '#f97316',
  }),
  tagRail({
    id: 'sports',
    emoji: '⚽',
    title: 'Sport',
    tag: HOME_TAGS.SPORTS,
    searchMatch: /^(sports?|sportspiele?)$/i,
    accent: '#84cc16',
  }),
  tagRail({
    id: 'simulation',
    emoji: '🛠️',
    title: 'Simulation',
    tag: HOME_TAGS.SIMULATION,
    searchMatch: /^(simulation|simulator|sim)$/i,
    accent: '#94a3b8',
  }),
  tagRail({
    id: 'scifi_cyberpunk',
    emoji: '🌃',
    title: 'Sci-Fi & Cyberpunk',
    tag: HOME_TAGS.SCIFI_CYBERPUNK,
    searchMatch: /^(sci[- ]?fi|cyberpunk|sci[- ]?fi\s*&\s*cyberpunk)$/i,
    accent: '#22d3ee',
  }),
  tagRail({
    id: 'mystery_crime',
    emoji: '🕵️',
    title: 'Mystery, Crime & Detektiv',
    tag: HOME_TAGS.MYSTERY_CRIME,
    searchMatch: /^(mystery|crime|detektiv|krimi|mystery.*crime)$/i,
    accent: '#818cf8',
  }),
  tagRail({
    id: 'hidden_object',
    emoji: '🔍',
    title: 'Wimmelbild',
    tag: HOME_TAGS.HIDDEN_OBJECT,
    searchMatch: /^(hidden[- ]?object|wimmelbild)$/i,
    accent: '#fbbf24',
  }),
  tagRail({
    id: 'visual_novel',
    emoji: '📖',
    title: 'Visual Novel',
    tag: HOME_TAGS.VISUAL_NOVEL,
    searchMatch: /^(visual[- ]?novel)$/i,
    accent: '#e879f9',
  }),
  tagRail({
    id: 'fmv',
    emoji: '🎥',
    title: 'FMV / Interaktiver Film',
    tag: HOME_TAGS.FMV,
    searchMatch: /^(fmv|interaktiver film|interactive movie)$/i,
    accent: '#c084fc',
  }),
  tagRail({
    id: 'point_and_click',
    emoji: '🖱️',
    title: 'Point & Click',
    tag: HOME_TAGS.POINT_AND_CLICK,
    searchMatch: /^(point\s*&\s*click|point[- ]and[- ]click)$/i,
    accent: '#67e8f9',
  }),
  tagRail({
    id: 'otome_romance',
    emoji: '💕',
    title: 'Otome & Romance',
    tag: HOME_TAGS.OTOME_ROMANCE,
    searchMatch: /^(otome|romance|otome\s*&\s*romance)$/i,
    accent: '#fb7185',
  }),
  tagRail({
    id: 'psych_horror',
    emoji: '🧠',
    title: 'Psychologischer Horror',
    tag: HOME_TAGS.PSYCH_HORROR,
    searchMatch: /^(psych(ological)?[- ]?horror|psychologischer horror)$/i,
    accent: '#a78bfa',
  }),
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
  const opts = catalogOptions(includeReady, forceExclude, locale);
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

  if (spec.kind === 'genre') {
    const rows = await mergeRailRows(
      [
        spec.genre
          ? searchGamesBySubGenre(supabase, spec.genre, fetchLimit, locale, opts)
          : Promise.resolve({ data: [], error: null }),
        spec.tag
          ? searchGamesByHomeTag(supabase, spec.tag, fetchLimit, locale, opts)
          : Promise.resolve({ data: [], error: null }),
      ],
      locale,
      { dropQuickwins: !forceInclude, limit: fetchLimit },
    );
    return { data: rows, error: null };
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

export function getHomeCategoryById(id) {
  return HOME_CATEGORIES.find((cat) => cat.id === id) ?? null;
}

export function getHomeCategoriesByIds(ids) {
  const map = new Map(HOME_CATEGORIES.map((cat) => [cat.id, cat]));
  return (ids ?? []).map((id) => map.get(id)).filter(Boolean);
}

export function getHomeCategoryTitle(category, locale = getLocale(), translateUi) {
  if (category?.tagSlug) {
    return translateHomeTag(category.tagSlug, locale, category.title);
  }
  if (category?.titleKey && typeof translateUi === 'function') {
    return translateUi(category.titleKey);
  }
  return category?.title || '';
}

export function findHomeCategoryForQuery(query, locale = getLocale()) {
  const q = String(query ?? '').trim();
  if (!q) return null;
  const lower = q.toLowerCase();
  return (
    HOME_CATEGORIES.find((cat) => {
      if (cat.id === lower || cat.tagSlug === lower) return true;
      if (cat.searchMatch?.test(q)) return true;
      if (cat.title.toLowerCase() === lower) return true;
      if (cat.tagSlug && translateHomeTag(cat.tagSlug, locale).toLowerCase() === lower) {
        return true;
      }
      return Boolean(cat.search && cat.title.toLowerCase() === lower);
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
  const rails = viaRpc ?? (await fetchHomeRailsLegacy(
    supabase,
    locale,
    includeReady,
    [...HOME_RAILS_RPC_IDS],
  ));

  if (viaRpc) {
    homeRailsCache = { locale, at: Date.now(), rails: viaRpc };
  }

  return railsForLocale(rails, locale);
}

/**
 * Nur die gewünschten Schienen. RPC-Cache für die 12 Original-Reihen,
 * fehlende Bausteine (weitere der 26 Genres) per Legacy nachladen.
 */
export async function fetchHomeCategoriesForIds(
  supabase,
  locale = getLocale(),
  categoryIds = [],
  includeReady = false,
) {
  const wanted = [...new Set(categoryIds)].filter((id) => getHomeCategoryById(id));
  const byId = await fetchAllHomeCategories(supabase, locale, includeReady);
  const missing = wanted
    .map((id) => getHomeCategoryById(id))
    .filter((cat) => cat && !HOME_RAILS_RPC_IDS.has(cat.id));

  if (missing.length > 0) {
    const extras = await mapPool(
      missing,
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
    const extraRails = railsForLocale(Object.fromEntries(extras), locale);
    for (const [id, games] of Object.entries(extraRails)) {
      byId[id] = games;
    }
  }

  return Object.fromEntries(wanted.map((id) => [id, byId[id] || []]));
}
