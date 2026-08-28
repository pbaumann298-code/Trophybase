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
    localisation: String(row.localisation ?? '').trim(),
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
 * Gebiet über den *_group-Kacheln (z. B. Galaxie bei Astro Bot).
 * Leerer String heißt: dieser Eintrag hat keine Gebiets-Ebene und wird ohne
 * zusätzlichen Rahmen dargestellt.
 */
export function guideLocalisationKey(row) {
  return String(row?.localisation ?? '').trim();
}

/** Trenner für zusammengesetzte Gruppenschlüssel – in Gruppennamen unmöglich. */
const GROUP_KEY_SEPARATOR = '\u0000';

export function guideGroupName(row, groupByField = 'category_group') {
  const fallbackField =
    groupByField === 'chronological_group' ? 'category_group' : 'chronological_group';
  return (
    String(row?.[groupByField] ?? '').trim() ||
    String(row?.[fallbackField] ?? '').trim() ||
    'Allgemein'
  );
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
 * Sortiert hierarchisch über beliebig viele Gruppenebenen (z. B. localisation →
 * chronological_group). Jede Ebene läuft nach der kleinsten sort_order ihrer
 * Einträge, bei Gleichstand alphabetisch; innerhalb der letzten Ebene zählt die
 * Einzel-Reihenfolge. Sind alle Schlüssel einer Ebene gleich (etwa ohne
 * gepflegte localisation), fällt die Ebene wirkungslos heraus.
 * @param {object[]} rows
 * @param {((row: object) => string)[]} keyFns Von außen nach innen
 */
function sortRowsByGroupLevels(rows, keyFns) {
  const levelKey = (row, level) =>
    keyFns
      .slice(0, level + 1)
      .map((fn) => fn(row))
      .join(GROUP_KEY_SEPARATOR);

  const minSortOrderByLevel = keyFns.map(() => new Map());

  for (const row of rows) {
    const sortNumber = toSortNumber(row);
    keyFns.forEach((_, level) => {
      const key = levelKey(row, level);
      const prev = minSortOrderByLevel[level].get(key);
      if (prev === undefined || sortNumber < prev) {
        minSortOrderByLevel[level].set(key, sortNumber);
      }
    });
  }

  return [...rows].sort((a, b) => {
    for (let level = 0; level < keyFns.length; level += 1) {
      const keyA = levelKey(a, level);
      const keyB = levelKey(b, level);
      if (keyA === keyB) continue;

      const minA = minSortOrderByLevel[level].get(keyA) ?? Infinity;
      const minB = minSortOrderByLevel[level].get(keyB) ?? Infinity;
      if (minA !== minB) return minA - minB;

      return keyFns[level](a).localeCompare(keyFns[level](b), 'de');
    }
    return compareGuideOrder(a, b);
  });
}

/**
 * Walkthrough (sheet_type 1): Gebiete (localisation) nach kleinster sort_order,
 * darin die Kacheln je chronological_group.
 */
export function sortChronologicalGuideRows(rows) {
  return sortRowsByGroupLevels(rows, [guideLocalisationKey, chronologicalGroupKey]);
}

/** Sammelobjekte (sheet_type 2) – localisation, category_group, dann item_name */
export function sortByTypeGuideRows(rows) {
  return [...rows].sort((a, b) => {
    const localisationCmp = guideLocalisationKey(a).localeCompare(guideLocalisationKey(b), 'de');
    if (localisationCmp !== 0) return localisationCmp;

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
 * Bosse (sheet_type 3): Gebiete (localisation), darin Kacheln je category_group.
 */
export function sortBossRows(rows) {
  return sortRowsByGroupLevels(rows, [guideLocalisationKey, bossCategoryKey]);
}

/**
 * Baut den zweistufigen Kachelbaum für die Anzeige: Gebiet (localisation) →
 * Gruppe (chronological_group/category_group) → Einträge. Die Reihenfolge folgt
 * den bereits sortierten Zeilen; Einträge ohne localisation landen in einem
 * Abschnitt mit leerem Namen und werden ohne Gebiets-Rahmen gerendert.
 * @param {object[]} rows Bereits sortiert und gefiltert
 * @param {'chronological_group'|'category_group'} groupByField
 */
export function buildGuideGroupTree(rows, groupByField = 'category_group') {
  /** @type {{ localisation: string, itemCount: number, groups: { key: string, name: string, items: object[] }[] }[]} */
  const sections = [];
  const sectionByLocalisation = new Map();

  for (const row of rows || []) {
    const localisation = guideLocalisationKey(row);
    const groupName = guideGroupName(row, groupByField);

    let section = sectionByLocalisation.get(localisation);
    if (!section) {
      section = { localisation, itemCount: 0, groups: [], groupsByName: new Map() };
      sectionByLocalisation.set(localisation, section);
      sections.push(section);
    }

    let group = section.groupsByName.get(groupName);
    if (!group) {
      group = {
        key: `${localisation}${GROUP_KEY_SEPARATOR}${groupName}`,
        name: groupName,
        items: [],
      };
      section.groupsByName.set(groupName, group);
      section.groups.push(group);
    }

    group.items.push(row);
    section.itemCount += 1;
  }

  return sections.map(({ localisation, itemCount, groups }) => ({
    localisation,
    itemCount,
    groups,
  }));
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
