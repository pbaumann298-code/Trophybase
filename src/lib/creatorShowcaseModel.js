import { getGameTitle, getGameUuid } from './gameModel.js';
import { readHomeTags, resolveMatchingHomeTagSlugs, translateHomeTag } from './homeTagDefs.js';
import { gameTitleMatches, groupQuickwinsByAlphabet } from './quickwinCatalog.js';
import { isEasyPlatinGame, isQuickwinStyleType } from './gameSchema.js';

export const OTHER_GENRE_KEY = '__other_single_titles__';

export function normalizeShowcaseConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const rawShelves = Array.isArray(src.pinnedShelves) ? src.pinnedShelves : [];
  const pinnedShelves = rawShelves
    .map((entry, idx) => {
      if (!entry || typeof entry !== 'object') return null;
      const title = String(entry.title ?? '').trim().slice(0, 80);
      const matchQuery = String(entry.matchQuery ?? '').trim().slice(0, 80);
      const tagSlug = String(entry.tagSlug ?? '').trim().toLowerCase();
      const gameIds = Array.isArray(entry.gameIds)
        ? [...new Set(entry.gameIds.map((id) => String(id ?? '').trim()).filter(Boolean))]
        : [];
      if (!title && !matchQuery && gameIds.length === 0) return null;
      return {
        id: String(entry.id || `shelf_${idx}_${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`),
        title: title || matchQuery || `Reihe ${idx + 1}`,
        matchQuery,
        tagSlug,
        gameIds,
      };
    })
    .filter(Boolean)
    .slice(0, 24);

  const restGrouping = ['auto', 'by_genre', 'a_z', 'grid'].includes(src.restGrouping)
    ? src.restGrouping
    : 'auto';

  const genreOrder = Array.isArray(src.genreOrder)
    ? [...new Set(src.genreOrder.map((g) => String(g ?? '').trim()).filter(Boolean))]
    : [];

  return {
    pinnedShelves,
    restGrouping,
    genreOrder,
    dedupePinnedFromRest: src.dedupePinnedFromRest !== false,
    linkFromGuides: src.linkFromGuides !== false,
  };
}

export function resolveEffectiveGrouping(config, totalGamesCount) {
  const norm = normalizeShowcaseConfig(config);
  if (norm.restGrouping !== 'auto') return norm.restGrouping;
  if (totalGamesCount <= 8 && norm.pinnedShelves.length === 0) {
    return 'grid';
  }
  return 'by_genre';
}

export function gameMatchesShelf(game, shelf) {
  if (!game || !shelf) return false;
  const id = getGameUuid(game);
  if (id && Array.isArray(shelf.gameIds) && shelf.gameIds.includes(id)) {
    return true;
  }
  if (shelf.tagSlug) {
    const tags = readHomeTags(game).map((t) => t.toLowerCase());
    if (tags.includes(shelf.tagSlug.toLowerCase())) return true;
  }
  if (shelf.matchQuery) {
    if (gameTitleMatches(game, shelf.matchQuery)) return true;
    const q = shelf.matchQuery.toLowerCase().trim();
    if (q.length >= 3) {
      if (String(game.publisher ?? '').toLowerCase().includes(q)) return true;
      if (String(game.entwickler ?? '').toLowerCase().includes(q)) return true;
    }
  }
  return false;
}

export function buildCreatorShowcaseSections(games, rawConfig, locale = 'de') {
  const config = normalizeShowcaseConfig(rawConfig);
  const pinnedGameIds = new Set();
  const pinnedRows = [];

  for (const shelf of config.pinnedShelves) {
    const explicitRank = new Map((shelf.gameIds || []).map((gid, i) => [gid, i]));
    const matched = (games ?? []).filter((game) => gameMatchesShelf(game, shelf));
    if (matched.length === 0) continue;

    matched.sort((a, b) => {
      const idA = getGameUuid(a);
      const idB = getGameUuid(b);
      const posA = explicitRank.has(idA) ? explicitRank.get(idA) : 99999;
      const posB = explicitRank.has(idB) ? explicitRank.get(idB) : 99999;
      if (posA !== posB) return posA - posB;
      const yA = Number(a?.release_jahr) || 0;
      const yB = Number(b?.release_jahr) || 0;
      if (yA !== yB) return yA - yB;
      return getGameTitle(a, locale).localeCompare(getGameTitle(b, locale), locale);
    });

    for (const g of matched) {
      const gid = getGameUuid(g);
      if (gid) pinnedGameIds.add(gid);
    }

    pinnedRows.push({
      id: `pinned:${shelf.id}`,
      shelfId: shelf.id,
      title: shelf.title,
      kind: 'pinned',
      games: matched,
    });
  }

  const remainingGames = config.dedupePinnedFromRest
    ? (games ?? []).filter((g) => !pinnedGameIds.has(getGameUuid(g)))
    : [...(games ?? [])];

  // Gruppiere verbleibende Einzeltitel nach Genre (bevorzugt vom Creator priorisierte Genres zuerst)
  const orderIndex = new Map(config.genreOrder.map((slug, idx) => [slug, idx]));
  const buckets = new Map();

  for (const game of remainingGames) {
    const tags = readHomeTags(game);
    let chosenTag = OTHER_GENRE_KEY;
    if (tags.length > 0) {
      const sortedTags = [...tags].sort((a, b) => {
        const pA = orderIndex.has(a) ? orderIndex.get(a) : 999;
        const pB = orderIndex.has(b) ? orderIndex.get(b) : 999;
        return pA - pB;
      });
      chosenTag = sortedTags[0];
    }
    const bucket = buckets.get(chosenTag) ?? [];
    bucket.push(game);
    buckets.set(chosenTag, bucket);
  }

  const genreEntries = [...buckets.entries()].map(([slug, list]) => ({
    id: `genre:${slug}`,
    genreSlug: slug,
    title:
      slug === OTHER_GENRE_KEY
        ? locale === 'de'
          ? 'Weitere Einzeltitel'
          : 'More Single Titles'
        : translateHomeTag(slug, locale),
    kind: 'genre',
    games: list,
  }));

  genreEntries.sort((a, b) => {
    const pA = orderIndex.has(a.genreSlug) ? orderIndex.get(a.genreSlug) : null;
    const pB = orderIndex.has(b.genreSlug) ? orderIndex.get(b.genreSlug) : null;
    if (pA !== null && pB !== null) return pA - pB;
    if (pA !== null) return -1;
    if (pB !== null) return 1;
    if (a.genreSlug === OTHER_GENRE_KEY) return 1;
    if (b.genreSlug === OTHER_GENRE_KEY) return -1;
    if (b.games.length !== a.games.length) return b.games.length - a.games.length;
    return a.title.localeCompare(b.title, locale);
  });

  const alphabetSections = groupQuickwinsByAlphabet(remainingGames, locale);

  return {
    config,
    pinnedRows,
    remainingGames,
    genreRows: genreEntries,
    alphabetSections,
  };
}

/**
 * Erkennt automatisch mehrteilige Spielereihen im Katalog eines Creators
 * (z. B. "Five Nights at Freddy's", "Assassin's Creed", "Resident Evil").
 */
export function detectCreatorSeriesSuggestions(games, locale = 'de', existingShelves = []) {
  const existingQueries = new Set(
    (existingShelves ?? [])
      .map((s) => String(s?.matchQuery || s?.title || '').toLowerCase().trim())
      .filter(Boolean),
  );

  const stemMap = new Map();

  for (const game of games ?? []) {
    const rawTitle = getGameTitle(game, locale).trim();
    if (!rawTitle) continue;

    // Schneide Untertitel an ":", " - ", " – " oder römischen/arabischen Folgeziffern ab
    let stem = rawTitle
      .split(/\s*(?::|–|—|\s-\s)\s*/)[0]
      .replace(
        /\s+(?:Part\s+[IVX0-9]+|[IVX]{2,5}|[0-9]{1,2}|Remake|Remastered|Definitive Edition|Director's Cut)$/i,
        '',
      )
      .trim();

    if (stem.length < 4) continue;
    const normKey = stem
      .toLowerCase()
      .replace(/['’.:;-]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (normKey.length < 4) continue;

    const entry = stemMap.get(normKey) ?? { label: stem, games: [] };
    entry.games.push(game);
    if (stem.length < entry.label.length) entry.label = stem;
    stemMap.set(normKey, entry);
  }

  const suggestions = [];
  for (const [, entry] of stemMap.entries()) {
    if (entry.games.length < 2) continue;
    const low = entry.label.toLowerCase().trim();
    if (existingQueries.has(low)) continue;
    suggestions.push({
      title: entry.label,
      matchQuery: entry.label,
      count: entry.games.length,
    });
  }

  suggestions.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, locale));
  return suggestions.slice(0, 14);
}

export function classifyCreatorGameSegment(game) {
  if (isQuickwinStyleType(game?.spiel_typ)) return 'quickwin';
  if (isEasyPlatinGame(game)) return 'easy_platin';
  return 'main';
}

export function filterCreatorCatalogGames(games, { query = '', segment = 'all', locale = 'de' } = {}) {
  const q = String(query ?? '').trim().toLowerCase();
  const matchedGenreSlugs = q.length >= 2 ? new Set(resolveMatchingHomeTagSlugs(q)) : new Set();

  return (games ?? []).filter((game) => {
    if (segment !== 'all') {
      const seg = classifyCreatorGameSegment(game);
      if (seg !== segment) return false;
    }

    if (!q) return true;
    if (gameTitleMatches(game, q)) return true;
    if (String(game?.publisher ?? '').toLowerCase().includes(q)) return true;
    if (String(game?.entwickler ?? '').toLowerCase().includes(q)) return true;
    for (const tag of readHomeTags(game)) {
      const slug = tag.toLowerCase();
      if (slug.includes(q) || matchedGenreSlugs.has(slug)) return true;
      if (translateHomeTag(slug, locale).toLowerCase().includes(q)) return true;
    }
    return false;
  });
}
