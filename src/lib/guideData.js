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

function chronologicalGroupKey(row) {
  return String(row.chronological_group ?? '').trim() || 'Allgemein';
}

function toGuideIdNumber(guideId) {
  const n = Number(guideId);
  return Number.isFinite(n) ? n : Infinity;
}

function compareGuideId(a, b) {
  const idCmp = toGuideIdNumber(a.guide_id) - toGuideIdNumber(b.guide_id);
  if (idCmp !== 0) return idCmp;
  return compareTimestamp(a, b);
}

/**
 * Full-Gameplay (Reiter 2): Kacheln-Reihenfolge = aufsteigend nach kleinster guide_id
 * je chronological_group; Items innerhalb einer Kachel ebenfalls nach guide_id.
 */
export function sortChronologicalGuideRows(rows) {
  const minGuideIdByGroup = new Map();

  for (const row of rows) {
    const group = chronologicalGroupKey(row);
    const guideNum = toGuideIdNumber(row.guide_id);
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

    return compareGuideId(a, b);
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

function bossCategoryKey(row) {
  return String(row.category_group ?? '').trim() || 'Allgemein';
}

export function normalizeBossRow(row) {
  if (!row) return null;
  return {
    boss_id: row.boss_id ?? row.id ?? null,
    game_id: String(row.game_id ?? row.NPWR_ID ?? row.npwr_id ?? '').trim(),
    boss_name: String(row.boss_name ?? row.Boss_Name ?? '').trim(),
    category_group: bossCategoryKey(row),
    timestamp: String(row.timestamp ?? row.Timestamp ?? '').trim(),
    video_url: String(row.video_url ?? row.Video_URL ?? '').trim(),
    is_trophy_relevant: row.is_trophy_relevant ?? row.Is_Trophy_Relevant ?? '',
  };
}

function compareBossId(a, b) {
  const idCmp = toGuideIdNumber(a.boss_id) - toGuideIdNumber(b.boss_id);
  if (idCmp !== 0) return idCmp;
  return compareTimestamp(a, b);
}

/**
 * Bosse (Reiter 4): Kacheln nach kleinster boss_id je category_group;
 * Bosse innerhalb einer Kachel aufsteigend nach boss_id.
 */
export function sortBossRows(rows) {
  const minBossIdByGroup = new Map();

  for (const row of rows) {
    const group = bossCategoryKey(row);
    const bossNum = toGuideIdNumber(row.boss_id);
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

    return compareBossId(a, b);
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

/** Reiter 4: Boss-Übersicht – Kachel: category_group · Item: boss_name */
export function buildBossOverviewData(bossRows) {
  const normalized = (bossRows || []).map(normalizeBossRow).filter(Boolean);
  return mapBossRows(sortBossRows(normalized));
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
