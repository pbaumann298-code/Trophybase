export const BETA_TESTER_ROLE = 'beta_tester';

/** Tester_ + genau 5 alphanumerische Zeichen */
export const BETA_TESTER_ID_PATTERN = /^Tester_[A-Za-z0-9]{5}$/;

export function isBetaTester(user) {
  if (!user) return false;
  const role = user.user_metadata?.role ?? user.app_metadata?.role;
  return role === BETA_TESTER_ROLE;
}

export function normalizeBetaTesterId(value) {
  return String(value ?? '').trim();
}

export function betaTesterEmail(testerId) {
  const id = normalizeBetaTesterId(testerId);
  return `${id.toLowerCase()}@beta.trophybase.app`;
}

function mapValidateError(code) {
  switch (code) {
    case 'missing_credentials':
      return 'Bitte Tester-ID und Passwort eingeben.';
    case 'invalid_tester_id_format':
      return 'Tester-ID muss wie Tester_A9k2M aussehen (Tester_ + 5 Zeichen).';
    case 'invalid_credentials':
      return 'Tester-ID oder Passwort ist falsch.';
    case 'already_used':
      return 'Dieser Beta-Zugang wurde bereits von jemand anderem eingelöst.';
    case 'not_authenticated':
      return 'Keine Session – bitte erneut anmelden.';
    default:
      return 'Beta-Zugang konnte nicht geprüft werden.';
  }
}

/**
 * RPC: Zugangsdaten gegen public.beta_testers prüfen.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function validateBetaTester(supabase, testerId, password) {
  const id = normalizeBetaTesterId(testerId);
  const pw = String(password ?? '').trim();

  if (!id || !pw) {
    return { ok: false, message: mapValidateError('missing_credentials') };
  }
  if (!BETA_TESTER_ID_PATTERN.test(id)) {
    return { ok: false, message: mapValidateError('invalid_tester_id_format') };
  }

  const { data, error } = await supabase.rpc('tb_validate_beta_tester', {
    p_tester_id: id,
    p_password: pw,
  });

  if (error) {
    return { ok: false, message: error.message || mapValidateError() };
  }

  const payload = data && typeof data === 'object' ? data : {};
  if (!payload.ok) {
    return { ok: false, message: mapValidateError(payload.error) };
  }

  return {
    ok: true,
    testerId: payload.tester_id || id,
    email: payload.email || betaTesterEmail(id),
    alreadyClaimedByYou: Boolean(payload.already_claimed_by_you),
  };
}

/**
 * RPC: Slot dem aktuellen Auth-User zuordnen.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function claimBetaTester(supabase, testerId, password) {
  const id = normalizeBetaTesterId(testerId);
  const pw = String(password ?? '').trim();

  const { data, error } = await supabase.rpc('tb_claim_beta_tester', {
    p_tester_id: id,
    p_password: pw,
  });

  if (error) {
    return { ok: false, message: error.message || mapValidateError() };
  }

  const payload = data && typeof data === 'object' ? data : {};
  if (!payload.ok) {
    return { ok: false, message: mapValidateError(payload.error) };
  }

  return { ok: true, testerId: payload.tester_id || id, email: payload.email };
}

/**
 * Rolle beta_tester in user_metadata setzen.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} [testerId]
 */
export async function markBetaTesterRole(supabase, testerId) {
  const { data, error } = await supabase.auth.updateUser({
    data: {
      role: BETA_TESTER_ROLE,
      ...(testerId ? { tester_id: normalizeBetaTesterId(testerId) } : {}),
    },
  });
  if (error) return { ok: false, message: error.message, user: null };
  return { ok: true, user: data.user };
}

/**
 * /beta-Login: Tester-ID + Passwort → Session + Rolle.
 * Legt den Auth-User bei Bedarf an (Confirm-Email sollte in der Beta aus sein).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function signInWithBetaTesterKeys(supabase, testerId, password) {
  const validated = await validateBetaTester(supabase, testerId, password);
  if (!validated.ok) return validated;

  const email = validated.email;
  const pw = String(password ?? '').trim();
  const id = validated.testerId;

  let user = null;
  let session = null;

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: pw,
  });

  if (!signInError && signInData?.session?.user) {
    user = signInData.session.user;
    session = signInData.session;
  } else {
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: pw,
      options: {
        data: {
          role: BETA_TESTER_ROLE,
          tester_id: id,
        },
      },
    });

    if (signUpError) {
      const already =
        /already registered|already exists|user already/i.test(signUpError.message || '');
      if (already) {
        return {
          ok: false,
          message:
            'Zugang existiert, Login fehlgeschlagen. Passwort prüfen oder in Supabase zurücksetzen.',
        };
      }
      return { ok: false, message: signUpError.message };
    }

    if (signUpData.session?.user) {
      user = signUpData.session.user;
      session = signUpData.session;
    } else {
      const retry = await supabase.auth.signInWithPassword({ email, password: pw });
      if (retry.error || !retry.data.session?.user) {
        return {
          ok: false,
          message:
            retry.error?.message ||
            'Account angelegt, aber keine Session. In Supabase „Confirm email“ für die Beta ggf. deaktivieren.',
        };
      }
      user = retry.data.session.user;
      session = retry.data.session;
    }
  }

  const claim = await claimBetaTester(supabase, id, pw);
  if (!claim.ok) {
    return { ok: false, message: claim.message };
  }

  if (!isBetaTester(user)) {
    const marked = await markBetaTesterRole(supabase, id);
    if (!marked.ok) return { ok: false, message: marked.message };
    user = marked.user ?? user;
  }

  return { ok: true, user, session, testerId: id, email };
}

/** @deprecated Alte Invite-Key-Tabelle; bleibt für Referenz. */
export async function redeemInviteKey(supabase, userKey, currentUserId) {
  void supabase;
  void userKey;
  void currentUserId;
  return {
    ok: false,
    message: 'Alte Invite-Keys sind abgelöst. Bitte Tester-ID + Passwort auf /beta nutzen.',
  };
}
