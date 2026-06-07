import { GUIDE_REITER } from './gameTypes';

/** @deprecated Legacy sheet_name – Tabellen sind jetzt getrennt (game_chapters / game_guides) */
export const GUIDE_SHEET = {
  CHRONOLOGICAL: 1,
  BY_TYPE: 2,
};

/**
 * game_chapters und game_guides nutzen dieselben Spalten.
 * Mappt Supabase-Zeilen auf ein einheitliches Frontend-Objekt.
 */
export function normalizeGuideEntryRow(row) {
  if (!row) return null;

  const guideId = row.guide_id ?? row.Guide_ID ?? row.id ?? null;

  return {
    guide_id: guideId,
    game_id: String(row.game_id ?? row.NPWR_ID ?? row.npwr_id ?? '').trim(),
    item_name: String(row.item_name ?? row.Item_Name ?? row.name ?? '').trim(),
    timestamp: String(row.timestamp ?? row.Timestamp ?? '').trim(),
    video_url: String(row.video_url ?? row.Video_URL ?? '').trim(),
    chronological_group: String(
      row.chronological_group ?? row.Chronological_Group ?? row.area ?? row.Area ?? '',
    ).trim(),
    category_group: String(
      row.category_group ?? row.Category_Group ?? row.type ?? row.Type ?? '',
    ).trim(),
    sort_order: row.sort_order ?? row.Sort_Order ?? row.chapter_order ?? row.Chapter_Order ?? null,
  };
}

/** @deprecated Alias – identische Spalten wie game_guides */
export function normalizeChapterRow(row) {
  return normalizeGuideEntryRow(row);
}

/** @deprecated Alias – identische Spalten wie game_chapters */
export function normalizeGuideRow(row) {
  return normalizeGuideEntryRow(row);
}

function compareTimestamp(a, b) {
  return String(a?.timestamp ?? '').localeCompare(String(b?.timestamp ?? ''));
}

/** Reiter 1 – primär chronological_group, dann sort_order / guide_id / Zeitstempel */
export function sortChronologicalGuideRows(rows) {
  return [...rows].sort((a, b) => {
    const groupCmp = String(a.chronological_group ?? '').localeCompare(
      String(b.chronological_group ?? ''),
      'de',
    );
    if (groupCmp !== 0) return groupCmp;

    const orderA = Number(a.sort_order ?? a.guide_id ?? 0);
    const orderB = Number(b.sort_order ?? b.guide_id ?? 0);
    if (orderA !== orderB) return orderA - orderB;

    return compareTimestamp(a, b);
  });
}

/** Reiter 2 – category_group (Waffen, Ringe, …), dann item_name */
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

function assignStableIds(rows, idPrefix) {
  return rows.map((row, index) => {
    const base =
      row.guide_id ??
      `${row.item_name || 'item'}-${row.timestamp || index}`;
    return {
      ...row,
      id: `${idPrefix}-${base}`,
    };
  });
}

export function mapGuideRows(rows, sheetNumber) {
  return assignStableIds(rows, `guide-s${sheetNumber}`);
}

export function mapChapterRows(rows) {
  return assignStableIds(rows, 'chapter');
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

function mapGuideEntryRows(rows, idPrefix) {
  const normalized = (rows || []).map(normalizeGuideEntryRow).filter(Boolean);
  return assignStableIds(normalized, idPrefix);
}

/**
 * Reiter 1 (Full-Gameplay): game_chapters
 * Überschrift: chronological_group · Item: item_name
 */
export function buildChronologicalGuideData(chapterRows) {
  const mapped = mapGuideEntryRows(chapterRows, 'chapter');
  return sortChronologicalGuideRows(mapped);
}

/**
 * Reiter 2 (Komplettierung): game_guides
 * Überschrift: category_group · Item: item_name
 */
export function buildByTypeGuideData(guideRows) {
  const mapped = mapGuideEntryRows(guideRows, 'guide');
  return sortByTypeGuideRows(mapped);
}

/** Reiter 3: Boss-Übersicht aus game_bosses */
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
