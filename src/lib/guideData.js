import { GUIDE_REITER } from './gameTypes';

/** sheet_name in game_guides: 1 = chronologisch, 2 = nach Art */
export const GUIDE_SHEET = {
  CHRONOLOGICAL: 1,
  BY_TYPE: 2,
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

/** Reiter 1 – primär nach chronological_group, dann Zeitstempel */
export function sortChronologicalGuideRows(rows) {
  return [...rows].sort((a, b) => {
    const groupCmp = String(a.chronological_group ?? '').localeCompare(
      String(b.chronological_group ?? ''),
      'de',
    );
    if (groupCmp !== 0) return groupCmp;

    const orderA = Number(a.sort_order ?? a.chapter_order ?? a.chapter_id ?? a.guide_id ?? 0);
    const orderB = Number(b.sort_order ?? b.chapter_order ?? b.chapter_id ?? b.guide_id ?? 0);
    if (orderA !== orderB) return orderA - orderB;

    return compareTimestamp(a, b);
  });
}

/** Reiter 2 – nach category_group (Waffen, Ringe, …), dann item_name */
export function sortByTypeGuideRows(rows) {
  return [...rows].sort((a, b) => {
    const groupCmp = String(a.category_group ?? '').localeCompare(
      String(b.category_group ?? ''),
      'de',
    );
    if (groupCmp !== 0) return groupCmp;
    return String(a.item_name ?? '').localeCompare(String(b.item_name ?? ''), 'de');
  });
}

/** game_bosses – nach Name / Timestamp */
export function sortBossRows(rows) {
  return [...rows].sort((a, b) => {
    const nameCmp = String(a.boss_name ?? '').localeCompare(String(b.boss_name ?? ''), 'de');
    if (nameCmp !== 0) return nameCmp;
    return compareTimestamp(a, b);
  });
}

export function mapGuideRows(rows, sheetNumber) {
  return rows.map((row, index) => {
    const base =
      row.guide_id ??
      row.id ??
      `${row.item_name || 'item'}-${row.timestamp || index}`;
    return {
      ...row,
      id: `guide-s${sheetNumber}-${base}`,
    };
  });
}

export function mapChapterRows(rows) {
  return rows.map((row, index) => {
    const base =
      row.chapter_id ??
      row.guide_id ??
      row.id ??
      `${row.item_name || 'item'}-${row.timestamp || index}`;
    return {
      ...row,
      id: `chapter-${base}`,
    };
  });
}

export function mapBossRows(rows) {
  return rows.map((row, index) => {
    const base =
      row.boss_id ??
      row.id ??
      `${row.boss_name || 'boss'}-${row.timestamp || index}`;
    return {
      ...row,
      id: `boss-${base}`,
    };
  });
}

/** Tab 2: Full-Gameplay chronologisch aus game_chapters (Gruppierung: chronological_group) */
export function buildChronologicalGuideData(chapterRows) {
  return mapChapterRows(sortChronologicalGuideRows(chapterRows || []));
}

/** Tab 3: Komplettierung nach Art (sheet_name=2, Gruppierung: category_group) */
export function buildByTypeGuideData(allGuideRows) {
  const filtered = filterGuideBySheet(allGuideRows, GUIDE_SHEET.BY_TYPE);
  return mapGuideRows(sortByTypeGuideRows(filtered), GUIDE_SHEET.BY_TYPE);
}

/** Tab 4: Boss-Übersicht aus game_bosses */
export function buildBossOverviewData(bossRows) {
  return mapBossRows(sortBossRows(bossRows || []));
}

/** @deprecated Alias – nutze buildChronologicalGuideData */
export function buildChapterGuideData(rows) {
  return buildChronologicalGuideData(rows);
}

/** @deprecated Alias – nutze buildByTypeGuideData */
export function buildCollectibleCategoryData(rows) {
  return buildByTypeGuideData(rows);
}

/** @deprecated Bosse kommen nur noch aus game_bosses */
export function buildBossGuideData(_guideRows) {
  return [];
}

export { GUIDE_REITER };
