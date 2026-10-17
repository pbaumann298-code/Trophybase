import { supabase } from '../pages/supabaseClient';
import { isUuid } from './gameModel';
import {
  localProgressPayloadForGame,
  loadProgressOwner,
} from './localUserProgress';
import { upsertUserGuideProgress } from './userProgressQueries';

/** Aktiver Cloud-User nach bestätigtem Sync; null = nicht pushen. */
let cloudUserId = null;

export function setProgressCloudUser(userId) {
  const id = String(userId ?? '').trim();
  cloudUserId = id || null;
}

export function getProgressCloudUser() {
  return cloudUserId;
}

/**
 * Nach lokalem Speichern: Stand dieses Spiels in user_guide_progress spiegeln,
 * sofern Sync freigeschaltet und Owner = Session.
 */
export function pushLocalGameProgressToCloud(gameId) {
  const userId = cloudUserId;
  const id = String(gameId ?? '').trim();
  if (!userId || !isUuid(id)) return;

  const owner = loadProgressOwner();
  if (owner && owner !== userId) return;

  const payload = localProgressPayloadForGame(id);
  void upsertUserGuideProgress(
    supabase,
    userId,
    id,
    payload.steps,
    payload.isPlatinum,
  ).then(({ error }) => {
    if (error) console.warn('Fortschritt-Sync:', error.message);
  });
}
