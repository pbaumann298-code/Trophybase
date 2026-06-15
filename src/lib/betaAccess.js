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

async function establishSessionAfterSignUp(supabase, email, password) {
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signInData.session?.user) {
    return {
      ok: false,
      signInError,
      message:
        signInError?.message ??
        'Account wurde angelegt, aber die automatische Anmeldung ist fehlgeschlagen.',
    };
  }

  return {
    ok: true,
    user: signInData.session.user,
    session: signInData.session,
  };
}

/**
 * Beta-Registrierung:
 * 1. signUp
 * 2. Sofort signInWithPassword → aktive Session (Bypass)
 * 3. Erst dann Key-Einlösung möglich
 *
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
    const alreadyExists = /already registered|already exists|user already/i.test(error.message);

    if (alreadyExists) {
      const loginResult = await establishSessionAfterSignUp(
        supabase,
        normalizedEmail,
        trimmedPassword,
      );
      if (loginResult.ok) {
        return { ...loginResult, existingAccount: true };
      }
      return {
        ok: false,
        message: loginResult.message ?? 'Diese E-Mail ist bereits registriert. Passwort prüfen.',
      };
    }

    return { ok: false, message: error.message };
  }

  if (data.session?.user) {
    return {
      ok: true,
      user: data.session.user,
      session: data.session,
    };
  }

  if (data.user) {
    const loginResult = await establishSessionAfterSignUp(
      supabase,
      normalizedEmail,
      trimmedPassword,
    );

    if (loginResult.ok) {
      return loginResult;
    }

    const needsEmailConfirm =
      loginResult.signInError?.message?.toLowerCase().includes('email not confirmed') ||
      loginResult.signInError?.message?.toLowerCase().includes('invalid login');

    return {
      ok: false,
      needsEmailConfirm,
      message: needsEmailConfirm
        ? 'Account angelegt. Bitte E-Mail bestätigen, danach erneut mit E-Mail + Passwort einloggen und deinen Beta-Key auf /beta einlösen.'
        : `${loginResult.message} (Tipp: In Supabase „Confirm email“ für die Beta ggf. deaktivieren.)`,
    };
  }

  return { ok: false, message: 'Registrierung fehlgeschlagen. Bitte erneut versuchen.' };
}

/**
 * Bestehenden Account einloggen und zur Key-Eingabe weiterleiten.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function signInBetaAccount(supabase, email, password) {
  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  const trimmedPassword = String(password ?? '').trim();

  const result = await establishSessionAfterSignUp(supabase, normalizedEmail, trimmedPassword);
  if (!result.ok) {
    return { ok: false, message: result.message ?? 'Login fehlgeschlagen.' };
  }
  return { ok: true, user: result.user, session: result.session };
}
