import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../pages/supabaseClient';
import { isUuid } from '../lib/gameModel';
import {
  LOCAL_WATCHLIST_STORAGE_KEY,
  loadLocalWatchlistIds,
  loadWatchlistOwner,
  planWatchlistMerge,
  saveLocalWatchlistIds,
  toggleLocalWatchlistId,
} from '../lib/localWatchlist';
import {
  ensureGameOnWatchlist,
  fetchWatchlistGameIds,
  removeGameFromWatchlist,
} from '../lib/watchlistQueries';

function asWatchlistError(err) {
  return err instanceof Error ? err : new Error('Watchlist konnte nicht aktualisiert werden.');
}

async function pushMissingWatchlistIds(userId, pushIds) {
  const results = await Promise.all(
    pushIds.map((id) => ensureGameOnWatchlist(supabase, userId, id)),
  );
  return results.find((result) => result.error)?.error ?? null;
}

async function reconcileWatchlistCloud(userId, previousIds, nextIds) {
  const prev = new Set((previousIds ?? []).filter((id) => isUuid(id)));
  const next = (nextIds ?? []).filter((id) => isUuid(id));
  const nextSet = new Set(next);
  const jobs = [];

  for (const id of next) {
    if (!prev.has(id)) jobs.push(ensureGameOnWatchlist(supabase, userId, id));
  }
  for (const id of prev) {
    if (!nextSet.has(id)) jobs.push(removeGameFromWatchlist(supabase, userId, id));
  }
  if (jobs.length === 0) return null;

  const results = await Promise.all(jobs);
  return results.find((result) => result.error)?.error ?? null;
}

const WatchlistContext = createContext(null);

export function WatchlistProvider({ sessionUser, children }) {
  const [watchlistIdList, setWatchlistIdList] = useState(loadLocalWatchlistIds);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const idsRef = useRef(watchlistIdList);
  const userIdRef = useRef(sessionUser?.id ?? null);
  idsRef.current = watchlistIdList;
  userIdRef.current = sessionUser?.id ?? null;

  const applyIds = useCallback((ids, { owner, syncCloud = true } = {}) => {
    const previous = idsRef.current;
    const next = saveLocalWatchlistIds(ids, owner);
    idsRef.current = next;
    setWatchlistIdList(next);
    setVersion((v) => v + 1);

    const userId = userIdRef.current;
    const storedOwner = loadWatchlistOwner();
    // Fremde Geräte-Liste (anderer Account) nicht in die Cloud des neuen Users schieben.
    if (userId && syncCloud && (!storedOwner || storedOwner === userId)) {
      void reconcileWatchlistCloud(userId, previous, next).then((error) => {
        if (error) console.warn('Watchlist-Sync:', error.message);
      });
    }
    return next;
  }, []);

  useEffect(() => {
    const userId = sessionUser?.id;
    if (!userId) return undefined;

    let cancelled = false;
    setLoading(true);

    async function mergeWithAccount() {
      const { ids: cloudIds, error } = await fetchWatchlistGameIds(supabase, userId);
      if (cancelled) return;
      if (error) {
        console.warn('Watchlist-Sync:', error.message);
        setLoading(false);
        return;
      }

      let plan = planWatchlistMerge({
        localIds: loadLocalWatchlistIds(),
        cloudIds,
        owner: loadWatchlistOwner(),
        userId,
      });
      let guard = 0;
      while (plan.pushIds.length > 0 && guard < 3 && !cancelled) {
        guard += 1;
        const pushError = await pushMissingWatchlistIds(userId, plan.pushIds);
        if (cancelled) return;
        if (pushError) {
          console.warn('Watchlist-Sync:', pushError.message);
          break;
        }
        plan = planWatchlistMerge({
          localIds: loadLocalWatchlistIds(),
          cloudIds,
          owner: loadWatchlistOwner(),
          userId,
        });
      }

      if (!cancelled) {
        applyIds(plan.ids, { owner: userId, syncCloud: false });
        setLoading(false);
      }
    }

    mergeWithAccount().catch((err) => {
      if (!cancelled) {
        console.warn('Watchlist-Sync:', asWatchlistError(err).message);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sessionUser?.id, applyIds]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== LOCAL_WATCHLIST_STORAGE_KEY) return;
      const next = loadLocalWatchlistIds();
      idsRef.current = next;
      setWatchlistIdList(next);
      setVersion((v) => v + 1);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const watchlistIds = useMemo(() => new Set(watchlistIdList), [watchlistIdList]);

  const isOnWatchlist = useCallback(
    (gameId) => {
      if (!gameId) return false;
      return watchlistIds.has(String(gameId));
    },
    [watchlistIds],
  );

  const toggleWatchlist = useCallback(async (gameId) => {
    if (!gameId) {
      return { ok: false, added: false, needsLogin: false, error: new Error('Spiel-ID fehlt') };
    }

    let added = false;
    try {
      const result = toggleLocalWatchlistId(gameId);
      added = result.added;
      idsRef.current = result.ids;
      setWatchlistIdList(result.ids);
      setVersion((v) => v + 1);
    } catch (err) {
      return { ok: false, added: false, needsLogin: false, error: asWatchlistError(err) };
    }

    const userId = userIdRef.current;
    if (!userId) return { ok: true, added, needsLogin: false, error: null };

    const cloudResult = added
      ? await ensureGameOnWatchlist(supabase, userId, gameId)
      : await removeGameFromWatchlist(supabase, userId, gameId);

    if (cloudResult.error) {
      try {
        const reverted = toggleLocalWatchlistId(gameId);
        idsRef.current = reverted.ids;
        setWatchlistIdList(reverted.ids);
        setVersion((v) => v + 1);
      } catch {
        /* Lokaler Rollback scheitert – Cloud und Gerät können kurz auseinanderlaufen */
      }
      return { ok: false, added: false, needsLogin: false, error: cloudResult.error };
    }

    return { ok: true, added, needsLogin: false, error: null };
  }, []);

  const value = useMemo(
    () => ({
      watchlistIds,
      watchlistIdList,
      version,
      loading,
      isOnWatchlist,
      toggleWatchlist,
      replaceWatchlistIds: applyIds,
      refreshWatchlist: () => applyIds(loadLocalWatchlistIds()),
      isLoggedIn: !!sessionUser?.id,
    }),
    [watchlistIds, watchlistIdList, version, loading, isOnWatchlist, toggleWatchlist, applyIds, sessionUser?.id],
  );

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export function useWatchlist() {
  const ctx = useContext(WatchlistContext);
  if (!ctx) {
    throw new Error('useWatchlist must be used within WatchlistProvider');
  }
  return ctx;
}
