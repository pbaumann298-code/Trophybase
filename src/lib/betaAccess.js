import { TABLES } from './gameSchema';

export const BETA_TESTER_ROLE = 'beta_tester';

export function isBetaTester(user) {
  if (!user) return false;
  const role = user.user_metadata?.role ?? user.app_metadata?.role;
  return role === BETA_TESTER_ROLE;
}

/**
 * Invite-Key einlösen und Rolle beta_tester setzen.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userKey
 * @param {string} currentUserId
 */
export async function redeemInviteKey(supabase, userKey, currentUserId) {
  const keyString = String(userKey ?? '').trim();
  if (!keyString) {
    return { ok: false, message: 'Bitte einen gültigen Beta-Key eingeben.' };
  }

  const { data: keyData, error: keyError } = await supabase
    .from(TABLES.inviteKeys)
    .select('*')
    .eq('key_string', keyString)
    .eq('is_used', false)
    .maybeSingle();

  if (keyError || !keyData) {
    return { ok: false, message: 'Dieser Key ist ungültig oder wurde bereits verwendet!' };
  }

  const { error: updateKeyError } = await supabase
    .from(TABLES.inviteKeys)
    .update({ is_used: true, used_by_user_id: currentUserId })
    .eq('id', keyData.id)
    .eq('is_used', false);

  if (updateKeyError) {
    return { ok: false, message: 'Key konnte nicht eingelöst werden. Bitte erneut versuchen.' };
  }

  const { data: authData, error: updateAuthError } = await supabase.auth.updateUser({
    data: { role: BETA_TESTER_ROLE },
  });

  if (updateAuthError) {
    return { ok: false, message: updateAuthError.message };
  }

  return { ok: true, user: authData.user };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} email
 * @param {string} password
 */
export async function registerBetaAccount(supabase, email, password) {
  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  const trimmedPassword = String(password ?? '').trim();

  if (!normalizedEmail || trimmedPassword.length < 6) {
    return {
      ok: false,
      message: 'E-Mail und Passwort (min. 6 Zeichen) sind erforderlich.',
    };
  }

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password: trimmedPassword,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  if (data.session?.user) {
    return { ok: true, user: data.session.user, needsEmailConfirm: false };
  }

  if (data.user && !data.session) {
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: trimmedPassword,
    });

    if (!signInError && signInData.session?.user) {
      return { ok: true, user: signInData.session.user, needsEmailConfirm: false };
    }

    return {
      ok: true,
      user: data.user,
      needsEmailConfirm: true,
      message:
        'Account angelegt. Bitte bestätige deine E-Mail und melde dich danach erneut an, um deinen Beta-Key einzulösen.',
    };
  }

  return { ok: false, message: 'Registrierung fehlgeschlagen. Bitte erneut versuchen.' };
}
