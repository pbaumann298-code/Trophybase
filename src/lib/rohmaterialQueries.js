import {
  GAME_FK,
  GAME_PK,
  GAME_PLATFORM_ID,
  GAME_STRUCT,
  GUIDE_I18N,
  GUIDE_PK,
  GUIDE_SHEET_TYPE,
  GUIDE_STRUCT,
  TABLES,
  hasSheetType,
  resolveSheetTypes,
} from './gameSchema';
import { getGameUuid, getPlatformGameId, getPlatformGameIds } from './gameModel';
import { mergeGuideRow } from './guideQueries';
import {
  GUIDE_PUBLICATION,
  buildUnifiedGuidePublishPatch,
  parseStatusMap,
  removeGameFromWiedervorlage,
} from './guidePublication';
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
  GUIDE_I18N.spielRegion,
  GUIDE_I18N.spielRegionTab,
  GUIDE_I18N.chronologicalGroup,
  GUIDE_I18N.categoryGroup,
  GUIDE_I18N.bossGroup,
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
  GUIDE_I18N.spielRegion,
  GUIDE_I18N.spielRegionTab,
  GUIDE_I18N.chronologicalGroup,
  GUIDE_I18N.categoryGroup,
  GUIDE_I18N.bossGroup,
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
    .select(`${GAME_STRUCT.status}, ${GAME_STRUCT.publishingStatus}, ${GAME_STRUCT.publishedLocales}`)
    .eq(GAME_PK, id)
    .maybeSingle();

  if (statusReadError) {
    return { inserted: insertRows.length, status: null, error: statusReadError };
  }

  const updatePatch = buildUnifiedGuidePublishPatch({
    currentGame: current,
    lang,
    guideState: GUIDE_PUBLICATION.DONE,
    hasVideo: true,
    clearRohmaterial: true,
  });

  const { data: updated, error: statusError } = await supabase
    .from(TABLES.games)
    .update(updatePatch)
    .eq(GAME_PK, id)
    .select(GAME_STRUCT.status)
    .maybeSingle();

  if (statusError) {
    return {
      inserted: insertRows.length,
      status: updatePatch[GAME_STRUCT.status],
      error: statusError,
    };
  }

  await removeGameFromWiedervorlage(supabase, id);

  const status = parseStatusMap(updated?.[GAME_STRUCT.status] ?? updatePatch[GAME_STRUCT.status]);

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
  const { data, error } = await supabase.rpc('tb_get_rohmaterial_queue_summary');
  if (error) return { data: [], error };

  const summary = Array.isArray(data) ? data[0] || {} : data || {};
  const items = Array.isArray(summary.items) ? summary.items : [];
  const overview = [];

  for (const item of items) {
    const gameId = item?.game_id ?? null;
    const rowCount = Number(item?.row_count) || 0;
    const creators = Array.isArray(item?.creators) ? item.creators.filter(Boolean) : [];
    const batches = Array.isArray(item?.batches) ? item.batches.filter(Boolean) : [];
    const batchKeys = batches.length > 0
      ? batches
      : [gameId || item?.sample_platform_id || 'ohne-batch'];
    const rowsAreGameTotal = batchKeys.length > 1;
    for (const batchKey of batchKeys) {
      overview.push({
        batchKey: String(batchKey),
        batchStatus: String(item?.batch_status ?? item?.status ?? '').trim() || 'OPEN',
        creatorName: creators.join(', '),
        creatorId: null,
        createdAt: item?.created_at ?? null,
        gameId,
        platformGameId: item?.sample_platform_id ?? null,
        totalRows: rowCount,
        rowsAreGameTotal,
      });
    }
  }

  overview.sort(
    (a, b) => b.totalRows - a.totalRows || String(a.batchKey).localeCompare(String(b.batchKey)),
  );

  return { data: overview, error: null };
}

const MULTI_TAB_PAGE = 1000;
const MULTI_TAB_INSERT_CHUNK = 500;
const MULTI_TAB_CREATOR_FALLBACK = 'Redaktion';

function jsonbObjectOrNull(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.keys(value).length > 0 ? value : null;
}

function statusForMultiTabMove(currentStatus) {
  const statusMap = { ...parseStatusMap(currentStatus) };
  for (const [key, value] of Object.entries(statusMap)) {
    if (!key.startsWith('guide_')) continue;
    const upper = String(value ?? '').trim().toUpperCase();
    if (upper === GUIDE_PUBLICATION.PUBLISHED || upper === 'READY') {
      statusMap[key] = GUIDE_PUBLICATION.DONE;
    }
  }
  statusMap.publish_status = GUIDE_PUBLICATION.DONE;
  statusMap.rohmaterial = 'PENDING_MULTI_TAB';
  return statusMap;
}

/**
 * Baut game_guides-Zeilen in das JSONB-Schema von game_guides_rohmaterial um.
 * 0 Live-Zeilen ergeben eine Platzhalterzeile, damit das Spiel in der Queue erscheint.
 * @param {{ gameId: string, game: object, guideRows: object[], creatorsById: Map<string, { channel_name?: string, youtube_url?: string }>, batchKey: string }} params
 */
export function buildMultiTabRows({ gameId, game, guideRows, creatorsById, batchKey }) {
  const fallbackPlatformId = getPlatformGameId(game) || '';
  const sourceRows = guideRows.length > 0 ? guideRows : [null];

  return sourceRows.map((row, index) => {
    const creator = row
      ? creatorsById.get(String(row[GUIDE_STRUCT.creatorId] ?? '').trim())
      : null;
    const guideId = String(row?.[GUIDE_STRUCT.guideId] ?? '').trim() || String(index + 1);
    const trophyId = String(row?.[GUIDE_STRUCT.trophyId] ?? '').trim();
    const regionTab = resolveSheetTypes(row?.[GUIDE_I18N.spielRegionTab]);
    const label = row ? `Schritt ${index + 1}` : 'Überarbeitung / Start';

    return {
      batch_key: batchKey,
      batch_status: 'OPEN',
      [GAME_FK]: gameId,
      [GUIDE_STRUCT.platformGameId]: row?.[GUIDE_STRUCT.platformGameId] || fallbackPlatformId,
      [GUIDE_STRUCT.creatorId]: row?.[GUIDE_STRUCT.creatorId] || null,
      creator_name: creator?.channel_name || MULTI_TAB_CREATOR_FALLBACK,
      playlist_url: creator?.youtube_url || row?.[GUIDE_STRUCT.videoUrl] || null,
      [GUIDE_STRUCT.guideId]: guideId,
      [GUIDE_I18N.sheetType]: sheetTypesOrWalkthrough(row?.[GUIDE_I18N.sheetType]),
      [GUIDE_I18N.itemName]: jsonbObjectOrNull(row?.[GUIDE_I18N.itemName]) || { de: label },
      [GUIDE_I18N.spielRegion]: jsonbObjectOrNull(row?.[GUIDE_I18N.spielRegion]),
      [GUIDE_I18N.spielRegionTab]: regionTab.length > 0 ? regionTab : null,
      [GUIDE_I18N.chronologicalGroup]: jsonbObjectOrNull(row?.[GUIDE_I18N.chronologicalGroup]),
      [GUIDE_I18N.categoryGroup]: jsonbObjectOrNull(row?.[GUIDE_I18N.categoryGroup]),
      [GUIDE_I18N.bossGroup]: jsonbObjectOrNull(row?.[GUIDE_I18N.bossGroup]),
      [GUIDE_I18N.videoChapter]: jsonbObjectOrNull(row?.[GUIDE_I18N.videoChapter]),
      [GUIDE_STRUCT.timestamp]: row?.[GUIDE_STRUCT.timestamp] || null,
      [GUIDE_STRUCT.videoUrl]: row?.[GUIDE_STRUCT.videoUrl] || null,
      [GUIDE_STRUCT.trophyId]: trophyId || null,
      [GUIDE_STRUCT.isTrophyRelevant]: row?.[GUIDE_STRUCT.isTrophyRelevant] || null,
    };
  });
}

function sheetTypesOrWalkthrough(value) {
  const types = resolveSheetTypes(value);
  return types.length > 0 ? types : [GUIDE_SHEET_TYPE.WALKTHROUGH];
}

/**
 * Schiebt ein Spiel aus public.game_guides in die Multi-Tab-Tabelle
 * (game_guides_rohmaterial) und nimmt einen veröffentlichten Guide offline.
 * Liegen schon Rohmaterial-Zeilen, wird nichts doppelt angelegt.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gameId
 * @returns {Promise<{ ok: boolean, alreadyThere: boolean, movedCount: number, error: Error|null }>}
 */
export async function moveGameToMultiTab(supabase, gameId) {
  const id = String(gameId ?? '').trim();
  const fail = (error) => ({ ok: false, alreadyThere: false, movedCount: 0, error });
  if (!id) return fail(new Error('Kein Spiel ausgewählt.'));

  const { count: existingCount, error: existingError } = await supabase
    .from(TABLES.guidesRohmaterial)
    .select('id', { count: 'exact', head: true })
    .eq(GAME_FK, id);
  if (existingError) return fail(existingError);
  if ((existingCount ?? 0) > 0) {
    return { ok: true, alreadyThere: true, movedCount: existingCount ?? 0, error: null };
  }

  const { data: game, error: gameError } = await supabase
    .from(TABLES.games)
    .select(
      `${GAME_PK}, ${GAME_PLATFORM_ID}, ${GAME_STRUCT.status}, ${GAME_STRUCT.publishingStatus}, ${GAME_STRUCT.publishedLocales}, ${GAME_STRUCT.progress}, ${GAME_STRUCT.isGuideLocked}`,
    )
    .eq(GAME_PK, id)
    .maybeSingle();
  if (gameError) return fail(gameError);
  if (!game) return fail(new Error('Spiel nicht gefunden.'));

  const guideRows = [];
  for (let from = 0; ; from += MULTI_TAB_PAGE) {
    const { data, error } = await supabase
      .from(TABLES.guides)
      .select('*')
      .eq(GAME_FK, id)
      .order(GUIDE_PK, { ascending: true })
      .range(from, from + MULTI_TAB_PAGE - 1);
    if (error) return fail(error);
    guideRows.push(...(data ?? []));
    if ((data ?? []).length < MULTI_TAB_PAGE) break;
  }

  const creatorIds = [
    ...new Set(
      guideRows.map((row) => String(row[GUIDE_STRUCT.creatorId] ?? '').trim()).filter(Boolean),
    ),
  ];
  const creatorsById = new Map();
  if (creatorIds.length > 0) {
    const { data: creators, error: creatorError } = await supabase
      .from(TABLES.contentCreators)
      .select('id, channel_name, youtube_url')
      .in('id', creatorIds);
    if (creatorError) return fail(creatorError);
    for (const creator of creators ?? []) creatorsById.set(String(creator.id), creator);
  }

  const nextStatus = statusForMultiTabMove(game[GAME_STRUCT.status]);
  const unlockPatch = {
    [GAME_STRUCT.isGuideLocked]: false,
    [GAME_STRUCT.status]: nextStatus,
    [GAME_STRUCT.publishingStatus]: {},
    [GAME_STRUCT.publishedLocales]: [],
  };
  if (String(game[GAME_STRUCT.progress] ?? '').trim().toUpperCase() === GUIDE_PUBLICATION.PUBLISHED) {
    unlockPatch[GAME_STRUCT.progress] = GUIDE_PUBLICATION.DONE;
  }
  const { error: unlockError } = await supabase
    .from(TABLES.games)
    .update(unlockPatch)
    .eq(GAME_PK, id);
  if (unlockError) return fail(unlockError);

  const batchKey = `detail_${id.slice(0, 8)}_${Date.now()}`;
  const rohRows = buildMultiTabRows({
    gameId: id,
    game,
    guideRows,
    creatorsById,
    batchKey,
  });

  for (let index = 0; index < rohRows.length; index += MULTI_TAB_INSERT_CHUNK) {
    const chunk = rohRows.slice(index, index + MULTI_TAB_INSERT_CHUNK);
    const { error: insertError } = await supabase.from(TABLES.guidesRohmaterial).insert(chunk);
    if (insertError) {
      await supabase.from(TABLES.guidesRohmaterial).delete().eq('batch_key', batchKey);
      return fail(insertError);
    }
  }

  const { count: insertedCount, error: verifyError } = await supabase
    .from(TABLES.guidesRohmaterial)
    .select('id', { count: 'exact', head: true })
    .eq('batch_key', batchKey);
  if (verifyError || !insertedCount) {
    await supabase.from(TABLES.guidesRohmaterial).delete().eq('batch_key', batchKey);
    return fail(verifyError || new Error('Die Multi-Tab-Tabelle hat keine Zeilen übernommen.'));
  }

  if (guideRows.length > 0) {
    const { error: deleteError } = await supabase.from(TABLES.guides).delete().eq(GAME_FK, id);
    if (deleteError) {
      await supabase.from(TABLES.guidesRohmaterial).delete().eq('batch_key', batchKey);
      return fail(deleteError);
    }
  }

  return { ok: true, alreadyThere: false, movedCount: insertedCount, error: null };
}
