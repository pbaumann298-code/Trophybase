import { supabase } from '../pages/supabaseClient';
import { isUuid } from './gameModel';
import { upsertGameHidden } from './userGameSettingsQueries';

let cloudUserId = null;

export function setGameHiddenCloudUser(userId) {
  cloudUserId = String(userId ?? '').trim() || null;
}

export function pushGameHiddenToCloud(gameId, isHidden) {
  const userId = cloudUserId;
  const id = String(gameId ?? '').trim();
  if (!userId || !isUuid(id)) return;

  void upsertGameHidden(supabase, userId, id, Boolean(isHidden)).then(({ error }) => {
    if (error) console.warn('Spiel-Sichtbarkeit:', error.message);
  });
}
