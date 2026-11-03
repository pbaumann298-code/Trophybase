/**
 * Feste Supabase Table-Editor OIDs unserer Datenbank (public Schema).
 */
export const SUPABASE_EDITOR_OIDS = Object.freeze({
  games: '24334',
  game_guides: '24785',
  game_achievements: '24826',
  game_guides_rohmaterial: '89620',
  staging_game_guides: '102936',
});

export const SUPABASE_DEFAULT_FILTER_COLUMNS = Object.freeze({
  games: 'id',
  game_guides: 'game_id',
  game_achievements: 'game_id',
  game_guides_rohmaterial: 'game_id',
  staging_game_guides: 'game_id',
});

/**
 * Extrahiert die Supabase Project-Ref aus `import.meta.env.VITE_SUPABASE_URL`
 * (`https://<projectRef>.supabase.co`).
 */
export function getSupabaseProjectRef() {
  const rawUrl = String(import.meta.env?.VITE_SUPABASE_URL ?? '').trim();
  if (!rawUrl) return '';
  const match = rawUrl.match(/^https?:\/\/([^./]+)\.supabase\.co/i);
  return match ? match[1] : '';
}

/**
 * Baut die direkte Supabase Dashboard Table-Editor URL inkl. aktivem Filter.
 *
 * @param {'games'|'game_guides'|'game_achievements'|'game_guides_rohmaterial'|'staging_game_guides'|string} tableName
 * @param {string} [filterColumn]
 * @param {string|number} [filterValue]
 * @returns {string}
 */
export function buildSupabaseTableUrl(tableName, filterColumn, filterValue) {
  const projectRef = getSupabaseProjectRef();
  const editorId = SUPABASE_EDITOR_OIDS[tableName];
  if (!projectRef || !editorId) return '';

  const col = filterColumn || SUPABASE_DEFAULT_FILTER_COLUMNS[tableName] || 'id';
  const val = filterValue != null ? String(filterValue).trim() : '';

  if (!col || !val) {
    return `https://supabase.com/dashboard/project/${projectRef}/editor/${editorId}?schema=public`;
  }

  return `https://supabase.com/dashboard/project/${projectRef}/editor/${editorId}?schema=public&filter=${encodeURIComponent(`${col}:eq:${val}`)}`;
}

/**
 * Liefert alle 5 vorgefilterten Supabase-Editor-Deep-Links für eine `gameId`.
 *
 * @param {string} gameId
 */
export function getGameSupabaseDeepLinks(gameId) {
  const cleanId = gameId != null ? String(gameId).trim() : '';
  return {
    games: buildSupabaseTableUrl('games', 'id', cleanId),
    game_guides: buildSupabaseTableUrl('game_guides', 'game_id', cleanId),
    game_guides_rohmaterial: buildSupabaseTableUrl('game_guides_rohmaterial', 'game_id', cleanId),
    staging_game_guides: buildSupabaseTableUrl('staging_game_guides', 'game_id', cleanId),
    game_achievements: buildSupabaseTableUrl('game_achievements', 'game_id', cleanId),
    items: [
      {
        key: 'games',
        tableName: 'games',
        editorId: SUPABASE_EDITOR_OIDS.games,
        label: '↗ games (24334)',
        filterText: `id:eq:${cleanId}`,
        url: buildSupabaseTableUrl('games', 'id', cleanId),
      },
      {
        key: 'game_guides',
        tableName: 'game_guides',
        editorId: SUPABASE_EDITOR_OIDS.game_guides,
        label: '↗ game_guides (24785)',
        filterText: `game_id:eq:${cleanId}`,
        url: buildSupabaseTableUrl('game_guides', 'game_id', cleanId),
      },
      {
        key: 'game_guides_rohmaterial',
        tableName: 'game_guides_rohmaterial',
        editorId: SUPABASE_EDITOR_OIDS.game_guides_rohmaterial,
        label: '↗ rohmaterial (89620)',
        filterText: `game_id:eq:${cleanId}`,
        url: buildSupabaseTableUrl('game_guides_rohmaterial', 'game_id', cleanId),
      },
      {
        key: 'staging_game_guides',
        tableName: 'staging_game_guides',
        editorId: SUPABASE_EDITOR_OIDS.staging_game_guides,
        label: '↗ staging (102936)',
        filterText: `game_id:eq:${cleanId}`,
        url: buildSupabaseTableUrl('staging_game_guides', 'game_id', cleanId),
      },
      {
        key: 'game_achievements',
        tableName: 'game_achievements',
        editorId: SUPABASE_EDITOR_OIDS.game_achievements,
        label: '↗ achievements (24826)',
        filterText: `game_id:eq:${cleanId}`,
        url: buildSupabaseTableUrl('game_achievements', 'game_id', cleanId),
      },
    ],
  };
}
