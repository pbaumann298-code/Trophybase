import {
  GAME_FK,
  GAME_PK,
  GAME_STRUCT,
  GUIDE_I18N,
  GUIDE_SHEET_TYPE,
  GUIDE_STRUCT,
  TABLES,
  hasSheetType,
} from './gameSchema';
import { getGameUuid, getPlatformGameIds } from './gameModel';
import { mergeGuideRow } from './guideQueries';
import { GUIDE_PUBLICATION, guideStatusKey, parseStatusMap } from './guidePublication';
import { getLocale, normalizeLocale } from './locale';
import { resolveGuideLanguage } from './localeResolver';

const ROH_SELECT = [
  'id',
  'batch_key',
  'batch_status',
  'creator_name',
  'creator_id',
  'playlist_url',
  'created_at',
  GAME_FK,
  GUIDE_STRUCT.platformGameId,
  GUIDE_STRUCT.guideId,
  GUIDE_I18N.sheetType,
  GUIDE_I18N.itemName,
  GUIDE_I18N.localisation,
  GUIDE_I18N.localisationSheet,
  GUIDE_I18N.chronologicalGroup,
  GUIDE_I18N.categoryGroup,
  GUIDE_I18N.videoChapter,
  GUIDE_STRUCT.timestamp,
  GUIDE_STRUCT.videoUrl,
  GUIDE_STRUCT.trophyId,
  GUIDE_STRUCT.isTrophyRelevant,
].join(', ');

const PROMOTE_COLUMNS = [
  GUIDE_STRUCT.platformGameId,
  GUIDE_STRUCT.guideId,
  GUIDE_I18N.sheetType,
  GUIDE_I18N.itemName,
  GUIDE_I18N.localisation,
  GUIDE_I18N.localisationSheet,
  GUIDE_I18N.chronologicalGroup,
  GUIDE_I18N.categoryGroup,
  GUIDE_I18N.videoChapter,
  GUIDE_STRUCT.timestamp,
  GUIDE_STRUCT.videoUrl,
  GUIDE_STRUCT.creatorId,
  GUIDE_STRUCT.trophyId,
  GUIDE_STRUCT.isTrophyRelevant,
];

function batchMetaFromRows(batchKey, rows) {
  const first = rows[0] ?? {};
  return {
    batchKey: String(batchKey ?? ''),
    batchStatus: String(first.batch_status ?? '').trim() || 'OPEN',
    creatorName: String(first.creator_name ?? '').trim(),
    creatorId: first.creator_id ?? null,
    playlistUrl: String(first.playlist_url ?? '').trim(),
    createdAt: first.created_at ?? null,
    gameId: first[GAME_FK] ?? null,
    platformGameId: first[GUIDE_STRUCT.platformGameId] ?? null,
    totalRows: rows.length,
  };
}

function groupRowsByBatchKey(rows) {
  /** @type {Map<string, object[]>} */
  const map = new Map();
  for (const row of rows ?? []) {
    const key = String(row?.batch_key ?? '').trim();
    if (!key) continue;
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}

function splitMergedBySheet(merged) {
  return {
    chapters: merged.filter((row) => hasSheetType(row, GUIDE_SHEET_TYPE.WALKTHROUGH)),
    guides: merged.filter((row) => hasSheetType(row, GUIDE_SHEET_TYPE.COLLECTIBLES)),
    bosses: merged.filter((row) => hasSheetType(row, GUIDE_SHEET_TYPE.BOSSES)),
  };
}

/**
 * Rohmaterial-Kandidaten eines Spiels, gruppiert nach batch_key.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object|null|undefined} game
 * @param {string} [locale]
 */
export async function fetchRohmaterialBatchesForGame(supabase, game, locale = getLocale()) {
  const gameId = getGameUuid(game);
  const platformIds = getPlatformGameIds(game);
  if (!gameId && platformIds.length === 0) {
    return { data: [], error: null };
  }

  const orParts = [];
  if (gameId) orParts.push(`${GAME_FK}.eq.${gameId}`);
  if (platformIds.length > 0) {
    orParts.push(`${GUIDE_STRUCT.platformGameId}.in.(${platformIds.join(',')})`);
  }

  const { data, error } = await supabase
    .from(TABLES.guidesRohmaterial)
    .select(ROH_SELECT)
    .or(orParts.join(','))
    .order('created_at', { ascending: true, nullsFirst: false });

  if (error) return { data: [], error };

  const lang = resolveGuideLanguage(locale, null);
  const grouped = groupRowsByBatchKey(data);
  const batches = [];

  for (const [batchKey, rows] of grouped) {
    const merged = rows
      .map((row, index) => mergeGuideRow(row, lang, index))
      .filter(Boolean);
    const sheets = splitMergedBySheet(merged);
    batches.push({
      ...batchMetaFromRows(batchKey, rows),
      ...sheets,
    });
  }

  batches.sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return ta - tb || a.batchKey.localeCompare(b.batchKey);
  });

  return { data: batches, error: null };
}

/**
 * Verwirft einen kompletten Rohmaterial-Batch.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} batchKey
 */
export async function discardRohmaterialBatch(supabase, batchKey) {
  const key = String(batchKey ?? '').trim();
  if (!key) return { error: new Error('Kein Batch gewählt.') };

  const { error } = await supabase
    .from(TABLES.guidesRohmaterial)
    .delete()
    .eq('batch_key', key);

  return { error: error ?? null };
}

/**
 * Markiert einen Batch als MATCHED (für PC-Excel) und löscht optional Parallel-Kandidaten.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} batchKey
 * @param {string[]} [otherBatchKeysToDiscard]
 */
export async function matchRohmaterialBatchForPc(
  supabase,
  batchKey,
  otherBatchKeysToDiscard = [],
) {
  const key = String(batchKey ?? '').trim();
  if (!key) return { error: new Error('Kein Batch gewählt.') };

  const { error: updateError } = await supabase
    .from(TABLES.guidesRohmaterial)
    .update({ batch_status: 'MATCHED' })
    .eq('batch_key', key);

  if (updateError) return { error: updateError };

  const discardKeys = [...new Set(
    (otherBatchKeysToDiscard ?? [])
      .map((item) => String(item ?? '').trim())
      .filter((item) => item && item !== key),
  )];

  if (discardKeys.length === 0) return { error: null };

  const { error: deleteError } = await supabase
    .from(TABLES.guidesRohmaterial)
    .delete()
    .in('batch_key', discardKeys);

  return { error: deleteError ?? null };
}

/**
 * Übernimmt einen Rohmaterial-Batch nach public.game_guides.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ gameId: string, batchKey: string, locale: string, clearOtherBatches?: boolean }} params
 */
export async function promoteRohmaterialBatchToGuide(
  supabase,
  { gameId, batchKey, locale, clearOtherBatches = true },
) {
  const id = String(gameId ?? '').trim();
  const key = String(batchKey ?? '').trim();
  const lang = normalizeLocale(locale);

  if (!id) return { inserted: 0, status: null, error: new Error('Kein Spiel ausgewählt.') };
  if (!key) return { inserted: 0, status: null, error: new Error('Kein Batch gewählt.') };
  if (!lang) return { inserted: 0, status: null, error: new Error('Keine Sprache gewählt.') };

  const { data: rows, error: readError } = await supabase
    .from(TABLES.guidesRohmaterial)
    .select(ROH_SELECT)
    .eq('batch_key', key)
    .order(GUIDE_STRUCT.guideId, { ascending: true, nullsFirst: false });

  if (readError) return { inserted: 0, status: null, error: readError };
  if (!rows?.length) {
    return { inserted: 0, status: null, error: new Error('Batch enthält keine Zeilen.') };
  }

  const insertRows = rows.map((row) => {
    const next = { [GAME_FK]: id };
    for (const column of PROMOTE_COLUMNS) {
      let value = row[column];
      if (column === GUIDE_STRUCT.trophyId && (value === '' || value == null)) {
        value = null;
      }
      if (column === GUIDE_STRUCT.creatorId && (value === '' || value == null)) {
        value = null;
      }
      next[column] = value ?? null;
    }
    return next;
  });

  const { error: insertError } = await supabase.from(TABLES.guides).insert(insertRows);
  if (insertError) return { inserted: 0, status: null, error: insertError };

  const { data: current, error: statusReadError } = await supabase
    .from(TABLES.games)
    .select(GAME_STRUCT.status)
    .eq(GAME_PK, id)
    .maybeSingle();

  if (statusReadError) {
    return { inserted: insertRows.length, status: null, error: statusReadError };
  }

  const statusMap = { ...parseStatusMap(current?.[GAME_STRUCT.status]) };
  const statusKey = guideStatusKey(lang);
  if (String(statusMap[statusKey] ?? '').trim().toUpperCase() !== GUIDE_PUBLICATION.PUBLISHED) {
    statusMap[statusKey] = GUIDE_PUBLICATION.DONE;
  }
  statusMap.guides = 'HAS_VIDEO';

  const { data: updated, error: statusError } = await supabase
    .from(TABLES.games)
    .update({ [GAME_STRUCT.status]: statusMap })
    .eq(GAME_PK, id)
    .select(GAME_STRUCT.status)
    .maybeSingle();

  if (statusError) {
    return {
      inserted: insertRows.length,
      status: statusMap,
      error: statusError,
    };
  }

  const status = parseStatusMap(updated?.[GAME_STRUCT.status] ?? statusMap);

  if (clearOtherBatches) {
    const platformIds = [
      ...new Set(
        rows
          .map((row) => String(row[GUIDE_STRUCT.platformGameId] ?? '').trim())
          .filter(Boolean),
      ),
    ];
    const { error: byGameError } = await supabase
      .from(TABLES.guidesRohmaterial)
      .delete()
      .eq(GAME_FK, id);
    if (byGameError) {
      return { inserted: insertRows.length, status, error: byGameError };
    }
    if (platformIds.length > 0) {
      const { error: byPlatformError } = await supabase
        .from(TABLES.guidesRohmaterial)
        .delete()
        .in(GUIDE_STRUCT.platformGameId, platformIds);
      if (byPlatformError) {
        return { inserted: insertRows.length, status, error: byPlatformError };
      }
    }
    // Batch ohne game_id/platform-Treffer trotzdem entfernen
    await supabase.from(TABLES.guidesRohmaterial).delete().eq('batch_key', key);
  } else {
    const { error: discardError } = await discardRohmaterialBatch(supabase, key);
    if (discardError) {
      return { inserted: insertRows.length, status, error: discardError };
    }
  }

  return { inserted: insertRows.length, status, error: null };
}

/**
 * Kompakte Intranet-Übersicht aller Rohmaterial-Batches.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function fetchAllRohmaterialOverview(supabase) {
  const { data, error } = await supabase
    .from(TABLES.guidesRohmaterial)
    .select(
      [
        'batch_key',
        'batch_status',
        'creator_name',
        'creator_id',
        'created_at',
        GAME_FK,
        GUIDE_STRUCT.platformGameId,
      ].join(', '),
    )
    .order('created_at', { ascending: false, nullsFirst: false });

  if (error) return { data: [], error };

  const grouped = groupRowsByBatchKey(data);
  const overview = [];

  for (const [batchKey, rows] of grouped) {
    const meta = batchMetaFromRows(batchKey, rows);
    overview.push({
      batchKey: meta.batchKey,
      batchStatus: meta.batchStatus,
      creatorName: meta.creatorName,
      creatorId: meta.creatorId,
      createdAt: meta.createdAt,
      gameId: meta.gameId,
      platformGameId: meta.platformGameId,
      totalRows: meta.totalRows,
    });
  }

  overview.sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta || a.batchKey.localeCompare(b.batchKey);
  });

  return { data: overview, error: null };
}
