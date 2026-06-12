/** Temporäre Einlass-Accounts (Schritt 1: Passwort-Login) */
export const GATE_ACCOUNTS = ['tester@trophybase.app', 'creator@trophybase.app'];

/** Vollzugriff ohne Social-Link */
export const ALLOWED_ADMINS = ['master@trophybase.app'];

/**
 * Views, die während der Wartung NIEMALS durch die Sperrseite blockiert werden.
 * Schritt 2 (Social-Link) muss hier explizit stehen.
 */
export const MAINTENANCE_ALLOWED_VIEWS = ['login', 'social-link'];

export const MAINTENANCE_BYPASS_METADATA_KEY = 'maintenance_bypass';

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function isGateAccount(email) {
  return GATE_ACCOUNTS.includes(normalizeEmail(email));
}

export function hasLinkedSocialIdentity(user) {
  if (!user) return false;
  const identities = user.identities ?? [];
  return identities.some((identity) => identity.provider && identity.provider !== 'email');
}

export function hasMaintenanceBypassFlag(user) {
  if (!user) return false;
  return user.user_metadata?.[MAINTENANCE_BYPASS_METADATA_KEY] === true;
}

/**
 * Wartung umgehen: Admin, persönlicher Account, oder Gate-Account mit
 * gesetztem maintenance_bypass-Flag / verknüpfter Social-Identität.
 */
export function hasMaintenanceBypass(user) {
  if (!user) return false;

  const email = normalizeEmail(user.email);
  if (ALLOWED_ADMINS.includes(email)) return true;
  if (!isGateAccount(email)) return true;

  if (hasMaintenanceBypassFlag(user)) return true;
  return hasLinkedSocialIdentity(user);
}

export function shouldBlockWithMaintenancePage(isMaintenanceMode, user, currentView) {
  if (!isMaintenanceMode) return false;
  if (hasMaintenanceBypass(user)) return false;
  return !MAINTENANCE_ALLOWED_VIEWS.includes(currentView);
}

export function resolvePostLoginView(email) {
  return isGateAccount(email) ? 'social-link' : 'home';
}
