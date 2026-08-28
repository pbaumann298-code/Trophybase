import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  LOCAL_WATCHLIST_STORAGE_KEY,
  loadLocalWatchlistIds,
  saveLocalWatchlistIds,
  toggleLocalWatchlistId,
} from '../lib/localWatchlist';

const WatchlistContext = createContext(null);

export function WatchlistProvider({ sessionUser, children }) {
  const [watchlistIdList, setWatchlistIdList] = useState(loadLocalWatchlistIds);
  const [version, setVersion] = useState(0);

  const applyIds = useCallback((ids) => {
    const next = saveLocalWatchlistIds(ids);
    setWatchlistIdList(next);
    setVersion((v) => v + 1);
    return next;
  }, []);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== LOCAL_WATCHLIST_STORAGE_KEY) return;
      setWatchlistIdList(loadLocalWatchlistIds());
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

    const { ids, added } = toggleLocalWatchlistId(gameId);
    setWatchlistIdList(ids);
    setVersion((v) => v + 1);
    return { ok: true, added, needsLogin: false, error: null };
  }, []);

  const value = useMemo(
    () => ({
      watchlistIds,
      watchlistIdList,
      version,
      loading: false,
      isOnWatchlist,
      toggleWatchlist,
      refreshWatchlist: () => applyIds(loadLocalWatchlistIds()),
      isLoggedIn: !!sessionUser?.id,
    }),
    [watchlistIds, watchlistIdList, version, isOnWatchlist, toggleWatchlist, applyIds, sessionUser?.id],
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
