import { GAME_PK } from './gameSchema';
import { getGameTitle, getRouteSlug } from './gameModel';
import {
  GAME_SEARCH_STRUCT_COLUMNS,
  GAME_SEARCH_LOCALIZED_COLUMNS,
  fetchNewGuideGames,
  fetchPopularGames,
  searchGamesByColumn,
} from './gameQueries';
import { getLocale } from './locale';

const LIMIT = 12;

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

function catalogOptions(includeReady) {
  return includeReady ? { includeReady: true } : { publishedOnly: true };
}

function titleLike(supabase, pattern, locale, includeReady) {
  if (!pattern) return Promise.resolve({ data: [], error: new Error('Suchmuster fehlt') });
  return searchGamesByColumn(
    supabase,
    GAME_SEARCH_LOCALIZED_COLUMNS.title,
    pattern,
    LIMIT,
    locale,
    catalogOptions(includeReady),
  );
}

function devLike(supabase, pattern, locale, includeReady) {
  if (!pattern) return Promise.resolve({ data: [], error: new Error('Suchmuster fehlt') });
  return searchGamesByColumn(
    supabase,
    GAME_SEARCH_STRUCT_COLUMNS.developer,
    pattern,
    LIMIT,
    locale,
    catalogOptions(includeReady),
  );
}

function genreLike(supabase, pattern, locale, includeReady) {
  if (!pattern) return Promise.resolve({ data: [], error: new Error('Suchmuster fehlt') });
  return searchGamesByColumn(
    supabase,
    GAME_SEARCH_STRUCT_COLUMNS.genre,
    pattern,
    LIMIT,
    locale,
    catalogOptions(includeReady),
  );
}

/**
 * Kuratierte Startseiten-Reihen (Netflix-Prinzip).
 */
export const HOME_CATEGORIES = [
  {
    id: 'beliebt',
    emoji: '🔥',
    title: 'Beliebt',
    tagline: 'Die meistaufgerufenen Evergreen- & Premium-Guides',
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
    tagline: 'Frisch in der Datenbank – nur Evergreen & Premium',
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
    searchTerm: 'Souls',
    tagline: 'Für die Hardcore-Fraktion – Elden Ring, Wuchang & Co.',
    accent: '#a855f7',
    fetch: async (supabase, locale = getLocale(), includeReady = false) => {
      const rows = await runQueries([
        genreLike(supabase, '%Soulslike%', locale, includeReady),
        genreLike(supabase, '%Souls%', locale, includeReady),
        devLike(supabase, '%FromSoftware%', locale, includeReady),
        titleLike(supabase, '%Elden Ring%', locale, includeReady),
        titleLike(supabase, '%Dark Souls%', locale, includeReady),
        titleLike(supabase, '%Sekiro%', locale, includeReady),
        titleLike(supabase, '%Bloodborne%', locale, includeReady),
        titleLike(supabase, '%Wuchang%', locale, includeReady),
        titleLike(supabase, '%Lies of P%', locale, includeReady),
        titleLike(supabase, '%Nioh%', locale, includeReady),
      ]);
      return dedupeGames(rows, locale).slice(0, LIMIT);
    },
  },
  {
    id: 'ubisoft',
    emoji: '🦅',
    title: 'Ubisoft-Welten',
    searchTerm: 'Ubisoft',
    tagline: 'Open-World-Suchtis & Komplettierer',
    accent: '#38bdf8',
    fetch: async (supabase, locale = getLocale(), includeReady = false) => {
      const rows = await runQueries([
        devLike(supabase, '%Ubisoft%', locale, includeReady),
        titleLike(supabase, '%Assassin%', locale, includeReady),
        titleLike(supabase, '%Far Cry%', locale, includeReady),
        titleLike(supabase, '%Watch Dogs%', locale, includeReady),
        titleLike(supabase, '%Ghost Recon%', locale, includeReady),
        titleLike(supabase, '%Rainbow Six%', locale, includeReady),
      ]);
      return dedupeGames(rows, locale).slice(0, LIMIT);
    },
  },
  {
    id: 'rockstar',
    emoji: '⭐️',
    title: 'Rockstar Games',
    searchTerm: 'Rockstar',
    tagline: 'Legendär schwere & zeitaufwendige Meilensteine',
    accent: '#facc15',
    fetch: async (supabase, locale = getLocale(), includeReady = false) => {
      const rows = await runQueries([
        devLike(supabase, '%Rockstar%', locale, includeReady),
        titleLike(supabase, '%Grand Theft Auto%', locale, includeReady),
        titleLike(supabase, '%GTA%', locale, includeReady),
        titleLike(supabase, '%Red Dead%', locale, includeReady),
        titleLike(supabase, '%Bully%', locale, includeReady),
        titleLike(supabase, '%Max Payne%', locale, includeReady),
        titleLike(supabase, '%Lies of P%', locale, includeReady),
      ]);
      return dedupeGames(rows, locale).slice(0, LIMIT);
    },
  },
  {
    id: 'family',
    emoji: '🧸',
    title: 'Familienspaß & Easy Platin',
    searchTerm: 'LEGO',
    tagline: 'Kinder- & Familienspiele – entspannt zum Ziel',
    accent: '#4ade80',
    fetch: async (supabase, locale = getLocale(), includeReady = false) => {
      const rows = await runQueries([
        genreLike(supabase, '%Familie%', locale, includeReady),
        genreLike(supabase, '%Kinder%', locale, includeReady),
        genreLike(supabase, '%Party%', locale, includeReady),
        titleLike(supabase, '%Astro Bot%', locale, includeReady),
        titleLike(supabase, '%SpongeBob%', locale, includeReady),
        titleLike(supabase, '%LEGO%', locale, includeReady),
        titleLike(supabase, '%Lego%', locale, includeReady),
        titleLike(supabase, '%Sackboy%', locale, includeReady),
        titleLike(supabase, '%Ratchet%', locale, includeReady),
        titleLike(supabase, '%LittleBigPlanet%', locale, includeReady),
        titleLike(supabase, '%Crash Bandicoot%', locale, includeReady),
        titleLike(supabase, '%Disney%', locale, includeReady),
      ]);
      return dedupeGames(rows, locale).slice(0, LIMIT);
    },
  },
  {
    id: 'indie',
    emoji: '🕹️',
    title: 'Indie-Perlen',
    searchTerm: 'Hollow Knight',
    tagline: 'Treue Nischen-Communities – Hollow Knight, Hades, Stray',
    accent: '#f472b6',
    fetch: async (supabase, locale = getLocale(), includeReady = false) => {
      const rows = await runQueries([
        genreLike(supabase, '%Indie%', locale, includeReady),
        titleLike(supabase, '%Hollow Knight%', locale, includeReady),
        titleLike(supabase, '%Hades%', locale, includeReady),
        titleLike(supabase, '%Stray%', locale, includeReady),
        titleLike(supabase, '%Celeste%', locale, includeReady),
        titleLike(supabase, '%Stardew%', locale, includeReady),
        titleLike(supabase, '%Cuphead%', locale, includeReady),
        titleLike(supabase, '%Ori%', locale, includeReady),
        titleLike(supabase, '%Shovel Knight%', locale, includeReady),
        titleLike(supabase, '%Dead Cells%', locale, includeReady),
      ]);
      return dedupeGames(rows, locale).slice(0, LIMIT);
    },
  },
  {
    id: 'racing',
    emoji: '⏱️',
    title: 'Highspeed & Asphalt',
    searchTerm: 'Gran Turismo',
    tagline: 'Rennspiele & skill-basierte Sport-Trophäen',
    accent: '#22d3ee',
    fetch: async (supabase, locale = getLocale(), includeReady = false) => {
      const rows = await runQueries([
        genreLike(supabase, '%Renn%', locale, includeReady),
        genreLike(supabase, '%Racing%', locale, includeReady),
        genreLike(supabase, '%Sport%', locale, includeReady),
        titleLike(supabase, '%Gran Turismo%', locale, includeReady),
        titleLike(supabase, '%Need for Speed%', locale, includeReady),
        titleLike(supabase, '%F1%', locale, includeReady),
        titleLike(supabase, '%Dirt%', locale, includeReady),
        titleLike(supabase, '%WRC%', locale, includeReady),
        titleLike(supabase, '%Asphalt%', locale, includeReady),
        titleLike(supabase, '%Burnout%', locale, includeReady),
        titleLike(supabase, '%Driveclub%', locale, includeReady),
      ]);
      return dedupeGames(rows, locale).slice(0, LIMIT);
    },
  },
  {
    id: 'godofwar',
    emoji: '⚔️',
    title: 'God of War',
    searchTerm: 'God of War',
    tagline: 'Von den griechischen Mythen bis nach Midgard',
    accent: '#c4a35a',
    fetch: async (supabase, locale = getLocale(), includeReady = false) => {
      const rows = await runQueries([
        titleLike(supabase, '%God of War%', locale, includeReady),
      ]);
      return dedupeGames(rows, locale).slice(0, LIMIT);
    },
  },
  {
    id: 'tombraider',
    emoji: '🏹',
    title: 'Tomb Raider',
    searchTerm: 'Tomb Raider',
    tagline: 'Laras Abenteuer – von den Klassikern bis zum Reboot',
    accent: '#14b8a6',
    fetch: async (supabase, locale = getLocale(), includeReady = false) => {
      const rows = await runQueries([
        titleLike(supabase, '%Tomb Raider%', locale, includeReady),
        titleLike(supabase, '%Lara Croft%', locale, includeReady),
      ]);
      return dedupeGames(rows, locale).slice(0, LIMIT);
    },
  },
];

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} [locale]
 * @param {boolean} [includeReady] Admin-Vorschau: FERTIG-Guides mit anzeigen
 */
export async function fetchAllHomeCategories(supabase, locale = getLocale(), includeReady = false) {
  const entries = await Promise.all(
    HOME_CATEGORIES.map(async (cat) => {
      try {
        const games = await cat.fetch(supabase, locale, includeReady);
        return [cat.id, games];
      } catch (err) {
        console.error(`Kategorie ${cat.id}:`, err);
        return [cat.id, []];
      }
    }),
  );
  return Object.fromEntries(entries);
}
