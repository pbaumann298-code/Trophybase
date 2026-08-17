import { GUIDE_REITER } from './gameTypes';
import { GUIDE_SHEET_TYPE, hasSheetType, resolveSheetTypes } from './gameSchema';

/** sheet_type on unified game_guides */
export const GUIDE_SHEET = {
  WALKTHROUGH: GUIDE_SHEET_TYPE.WALKTHROUGH,
  COLLECTIBLES: GUIDE_SHEET_TYPE.COLLECTIBLES,
  BOSSES: GUIDE_SHEET_TYPE.BOSSES,
};

/**
 * Map a locale-resolved game_guides row to a flat frontend object.
 */
export function normalizeGuideEntryRow(row) {
  if (!row) return null;

  const guideId = row.guide_id ?? row.id ?? null;
  const itemName = String(row.item_name ?? row.boss_name ?? row.name ?? '').trim();
  const sheetTypes = resolveSheetTypes(row.sheet_types ?? row.sheet_type);

  return {
    guide_id: guideId,
    boss_id: row.boss_id ?? guideId,
    local_id: row.local_id ?? null,
    game_id: String(row.game_id ?? '').trim(),
    sheet_types: sheetTypes,
    /** Primärer Reiter – für Filter ist sheet_types maßgeblich */
    sheet_type: sheetTypes[0] ?? 0,
    item_name: itemName,
    boss_name: String(row.boss_name ?? itemName).trim(),
    timestamp: String(row.timestamp ?? '').trim(),
    video_url: String(row.video_url ?? '').trim(),
    video_chapter: String(row.video_chapter ?? '').trim(),
    chronological_group: String(row.chronological_group ?? row.area ?? '').trim(),
    category_group: String(row.category_group ?? row.type ?? '').trim(),
    sort_order: row.sort_order ?? null,
    trophy_id: row.trophy_id ?? null,
    is_trophy_relevant: row.is_trophy_relevant ?? (row.trophy_id ? 'Ja' : ''),
  };
}

/** @deprecated Alias */
export function normalizeChapterRow(row) {
  return normalizeGuideEntryRow(row);
}

/** @deprecated Alias */
export function normalizeGuideRow(row) {
  return normalizeGuideEntryRow(row);
}

function compareTimestamp(a, b) {
  return String(a?.timestamp ?? '').localeCompare(String(b?.timestamp ?? ''));
}

function chronologicalGroupKey(row) {
  return String(row.chronological_group ?? '').trim() || 'Allgemein';
}

/**
 * game_guides.id ist eine UUID – die Reihenfolge steckt in sort_order
 * (aus local_id bzw. Ladereihenfolge, siehe mergeGuideRow).
 * Bosse haben ein „B_"-Präfix auf local_id („B_12"), aus dem /\d+/ die 12 zieht.
 */
function toSortNumber(row) {
  const candidates = [row?.sort_order, String(row?.local_id ?? '').match(/\d+/)?.[0]];
  for (const candidate of candidates) {
    if (candidate == null || candidate === '') continue;
    const n = Number(candidate);
    if (Number.isFinite(n)) return n;
  }
  return Infinity;
}

function compareGuideOrder(a, b) {
  const orderCmp = toSortNumber(a) - toSortNumber(b);
  if (orderCmp !== 0) return orderCmp;
  return compareTimestamp(a, b);
}

/**
 * Walkthrough (sheet_type 1): Kacheln nach kleinster sort_order je chronological_group.
 */
export function sortChronologicalGuideRows(rows) {
  const minGuideIdByGroup = new Map();

  for (const row of rows) {
    const group = chronologicalGroupKey(row);
    const guideNum = toSortNumber(row);
    const prev = minGuideIdByGroup.get(group);
    if (prev === undefined || guideNum < prev) {
      minGuideIdByGroup.set(group, guideNum);
    }
  }

  return [...rows].sort((a, b) => {
    const groupA = chronologicalGroupKey(a);
    const groupB = chronologicalGroupKey(b);
    const minA = minGuideIdByGroup.get(groupA) ?? Infinity;
    const minB = minGuideIdByGroup.get(groupB) ?? Infinity;

    if (minA !== minB) return minA - minB;
    if (groupA !== groupB) return groupA.localeCompare(groupB, 'de');

    return compareGuideOrder(a, b);
  });
}

/** Sammelobjekte (sheet_type 2) – category_group, dann item_name */
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

function bossCategoryKey(row) {
  return String(row.category_group ?? '').trim() || 'Allgemein';
}

export function normalizeBossRow(row) {
  const normalized = normalizeGuideEntryRow(row);
  if (!normalized) return null;
  return {
    ...normalized,
    boss_id: normalized.boss_id ?? normalized.guide_id,
    boss_name: normalized.boss_name || normalized.item_name,
    category_group: bossCategoryKey(normalized),
  };
}

/**
 * Bosse (sheet_type 3): Kacheln nach kleinster sort_order je category_group.
 */
export function sortBossRows(rows) {
  const minBossIdByGroup = new Map();

  for (const row of rows) {
    const group = bossCategoryKey(row);
    const bossNum = toSortNumber(row);
    const prev = minBossIdByGroup.get(group);
    if (prev === undefined || bossNum < prev) {
      minBossIdByGroup.set(group, bossNum);
    }
  }

  return [...rows].sort((a, b) => {
    const groupA = bossCategoryKey(a);
    const groupB = bossCategoryKey(b);
    const minA = minBossIdByGroup.get(groupA) ?? Infinity;
    const minB = minBossIdByGroup.get(groupB) ?? Infinity;

    if (minA !== minB) return minA - minB;
    if (groupA !== groupB) return groupA.localeCompare(groupB, 'de');

    return compareGuideOrder(a, b);
  });
}

function assignStableIds(rows, idPrefix) {
  return rows.map((row, index) => {
    const base =
      row.guide_id ??
      `${row.item_name || row.boss_name || 'item'}-${row.timestamp || index}`;
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
  return assignStableIds(rows, 'walkthrough');
}

export function mapBossRows(rows) {
  return rows.map((row, index) => {
    const base =
      row.boss_id ??
      row.guide_id ??
      row.id ??
      `${row.boss_name || row.item_name || 'boss'}-${row.timestamp || index}`;
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

export function filterGuidesBySheetType(rows, sheetType) {
  return (rows || []).filter((row) => hasSheetType(row, sheetType));
}

/**
 * Walkthrough (sheet_type 1): group by chronological_group · Item: item_name
 */
export function buildChronologicalGuideData(chapterRows) {
  const mapped = mapGuideEntryRows(chapterRows, 'walkthrough');
  return sortChronologicalGuideRows(mapped);
}

/**
 * Sammelobjekte (sheet_type 2): group by category_group · Item: item_name
 */
export function buildByTypeGuideData(guideRows) {
  const mapped = mapGuideEntryRows(guideRows, 'collectible');
  return sortByTypeGuideRows(mapped);
}

/** Bosse (sheet_type 3): group by category_group · Item: item_name / boss_name */
export function buildBossOverviewData(bossRows) {
  const normalized = (bossRows || []).map(normalizeBossRow).filter(Boolean);
  return mapBossRows(sortBossRows(normalized));
}

/** @deprecated Alias */
export function buildChapterGuideData(rows) {
  return buildChronologicalGuideData(rows);
}

/** @deprecated Alias */
export function buildCollectibleCategoryData(rows) {
  return buildByTypeGuideData(rows);
}

/** @deprecated Prefer buildBossOverviewData on sheet_type === 3 rows */
export function buildBossGuideData(guideRows) {
  return buildBossOverviewData(filterGuidesBySheetType(guideRows, GUIDE_SHEET.BOSSES));
}

export { GUIDE_REITER, GUIDE_SHEET_TYPE };
