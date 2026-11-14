import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../pages/supabaseClient';
import ProgressSyncPrompt from '../components/ProgressSyncPrompt';
import {
  applyProgressByGameToLocal,
  loadProgressOwner,
  mergeProgressByGame,
  planProgressSync,
  PROGRESS_OWNER_KEY,
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
const PROMPT_RESOLVED_PREFIX = 'tb_progress_prompt_resolved:';

function hasResolvedPromptForUser(userId) {
  if (!userId || typeof window === 'undefined') return false;
  try {
    return window.localStorage?.getItem(`${PROMPT_RESOLVED_PREFIX}${userId}`) === '1';
  } catch {
    return false;
  }
}

function markPromptResolvedForUser(userId) {
  if (!userId || typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(`${PROMPT_RESOLVED_PREFIX}${userId}`, '1');
  } catch {
    /* ignore storage errors */
  }
}

export function ProgressSyncProvider({ sessionUser, authLoading = false, children }) {
  const userId = sessionUser?.id ?? null;
  const { listHiddenGameUuids, replaceHiddenGameUuids } = useVisibility();
  const visibilityFnsRef = useRef({ listHiddenGameUuids, replaceHiddenGameUuids });

  const [prompt, setPrompt] = useState(null);
  const [busy, setBusy] = useState(false);
  const runIdRef = useRef(0);
  const activePrompt = userId && prompt?.userId === userId ? prompt : null;

  useEffect(() => {
    visibilityFnsRef.current = { listHiddenGameUuids, replaceHiddenGameUuids };
  }, [listHiddenGameUuids, replaceHiddenGameUuids]);

  const enableCloudPush = useCallback((id) => {
    setProgressCloudUser(id);
    setGameHiddenCloudUser(id);
    if (id) {
      saveProgressOwner(id);
      markPromptResolvedForUser(id);
    }
  }, []);

  const disableCloudPush = useCallback(() => {
    setProgressCloudUser(null);
    // Ausblenden darf weiter syncen, auch während der Fortschritts-Abfrage.
  }, []);

  // Cross-Tab Synchronisation: Sobald in EINEM Tab entschieden wurde, schließen alle anderen Tabs sofort ihr Popup.
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return undefined;
    const resolvedKey = `${PROMPT_RESOLVED_PREFIX}${userId}`;
    const handleStorage = (event) => {
      if (
        (event.key === PROGRESS_OWNER_KEY && event.newValue === userId) ||
        (event.key === resolvedKey && event.newValue === '1')
      ) {
        setPrompt(null);
        setProgressCloudUser(userId);
        setGameHiddenCloudUser(userId);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [userId]);

  useEffect(() => {
    if (authLoading) return undefined;
    if (!userId) {
      disableCloudPush();
      setGameHiddenCloudUser(null);
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
      const localHidden = visibilityFnsRef.current.listHiddenGameUuids().filter((id) => isUuid(id));
      const merged = new Set([...localHidden, ...cloudHidden]);
      visibilityFnsRef.current.replaceHiddenGameUuids(merged);
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

      const effectiveOwner =
        loadProgressOwner() || (hasResolvedPromptForUser(userId) ? userId : null);

      const plan = planProgressSync({
        localByGame,
        cloudByGame,
        owner: effectiveOwner,
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

      // Falls ein anderer Tab in der Zwischenzeit bereits entschieden hat → nicht noch mal fragen!
      if (loadProgressOwner() === userId || hasResolvedPromptForUser(userId)) {
        enableCloudPush(userId);
        return;
      }

      // prompt – Cloud-Push erst nach Entscheidung
      disableCloudPush();
      setPrompt({
        userId,
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
  }, [userId, authLoading, enableCloudPush, disableCloudPush]);

  const acceptBrowser = useCallback(async () => {
    if (!userId || !activePrompt) return;
    setBusy(true);
    try {
      const merged = mergeProgressByGame(activePrompt.localByGame, activePrompt.cloudByGame);
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
  }, [userId, activePrompt, enableCloudPush]);

  const declineBrowser = useCallback(() => {
    if (!userId || !activePrompt) return;
    setBusy(true);
    try {
      applyProgressByGameToLocal(activePrompt.cloudByGame, { replaceAll: true });
      enableCloudPush(userId);
      setPrompt(null);
    } finally {
      setBusy(false);
    }
  }, [userId, activePrompt, enableCloudPush]);

  const value = useMemo(
    () => ({
      progressSyncPending: Boolean(activePrompt),
    }),
    [activePrompt],
  );

  return (
    <ProgressSyncContext.Provider value={value}>
      {children}
      <ProgressSyncPrompt
        open={Boolean(activePrompt)}
        busy={busy}
        localStats={activePrompt?.localStats}
        cloudStats={activePrompt?.cloudStats}
        reason={activePrompt?.reason ?? ''}
        onAccept={acceptBrowser}
        onDecline={declineBrowser}
      />
    </ProgressSyncContext.Provider>
  );
}

export function useProgressSync() {
  return useContext(ProgressSyncContext);
}
