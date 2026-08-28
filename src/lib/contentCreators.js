import {
  TABLES,
  GAME_FK,
  GAME_CREATOR_MAP,
  CREATOR_CONTENT_TYPE,
} from './gameSchema';
import { getGameUuid } from './gameModel';

const CREATOR_SELECT = 'id, channel_name, youtube_url';

function normalizeCreator(row) {
  if (!row) return null;
  const name = String(row.channel_name ?? '').trim();
  const youtubeUrl = normalizeYoutubeUrl(row.youtube_url);
  if (!name && !youtubeUrl) return null;
  return {
    id: row.id ?? null,
    channelName: name,
    youtubeUrl: isSafeYoutubeChannelUrl(youtubeUrl) ? youtubeUrl : '',
  };
}

export function isSafeYoutubeChannelUrl(url) {
  try {
    const parsed = new URL(String(url ?? '').trim());
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    return (
      parsed.protocol === 'https:' &&
      (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be')
    );
  } catch {
    return false;
  }
}

function normalizeYoutubeUrl(url) {
  const raw = String(url ?? '').trim();
  try {
    const parsed = new URL(raw);
    // Häufiger Tippfehler in der Tabelle: /c/@Handle statt /@Handle
    if (/^\/c\/@/i.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname.replace(/^\/c\//i, '/');
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

function isUnavailableRelationError(error) {
  const message = String(error?.message ?? error?.details ?? error?.code ?? '').toLowerCase();
  return (
    message.includes('does not exist') ||
    message.includes('permission denied') ||
    message.includes('row-level security')
  );
}

function pickCreatorIds(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const videoType = CREATOR_CONTENT_TYPE.video.toLowerCase();
  const videoRows = list.filter(
    (row) => String(row?.[GAME_CREATOR_MAP.contentType] ?? '').toLowerCase() === videoType,
  );
  const preferred = videoRows.length > 0 ? videoRows : list;
  const ids = [];
  for (const row of preferred) {
    const id = row?.[GAME_CREATOR_MAP.creatorId];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Creator zum Spiel über game_creator_map (game_id → creator_id).
 * Bevorzugt content_type VIDEO. Ohne Mapping oder ohne Leserecht: { data: [] }.
 */
export async function fetchContentCreatorsForGame(supabase, gameOrUuid) {
  const gameUuid = typeof gameOrUuid === 'string' ? gameOrUuid : getGameUuid(gameOrUuid);
  if (!gameUuid) return { data: [], error: null };

  const { data: maps, error: mapError } = await supabase
    .from(TABLES.gameCreatorMap)
    .select(`${GAME_CREATOR_MAP.creatorId}, ${GAME_CREATOR_MAP.contentType}`)
    .eq(GAME_FK, gameUuid);

  if (mapError) {
    if (isUnavailableRelationError(mapError)) return { data: [], error: null };
    return { data: [], error: mapError };
  }

  const creatorIds = pickCreatorIds(maps);
  if (creatorIds.length === 0) return { data: [], error: null };

  const { data, error } = await supabase
    .from(TABLES.contentCreators)
    .select(CREATOR_SELECT)
    .in('id', creatorIds);

  if (error) {
    if (isUnavailableRelationError(error)) return { data: [], error: null };
    return { data: [], error };
  }

  const byId = new Map((data ?? []).map((row) => [row.id, normalizeCreator(row)]));
  const creators = creatorIds.map((id) => byId.get(id)).filter(Boolean);
  return { data: creators, error: null };
}

/** Erster VIDEO-Creator, sonst der erste Mapping-Eintrag. */
export async function fetchContentCreatorForGame(supabase, gameOrUuid) {
  const { data, error } = await fetchContentCreatorsForGame(supabase, gameOrUuid);
  return { data: data[0] ?? null, error };
}
