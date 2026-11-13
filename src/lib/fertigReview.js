import {
  GAME_FK,
  GAME_PK,
  GAME_STRUCT,
  GUIDE_I18N,
  GUIDE_PK,
  TABLES,
} from './gameSchema';
import {
  GUIDE_PUBLICATION,
  buildUnifiedGuidePublishPatch,
  guideStatusKey,
  parseStatusMap,
} from './guidePublication';

const PAGE_SIZE = 1000;

export const FERTIG_REVIEW_SELECT = [
  GAME_PK,
  'platform_game_id',
  'slug',
  GAME_STRUCT.status,
  GAME_STRUCT.publishingStatus,
  GAME_STRUCT.publishedLocales,
  GAME_STRUCT.progress,
  GAME_STRUCT.isGuideLocked,
  GAME_STRUCT.guideTyp,
  'spieltitel',
  'cover_url',
  GAME_STRUCT.coverStatus,
  GAME_STRUCT.publisher,
  GAME_STRUCT.developer,
  GAME_STRUCT.gameType,
  GAME_STRUCT.trophyCount,
  GAME_STRUCT.hardware,
].join(', ');

const GUIDE_TEXT_FIELDS = [
  GUIDE_I18N.itemName,
  GUIDE_I18N.chronologicalGroup,
  GUIDE_I18N.categoryGroup,
  GUIDE_I18N.bossGroup,
  GUIDE_I18N.spielRegion,
  GUIDE_I18N.videoChapter,
];

function textAtLang(value, lang) {
  if (typeof value === 'string') return lang === 'de' && value.trim() !== '';
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value[lang];
  return typeof raw === 'string' && raw.trim() !== '';
}

export function guideRowsHaveLang(rows, lang) {
  return (rows ?? []).some((row) => GUIDE_TEXT_FIELDS.some((field) => textAtLang(row?.[field], lang)));
}

/** Sprachen mit echtem Text in den Guide-Zeilen, nur de und en. */
export function fertigReviewPublishLangs(rows) {
  return ['de', 'en'].filter((lang) => guideRowsHaveLang(rows, lang));
}

export function isSingleLangFertigGame(game) {
  const locales = Array.isArray(game?.published_locales) ? game.published_locales : [];
  if (locales.length > 0) return false;
  const status = parseStatusMap(game?.status);
  const de = String(status.guide_de ?? '').trim().toUpperCase();
  const en = String(status.guide_en ?? '').trim().toUpperCase();
  return de === GUIDE_PUBLICATION.DONE || en === GUIDE_PUBLICATION.DONE;
}

export function buildFertigPublishUpdate(game, langs) {
  const status = { ...parseStatusMap(game?.status) };
  for (const lang of langs) {
    status[guideStatusKey(lang)] = GUIDE_PUBLICATION.PUBLISHED;
  }
  status.publish_status = GUIDE_PUBLICATION.PUBLISHED;
  delete status.review_queue;
  return {
    [GAME_STRUCT.status]: status,
    [GAME_STRUCT.isGuideLocked]: true,
  };
}

export function buildFertigDiscardStatus(currentStatus) {
  const status = { ...parseStatusMap(currentStatus) };
  status.guides = 'NO_VIDEO';
  for (const key of Object.keys(status)) {
    if (key.startsWith('guide_')) delete status[key];
  }
  delete status.review_queue;
  const publish = String(status.publish_status ?? '').trim().toUpperCase();
  if (publish === GUIDE_PUBLICATION.PUBLISHED || publish === 'READY') {
    status.publish_status = GUIDE_PUBLICATION.DONE;
  }
  return status;
}

async function fetchAllGuideTextRows(supabase, gameId) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(TABLES.guides)
      .select(GUIDE_TEXT_FIELDS.join(', '))
      .eq(GAME_FK, gameId)
      .order(GUIDE_PK, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return { rows, error: null };
}

function isFertigReviewCandidate(game) {
  const status = parseStatusMap(game?.status);
  const de = String(status.guide_de ?? '').trim().toUpperCase();
  const en = String(status.guide_en ?? '').trim().toUpperCase();
  return de === GUIDE_PUBLICATION.DONE || en === GUIDE_PUBLICATION.DONE;
}

/**
 * Unveröffentlichte Guides mit guide_de oder guide_en = FERTIG.
 * Die Status-Prüfung läuft im Client. Ein OR über status->>… zusammen mit
 * published_locales = '[]' verfehlt den partiellen Index und läuft in den
 * Statement-Timeout.
 */
export async function fetchFertigReviewGames(supabase) {
  const games = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(TABLES.games)
      .select(FERTIG_REVIEW_SELECT)
      .eq(GAME_STRUCT.publishedLocales, '[]')
      .order(GAME_PK, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { games, error };
    const page = data ?? [];
    games.push(...page.filter(isFertigReviewCandidate));
    if (page.length < PAGE_SIZE) break;
  }
  return { games, error: null };
}

export async function publishFertigReviewGame(supabase, game) {
  const id = String(game?.[GAME_PK] ?? game?.id ?? '').trim();
  if (!id) return { update: null, langs: [], error: new Error('Kein Spiel ausgewählt.') };

  const { rows, error: readError } = await fetchAllGuideTextRows(supabase, id);
  if (readError) return { update: null, langs: [], error: readError };

  const langs = fertigReviewPublishLangs(rows);
  if (langs.length === 0) {
    return {
      update: null,
      langs: [],
      error: new Error('Keine deutschen oder englischen Texte in den Guide-Zeilen.'),
    };
  }

  const update = buildFertigPublishUpdate(game, langs);
  const { error } = await supabase.from(TABLES.games).update(update).eq(GAME_PK, id);
  if (error) return { update: null, langs, error };
  return { update, langs, error: null };
}

/**
 * Freigabe eines schon in game_guides liegenden FERTIG-Guides.
 * Dieselbe Pipeline wie nach der Staging-Freigabe: gewählte Sprache auf
 * PUBLISHED, danach tb_apply_stage1_sql_for_game. Die Zeilen bleiben,
 * es wird nichts aus staging_game_guides kopiert.
 */
export async function publishFertigReviewInLanguage(supabase, game, lang) {
  const id = String(game?.[GAME_PK] ?? game?.id ?? '').trim();
  const normalized = String(lang ?? '').trim().toLowerCase();
  if (!id) return { update: null, error: new Error('Kein Spiel ausgewählt.') };
  if (!normalized) return { update: null, error: new Error('Keine Sprache gewählt.') };

  const { rows, error: readError } = await fetchAllGuideTextRows(supabase, id);
  if (readError) return { update: null, error: readError };
  if (rows.length === 0) {
    return { update: null, error: new Error('Keine Guide-Zeilen in game_guides.') };
  }
  if (!guideRowsHaveLang(rows, normalized)) {
    return {
      update: null,
      error: new Error(
        `In den Guide-Zeilen steht kein Text für [${normalized.toUpperCase()}].`,
      ),
    };
  }

  const { count: videoCount, error: videoError } = await supabase
    .from(TABLES.guides)
    .select(GUIDE_PK, { count: 'exact', head: true })
    .eq(GAME_FK, id)
    .not('video_url', 'is', null)
    .neq('video_url', '');
  if (videoError) return { update: null, error: videoError };

  const update = buildUnifiedGuidePublishPatch({
    currentGame: game,
    lang: normalized,
    guideState: GUIDE_PUBLICATION.PUBLISHED,
    hasVideo: (videoCount ?? 0) > 0,
  });
  delete update[GAME_STRUCT.status].review_queue;
  update[GAME_STRUCT.progress] = GUIDE_PUBLICATION.PUBLISHED;

  const { error } = await supabase.from(TABLES.games).update(update).eq(GAME_PK, id);
  if (error) return { update: null, error };

  const { error: stageError } = await supabase.rpc('tb_apply_stage1_sql_for_game', {
    p_game_id: id,
  });
  if (stageError) {
    return {
      update,
      error: new Error(`Status ist gesetzt, die Pipeline ist fehlgeschlagen: ${stageError.message}`),
    };
  }
  return { update, error: null };
}

export async function discardFertigReviewGuide(supabase, game) {
  const id = String(game?.[GAME_PK] ?? game?.id ?? '').trim();
  if (!id) return { status: null, error: new Error('Kein Spiel ausgewählt.') };

  const nextStatus = buildFertigDiscardStatus(game?.status);
  const unlockPatch = {
    [GAME_STRUCT.isGuideLocked]: false,
    [GAME_STRUCT.status]: nextStatus,
  };
  if (String(game?.[GAME_STRUCT.progress] ?? '').trim().toUpperCase() === GUIDE_PUBLICATION.PUBLISHED) {
    unlockPatch[GAME_STRUCT.progress] = GUIDE_PUBLICATION.DONE;
  }
  const { error: unlockError } = await supabase
    .from(TABLES.games)
    .update(unlockPatch)
    .eq(GAME_PK, id);
  if (unlockError) return { status: null, error: unlockError };

  const { error: deleteError } = await supabase.from(TABLES.guides).delete().eq(GAME_FK, id);
  if (deleteError) return { status: null, error: deleteError };
  return { status: nextStatus, error: null };
}
