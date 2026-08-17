import { TABLES, GAME_FK, WATCHLIST, GAME_FIELDS, GAME_PK, isActiveWatchlistStatus } from './gameSchema';
import { fetchProfile } from './profileQueries';
import { fetchGamesByIds } from './gameQueries';
import { getGameTitle, getGameCover } from './gameModel';
import { getLocale } from './locale';

function isMissingTableError(error) {
  if (!error) return false;
  const msg = String(error.message ?? '').toLowerCase();
  return (
    error.code === '42P01' ||
    msg.includes('does not exist') ||
    msg.includes('relation') ||
    msg.includes('schema cache')
  );
}

export async function fetchUserAreaStats(supabase, userId) {
  if (!userId) {
    return {
      profile: null,
      profileError: null,
      watchlistCount: 0,
      earnedTrophiesCount: 0,
      unreadInboxCount: 0,
      errors: {},
    };
  }

  const [profileRes, watchlistRes, earnedRes, inboxRes] = await Promise.all([
    fetchProfile(supabase, userId),
    supabase
      .from(TABLES.watchlist)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabase
      .from(TABLES.earnedTrophies)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabase
      .from(TABLES.inbox)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false),
  ]);

  const errors = {};
  if (profileRes.error) errors.profile = profileRes.error;
  if (watchlistRes.error) errors.watchlist = watchlistRes.error;
  if (earnedRes.error) errors.earnedTrophies = earnedRes.error;
  if (inboxRes.error) errors.inbox = inboxRes.error;

  return {
    profile: profileRes.data,
    profileError: profileRes.error,
    watchlistCount: watchlistRes.count ?? 0,
    earnedTrophiesCount: earnedRes.count ?? 0,
    unreadInboxCount: inboxRes.count ?? 0,
    errors,
  };
}

export async function fetchProfileWatchlistPreview(supabase, userId, limit = 6) {
  if (!userId) return { items: [], error: null };

  const { data: watchlistRows, error: watchError } = await supabase
    .from(TABLES.watchlist)
    .select(`id, ${GAME_FK}, ${WATCHLIST.progress}, ${WATCHLIST.status}, updated_at`)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit * 2);

  if (watchError) {
    return { items: [], error: watchError };
  }

  const activeRows = (watchlistRows ?? [])
    .filter((row) => isActiveWatchlistStatus(row[WATCHLIST.status]))
    .slice(0, limit);

  const gameIds = [...new Set(activeRows.map((row) => row[GAME_FK]).filter(Boolean))];
  let gamesById = new Map();

  if (gameIds.length > 0) {
    const { data: games, error: gamesError } = await fetchGamesByIds(
      supabase,
      gameIds,
      getLocale(),
    );

    if (gamesError) {
      return { items: [], error: gamesError };
    }

    for (const game of games ?? []) {
      gamesById.set(game[GAME_PK], game);
    }
  }

  const items = activeRows.map((row) => {
    const game = gamesById.get(row[GAME_FK]) ?? null;
    return {
      watchlistId: row.id,
      gameId: row[GAME_FK],
      title: getGameTitle(game) || row[GAME_FK],
      cover: getGameCover(game) || null,
      progress: row[WATCHLIST.progress] ?? 0,
      game,
    };
  });

  return { items, error: null };
}

export function getUserAreaErrorHint(error, area) {
  if (!error) return null;
  if (isMissingTableError(error)) {
    if (area === 'profile') {
      return 'Die Tabelle „profiles“ fehlt in Supabase. Bitte supabase/profiles.sql im SQL-Editor ausführen.';
    }
    if (area === 'earnedTrophies') {
      return 'Die Tabelle „user_earned_trophies“ fehlt. Bitte supabase/user_earned_trophies.sql ausführen.';
    }
    return `Datenbank-Tabelle für „${area}“ ist noch nicht eingerichtet.`;
  }
  return error.message;
}
