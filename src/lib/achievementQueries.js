import { TABLES, GAME_FK, ACHIEVEMENT_PK, ACHIEVEMENT_STRUCT } from './gameSchema';
import { getLocale } from './locale';
import { resolveGuideLanguage } from './localeResolver';
import { mergeAchievementRecord } from './gameModel';
import { resolveGameUuid } from './gameQueries';

const naturalCollator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });

/**
 * game_achievements hat keine sort_order-Spalte: Reihenfolge ergibt sich aus
 * Trophäengruppe (Hauptspiel vor DLC) und natürlicher ID-Sortierung.
 */
function compareAchievements(a, b) {
  const groupA = String(a?.[ACHIEVEMENT_STRUCT.trophyGroup] ?? '');
  const groupB = String(b?.[ACHIEVEMENT_STRUCT.trophyGroup] ?? '');
  if (groupA !== groupB) return naturalCollator.compare(groupA, groupB);

  return naturalCollator.compare(
    String(a?.[ACHIEVEMENT_PK] ?? ''),
    String(b?.[ACHIEVEMENT_PK] ?? ''),
  );
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {unknown} gameRef games.id, gemergtes Spiel-Objekt oder Route-Ref
 * @param {string} [locale]
 * @param {string|null} [overrideLang]
 */
export async function fetchAchievementsForGame(
  supabase,
  gameRef,
  locale = getLocale(),
  overrideLang = null,
) {
  const { uuid, error: resolveError } = await resolveGameUuid(supabase, gameRef);
  if (resolveError) return { data: [], error: resolveError };
  if (!uuid) return { data: [], error: null };

  const targetLang = resolveGuideLanguage(locale, overrideLang);

  const { data, error } = await supabase
    .from(TABLES.achievements)
    .select('*')
    .eq(GAME_FK, uuid);

  if (error) return { data: [], error };

  const merged = [...(data ?? [])]
    .sort(compareAchievements)
    .map((row) => mergeAchievementRecord(row, targetLang))
    .filter(Boolean);

  return { data: merged, error: null };
}

/** @deprecated Nutze fetchAchievementsForGame */
export async function fetchTrophiesForGame(supabase, gameRef, locale) {
  return fetchAchievementsForGame(supabase, gameRef, locale);
}
