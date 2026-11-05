import { TABLES, GAME_FK, WATCHLIST, GAME_PK, isActiveWatchlistStatus } from './gameSchema';
import { fetchProfile } from './profileQueries';
import { fetchGamesByIds } from './gameQueries';
import { getGameTitle, getGameCover, mergeGameRecord } from './gameModel';
import { getLocale } from './locale';
import { saveLocalPlatinumFlag } from './localUserProgress';
import { scanLocalPlatinumGameIds } from './platinumGames';
import { setPreferredLocales, sanitizePreferredLocales } from './userPreferences';

/** Gruppierungsfelder aus der games-Zeile, flach auf dem Watchlist-Item. */
export function watchlistGameMeta(game) {
  return {
    releaseYear: game?.release_jahr ?? null,
    homeTags: Array.isArray(game?.home_tags) ? game.home_tags : [],
    hardware: game?.hardware ?? null,
    spielTyp: game?.spiel_typ ?? null,
  };
}

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

/**
 * Normalisiert den Status aus user_watchlist auf eines der 3 Haupt-Buckets:
 * PLAYING, COMPLETED, BACKLOG.
 */
export function normalizeWatchlistBucket(row) {
  if (!row) return 'BACKLOG';
  const raw = String(row.status ?? '').trim().toUpperCase();
  const progress = Number(row.progress_percent ?? 0);
  const isPlatinum = Boolean(row.is_platinum) || Number(row.earned_trophies?.platinum ?? 0) > 0;

  if (
    raw === 'COMPLETED' ||
    raw === 'COMPLETED_NO_PLATINUM' ||
    raw === 'COMPLETED_PLATINUM' ||
    raw === 'DONE' ||
    isPlatinum ||
    progress >= 100
  ) {
    return 'COMPLETED';
  }
  if (raw === 'PLAYING' || raw === 'IN_PROGRESS' || raw === 'STARTED' || (raw === 'ACTIVE' && progress > 0)) {
    return 'PLAYING';
  }
  if (raw === 'BACKLOG' || raw === 'WATCHLIST' || raw === 'PLANNED' || raw === 'ACTIVE') {
    return 'BACKLOG';
  }
  if (progress > 0) return 'PLAYING';
  return 'BACKLOG';
}

/**
 * Lädt alle Daten für das neue User-Cockpit in einem Rutsch:
 * - public.profiles
 * - public.user_watchlist inkl. Join auf public.games
 * - public.user_game_ratings
 * - public.user_guide_progress
 */
export async function fetchUserCockpitBundle(supabase, userId, locale = getLocale()) {
  if (!userId) {
    return {
      profile: null,
      watchlistItems: [],
      ratingsByGame: {},
      guideChecklists: [],
      unreadInboxCount: 0,
      errors: {},
    };
  }

  const gamesJoinSelect =
    'id, platform_game_id, hardware, slug, slugs, spieltitel, cover_url, anzahl_trophaeen, spielzeit_komplettierer, schwierigkeit_highscore, status, publishing_status, published_locales, release_jahr, home_tags, spiel_typ, entwickler, publisher';

  const [profileRes, watchlistJoinRes, ratingsRes, progressRes] = await Promise.all([
    fetchProfile(supabase, userId),
    supabase
      .from(TABLES.watchlist)
      .select(`*, games(${gamesJoinSelect})`)
      .eq('user_id', userId)
      .order('last_played_at', { ascending: false, nullsFirst: false }),
    supabase
      .from(TABLES.gameRatings || 'user_game_ratings')
      .select('*')
      .eq('user_id', userId),
    supabase
      .from(TABLES.guideProgress)
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }),
  ]);

  const errors = {};
  if (profileRes.error) errors.profile = profileRes.error;

  // Fallback falls direkter PostgREST-Join wegen fehlender FK-Beziehung scheitert
  let rawWatchlistRows = watchlistJoinRes.data ?? [];
  if (watchlistJoinRes.error) {
    const fallbackWatchlist = await supabase
      .from(TABLES.watchlist)
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (fallbackWatchlist.error) {
      errors.watchlist = fallbackWatchlist.error;
    } else {
      rawWatchlistRows = fallbackWatchlist.data ?? [];
    }
  }

  if (ratingsRes.error && !isMissingTableError(ratingsRes.error)) {
    errors.ratings = ratingsRes.error;
  }
  if (progressRes.error && !isMissingTableError(progressRes.error)) {
    errors.guideProgress = progressRes.error;
  }

  const allProgressRows = progressRes.data ?? [];
  const rawProgressRows = allProgressRows.filter(
    (row) => Array.isArray(row.completed_steps) && row.completed_steps.length > 0,
  );
  const platinumProgressIds = new Set(
    allProgressRows
      .filter((row) => Boolean(row?.is_platinum))
      .map((row) => String(row[GAME_FK] ?? '').trim())
      .filter(Boolean),
  );
  for (const localPlatId of scanLocalPlatinumGameIds()) {
    platinumProgressIds.add(localPlatId);
  }

  const gamesById = new Map();
  for (const row of rawWatchlistRows) {
    const joined = Array.isArray(row.games) ? row.games[0] : row.games;
    if (joined && joined.id) {
      gamesById.set(String(joined.id), mergeGameRecord(joined, locale));
    }
  }

  const missingGameIds = new Set();
  for (const row of rawWatchlistRows) {
    const gid = String(row[GAME_FK] ?? '').trim();
    if (gid && !gamesById.has(gid)) missingGameIds.add(gid);
  }
  for (const row of allProgressRows) {
    const gid = String(row[GAME_FK] ?? '').trim();
    if (gid && !gamesById.has(gid)) missingGameIds.add(gid);
  }
  for (const gid of platinumProgressIds) {
    if (gid && !gamesById.has(gid)) missingGameIds.add(gid);
  }

  if (missingGameIds.size > 0) {
    const { data: fetchedGames } = await fetchGamesByIds(
      supabase,
      [...missingGameIds],
      locale,
    );
    for (const g of fetchedGames ?? []) {
      const gid = String(g[GAME_PK] ?? g.id ?? '').trim();
      if (gid) gamesById.set(gid, g);
    }
  }

  const ratingsByGame = {};
  for (const r of ratingsRes.data ?? []) {
    const gid = String(r[GAME_FK] ?? '').trim();
    if (gid) {
      ratingsByGame[gid] = {
        id: r.id,
        gameId: gid,
        difficulty: r.difficulty != null ? Number(r.difficulty) : null,
        completionHours: r.completion_hours != null ? Number(r.completion_hours) : null,
        funRating: r.fun_rating != null ? Number(r.fun_rating) : null,
        comment: r.comment ?? '',
        updatedAt: r.updated_at ?? r.created_at ?? null,
      };
    }
  }

  const seenWatchlistGameIds = new Set();
  const watchlistItems = rawWatchlistRows.map((row) => {
    const gameId = String(row[GAME_FK] ?? '').trim();
    if (gameId) seenWatchlistGameIds.add(gameId);
    const joinedRaw = Array.isArray(row.games) ? row.games[0] : row.games;
    const game = gamesById.get(gameId) || (joinedRaw ? mergeGameRecord(joinedRaw, locale) : null);
    const earned =
      row.earned_trophies && typeof row.earned_trophies === 'object'
        ? {
            platinum: Number(row.earned_trophies.platinum ?? 0),
            gold: Number(row.earned_trophies.gold ?? 0),
            silver: Number(row.earned_trophies.silver ?? 0),
            bronze: Number(row.earned_trophies.bronze ?? 0),
          }
        : { platinum: 0, gold: 0, silver: 0, bronze: 0 };

    const rawStatus = String(row.status ?? '').trim().toLowerCase();
    const completedWithoutPlatinum = rawStatus === 'completed_no_platinum';
    const isPlatinum =
      !completedWithoutPlatinum &&
      (Boolean(row.is_platinum) || earned.platinum > 0 || platinumProgressIds.has(gameId));
    const progressPercent = isPlatinum
      ? 100
      : Math.max(0, Math.min(100, Number(row.progress_percent ?? 0)));
    const playtimeHours = Math.max(0, Number(row.playtime_hours ?? 0));
    const bucket = normalizeWatchlistBucket({
      ...row,
      is_platinum: isPlatinum,
      progress_percent: progressPercent,
      earned_trophies: earned,
    });

    return {
      watchlistId: row.id ?? `${userId}:${gameId}`,
      gameId,
      status: String(row.status ?? 'BACKLOG'),
      bucket,
      completedWithoutPlatinum,
      progressPercent,
      isPlatinum,
      playtimeHours,
      titleId: row.title_id ? String(row.title_id).trim() : null,
      earnedTrophies: isPlatinum && earned.platinum === 0 ? { ...earned, platinum: 1 } : earned,
      lastPlayedAt: row.last_played_at ?? row.updated_at ?? null,
      game,
      title: getGameTitle(game, locale) || gameId || 'Unbekanntes Spiel',
      cover: getGameCover(game, locale) || null,
      totalTrophies: game?.anzahl_trophaeen ?? null,
      guideCompletionTime: game?.spielzeit_komplettierer ?? null,
      rating: ratingsByGame[gameId] ?? null,
      ...watchlistGameMeta(game),
    };
  });

  // Synchronisierte Platin-Spiele aus user_guide_progress / lokalem Speicher ergänzen, falls noch nicht in user_watchlist
  for (const platGameId of platinumProgressIds) {
    if (!platGameId || seenWatchlistGameIds.has(platGameId)) continue;
    const game = gamesById.get(platGameId) ?? null;
    if (!game) continue;
    seenWatchlistGameIds.add(platGameId);
    const progRow = allProgressRows.find((r) => String(r[GAME_FK] ?? '').trim() === platGameId);
    watchlistItems.push({
      watchlistId: `sync:${userId}:${platGameId}`,
      gameId: platGameId,
      status: 'COMPLETED',
      bucket: 'COMPLETED',
      completedWithoutPlatinum: false,
      progressPercent: 100,
      isPlatinum: true,
      playtimeHours: 0,
      titleId: null,
      earnedTrophies: { platinum: 1, gold: 0, silver: 0, bronze: 0 },
      lastPlayedAt: progRow?.updated_at ?? null,
      game,
      title: getGameTitle(game, locale) || platGameId || 'Unbekanntes Spiel',
      cover: getGameCover(game, locale) || null,
      totalTrophies: game?.anzahl_trophaeen ?? null,
      guideCompletionTime: game?.spielzeit_komplettierer ?? null,
      rating: ratingsByGame[platGameId] ?? null,
      ...watchlistGameMeta(game),
    });
  }

  const guideChecklists = rawProgressRows.map((row) => {
    const gameId = String(row[GAME_FK] ?? '').trim();
    const game = gamesById.get(gameId) ?? null;
    const steps = Array.isArray(row.completed_steps)
      ? row.completed_steps.map((s) => String(s ?? '').trim()).filter(Boolean)
      : [];
    return {
      gameId,
      steps,
      stepsCount: steps.length,
      isPlatinum: Boolean(row.is_platinum),
      updatedAt: row.updated_at ?? null,
      game,
      title: getGameTitle(game, locale) || gameId,
      cover: getGameCover(game, locale) || null,
    };
  });

  return {
    profile: profileRes.data ?? null,
    watchlistItems,
    ratingsByGame,
    guideChecklists,
    unreadInboxCount: 0,
    errors,
  };
}

/**
 * Speichert oder aktualisiert ein 1-Klick-Rating (Platin-Zeit + Schwierigkeit) in public.user_game_ratings.
 */
export async function upsertUserGameRating(
  supabase,
  userId,
  gameId,
  { completionHours, difficulty, funRating = null, comment = null } = {},
) {
  if (!userId || !gameId) {
    return { data: null, error: new Error('Anmeldung und Spiel-ID erforderlich.') };
  }

  const parsedHours =
    completionHours !== '' && completionHours != null && Number.isFinite(Number(completionHours))
      ? Math.max(0, Math.round(Number(completionHours) * 10) / 10)
      : null;

  const parsedDifficulty =
    difficulty !== '' && difficulty != null && Number.isFinite(Number(difficulty))
      ? Math.max(1, Math.min(10, Math.round(Number(difficulty))))
      : null;

  if (parsedHours == null && parsedDifficulty == null) {
    return {
      data: null,
      error: new Error('Bitte gib mindestens eine Platin-Zeit (Stunden) oder Schwierigkeit (1–10) an.'),
    };
  }

  const now = new Date().toISOString();
  const payload = {
    user_id: userId,
    [GAME_FK]: gameId,
    completion_hours: parsedHours,
    difficulty: parsedDifficulty,
    updated_at: now,
  };
  if (funRating != null) payload.fun_rating = Number(funRating);
  if (comment != null) payload.comment = String(comment);

  const table = TABLES.gameRatings || 'user_game_ratings';

  // Versuch 1: Upsert über (user_id, game_id)
  const { data, error } = await supabase
    .from(table)
    .upsert(payload, { onConflict: 'user_id,game_id' })
    .select('*')
    .maybeSingle();

  if (!error) {
    return { data, error: null };
  }

  // Fallback falls kein Unique-Constraint auf (user_id, game_id) existiert: erst prüfen, dann update/insert
  const { data: existing } = await supabase
    .from(table)
    .select('id')
    .eq('user_id', userId)
    .eq(GAME_FK, gameId)
    .maybeSingle();

  if (existing?.id) {
    const upd = await supabase
      .from(table)
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single();
    return { data: upd.data, error: upd.error };
  }

  const ins = await supabase.from(table).insert(payload).select('*').single();
  return { data: ins.data, error: ins.error };
}

/**
 * Aktualisiert den Watchlist-Status (z. B. PLAYING, COMPLETED, completed_no_platinum, BACKLOG) eines Spiels.
 */
export async function updateWatchlistEntryStatus(
  supabase,
  userId,
  gameId,
  nextStatus,
  { markPlatinum = null, progressPercent = null } = {},
) {
  if (!userId || !gameId) {
    return { error: new Error('Anmeldung und Spiel-ID erforderlich.') };
  }
  const now = new Date().toISOString();
  const payload = {
    user_id: userId,
    [GAME_FK]: gameId,
    status: nextStatus,
    last_played_at: now,
    updated_at: now,
  };
  if (progressPercent != null) {
    payload[WATCHLIST.progress] = Math.max(0, Math.min(100, Number(progressPercent)));
  } else if (markPlatinum === true) {
    payload[WATCHLIST.progress] = 100;
  }

  let { error } = await supabase
    .from(TABLES.watchlist)
    .upsert(payload, { onConflict: WATCHLIST.onConflict });

  if (error) {
    const upd = await supabase
      .from(TABLES.watchlist)
      .update({
        status: nextStatus,
        ...(payload[WATCHLIST.progress] != null ? { [WATCHLIST.progress]: payload[WATCHLIST.progress] } : {}),
        updated_at: now,
      })
      .eq('user_id', userId)
      .eq(GAME_FK, gameId);
    error = upd.error;
  }

  if (markPlatinum === true) {
    saveLocalPlatinumFlag(gameId, true);
    const { data: existingProg } = await supabase
      .from(TABLES.guideProgress)
      .select('completed_steps')
      .eq('user_id', userId)
      .eq(GAME_FK, gameId)
      .maybeSingle();
    await supabase.from(TABLES.guideProgress).upsert(
      {
        user_id: userId,
        [GAME_FK]: gameId,
        completed_steps: Array.isArray(existingProg?.completed_steps)
          ? existingProg.completed_steps
          : [],
        is_platinum: true,
        updated_at: now,
      },
      { onConflict: 'user_id,game_id' },
    );
  } else if (markPlatinum === false) {
    saveLocalPlatinumFlag(gameId, false);
    const { data: existingProg } = await supabase
      .from(TABLES.guideProgress)
      .select('completed_steps, is_platinum')
      .eq('user_id', userId)
      .eq(GAME_FK, gameId)
      .maybeSingle();
    if (existingProg?.is_platinum) {
      await supabase
        .from(TABLES.guideProgress)
        .update({ is_platinum: false, updated_at: now })
        .eq('user_id', userId)
        .eq(GAME_FK, gameId);
    }
  }

  return { error };
}

/**
 * Speichert die Mehrfachauswahl der User-Sprachen (für Guides & spätere Online-Trophäen-Verabredungen)
 * in localStorage (`preferred_locales`) sowie in Supabase User-Metadata / Profil.
 */
export async function saveUserPreferredLocales(supabase, userId, locales) {
  const sanitized = sanitizePreferredLocales(locales);
  setPreferredLocales(sanitized);

  if (!supabase || !userId) {
    return { locales: sanitized, error: null };
  }

  try {
    await supabase.auth.updateUser({
      data: { preferred_locales: sanitized },
    });
  } catch {
    /* ignore auth metadata error */
  }

  try {
    await supabase
      .from(TABLES.profiles)
      .update({ preferred_locales: sanitized, updated_at: new Date().toISOString() })
      .eq('id', userId);
  } catch {
    /* Spalte preferred_locales ist auf profiles optional */
  }

  return { locales: sanitized, error: null };
}

/**
 * Setzt die Durchlauf-Checkliste (completed_steps) eines Spiels in user_guide_progress sicher auf [] zurück,
 * ohne den PSN-Trophäenstatus (is_platinum oder user_watchlist) zu löschen.
 */
export async function resetUserGuideChecklist(supabase, userId, gameId, keepPlatinum = false) {
  if (!userId || !gameId) {
    return { error: new Error('Anmeldung und Spiel-ID erforderlich.') };
  }

  const now = new Date().toISOString();
  if (keepPlatinum) {
    const { error } = await supabase
      .from(TABLES.guideProgress)
      .update({ completed_steps: [], updated_at: now })
      .eq('user_id', userId)
      .eq(GAME_FK, gameId);
    return { error };
  }

  const { error } = await supabase
    .from(TABLES.guideProgress)
    .update({ completed_steps: [], updated_at: now })
    .eq('user_id', userId)
    .eq(GAME_FK, gameId);
  return { error };
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

export async function fetchProfileWatchlistPreview(supabase, userId, limit = 6, locale = getLocale()) {
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
    const { data: games, error: gamesError } = await fetchGamesByIds(supabase, gameIds, locale);

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
      title: getGameTitle(game, locale) || row[GAME_FK],
      cover: getGameCover(game, locale) || null,
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
