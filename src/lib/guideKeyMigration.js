/**
 * Fortschritt und Sichtbarkeit von Guide-Einträgen wurden früher pro Reiter
 * gespeichert („walkthrough-<uuid>", „collectible-<uuid>", …). Seit ein
 * Eintrag in mehreren Reitern stehen kann (game_guides.sheet_type = [1, 2]),
 * ist die nackte guide_id der Schlüssel – dieselbe DB-Zeile gilt damit in
 * allen Reitern als abgehakt bzw. ausgeblendet.
 *
 * Die Storage-Keys liegen hier, damit die Migration keinen Import-Zyklus mit
 * guideProgressStorage.js / visibilityPreferences.js erzeugt.
 */

export const COMPLETED_ITEMS_STORAGE_KEY = 'tb_completed_guide_items';
export const HIDDEN_IDS_STORAGE_KEY = 'tb_hidden_ids';

const MIGRATION_STORAGE_KEY = 'tb_guide_key_migration';
/** 2 = Reiter-Präfixe entfernt. 3 = Legacy-Blob in Spiel-Shards aufgeteilt (oder leer). */
const PREFIX_MIGRATION_VERSION = '2';
const SHARD_MIGRATION_VERSION = '3';

/** Präfixe aus assignStableIds / mapGuideRows / mapBossRows */
const TAB_PREFIX_PATTERN = /^(?:walkthrough|collectible|boss|guide-s\d+)-/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITEM_PREFIX = 'item:';

/**
 * „collectible-3f2a…" → „3f2a…". Alles, was nach dem Abschneiden keine UUID
 * ist (z. B. namensbasierte Alt-IDs), bleibt unverändert erhalten.
 * @param {unknown} key
 * @returns {string}
 */
export function stripGuideTabPrefix(key) {
  const raw = String(key ?? '');
  const stripped = raw.replace(TAB_PREFIX_PATTERN, '');
  return stripped !== raw && UUID_PATTERN.test(stripped) ? stripped : raw;
}

function readJson(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(storageKey, value) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    /* Speicher voll oder nicht verfügbar */
  }
}

/** Mehrere Reiter-Schlüssel derselben UUID verschmelzen – abgehakt gewinnt. */
function migrateCompletedItems() {
  const parsed = readJson(COMPLETED_ITEMS_STORAGE_KEY);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;

  const next = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!value) continue;
    next[stripGuideTabPrefix(key)] = true;
  }

  writeJson(COMPLETED_ITEMS_STORAGE_KEY, next);
}

/** Nur „item:"-Einträge betreffen Guide-Zeilen; „game:"-Keys bleiben unberührt. */
function migrateHiddenIds() {
  const parsed = readJson(HIDDEN_IDS_STORAGE_KEY);
  if (!Array.isArray(parsed)) return;

  const next = new Set();
  for (const entry of parsed) {
    const id = String(entry ?? '');
    if (!id) continue;
    next.add(
      id.startsWith(ITEM_PREFIX)
        ? `${ITEM_PREFIX}${stripGuideTabPrefix(id.slice(ITEM_PREFIX.length))}`
        : id,
    );
  }

  writeJson(HIDDEN_IDS_STORAGE_KEY, [...next]);
}

let alreadyRun = false;

/**
 * Einmalige, idempotente Migration beider Stores. Wird beim ersten Lesen
 * aufgerufen, weil der Sichtbarkeits-Store bereits beim Modul-Import
 * initialisiert wird.
 */
function prefixMigrationDone() {
  const version = localStorage.getItem(MIGRATION_STORAGE_KEY);
  return version === PREFIX_MIGRATION_VERSION || version === SHARD_MIGRATION_VERSION;
}

/**
 * Legacy-Blob `tb_completed_guide_items` ist leer bzw. wurde in
 * `tb_guide_progress:{gameId}` übernommen.
 */
export function noteLegacyGuideProgressDrained() {
  try {
    localStorage.removeItem(COMPLETED_ITEMS_STORAGE_KEY);
    localStorage.setItem(MIGRATION_STORAGE_KEY, SHARD_MIGRATION_VERSION);
  } catch {
    /* Speicher voll oder nicht verfügbar */
  }
}

export function runGuideKeyMigration() {
  if (alreadyRun) return;
  alreadyRun = true;

  try {
    if (prefixMigrationDone()) return;
    migrateCompletedItems();
    migrateHiddenIds();
    localStorage.setItem(MIGRATION_STORAGE_KEY, PREFIX_MIGRATION_VERSION);
  } catch {
    /* Kein localStorage (SSR o. Ä.) – nächster Start versucht es erneut */
  }
}
