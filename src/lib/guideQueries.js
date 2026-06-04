import { TABLES, GAME_FK } from './gameSchema';

/** game_guides – Reiter „Nach Art“ (sheet_name=2) */
export const GUIDE_SELECT = [
  'guide_id',
  'game_id',
  'item_name',
  'timestamp',
  'video_url',
  'chronological_group',
  'category_group',
  'sheet_name',
  'sort_order',
  'chapter_order',
].join(', ');

/** game_chapters – Reiter „Chronologischer Guide“ */
export const CHAPTER_SELECT = [
  'chapter_id',
  'game_id',
  'item_name',
  'timestamp',
  'video_url',
  'chronological_group',
  'sort_order',
  'chapter_order',
].join(', ');

/** game_bosses – Boss-Übersicht */
export const BOSS_SELECT = [
  'boss_id',
  'game_id',
  'boss_name',
  'timestamp',
  'video_url',
  'is_trophy_relevant',
  'trophy_id',
].join(', ');

export async function fetchGuidesForGame(supabase, gameId) {
  return supabase
    .from(TABLES.guides)
    .select(GUIDE_SELECT)
    .eq(GAME_FK, gameId)
    .order('guide_id', { ascending: true });
}

export async function fetchChaptersForGame(supabase, gameId) {
  return supabase
    .from(TABLES.chapters)
    .select(CHAPTER_SELECT)
    .eq(GAME_FK, gameId)
    .order('chapter_id', { ascending: true });
}

export async function fetchBossesForGame(supabase, gameId) {
  return supabase
    .from(TABLES.bosses)
    .select(BOSS_SELECT)
    .eq(GAME_FK, gameId)
    .order('boss_id', { ascending: true });
}

/**
 * Lädt game_chapters, game_guides und game_bosses parallel für ein Spiel.
 */
export async function fetchGameGuideBundle(supabase, gameId) {
  const [chaptersRes, guidesRes, bossesRes] = await Promise.all([
    fetchChaptersForGame(supabase, gameId),
    fetchGuidesForGame(supabase, gameId),
    fetchBossesForGame(supabase, gameId),
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
