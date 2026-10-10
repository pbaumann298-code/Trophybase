import {
  TABLES,
  GAME_FK,
  GUIDE_STRUCT,
} from './gameSchema.js';
import { getGameUuid } from './gameModel.js';

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

function uniqueIds(rows, column) {
  const ids = [];
  for (const row of rows ?? []) {
    const id = row?.[column];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Creator zum Spiel über game_guides.creator_id.
 * Die Sicht game_guide_creators hält die Paare distinct, damit nicht jede
 * Guide-Zeile denselben Creator noch einmal liefert.
 * Embed auf der Tabelle: game_guides(creator_id, content_creators(*)).
 * Ohne Zuordnung oder ohne Leserecht: { data: [] }.
 */
export async function fetchContentCreatorsForGame(supabase, gameOrUuid) {
  const gameUuid = typeof gameOrUuid === 'string' ? gameOrUuid : getGameUuid(gameOrUuid);
  if (!gameUuid) return { data: [], error: null };

  const { data: links, error: linkError } = await supabase
    .from(TABLES.gameGuideCreators)
    .select(GUIDE_STRUCT.creatorId)
    .eq(GAME_FK, gameUuid);

  if (linkError) {
    if (isUnavailableRelationError(linkError)) return { data: [], error: null };
    return { data: [], error: linkError };
  }

  const creatorIds = uniqueIds(links, GUIDE_STRUCT.creatorId);
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

/** Erster Creator der Guide-Zeilen, sonst null. */
export async function fetchContentCreatorForGame(supabase, gameOrUuid) {
  const { data, error } = await fetchContentCreatorsForGame(supabase, gameOrUuid);
  return { data: data[0] ?? null, error };
}
