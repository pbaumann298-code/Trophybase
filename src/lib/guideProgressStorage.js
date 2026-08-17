import {
  COMPLETED_ITEMS_STORAGE_KEY,
  runGuideKeyMigration,
} from './guideKeyMigration';

/**
 * Schlüssel für Fortschritt und Sichtbarkeit eines Guide-Eintrags.
 *
 * Bewusst die nackte guide_id (UUID) und nicht die reiter-präfixierte item.id:
 * Ein Eintrag mit sheet_types [1, 2] wird in zwei Reitern gerendert, ist aber
 * dieselbe DB-Zeile und darf nur einmal abgehakt werden. Die präfixierte
 * item.id bleibt React-Key und Video-Identität.
 * @param {{ guide_id?: string, id?: string }|null|undefined} item
 * @returns {string}
 */
export function guideProgressKey(item) {
  if (!item) return '';
  const guideId = String(item.guide_id ?? '').trim();
  if (guideId) return guideId;
  return String(item.id ?? '').trim();
}

export function loadCompletedGuideItems() {
  runGuideKeyMigration();
  try {
    const raw = localStorage.getItem(COMPLETED_ITEMS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCompletedGuideItems(items) {
  try {
    localStorage.setItem(COMPLETED_ITEMS_STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* Speicher voll oder nicht verfügbar */
  }
}
