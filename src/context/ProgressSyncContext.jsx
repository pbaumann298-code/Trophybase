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
import { setGameHiddenCloudUser } from '../lib/gameHiddenCloudBridge';
import {
  fetchUserGuideProgress,
  upsertUserGuideProgressBulk,
} from '../lib/userProgressQueries';
import { fetchHiddenGameIds, upsertGameHidden } from '../lib/userGameSettingsQueries';
import { isUuid } from '../lib/gameModel';
import { useVisibility } from './VisibilityContext';

const ProgressSyncContext = createContext(null);

export function ProgressSyncProvider({ sessionUser, authLoading = false, children }) {
  const userId = sessionUser?.id ?? null;
  const { listHiddenGameUuids, replaceHiddenGameUuids } = useVisibility();
  const [prompt, setPrompt] = useState(null);
  const [busy, setBusy] = useState(false);
  const runIdRef = useRef(0);

  const enableCloudPush = useCallback((id) => {
    setProgressCloudUser(id);
    setGameHiddenCloudUser(id);
    if (id) saveProgressOwner(id);
  }, []);

  const disableCloudPush = useCallback(() => {
    setProgressCloudUser(null);
    // Ausblenden darf weiter syncen, auch während der Fortschritts-Abfrage.
  }, []);

  useEffect(() => {
    if (authLoading) return undefined;
    if (!userId) {
      disableCloudPush();
      setGameHiddenCloudUser(null);
      setPrompt(null);
      return undefined;
    }

    setGameHiddenCloudUser(userId);

    const initialOwner = loadProgressOwner();
    if (initialOwner === userId) {
      enableCloudPush(userId);
    }

    let cancelled = false;
    const runId = ++runIdRef.current;

    async function reconcileHidden() {
      const { ids: cloudHidden, error } = await fetchHiddenGameIds(supabase, userId);
      if (cancelled || error) {
        if (error) console.warn('Spiel-Sichtbarkeit:', error.message);
        return;
      }
      const localHidden = listHiddenGameUuids().filter((id) => isUuid(id));
      const merged = new Set([...localHidden, ...cloudHidden]);
      replaceHiddenGameUuids(merged);
      const toPush = localHidden.filter((id) => !cloudHidden.includes(id));
      if (toPush.length > 0) {
        await Promise.all(toPush.map((id) => upsertGameHidden(supabase, userId, id, true)));
      }
    }

    async function reconcile() {
      void reconcileHidden();

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

      if (plan.action === 'auto_merge') {
        const merged = mergeProgressByGame(localByGame, cloudByGame);
        const { error: mergeErr } = await upsertUserGuideProgressBulk(supabase, userId, merged);
        if (mergeErr) {
          console.warn('Fortschritt-Auto-Merge:', mergeErr.message);
        }
        applyProgressByGameToLocal(merged, { replaceAll: true });
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
  }, [userId, authLoading, enableCloudPush, disableCloudPush, listHiddenGameUuids, replaceHiddenGameUuids]);

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
