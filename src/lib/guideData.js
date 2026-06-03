/** sheet_name-Werte aus dem Python-Worker-Pipeline-Output */
export const GUIDE_SHEET = {
  CHAPTER: 1,
  COLLECTIBLES: 2,
  BOSSES: 3,
};

export function normalizeSheetName(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  const digits = raw.match(/\d+/);
  if (digits) return parseInt(digits[0], 10);
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

export function filterGuideBySheet(rows, sheetNumber) {
  return (rows || []).filter((row) => normalizeSheetName(row.sheet_name) === sheetNumber);
}

function compareTimestamp(a, b) {
  return String(a?.timestamp ?? '').localeCompare(String(b?.timestamp ?? ''));
}

/** Sheet 1 – chronologischer Kapitel-Run */
export function sortChapterGuideRows(rows) {
  return [...rows].sort((a, b) => {
    const orderA = Number(a.sort_order ?? a.chapter_order ?? a.guide_id ?? 0);
    const orderB = Number(b.sort_order ?? b.chapter_order ?? b.guide_id ?? 0);
    if (orderA !== orderB) return orderA - orderB;
    return compareTimestamp(a, b);
  });
}

/** Sheet 2 – nach Kategorie, dann Item-Name */
export function sortCollectibleCategoryRows(rows) {
  return [...rows].sort((a, b) => {
    const groupCmp = String(a.category_group ?? '').localeCompare(
      String(b.category_group ?? ''),
      'de',
    );
    if (groupCmp !== 0) return groupCmp;
    return String(a.item_name ?? '').localeCompare(String(b.item_name ?? ''), 'de');
  });
}

/** Sheet 3 – Bosse nach Gruppe / Name */
export function sortBossGuideRows(rows) {
  return [...rows].sort((a, b) => {
    const groupCmp = String(a.category_group ?? '').localeCompare(
      String(b.category_group ?? ''),
      'de',
    );
    if (groupCmp !== 0) return groupCmp;
    return String(a.boss_name ?? '').localeCompare(String(b.boss_name ?? ''), 'de');
  });
}

/**
 * Stabile, tab-spezifische IDs für hiddenItems (keine Kollisionen zwischen Sheets).
 */
export function mapCollectibleRows(rows, sheetNumber) {
  return rows.map((row, index) => {
    const base =
      row.guide_id ??
      row.id ??
      `${row.item_name || 'item'}-${row.timestamp || index}`;
    return {
      ...row,
      id: `sheet${sheetNumber}-${base}`,
    };
  });
}

export function mapBossRows(rows) {
  return rows.map((row, index) => {
    const base =
      row.boss_id ??
      row.guide_id ??
      row.id ??
      `${row.boss_name || 'boss'}-${row.timestamp || index}`;
    return {
      ...row,
      id: `sheet3-boss-${base}`,
    };
  });
}

export function buildChapterGuideData(allRows) {
  const filtered = filterGuideBySheet(allRows, GUIDE_SHEET.CHAPTER);
  return mapCollectibleRows(sortChapterGuideRows(filtered), GUIDE_SHEET.CHAPTER);
}

export function buildCollectibleCategoryData(allRows) {
  const filtered = filterGuideBySheet(allRows, GUIDE_SHEET.COLLECTIBLES);
  return mapCollectibleRows(sortCollectibleCategoryRows(filtered), GUIDE_SHEET.COLLECTIBLES);
}

export function buildBossGuideData(allRows) {
  const filtered = filterGuideBySheet(allRows, GUIDE_SHEET.BOSSES);
  return mapBossRows(sortBossGuideRows(filtered));
}
