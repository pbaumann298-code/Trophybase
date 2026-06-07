import { TABLES, GAME_PK } from './gameSchema';

const GAMES = TABLES.games;
const LIMIT = 12;

/** Eindeutige Spiele nach NPWR_ID (Fallback: Titel) */
export function dedupeGames(games, getProp) {
  const map = new Map();
  for (const game of games) {
    const key = game[GAME_PK] ?? getProp(game, [GAME_PK, 'Spieltitel', 'spieltitel']);
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

function titleLike(supabase, pattern) {
  return supabase.from(GAMES).select('*').ilike('Spieltitel', pattern).limit(LIMIT);
}

function devLike(supabase, pattern) {
  return supabase.from(GAMES).select('*').ilike('Entwickler', pattern).limit(LIMIT);
}

function genreLike(supabase, pattern) {
  return supabase.from(GAMES).select('*').ilike('Genre', pattern).limit(LIMIT);
}

/**
 * Die 8 psychologischen Startseiten-Kategorien (Netflix-Prinzip).
 * Reihenfolge = Darstellungsreihenfolge auf der Landingpage.
 */
export const HOME_CATEGORIES = [
  {
    id: 'beliebt',
    emoji: '🔥',
    title: 'Beliebt',
    searchTerm: 'Elden Ring',
    tagline: 'Die meisterwarteten & meistgesuchten Guides',
    accent: '#ff6b35',
    fetch: async (supabase, getProp) => {
      const { data } = await supabase
        .from(GAMES)
        .select('*')
        .order('views', { ascending: false })
        .limit(LIMIT);
      return dedupeGames(data || [], getProp);
    },
  },
  {
    id: 'souls',
    emoji: '💀',
    title: 'Souls / Soulslike',
    searchTerm: 'Souls',
    tagline: 'Für die Hardcore-Fraktion – Elden Ring, Wuchang & Co.',
    accent: '#a855f7',
    fetch: async (supabase, getProp) => {
      const rows = await runQueries([
        genreLike(supabase, '%Soulslike%'),
        genreLike(supabase, '%Souls%'),
        devLike(supabase, '%FromSoftware%'),
        titleLike(supabase, '%Elden Ring%'),
        titleLike(supabase, '%Dark Souls%'),
        titleLike(supabase, '%Sekiro%'),
        titleLike(supabase, '%Bloodborne%'),
        titleLike(supabase, '%Wuchang%'),
        titleLike(supabase, '%Lies of P%'),
        titleLike(supabase, '%Nioh%'),
      ]);
      return dedupeGames(rows, getProp).slice(0, LIMIT);
    },
  },
  {
    id: 'ubisoft',
    emoji: '🦅',
    title: 'Ubisoft-Welten',
    searchTerm: 'Ubisoft',
    tagline: 'Open-World-Suchtis & Komplettierer',
    accent: '#38bdf8',
    fetch: async (supabase, getProp) => {
      const rows = await runQueries([
        devLike(supabase, '%Ubisoft%'),
        titleLike(supabase, '%Assassin%'),
        titleLike(supabase, '%Far Cry%'),
        titleLike(supabase, '%Watch Dogs%'),
        titleLike(supabase, '%Ghost Recon%'),
        titleLike(supabase, '%Rainbow Six%'),
      ]);
      return dedupeGames(rows, getProp).slice(0, LIMIT);
    },
  },
  {
    id: 'rockstar',
    emoji: '⭐️',
    title: 'Rockstar Games',
    searchTerm: 'Rockstar',
    tagline: 'Legendär schwere & zeitaufwendige Meilensteine',
    accent: '#facc15',
    fetch: async (supabase, getProp) => {
      const rows = await runQueries([
        devLike(supabase, '%Rockstar%'),
        titleLike(supabase, '%Grand Theft Auto%'),
        titleLike(supabase, '%GTA%'),
        titleLike(supabase, '%Red Dead%'),
        titleLike(supabase, '%Bully%'),
        titleLike(supabase, '%Max Payne%'),
        titleLike(supabase, '%L.A. Noire%'),
      ]);
      return dedupeGames(rows, getProp).slice(0, LIMIT);
    },
  },
  {
    id: 'family',
    emoji: '🧸',
    title: 'Familienspaß & Easy Platin',
    searchTerm: 'LEGO',
    tagline: 'Kinder- & Familienspiele – entspannt zum Ziel',
    accent: '#4ade80',
    fetch: async (supabase, getProp) => {
      const rows = await runQueries([
        genreLike(supabase, '%Familie%'),
        genreLike(supabase, '%Kinder%'),
        genreLike(supabase, '%Party%'),
        titleLike(supabase, '%Astro Bot%'),
        titleLike(supabase, '%SpongeBob%'),
        titleLike(supabase, '%LEGO%'),
        titleLike(supabase, '%Lego%'),
        titleLike(supabase, '%Sackboy%'),
        titleLike(supabase, '%Ratchet%'),
        titleLike(supabase, '%LittleBigPlanet%'),
        titleLike(supabase, '%Crash Bandicoot%'),
        titleLike(supabase, '%Disney%'),
      ]);
      return dedupeGames(rows, getProp).slice(0, LIMIT);
    },
  },
  {
    id: 'indie',
    emoji: '🕹️',
    title: 'Indie-Perlen',
    searchTerm: 'Hollow Knight',
    tagline: 'Treue Nischen-Communities – Hollow Knight, Hades, Stray',
    accent: '#f472b6',
    fetch: async (supabase, getProp) => {
      const rows = await runQueries([
        genreLike(supabase, '%Indie%'),
        titleLike(supabase, '%Hollow Knight%'),
        titleLike(supabase, '%Hades%'),
        titleLike(supabase, '%Stray%'),
        titleLike(supabase, '%Celeste%'),
        titleLike(supabase, '%Stardew%'),
        titleLike(supabase, '%Cuphead%'),
        titleLike(supabase, '%Ori%'),
        titleLike(supabase, '%Shovel Knight%'),
        titleLike(supabase, '%Dead Cells%'),
      ]);
      return dedupeGames(rows, getProp).slice(0, LIMIT);
    },
  },
  {
    id: 'racing',
    emoji: '⏱️',
    title: 'Highspeed & Asphalt',
    searchTerm: 'Gran Turismo',
    tagline: 'Rennspiele & skill-basierte Sport-Trophäen',
    accent: '#22d3ee',
    fetch: async (supabase, getProp) => {
      const rows = await runQueries([
        genreLike(supabase, '%Renn%'),
        genreLike(supabase, '%Racing%'),
        genreLike(supabase, '%Sport%'),
        titleLike(supabase, '%Gran Turismo%'),
        titleLike(supabase, '%Need for Speed%'),
        titleLike(supabase, '%F1%'),
        titleLike(supabase, '%Dirt%'),
        titleLike(supabase, '%WRC%'),
        titleLike(supabase, '%Asphalt%'),
        titleLike(supabase, '%Burnout%'),
        titleLike(supabase, '%Driveclub%'),
      ]);
      return dedupeGames(rows, getProp).slice(0, LIMIT);
    },
  },
  {
    id: 'halloffame',
    emoji: '🏆',
    title: 'Die Hall of Fame',
    searchTerm: 'Monster Hunter',
    tagline: 'Die härtesten Platin-Trophäen – nur für die Elite',
    accent: '#ef4444',
    fetch: async (supabase, getProp) => {
      const rows = await runQueries([
        titleLike(supabase, '%Rainbow Six Siege%'),
        titleLike(supabase, '%Call of Duty%'),
        titleLike(supabase, '%Battlefield%'),
        titleLike(supabase, '%Destiny%'),
        titleLike(supabase, '%Warframe%'),
        titleLike(supabase, '%Monster Hunter%'),
        titleLike(supabase, '%Street Fighter%'),
        titleLike(supabase, '%Tekken%'),
        titleLike(supabase, '%Gran Turismo%'),
        titleLike(supabase, '%NBA 2K%'),
        titleLike(supabase, '%FIFA%'),
        titleLike(supabase, '%EA Sports FC%'),
        titleLike(supabase, '%Nioh%'),
        titleLike(supabase, '%Elden Ring%'),
        titleLike(supabase, '%Bloodborne%'),
      ]);
      return dedupeGames(rows, getProp).slice(0, LIMIT);
    },
  },
];

export async function fetchAllHomeCategories(supabase, getProp) {
  const entries = await Promise.all(
    HOME_CATEGORIES.map(async (cat) => {
      try {
        const games = await cat.fetch(supabase, getProp);
        return [cat.id, games];
      } catch (err) {
        console.error(`Kategorie ${cat.id}:`, err);
        return [cat.id, []];
      }
    }),
  );
  return Object.fromEntries(entries);
}
