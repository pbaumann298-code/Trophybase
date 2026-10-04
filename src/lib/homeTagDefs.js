import { GAME_PK, GAME_STRUCT, TABLES } from './gameSchema';

const HOME_TAG_DEFS = 'home_tag_defs';

function normalizeSlug(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * @param {object | null | undefined} game
 * @returns {string[]}
 */
export function readHomeTags(game) {
  const raw = game?.[GAME_STRUCT.homeTags];
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map(normalizeSlug).filter(Boolean))];
}

/**
 * @param {{ slug: string }[]} defs
 * @param {string[]} slugs
 */
export function orderHomeTags(defs, slugs) {
  const allowed = new Set((defs ?? []).map((def) => def.slug));
  const chosen = new Set((slugs ?? []).map(normalizeSlug).filter((slug) => allowed.has(slug)));
  return (defs ?? []).map((def) => def.slug).filter((slug) => chosen.has(slug));
}

/**
 * Allowlist aus home_tag_defs, sortiert wie in der Tabelle.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function fetchHomeTagDefs(supabase) {
  const { data, error } = await supabase
    .from(HOME_TAG_DEFS)
    .select('slug, label, rail_id, sort_pos')
    .order('sort_pos', { ascending: true })
    .order('slug', { ascending: true });

  if (error) return { data: [], error };
  const defs = (data ?? [])
    .map((row) => ({
      slug: normalizeSlug(row.slug),
      label: String(row.label ?? '').trim() || normalizeSlug(row.slug),
      railId: String(row.rail_id ?? '').trim(),
      sortPos: Number(row.sort_pos) || 0,
    }))
    .filter((row) => row.slug);
  return { data: defs, error: null };
}

/**
 * Redaktionelle Zuordnung. Sperrt die Zeile, damit das Modell sie nicht überschreibt.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gameId
 * @param {string[]} tags
 * @param {{ slug: string }[]} [defs]
 */
export async function setEditorialHomeTags(supabase, gameId, tags, defs = []) {
  const id = String(gameId ?? '').trim();
  if (!id) return { homeTags: null, error: new Error('Kein Spiel ausgewählt.') };

  const next = defs.length ? orderHomeTags(defs, tags) : [...new Set((tags ?? []).map(normalizeSlug).filter(Boolean))];
  const { data, error } = await supabase.rpc('tb_set_home_tags_editorial', {
    p_id: id,
    p_tags: next,
    p_lock: true,
  });

  if (!error) {
    if (data === false) return { homeTags: null, error: new Error('Spiel nicht gefunden.') };
    return { homeTags: next, error: null };
  }

  const message = String(error.message ?? '');
  const missingRpc = error.code === 'PGRST202' || /tb_set_home_tags_editorial/i.test(message);
  if (!missingRpc) return { homeTags: null, error };

  const { data: updated, error: updateError } = await supabase
    .from(TABLES.games)
    .update({
      [GAME_STRUCT.homeTags]: next,
      [GAME_STRUCT.homeTagsLocked]: true,
    })
    .eq(GAME_PK, id)
    .select(GAME_STRUCT.homeTags)
    .maybeSingle();

  if (updateError) return { homeTags: null, error: updateError };
  return { homeTags: readHomeTags(updated), error: null };
}
