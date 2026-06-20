import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../pages/supabaseClient';
import { fetchWatchlistGameIds, toggleWatchlistGame } from '../lib/watchlistQueries';

const WatchlistContext = createContext(null);

export function WatchlistProvider({ sessionUser, children }) {
  const [watchlistIds, setWatchlistIds] = useState(() => new Set());
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);

  const refreshWatchlist = useCallback(async () => {
    if (!sessionUser?.id) {
      setWatchlistIds(new Set());
      setLoading(false);
      return;
    }

    setLoading(true);
    const { ids, error } = await fetchWatchlistGameIds(supabase, sessionUser.id);
    if (error) {
      console.error('watchlist load:', error.message);
    }
    setWatchlistIds(ids);
    setLoading(false);
    setVersion((v) => v + 1);
  }, [sessionUser?.id]);

  useEffect(() => {
    refreshWatchlist();
  }, [refreshWatchlist]);

  const isOnWatchlist = useCallback(
    (gameId) => {
      if (!gameId) return false;
      return watchlistIds.has(String(gameId));
    },
    [watchlistIds],
  );

  const toggleWatchlist = useCallback(
    async (gameId) => {
      if (!sessionUser?.id) {
        return { ok: false, needsLogin: true, error: null };
      }

      const id = String(gameId);
      const onList = watchlistIds.has(id);
      const { error } = await toggleWatchlistGame(supabase, sessionUser.id, id, onList);

      if (error) {
        return { ok: false, needsLogin: false, error };
      }

      await refreshWatchlist();
      return { ok: true, added: !onList, needsLogin: false, error: null };
    },
    [sessionUser?.id, watchlistIds, refreshWatchlist],
  );

  const value = useMemo(
    () => ({
      watchlistIds,
      version,
      loading,
      isOnWatchlist,
      toggleWatchlist,
      refreshWatchlist,
      isLoggedIn: !!sessionUser?.id,
    }),
    [watchlistIds, version, loading, isOnWatchlist, toggleWatchlist, refreshWatchlist, sessionUser?.id],
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
