import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../pages/supabaseClient';
import { PLATINUM_CHANGED_EVENT, PROGRESS_SYNCED_EVENT } from '../lib/localUserProgress';
import { scanLocalPlatinumGameIds } from '../lib/platinumGames';
import { fetchUserGuideProgress } from '../lib/userProgressQueries';

const PlatinumStatusContext = createContext(null);

export function PlatinumStatusProvider({ sessionUser, children }) {
  const userId = sessionUser?.id ?? null;
  const [platinumIds, setPlatinumIds] = useState(() => new Set(scanLocalPlatinumGameIds()));

  const refresh = useCallback(async () => {
    const next = new Set(scanLocalPlatinumGameIds());
    if (userId) {
      const { byGame, error } = await fetchUserGuideProgress(supabase, userId);
      if (!error) {
        for (const [gameId, row] of Object.entries(byGame ?? {})) {
          if (row?.isPlatinum) next.add(gameId);
        }
      }
    }
    setPlatinumIds(next);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onSynced = () => {
      void refresh();
    };
    window.addEventListener(PROGRESS_SYNCED_EVENT, onSynced);
    window.addEventListener(PLATINUM_CHANGED_EVENT, onSynced);
    return () => {
      window.removeEventListener(PROGRESS_SYNCED_EVENT, onSynced);
      window.removeEventListener(PLATINUM_CHANGED_EVENT, onSynced);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      isPlatinum: (gameId) => {
        const id = String(gameId ?? '').trim();
        return Boolean(id) && platinumIds.has(id);
      },
      refreshPlatinum: refresh,
    }),
    [platinumIds, refresh],
  );

  return (
    <PlatinumStatusContext.Provider value={value}>
      {children}
    </PlatinumStatusContext.Provider>
  );
}

export function usePlatinumStatus() {
  const ctx = useContext(PlatinumStatusContext);
  if (!ctx) {
    return {
      isPlatinum: () => false,
      refreshPlatinum: async () => {},
    };
  }
  return ctx;
}
