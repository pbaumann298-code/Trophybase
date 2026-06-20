import { ALLOWED_ADMINS, normalizeEmail } from './maintenanceAccess';

export const ADMIN_RETURN_STORAGE_KEY = 'tb_admin_return';

/** Admin hat die Website geöffnet und kann zurück zum Panel. */
export function setAdminReturnFlag(active = true) {
  try {
    if (active) {
      sessionStorage.setItem(ADMIN_RETURN_STORAGE_KEY, '1');
    } else {
      sessionStorage.removeItem(ADMIN_RETURN_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function hasAdminReturnFlag() {
  try {
    return sessionStorage.getItem(ADMIN_RETURN_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isAdminUser(user) {
  if (!user?.email) return false;
  return ALLOWED_ADMINS.includes(normalizeEmail(user.email));
}

export { ALLOWED_ADMINS };
