import { TABLES, GAME_FK, GAME_PK } from './gameSchema';

/**
 * Stellt sicher, dass immer die NPWR_ID (String) verwendet wird – nie IGDB_ID.
 * @param {object|string|null|undefined} gameOrId
 * @param {(obj: object, keys: string[]) => string} [getProp]
 */
export function resolveGameId(gameOrId, getProp) {
  if (gameOrId == null) return '';
  if (typeof gameOrId === 'string' || typeof gameOrId === 'number') {
    return String(gameOrId).trim();
  }
  const id =
    gameOrId[GAME_PK] ??
    gameOrId.game_id ??
    gameOrId.npwr_id ??
    (getProp ? getProp(gameOrId, [GAME_PK, 'game_id', 'NPWR_ID', 'npwr_id']) : '');
  return String(id ?? '').trim();
}

export async function fetchGuidesForGame(supabase, gameId) {
  const id = resolveGameId(gameId);
  if (!id) return { data: [], error: null };

  return supabase
    .from(TABLES.guides)
    .select('*')
    .eq(GAME_FK, id)
    .order('guide_id', { ascending: true });
}

export async function fetchChaptersForGame(supabase, gameId) {
  const id = resolveGameId(gameId);
  if (!id) return { data: [], error: null };

  return supabase
    .from(TABLES.chapters)
    .select('*')
    .eq(GAME_FK, id)
    .order('chapter_id', { ascending: true });
}

export async function fetchBossesForGame(supabase, gameId) {
  const id = resolveGameId(gameId);
  if (!id) return { data: [], error: null };

  return supabase
    .from(TABLES.bosses)
    .select('*')
    .eq(GAME_FK, id)
    .order('boss_id', { ascending: true });
}

/**
 * Lädt game_chapters, game_guides und game_bosses parallel für ein Spiel.
 */
export async function fetchGameGuideBundle(supabase, gameId) {
  const id = resolveGameId(gameId);
  if (!id) {
    return {
      chapters: [],
      guides: [],
      bosses: [],
      chaptersError: null,
      guidesError: null,
      bossesError: null,
    };
  }

  const [chaptersRes, guidesRes, bossesRes] = await Promise.all([
    fetchChaptersForGame(supabase, id),
    fetchGuidesForGame(supabase, id),
    fetchBossesForGame(supabase, id),
  ]);

  return {
    chapters: chaptersRes.data ?? [],
    guides: guidesRes.data ?? [],
    bosses: bossesRes.data ?? [],
    chaptersError: chaptersRes.error ?? null,
    guidesError: guidesRes.error ?? null,
    bossesError: bossesRes.error ?? null,
  };
}
