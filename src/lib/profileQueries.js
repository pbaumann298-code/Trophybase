import { TABLES } from './gameSchema';

const VERIFICATION_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Zufälliger Code im Format TB-XXXX (ohne verwechselbare Zeichen). */
export function generateVerificationCode() {
  let suffix = '';
  for (let i = 0; i < 4; i += 1) {
    suffix += VERIFICATION_CHARS[Math.floor(Math.random() * VERIFICATION_CHARS.length)];
  }
  return `TB-${suffix}`;
}

function normalizePsnId(psnId) {
  return String(psnId ?? '').trim();
}

function isDuplicatePsnError(error) {
  if (!error) return false;
  if (error.code === '23505') return true;
  const msg = String(error.message ?? '').toLowerCase();
  return msg.includes('idx_profiles_psn_id_unique') || msg.includes('profiles_psn_id');
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function fetchProfile(supabase, userId) {
  if (!userId) return { data: null, error: null };

  const { data, error } = await supabase
    .from(TABLES.profiles)
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  return { data, error };
}

/**
 * Prüft, ob eine PSN-ID bereits einem anderen Account gehört.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} psnId
 */
export async function isPsnIdTakenByOther(supabase, userId, psnId) {
  const normalized = normalizePsnId(psnId);
  if (!normalized) return { taken: false, error: null };

  const { data, error } = await supabase
    .from(TABLES.profiles)
    .select('id')
    .ilike('psn_id', normalized)
    .neq('id', userId)
    .limit(1);

  if (error) return { taken: false, error };

  return { taken: (data ?? []).length > 0, error: null };
}

/**
 * PSN-ID registrieren, Verifizierungscode erzeugen, DSGVO-Einwilligung speichern.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} psnId
 * @param {boolean} datenschutzEinwilligung
 */
export async function registerPsnId(supabase, userId, psnId, datenschutzEinwilligung) {
  const normalized = normalizePsnId(psnId);

  if (!userId) {
    return { data: null, error: new Error('Anmeldung erforderlich') };
  }
  if (!normalized) {
    return { data: null, error: new Error('Bitte gib deine PSN-ID ein.') };
  }
  if (!datenschutzEinwilligung) {
    return { data: null, error: new Error('Die Datenschutz-Einwilligung ist erforderlich.') };
  }

  const takenCheck = await isPsnIdTakenByOther(supabase, userId, normalized);
  if (takenCheck.error) {
    return { data: null, error: takenCheck.error };
  }
  if (takenCheck.taken) {
    return {
      data: null,
      error: new Error('Diese PSN-ID ist bereits mit einem anderen TrophyBase-Account verknüpft.'),
    };
  }

  const now = new Date().toISOString();
  const row = {
    id: userId,
    psn_id: normalized,
    verification_code: generateVerificationCode(),
    verification_status: 'pending',
    datenschutz_einwilligung: true,
    eingewilligt_am: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from(TABLES.profiles)
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();

  if (error && isDuplicatePsnError(error)) {
    return {
      data: null,
      error: new Error('Diese PSN-ID ist bereits mit einem anderen TrophyBase-Account verknüpft.'),
    };
  }

  return { data, error };
}

/**
 * Neuen Verifizierungscode erzeugen (z. B. nach fehlgeschlagener Prüfung).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function regenerateVerificationCode(supabase, userId) {
  if (!userId) {
    return { data: null, error: new Error('Anmeldung erforderlich') };
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLES.profiles)
    .update({
      verification_code: generateVerificationCode(),
      verification_status: 'pending',
      verification_requested_at: null,
      updated_at: now,
    })
    .eq('id', userId)
    .select()
    .single();

  return { data, error };
}

/**
 * Verifizierung über RPC anfordern (setzt Status auf verifying).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function requestPsnVerification(supabase) {
  const { data, error } = await supabase.rpc('request_psn_verification');

  if (error) {
    return { ok: false, message: error.message, error };
  }

  if (!data?.ok) {
    return {
      ok: false,
      message: data?.error ?? 'Verifizierung konnte nicht gestartet werden.',
      error: new Error(data?.error ?? 'Verifizierung fehlgeschlagen'),
    };
  }

  return { ok: true, message: data.message ?? 'Verifizierung gestartet.', error: null };
}

export const PROFILE_STATUS = {
  none: 'none',
  pending: 'pending',
  verifying: 'verifying',
  verified: 'verified',
  failed: 'failed',
};

export function getProfileStatusLabel(status) {
  switch (status) {
    case PROFILE_STATUS.pending:
      return 'Ausstehend';
    case PROFILE_STATUS.verifying:
      return 'Wird geprüft';
    case PROFILE_STATUS.verified:
      return 'Verifiziert';
    case PROFILE_STATUS.failed:
      return 'Fehlgeschlagen';
    default:
      return 'Nicht verknüpft';
  }
}
