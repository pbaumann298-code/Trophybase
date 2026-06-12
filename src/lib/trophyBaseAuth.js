/**
 * TrophyBase Wartungs-Login (Supabase: Signups OFF, Manual Linking ON)
 *
 * Flow:
 * 1. signInWithPassword → Session bleibt aktiv
 * 2. UI zeigt Social-Link (kein Dashboard)
 * 3. linkIdentity() verknüpft Provider mit bestehendem User
 * 4. user_metadata.maintenance_bypass = true → Wartung dauerhaft umgehen
 */

import {
  GATE_ACCOUNTS,
  isGateAccount,
  normalizeEmail,
  hasLinkedSocialIdentity,
} from './maintenanceAccess';

/** @typedef {'discord' | 'google' | 'apple' | 'facebook'} OAuthProvider */

export const MAINTENANCE_BYPASS_METADATA_KEY = 'maintenance_bypass';
export const SOCIAL_LINKED_AT_KEY = 'social_linked_at';

/** OAuth-Redirect nach manuellem Linking – Session bleibt am Gate-Account */
export function getSocialLinkRedirectUrl() {
  const url = new URL(window.location.origin);
  url.searchParams.set('tb_auth', 'social-link-complete');
  return url.toString();
}

/**
 * Schritt 1: Klassischer Login. Session bleibt aktiv.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} email
 * @param {string} password
 */
export async function signInWithGatePassword(supabase, email, password) {
  const normalizedEmail = normalizeEmail(email);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password: password.trim(),
  });

  if (error) {
    return {
      ok: false,
      error,
      nextView: 'login',
      hint: isGateAccount(normalizedEmail)
        ? 'Tor-Passwort in Supabase Auth prüfen oder zurücksetzen (Tester-Setup kann das alte Passwort ungültig machen).'
        : undefined,
    };
  }

  const user = data.user;
  const needsSocialLink =
    isGateAccount(normalizedEmail) && !hasMaintenanceBypassFlag(user);

  return {
    ok: true,
    user,
    session: data.session,
    /** Gate-Accounts: immer Schritt 2, nie direkt Dashboard */
    nextView: needsSocialLink ? 'social-link' : 'home',
  };
}

/**
 * Schritt 3: Social-Identität manuell verknüpfen (NICHT signInWithOAuth).
 * Leitet zum Provider weiter; nach Redirect → handleSocialLinkRedirect().
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {OAuthProvider} provider
 */
export async function linkSocialIdentity(supabase, provider) {
  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: {
      redirectTo: getSocialLinkRedirectUrl(),
    },
  });

  if (error) {
    return { ok: false, error };
  }

  // Browser-Redirect zum OAuth-Provider (Session bleibt am Gate-User)
  if (data?.url) {
    window.location.assign(data.url);
  }

  return { ok: true, redirecting: true };
}

/**
 * Prüft user_metadata-Flag (dauerhafter Wartungs-Bypass).
 * @param {import('@supabase/supabase-js').User | null | undefined} user
 */
export function hasMaintenanceBypassFlag(user) {
  if (!user) return false;
  return user.user_metadata?.[MAINTENANCE_BYPASS_METADATA_KEY] === true;
}

/**
 * Schritt 4: Nach OAuth-Redirect Flag setzen.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function markMaintenanceBypass(supabase) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: userError ?? new Error('Keine Session nach Social-Link') };
  }

  if (!hasLinkedSocialIdentity(user)) {
    return {
      ok: false,
      error: new Error('Social-Identität wurde noch nicht verknüpft'),
    };
  }

  if (hasMaintenanceBypassFlag(user)) {
    return { ok: true, user, alreadyMarked: true };
  }

  const { data, error } = await supabase.auth.updateUser({
    data: {
      [MAINTENANCE_BYPASS_METADATA_KEY]: true,
      [SOCIAL_LINKED_AT_KEY]: new Date().toISOString(),
    },
  });

  if (error) {
    return { ok: false, error };
  }

  return { ok: true, user: data.user };
}

/**
 * Nach OAuth-Redirect aufrufen (URL enthält ?tb_auth=social-link-complete).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function handleSocialLinkRedirect(supabase) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('tb_auth') !== 'social-link-complete') {
    return { handled: false };
  }

  // Query-Parameter aufräumen (Hash-Fragmente übernimmt Supabase intern)
  params.delete('tb_auth');
  const cleanSearch = params.toString();
  const cleanUrl = `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}`;
  window.history.replaceState({}, '', cleanUrl);

  const markResult = await markMaintenanceBypass(supabase);

  return {
    handled: true,
    ...markResult,
    nextView: markResult.ok ? 'home' : 'social-link',
  };
}

/**
 * @param {import('@supabase/supabase-js').User | null | undefined} user
 */
export function resolveViewForSession(user) {
  if (!user) return 'login';

  const email = normalizeEmail(user.email);
  if (!isGateAccount(email)) return 'home';
  if (hasMaintenanceBypassFlag(user) || hasLinkedSocialIdentity(user)) {
    return 'home';
  }
  return 'social-link';
}

export { GATE_ACCOUNTS, isGateAccount, normalizeEmail };
