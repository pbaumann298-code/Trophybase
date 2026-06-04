import { TABLES, GAME_FK } from './gameSchema';

/** Explizite Spalten – inkl. neuem chronological_group */
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

/** Neue Tabelle game_bosses (Reiter 3) */
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

export async function fetchBossesForGame(supabase, gameId) {
  return supabase
    .from(TABLES.bosses)
    .select(BOSS_SELECT)
    .eq(GAME_FK, gameId)
    .order('boss_id', { ascending: true });
}

/**
 * Lädt game_guides + game_bosses parallel für ein Spiel.
 * @returns {{ guides: object[], bosses: object[], guidesError: Error|null, bossesError: Error|null }}
 */
export async function fetchGameGuideBundle(supabase, gameId) {
  const [guidesRes, bossesRes] = await Promise.all([
    fetchGuidesForGame(supabase, gameId),
    fetchBossesForGame(supabase, gameId),
  ]);

  return {
    guides: guidesRes.data ?? [],
    bosses: bossesRes.data ?? [],
    guidesError: guidesRes.error ?? null,
    bossesError: bossesRes.error ?? null,
  };
}
