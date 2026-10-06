import { GAME_PK, GAME_STRUCT, TABLES } from './gameSchema';

const HOME_TAG_DEFS = 'home_tag_defs';

/** Vergleichsschlüssel. Die gespeicherte Schreibweise bleibt der Slug aus der Tabelle. */
export function homeTagKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * @param {object | null | undefined} game
 * @returns {string[]}
 */
export function readHomeTags(game) {
  const raw = game?.[GAME_STRUCT.homeTags];
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const tags = [];
  for (const value of raw) {
    const slug = String(value ?? '').trim();
    const key = homeTagKey(slug);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    tags.push(slug);
  }
  return tags;
}

/**
 * @param {{ slug: string }[]} defs
 * @param {string[]} slugs
 */
export function orderHomeTags(defs, slugs) {
  const chosen = new Set((slugs ?? []).map(homeTagKey).filter(Boolean));
  return (defs ?? []).filter((def) => chosen.has(homeTagKey(def.slug))).map((def) => def.slug);
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
      slug: String(row.slug ?? '').trim(),
      label: String(row.label ?? '').trim() || String(row.slug ?? '').trim(),
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

  const next = defs.length
    ? orderHomeTags(defs, tags)
    : [...new Set((tags ?? []).map((tag) => String(tag ?? '').trim()).filter(Boolean))];
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
