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
    guide_sequence: row.guide_sequence ?? null,
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
    localisation_sheets: resolveSheetTypes(
      row.localisation_sheets ?? row.localisation_sheet,
    ),
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

/**
 * Gebiet über den *_group-Kacheln (z. B. Galaxie bei Astro Bot).
 * Leerer String heißt: dieser Eintrag hat keine Gebiets-Ebene und wird ohne
 * zusätzlichen Rahmen dargestellt.
 *
 * Ob localisation in diesem Reiter gilt, entscheidet localisation_sheets –
 * analog zu sheet_type. applyLocalisationForSheet setzt den String deshalb
 * vor dem Gruppieren bereits auf leer, wenn der Reiter nicht gemeint ist.
 */
export function guideLocalisationKey(row) {
  return String(row?.localisation ?? '').trim();
}

/**
 * localisation für genau einen Excel-Reiter. Ohne localisation_sheet
 * (Altbestand) gilt das Gebiet nur im Walkthrough und bei den Bossen, nicht
 * bei den Sammelobjekten – sonst rutscht die Galaxie aus Reiter 1 nach Reiter 2.
 * @param {object|null|undefined} row
 * @param {number} sheetType GUIDE_SHEET_TYPE.*
 */
export function localisationForSheet(row, sheetType) {
  const text = String(row?.localisation ?? '').trim();
  if (!text) return '';

  const wanted = Number(sheetType);
  const sheets = Array.isArray(row?.localisation_sheets)
    ? row.localisation_sheets
    : resolveSheetTypes(row?.localisation_sheet);

  if (sheets.length > 0) {
    return sheets.includes(wanted) ? text : '';
  }

  if (wanted === GUIDE_SHEET_TYPE.COLLECTIBLES) return '';
  return text;
}

function applyLocalisationForSheet(rows, sheetType) {
  return (rows || []).map((row) => ({
    ...row,
    localisation: localisationForSheet(row, sheetType),
  }));
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

/** Sortier-Schlüssel der Gruppenebene – identisch zu dem, was buildGuideGroupTree
 * als Kachelnamen verwendet, damit Sortierung und Gruppierung nicht auseinanderlaufen. */
function groupNameKeyFn(groupByField) {
  return (row) => guideGroupName(row, groupByField);
}

/**
 * game_guides.id ist eine UUID – die Reihenfolge steckt in guide_id
 * (über guide_sequence / sort_order, siehe mergeGuideRow).
 */
function toSortNumber(row) {
  const raw = row?.guide_sequence ?? row?.sort_order;
  const match = String(raw ?? '').match(/\d+/);
  if (!match) return Infinity;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : Infinity;
}

function compareGuideOrder(a, b) {
  const orderCmp = toSortNumber(a) - toSortNumber(b);
  if (orderCmp !== 0) return orderCmp;
  const localCmp = String(a?.guide_sequence ?? '').localeCompare(
    String(b?.guide_sequence ?? ''),
    undefined,
    {
    numeric: true,
    sensitivity: 'base',
  });
  if (localCmp !== 0) return localCmp;
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
 * Walkthrough (sheet_type 1): Gebiete (localisation) nach kleinster guide_id,
 * darin die Kacheln je chronological_group, Einträge nach guide_id.
 */
export function sortChronologicalGuideRows(rows) {
  return sortRowsByGroupLevels(rows, [
    guideLocalisationKey,
    groupNameKeyFn('chronological_group'),
  ]);
}

/**
 * Sammelobjekte (sheet_type 2): Gebiete (localisation) nach kleinster
 * guide_id, darin die Kacheln je category_group, Einträge nach guide_id.
 */
export function sortByTypeGuideRows(rows) {
  return sortRowsByGroupLevels(rows, [guideLocalisationKey, groupNameKeyFn('category_group')]);
}

export function normalizeBossRow(row) {
  const normalized = normalizeGuideEntryRow(row);
  if (!normalized) return null;
  return {
    ...normalized,
    boss_id: normalized.boss_id ?? normalized.guide_id,
    boss_name: normalized.boss_name || normalized.item_name,
  };
}

/**
 * Bosse (sheet_type 3): Gebiete (localisation), darin eine Kachel je Boss
 * (chronological_group). Ältere Datensätze tragen den Boss-Namen in
 * category_group – guideGroupName fällt darauf zurück.
 */
export function sortBossRows(rows) {
  return sortRowsByGroupLevels(rows, [guideLocalisationKey, groupNameKeyFn('chronological_group')]);
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
 * Walkthrough (sheet_type 1): group by chronological_group, Sortierung nach
 * game_guides.guide_id (über sort_order).
 */
export function buildChronologicalGuideData(chapterRows) {
  const mapped = applyLocalisationForSheet(
    mapGuideEntryRows(chapterRows, 'walkthrough'),
    GUIDE_SHEET_TYPE.WALKTHROUGH,
  );
  return sortChronologicalGuideRows(mapped);
}

/**
 * Sammelobjekte (sheet_type 2): group by category_group, Sortierung nach
 * game_guides.guide_id (über sort_order). localisation nur, wenn
 * localisation_sheet den Reiter 2 enthält.
 */
export function buildByTypeGuideData(guideRows) {
  const mapped = applyLocalisationForSheet(
    mapGuideEntryRows(guideRows, 'collectible'),
    GUIDE_SHEET_TYPE.COLLECTIBLES,
  );
  return sortByTypeGuideRows(mapped);
}

/** Bosse (sheet_type 3): group by chronological_group · Item: item_name / boss_name */
export function buildBossOverviewData(bossRows) {
  const normalized = applyLocalisationForSheet(
    (bossRows || []).map(normalizeBossRow).filter(Boolean),
    GUIDE_SHEET_TYPE.BOSSES,
  );
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
