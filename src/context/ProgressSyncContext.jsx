import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../pages/supabaseClient';
import ProgressSyncPrompt from '../components/ProgressSyncPrompt';
import {
  applyProgressByGameToLocal,
  loadProgressOwner,
  mergeProgressByGame,
  planProgressSync,
  saveProgressOwner,
  scanLocalProgressByGame,
} from '../lib/localUserProgress';
import { setProgressCloudUser } from '../lib/progressCloudBridge';
import {
  fetchUserGuideProgress,
  upsertUserGuideProgressBulk,
} from '../lib/userProgressQueries';

const ProgressSyncContext = createContext(null);

export function ProgressSyncProvider({ sessionUser, children }) {
  const userId = sessionUser?.id ?? null;
  const [prompt, setPrompt] = useState(null);
  const [busy, setBusy] = useState(false);
  const runIdRef = useRef(0);

  const closePrompt = useCallback(() => setPrompt(null), []);

  const enableCloudPush = useCallback((id) => {
    setProgressCloudUser(id);
    if (id) saveProgressOwner(id);
  }, []);

  const disableCloudPush = useCallback(() => {
    setProgressCloudUser(null);
  }, []);

  useEffect(() => {
    if (!userId) {
      disableCloudPush();
      setPrompt(null);
      return undefined;
    }

    let cancelled = false;
    const runId = ++runIdRef.current;

    async function reconcile() {
      const localByGame = scanLocalProgressByGame();
      const { byGame: cloudByGame, error } = await fetchUserGuideProgress(supabase, userId);
      if (cancelled || runId !== runIdRef.current) return;

      if (error) {
        console.warn('Fortschritt-Sync:', error.message);
        // Ohne Cloud-Lesen nicht pushen – sonst könnten Profil-Daten überschrieben werden.
        disableCloudPush();
        return;
      }

      const plan = planProgressSync({
        localByGame,
        cloudByGame,
        owner: loadProgressOwner(),
        userId,
      });

      if (plan.action === 'noop') {
        enableCloudPush(userId);
        return;
      }

      if (plan.action === 'pull') {
        applyProgressByGameToLocal(cloudByGame, { replaceAll: true });
        enableCloudPush(userId);
        return;
      }

      // prompt – Cloud-Push erst nach Entscheidung
      disableCloudPush();
      setPrompt({
        reason: plan.reason,
        localByGame: plan.localByGame,
        cloudByGame: plan.cloudByGame,
        localStats: plan.localStats,
        cloudStats: plan.cloudStats,
      });
    }

    reconcile().catch((err) => {
      if (!cancelled) {
        console.warn('Fortschritt-Sync:', err?.message || err);
        disableCloudPush();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userId, enableCloudPush, disableCloudPush]);

  const acceptBrowser = useCallback(async () => {
    if (!userId || !prompt) return;
    setBusy(true);
    try {
      const merged = mergeProgressByGame(prompt.localByGame, prompt.cloudByGame);
      const { error } = await upsertUserGuideProgressBulk(supabase, userId, merged);
      if (error) {
        console.warn('Fortschritt-Sync:', error.message);
        setBusy(false);
        return;
      }
      applyProgressByGameToLocal(merged, { replaceAll: true });
      enableCloudPush(userId);
      setPrompt(null);
    } finally {
      setBusy(false);
    }
  }, [userId, prompt, enableCloudPush]);

  const declineBrowser = useCallback(() => {
    if (!userId || !prompt) return;
    setBusy(true);
    try {
      applyProgressByGameToLocal(prompt.cloudByGame, { replaceAll: true });
      enableCloudPush(userId);
      setPrompt(null);
    } finally {
      setBusy(false);
    }
  }, [userId, prompt, enableCloudPush]);

  const value = useMemo(
    () => ({
      progressSyncPending: Boolean(prompt),
    }),
    [prompt],
  );

  return (
    <ProgressSyncContext.Provider value={value}>
      {children}
      <ProgressSyncPrompt
        open={Boolean(prompt)}
        busy={busy}
        localStats={prompt?.localStats}
        cloudStats={prompt?.cloudStats}
        reason={prompt?.reason ?? ''}
        onAccept={acceptBrowser}
        onDecline={declineBrowser}
      />
    </ProgressSyncContext.Provider>
  );
}

export function useProgressSync() {
  return useContext(ProgressSyncContext);
}
