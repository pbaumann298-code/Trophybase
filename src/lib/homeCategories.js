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

const HOME_SEARCH_OPTIONS = { publishedOnly: true };

function titleLike(supabase, pattern, locale) {
  if (!pattern) return Promise.resolve({ data: [], error: new Error('Suchmuster fehlt') });
  return searchGamesByColumn(
    supabase,
    GAME_SEARCH_LOCALIZED_COLUMNS.title,
    pattern,
    LIMIT,
    locale,
    HOME_SEARCH_OPTIONS,
  );
}

function devLike(supabase, pattern, locale) {
  if (!pattern) return Promise.resolve({ data: [], error: new Error('Suchmuster fehlt') });
  return searchGamesByColumn(
    supabase,
    GAME_SEARCH_STRUCT_COLUMNS.developer,
    pattern,
    LIMIT,
    locale,
    HOME_SEARCH_OPTIONS,
  );
}

function genreLike(supabase, pattern, locale) {
  if (!pattern) return Promise.resolve({ data: [], error: new Error('Suchmuster fehlt') });
  return searchGamesByColumn(
    supabase,
    GAME_SEARCH_STRUCT_COLUMNS.genre,
    pattern,
    LIMIT,
    locale,
    HOME_SEARCH_OPTIONS,
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
    fetch: async (supabase, locale = getLocale()) => {
      const { data, error } = await fetchPopularGames(supabase, LIMIT, locale);
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
    fetch: async (supabase, locale = getLocale()) => {
      const { data, error } = await fetchNewGuideGames(supabase, LIMIT, locale);
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
    fetch: async (supabase, locale = getLocale()) => {
      const rows = await runQueries([
        genreLike(supabase, '%Soulslike%', locale),
        genreLike(supabase, '%Souls%', locale),
        devLike(supabase, '%FromSoftware%', locale),
        titleLike(supabase, '%Elden Ring%', locale),
        titleLike(supabase, '%Dark Souls%', locale),
        titleLike(supabase, '%Sekiro%', locale),
        titleLike(supabase, '%Bloodborne%', locale),
        titleLike(supabase, '%Wuchang%', locale),
        titleLike(supabase, '%Lies of P%', locale),
        titleLike(supabase, '%Nioh%', locale),
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
    fetch: async (supabase, locale = getLocale()) => {
      const rows = await runQueries([
        devLike(supabase, '%Ubisoft%', locale),
        titleLike(supabase, '%Assassin%', locale),
        titleLike(supabase, '%Far Cry%', locale),
        titleLike(supabase, '%Watch Dogs%', locale),
        titleLike(supabase, '%Ghost Recon%', locale),
        titleLike(supabase, '%Rainbow Six%', locale),
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
    fetch: async (supabase, locale = getLocale()) => {
      const rows = await runQueries([
        devLike(supabase, '%Rockstar%', locale),
        titleLike(supabase, '%Grand Theft Auto%', locale),
        titleLike(supabase, '%GTA%', locale),
        titleLike(supabase, '%Red Dead%', locale),
        titleLike(supabase, '%Bully%', locale),
        titleLike(supabase, '%Max Payne%', locale),
        titleLike(supabase, '%Lies of P%', locale),
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
    fetch: async (supabase, locale = getLocale()) => {
      const rows = await runQueries([
        genreLike(supabase, '%Familie%', locale),
        genreLike(supabase, '%Kinder%', locale),
        genreLike(supabase, '%Party%', locale),
        titleLike(supabase, '%Astro Bot%', locale),
        titleLike(supabase, '%SpongeBob%', locale),
        titleLike(supabase, '%LEGO%', locale),
        titleLike(supabase, '%Lego%', locale),
        titleLike(supabase, '%Sackboy%', locale),
        titleLike(supabase, '%Ratchet%', locale),
        titleLike(supabase, '%LittleBigPlanet%', locale),
        titleLike(supabase, '%Crash Bandicoot%', locale),
        titleLike(supabase, '%Disney%', locale),
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
    fetch: async (supabase, locale = getLocale()) => {
      const rows = await runQueries([
        genreLike(supabase, '%Indie%', locale),
        titleLike(supabase, '%Hollow Knight%', locale),
        titleLike(supabase, '%Hades%', locale),
        titleLike(supabase, '%Stray%', locale),
        titleLike(supabase, '%Celeste%', locale),
        titleLike(supabase, '%Stardew%', locale),
        titleLike(supabase, '%Cuphead%', locale),
        titleLike(supabase, '%Ori%', locale),
        titleLike(supabase, '%Shovel Knight%', locale),
        titleLike(supabase, '%Dead Cells%', locale),
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
    fetch: async (supabase, locale = getLocale()) => {
      const rows = await runQueries([
        genreLike(supabase, '%Renn%', locale),
        genreLike(supabase, '%Racing%', locale),
        genreLike(supabase, '%Sport%', locale),
        titleLike(supabase, '%Gran Turismo%', locale),
        titleLike(supabase, '%Need for Speed%', locale),
        titleLike(supabase, '%F1%', locale),
        titleLike(supabase, '%Dirt%', locale),
        titleLike(supabase, '%WRC%', locale),
        titleLike(supabase, '%Asphalt%', locale),
        titleLike(supabase, '%Burnout%', locale),
        titleLike(supabase, '%Driveclub%', locale),
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
    fetch: async (supabase, locale = getLocale()) => {
      const rows = await runQueries([
        titleLike(supabase, '%God of War%', locale),
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
    fetch: async (supabase, locale = getLocale()) => {
      const rows = await runQueries([
        titleLike(supabase, '%Tomb Raider%', locale),
        titleLike(supabase, '%Lara Croft%', locale),
      ]);
      return dedupeGames(rows, locale).slice(0, LIMIT);
    },
  },
];

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} [locale]
 */
export async function fetchAllHomeCategories(supabase, locale = getLocale()) {
  const entries = await Promise.all(
    HOME_CATEGORIES.map(async (cat) => {
      try {
        const games = await cat.fetch(supabase, locale);
        return [cat.id, games];
      } catch (err) {
        console.error(`Kategorie ${cat.id}:`, err);
        return [cat.id, []];
      }
    }),
  );
  return Object.fromEntries(entries);
}
