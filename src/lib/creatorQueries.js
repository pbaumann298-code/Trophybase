import {
  TABLES,
  GAME_FK,
  GAME_PK,
  GAME_PLATFORM_ID,
  GAME_STRUCT,
  GUIDE_STRUCT,
  resolveSheetTypes,
} from './gameSchema.js';
import { HUB_GAME_SELECT } from './gameQueries.js';
import {
  GUIDE_PUBLICATION,
  hasPublishedGuide,
  isGuidePublished,
  publishedGuideLocales,
} from './guidePublication.js';
import { getGameTitle } from './gameModel.js';
import { statusAfterGuideDiscard } from './intranetGameEdits.js';
import { normalizeLocale, SUPPORTED_LOCALES } from './locale.js';
import { localizeJsonField } from './translationUtils.js';
import {
  buildVideoUrlWithTimestamp,
  extractYouTubeStartSeconds,
  getYouTubeVideoId,
} from '../utils/videoUrl.js';

/**
 * Creator-Lesen und -Pflege auf den bestehenden Tabellen.
 *
 * Videos und Playlists hängen an public.game_guides, nicht an einer eigenen Medientabelle:
 *   - video_url     YouTube-Watch-URL, oft mit &t= und gelegentlich &list=PL…
 *   - timestamp     Startzeit des Schritts
 *   - video_chapter Titel (jsonb-Sprachmap)
 *   - item_name, chronological_group, category_group, boss_group
 *   - guide_id, sheet_type, creator_id
 * Eine playlist_url-Spalte gibt es auf game_guides nicht (nur Staging/Rohmaterial).
 *
 * Spiel-IDs eines einzelnen Creators kommen dedupliziert aus der View
 * public.game_guide_creators (gefiltert per creator_id; Index-Only-Scan über
 * game_guides(creator_id, game_id), nicht als Vollscan beim Intranet-Initial-Load).
 * public.creator_outreach_admin darf nur von den Admin-Funktionen gelesen werden.
 *
 * signature_tags ist in der Live-Datenbank ein text[]-Array, kein jsonb.
 */

const PAGE_SIZE = 1000;
const GAME_ID_CHUNK = 150;

const PUBLIC_CREATOR_SELECT = [
  'id',
  'channel_name',
  'slug',
  'youtube_url',
  'avatar_url',
  'bio',
  'social_links',
  'signature_tags',
  'is_active',
  'user_id',
].join(', ');

const ADMIN_CREATOR_SELECT = `${PUBLIC_CREATOR_SELECT}, auto_approve, is_blacklisted, blacklist_reason`;

const OUTREACH_SELECT = [
  'creator_id',
  'outreach_status',
  'contact_email',
  'instagram_url',
  'internal_notes',
  'claim_token',
  'claimed_at',
  'is_contacted',
  'contacted_at',
].join(', ');

/** Karten wie die Hub-/Quickwin-Kacheln: ohne beschreibung-JSONB, plus Route und Steam-Pill. */
const CREATOR_CARD_SELECT = [HUB_GAME_SELECT, GAME_PLATFORM_ID, 'steam_app_id'].join(', ');

const GUIDE_MEDIA_SELECT = [
  GUIDE_STRUCT.id,
  GUIDE_STRUCT.guideId,
  'sheet_type',
  GUIDE_STRUCT.videoUrl,
  GUIDE_STRUCT.timestamp,
  'video_chapter',
  'item_name',
  'chronological_group',
  'category_group',
  'boss_group',
].join(', ');

const OUTREACH_STATUSES = ['open', 'contacted', 'approved', 'claimed', 'opted_out'];

const SHEET_TAB = {
  1: 'reiter1',
  2: 'reiter2',
  3: 'reiter3',
};

const PLAYLIST_ID = /^(PL|UU|OL|FL|LL)/;

function emptyStats() {
  return { gameCount: 0, languageVersions: 0, linkedGameCount: 0 };
}

function chunkList(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function uniqueIds(rows, column) {
  const ids = [];
  const seen = new Set();
  for (const row of rows ?? []) {
    const id = row?.[column];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

async function fetchAllRanges(buildQuery) {
  const rows = [];
  for (let from = 0; from < 200000; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) return { data: [], error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { data: rows, error: null };
  }
  return { data: rows, error: null };
}

export function signatureTagsToList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry ?? '').trim()).filter(Boolean);
}

export function parseSignatureTagsInput(text) {
  const seen = new Set();
  const tags = [];
  for (const part of String(text ?? '').split(/[\n,]/)) {
    const tag = part.trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

function resolveLocale(locale) {
  const normalized = normalizeLocale(locale);
  return SUPPORTED_LOCALES.includes(normalized) ? normalized : 'de';
}

function compareGames(locale) {
  return (left, right) => getGameTitle(left, locale).localeCompare(
    getGameTitle(right, locale),
    locale,
  );
}

function statsFromGames(games) {
  const live = (games ?? []).filter((game) => hasPublishedGuide(game));
  let languageVersions = 0;
  for (const game of live) languageVersions += publishedGuideLocales(game).length;
  return { gameCount: live.length, languageVersions };
}

/**
 * Distinct game_id eines einzelnen Creators über die View public.game_guide_creators
 * (SELECT DISTINCT game_id, creator_id FROM game_guides WHERE creator_id IS NOT NULL).
 * Startet mit .range(0, 999) (Index-Only-Scan auf game_guides(creator_id, game_id))
 * und paginiert nur weiter, falls ein Creator >= 1.000 eigene Spiele erreicht.
 */
export async function fetchCreatorGameIds(supabase, creatorId) {
  const id = String(creatorId ?? '').trim();
  if (!id) return { data: [], error: null };

  const page = await fetchAllRanges(() => supabase
    .from(TABLES.gameGuideCreators)
    .select(GAME_FK)
    .eq(GUIDE_STRUCT.creatorId, id)
    .not(GAME_FK, 'is', null)
    .order(GAME_FK, { ascending: true }));

  if (page.error) return { data: [], error: page.error };
  return { data: uniqueIds(page.data, GAME_FK), error: null };
}

async function fetchGamesByIds(supabase, gameIds, columns, onlyPublished) {
  const rows = [];
  for (const chunk of chunkList(gameIds, GAME_ID_CHUNK)) {
    let query = supabase.from(TABLES.games).select(columns).in(GAME_PK, chunk);
    if (onlyPublished) {
      query = query.eq(GAME_STRUCT.isPublished, true);
    }
    const { data, error } = await query;
    if (error) return { data: [], error };
    rows.push(...(data ?? []));
  }
  return { data: rows, error: null };
}

/**
 * Verknüpfte Spiele eines Creators im Kartenformat der Quickwin-/Startseiten-Kacheln.
 * scope: 'locale' (nur guide_<locale> = PUBLISHED), 'live' (is_published), 'all' (auch Entwürfe).
 */
export async function fetchCreatorGames(supabase, creatorId, options = {}) {
  const locale = resolveLocale(options.locale);
  const scope = options.scope === 'all' || options.scope === 'live' ? options.scope : 'locale';
  const ids = await fetchCreatorGameIds(supabase, creatorId);
  if (ids.error) return { data: [], stats: emptyStats(), error: ids.error };
  if (ids.data.length === 0) return { data: [], stats: emptyStats(), error: null };

  // Für 'locale' und 'live' reicht ein einziger Query auf is_published = true:
  // vermeidet Doppel-Queries auf games und PostgREST-Syntaxfehler bei Bindestrich-Locales (zh-hans/zh-hant).
  const fetched = await fetchGamesByIds(
    supabase,
    ids.data,
    CREATOR_CARD_SELECT,
    scope !== 'all',
  );
  if (fetched.error) return { data: [], stats: emptyStats(), error: fetched.error };

  const stats = statsFromGames(fetched.data);
  const visible = scope === 'locale'
    ? fetched.data.filter((game) => isGuidePublished(game, locale))
    : fetched.data;
  const data = [...visible].sort(compareGames(locale));
  // linkedGameCount = alle distinct game_id an diesem Creator (unabhängig vom Publish-Scope).
  return {
    data,
    stats: { ...stats, linkedGameCount: ids.data.length },
    error: null,
  };
}

function guideNumber(value) {
  const parsed = Number.parseInt(String(value ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function sheetTab(sheetType) {
  const primary = resolveSheetTypes(sheetType)[0];
  return SHEET_TAB[primary] || 'reiter1';
}

function localizedGroup(row, locale) {
  const primary = resolveSheetTypes(row.sheet_type)[0];
  const ordered = primary === 2
    ? [row.category_group, row.chronological_group, row.boss_group]
    : primary === 3
      ? [row.boss_group, row.chronological_group, row.category_group]
      : [row.chronological_group, row.category_group, row.boss_group];
  for (const value of ordered) {
    const text = localizeJsonField(value, locale);
    if (text) return text;
  }
  return '';
}

/**
 * YouTube-Video- und Playlist-IDs aus game_guides.video_url.
 * Watch-URLs mit &list= zählen als Video und zusätzlich als Playlist.
 */
export function readYoutubeRefs(rawUrl) {
  const raw = String(rawUrl ?? '').trim();
  if (!raw) return { videoId: null, playlistId: null };
  const videoId = getYouTubeVideoId(raw);
  let list;
  try {
    list = new URL(raw).searchParams.get('list') || '';
  } catch {
    const match = raw.match(/[?&]list=([A-Za-z0-9_-]+)/);
    list = match?.[1] || '';
  }
  const playlistId = PLAYLIST_ID.test(list) ? list : null;
  const playlistOnly = Boolean(playlistId) && /\/playlist\b/i.test(raw);
  return {
    videoId: playlistOnly ? null : videoId,
    playlistId,
  };
}

function videoStart(timestamp, rawUrl) {
  const column = String(timestamp ?? '').trim().replace(/s$/i, '');
  if (column && column !== '0') return column;
  const seconds = extractYouTubeStartSeconds(rawUrl);
  if (seconds != null && seconds > 0) return String(seconds);
  return '';
}

function preferMedia(current, next) {
  if (!current) return next;
  const currentGuide = guideNumber(current.guideId);
  const nextGuide = guideNumber(next.guideId);
  if (nextGuide < currentGuide) return next;
  if (nextGuide === currentGuide && !current.title && next.title) {
    return { ...current, title: next.title, stepContext: next.stepContext };
  }
  return current;
}

/**
 * Schlanke Guide-Zeilen eines Creators in einem Spiel.
 * Liefert deduplizierte Videos und Playlists mit Typ, Titel, Schritt-Kontext, guide_id und YouTube-URL.
 */
export async function fetchCreatorGameMedia(supabase, creatorId, gameId, locale) {
  const creator = String(creatorId ?? '').trim();
  const game = String(gameId ?? '').trim();
  const lang = resolveLocale(locale);
  if (!creator || !game) return { data: [], error: null };

  const page = await fetchAllRanges(() => supabase
    .from(TABLES.guides)
    .select(GUIDE_MEDIA_SELECT)
    .eq(GUIDE_STRUCT.creatorId, creator)
    .eq(GAME_FK, game)
    .order(GUIDE_STRUCT.id, { ascending: true }));

  if (page.error) return { data: [], error: page.error };

  const videos = new Map();
  const playlists = new Map();

  for (const row of page.data) {
    const rawUrl = String(row?.[GUIDE_STRUCT.videoUrl] ?? '').trim();
    const refs = readYoutubeRefs(rawUrl);
    if (!refs.videoId && !refs.playlistId) continue;

    const chapter = localizeJsonField(row.video_chapter, lang);
    const item = localizeJsonField(row.item_name, lang);
    const group = localizedGroup(row, lang);
    const guideId = String(row?.[GUIDE_STRUCT.guideId] ?? '').trim();
    const tab = sheetTab(row.sheet_type);
    const stepParts = [group, item].filter((part, index, all) => part && all.indexOf(part) === index);

    if (refs.videoId) {
      const title = chapter || item || group || 'YouTube-Video';
      const entry = {
        type: 'video',
        title,
        stepContext: stepParts.filter((part) => part !== title).join(' · '),
        guideId,
        tab,
        url: buildVideoUrlWithTimestamp(
          `https://www.youtube.com/watch?v=${refs.videoId}`,
          videoStart(row?.[GUIDE_STRUCT.timestamp], rawUrl),
        ),
      };
      videos.set(refs.videoId, preferMedia(videos.get(refs.videoId), entry));
    }

    if (refs.playlistId) {
      const title = chapter || group || item || 'Playlist';
      const entry = {
        type: 'playlist',
        title,
        stepContext: stepParts.filter((part) => part !== title).join(' · '),
        guideId,
        tab,
        url: `https://www.youtube.com/playlist?list=${refs.playlistId}`,
      };
      playlists.set(refs.playlistId, preferMedia(playlists.get(refs.playlistId), entry));
    }
  }

  const data = [...videos.values(), ...playlists.values()].sort((left, right) => {
    const byGuide = guideNumber(left.guideId) - guideNumber(right.guideId);
    if (byGuide !== 0) return byGuide;
    if (left.type === right.type) return left.title.localeCompare(right.title, lang);
    return left.type === 'video' ? -1 : 1;
  });

  return { data, error: null };
}

export async function fetchCreatorBySlug(supabase, slug) {
  const safe = String(slug ?? '').trim().toLowerCase();
  if (!safe) return { data: null, error: null };
  const { data, error } = await supabase
    .from(TABLES.contentCreators)
    .select(PUBLIC_CREATOR_SELECT)
    .eq('slug', safe)
    .maybeSingle();
  if (error) return { data: null, error };
  return { data: data ?? null, error: null };
}

function normalizeOutreach(row) {
  const status = OUTREACH_STATUSES.includes(row?.outreach_status) ? row.outreach_status : 'open';
  return {
    outreach_status: status,
    contact_email: String(row?.contact_email ?? ''),
    instagram_url: String(row?.instagram_url ?? ''),
    internal_notes: String(row?.internal_notes ?? ''),
    claim_token: String(row?.claim_token ?? ''),
    claimed_at: row?.claimed_at ?? null,
    is_contacted: Boolean(row?.is_contacted),
    contacted_at: row?.contacted_at ? String(row.contacted_at).slice(0, 10) : '',
  };
}

function normalizeAdminCreator(row, outreach, gameCount = null) {
  if (!row) return null;
  return {
    id: row.id,
    channel_name: String(row.channel_name ?? ''),
    slug: String(row.slug ?? ''),
    youtube_url: String(row.youtube_url ?? ''),
    avatar_url: String(row.avatar_url ?? ''),
    bio: row.bio ?? null,
    social_links: row.social_links ?? null,
    signature_tags: signatureTagsToList(row.signature_tags),
    is_active: row.is_active !== false,
    auto_approve: Boolean(row.auto_approve),
    user_id: row.user_id ?? null,
    is_blacklisted: Boolean(row.is_blacklisted),
    blacklist_reason: String(row.blacklist_reason ?? ''),
    game_count: typeof gameCount === 'number' ? gameCount : null,
    ...normalizeOutreach(outreach),
  };
}

/**
 * Admin-Liste: nur content_creators + Outreach.
 * Kein Scan von game_guides / game_guide_creators — Spielzähler kommen lazy
 * über fetchCreatorGames, sobald ein Creator ausgewählt ist (vorher game_count = null).
 */
export async function fetchAdminCreators(supabase) {
  const [creators, outreach] = await Promise.all([
    fetchAllRanges(() => supabase
      .from(TABLES.contentCreators)
      .select(ADMIN_CREATOR_SELECT)
      .order('channel_name', { ascending: true })
      .order('id', { ascending: true })),
    fetchAllRanges(() => supabase
      .from('creator_outreach_admin')
      .select(OUTREACH_SELECT)
      .order('creator_id', { ascending: true })),
  ]);

  if (creators.error) return { data: [], outreachError: null, error: creators.error };

  // Outreach ist klein; bei Fehler trotzdem Creator-Liste zeigen, Fehler aber weiterreichen.
  const outreachByCreator = new Map(
    outreach.error
      ? []
      : (outreach.data ?? []).map((row) => [row.creator_id, row]),
  );
  const data = (creators.data ?? [])
    .map((row) => normalizeAdminCreator(row, outreachByCreator.get(row.id), null))
    .filter(Boolean);

  return { data, outreachError: outreach.error ?? null, error: null };
}

function cleanCreatorPatch(input) {
  const channelName = String(input?.channel_name ?? '').trim();
  const slug = String(input?.slug ?? '').trim().toLowerCase();
  const youtube = String(input?.youtube_url ?? '').trim();
  const avatar = String(input?.avatar_url ?? '').trim();
  return {
    channel_name: channelName,
    slug,
    youtube_url: youtube,
    avatar_url: avatar || null,
    signature_tags: parseSignatureTagsInput(
      Array.isArray(input?.signature_tags) ? input.signature_tags.join('\n') : input?.signature_tags,
    ),
    is_active: input?.is_active !== false,
    auto_approve: Boolean(input?.auto_approve),
    updated_at: new Date().toISOString(),
  };
}

function cleanOutreachPatch(creatorId, input) {
  const status = OUTREACH_STATUSES.includes(input?.outreach_status) ? input.outreach_status : 'open';
  const email = String(input?.contact_email ?? '').trim();
  const instagram = String(input?.instagram_url ?? '').trim();
  return {
    creator_id: creatorId,
    outreach_status: status,
    contact_email: email || null,
    instagram_url: instagram || null,
    internal_notes: String(input?.internal_notes ?? '').trim() || null,
    is_contacted: Boolean(input?.is_contacted),
    contacted_at: String(input?.contacted_at ?? '').trim().slice(0, 10) || null,
    updated_at: new Date().toISOString(),
  };
}

async function upsertOutreach(supabase, creatorId, input, extra = {}) {
  const patch = { ...cleanOutreachPatch(creatorId, input), ...extra };
  const { data, error } = await supabase
    .from('creator_outreach_admin')
    .upsert(patch, { onConflict: 'creator_id' })
    .select(OUTREACH_SELECT)
    .maybeSingle();
  return { data, error };
}

export async function saveAdminCreator(supabase, creatorId, input, options = {}) {
  const id = String(creatorId ?? '').trim();
  if (!id) return { data: null, error: new Error('Kein Creator ausgewählt.') };
  const patch = cleanCreatorPatch(input);
  if (!patch.channel_name) return { data: null, error: new Error('Kanalname fehlt.') };
  if (!patch.slug) return { data: null, error: new Error('Slug fehlt.') };
  if (!patch.youtube_url) return { data: null, error: new Error('YouTube-URL fehlt.') };

  const { data, error } = await supabase
    .from(TABLES.contentCreators)
    .update(patch)
    .eq('id', id)
    .select(ADMIN_CREATOR_SELECT)
    .maybeSingle();
  if (error) return { data: null, error };
  if (!data) return { data: null, error: new Error('Creator wurde nicht gespeichert.') };

  const count = typeof input?.game_count === 'number' ? input.game_count : null;
  if (options.skipOutreach) {
    return { data: normalizeAdminCreator(data, input, count), error: null };
  }

  const outreach = await upsertOutreach(supabase, id, input);
  if (outreach.error) return { data: null, error: outreach.error };
  return { data: normalizeAdminCreator(data, outreach.data, count), error: null };
}

export function newClaimToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `claim-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function createAdminCreator(supabase, input) {
  const patch = cleanCreatorPatch(input);
  if (!patch.channel_name) return { data: null, error: new Error('Kanalname fehlt.') };
  if (!patch.slug) return { data: null, error: new Error('Slug fehlt.') };
  if (!patch.youtube_url) return { data: null, error: new Error('YouTube-URL fehlt.') };

  const { data, error } = await supabase
    .from(TABLES.contentCreators)
    .insert(patch)
    .select(ADMIN_CREATOR_SELECT)
    .maybeSingle();
  if (error) return { data: null, error };
  if (!data?.id) return { data: null, error: new Error('Creator wurde nicht angelegt.') };

  const outreach = await upsertOutreach(supabase, data.id, input, {
    claim_token: newClaimToken(),
    outreach_status: cleanOutreachPatch(data.id, input).outreach_status,
  });
  if (outreach.error) return { data: null, error: outreach.error };
  return { data: normalizeAdminCreator(data, outreach.data, 0), error: null };
}

export async function rotateCreatorClaimToken(supabase, creatorId) {
  const id = String(creatorId ?? '').trim();
  if (!id) return { data: null, error: new Error('Kein Creator ausgewählt.') };
  const claim_token = newClaimToken();
  const { data: existing, error: readError } = await supabase
    .from('creator_outreach_admin')
    .select('creator_id')
    .eq('creator_id', id)
    .maybeSingle();
  if (readError) return { data: null, error: readError };

  const write = existing
    ? supabase
      .from('creator_outreach_admin')
      .update({ claim_token, updated_at: new Date().toISOString() })
      .eq('creator_id', id)
    : supabase
      .from('creator_outreach_admin')
      .insert({
        creator_id: id,
        outreach_status: 'open',
        claim_token,
        updated_at: new Date().toISOString(),
      });

  const { data, error } = await write.select('claim_token').maybeSingle();
  if (error) return { data: null, error };
  return { data: { claim_token: data?.claim_token || claim_token }, error: null };
}

export async function claimCreatorProfile(supabase, claimToken) {
  const token = String(claimToken ?? '').trim();
  if (!token) return { data: null, error: new Error('Einladungslink ist unvollständig.') };
  const { data, error } = await supabase.rpc('tb_claim_creator_profile', {
    p_claim_token: token,
  });
  if (error) return { data: null, error };
  if (data && typeof data === 'object' && data.ok === false) {
    return { data: null, error: new Error(data.message || 'Kanal konnte nicht verknüpft werden.') };
  }
  return { data, error: null };
}

/** Kanal-Identität aus einer YouTube-URL: @handle, /channel/UC… oder /c|/user. */
export function youtubeChannelKey(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./i, '').replace(/^m\./i, '').toLowerCase();
    if (host !== 'youtube.com' && host !== 'youtu.be') return '';
    let path = parsed.pathname.replace(/\/+$/, '');
    path = path.replace(/^\/c\/@/i, '/@');
    const handle = path.match(/^\/@([^/]+)/i);
    if (handle) return `handle:${decodeURIComponent(handle[1]).toLowerCase()}`;
    const channel = path.match(/^\/channel\/([^/]+)/i);
    if (channel) return `channel:${channel[1]}`;
    const custom = path.match(/^\/(?:c|user)\/([^/]+)/i);
    if (custom) return `custom:${decodeURIComponent(custom[1]).toLowerCase()}`;
    return '';
  } catch {
    return '';
  }
}

function comparableYoutubeUrl(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.replace(/^www\./i, '').replace(/^m\./i, '').toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/, '').replace(/^\/c\/@/i, '/@');
    for (const trackingKey of ['si', 'feature', 'pp', 'sub_confirmation']) {
      parsed.searchParams.delete(trackingKey);
    }
    const hasSpecificPath = parsed.pathname !== '' && parsed.pathname !== '/';
    const hasMediaParam = parsed.searchParams.has('v') || parsed.searchParams.has('list');
    if (!hasSpecificPath && !hasMediaParam) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

/**
 * Prüft, ob eine YouTube-URL zu einem gesperrten Kanal in content_creators gehört.
 * Der Datensatz bleibt stehen; gelöscht wird hier nichts.
 */
export async function isYoutubeChannelBlacklisted(supabase, url) {
  const raw = String(url ?? '').trim();
  if (!raw) return { blacklisted: false, error: null };
  const key = youtubeChannelKey(raw);
  const comparable = comparableYoutubeUrl(raw);
  const page = await fetchAllRanges(() => supabase
    .from(TABLES.contentCreators)
    .select('id, channel_name, youtube_url, blacklist_reason')
    .eq('is_blacklisted', true)
    .order('id', { ascending: true }));
  if (page.error) return { blacklisted: false, error: page.error };

  for (const row of page.data) {
    const rowKey = youtubeChannelKey(row.youtube_url);
    const sameChannel = Boolean(key) && key === rowKey;
    const sameUrl = comparable !== '' && comparable === comparableYoutubeUrl(row.youtube_url);
    if (!sameChannel && !sameUrl) continue;
    return {
      blacklisted: true,
      id: row.id,
      channelName: String(row.channel_name ?? ''),
      reason: String(row.blacklist_reason ?? ''),
      error: null,
    };
  }
  return { blacklisted: false, error: null };
}

async function fetchOwnedGuideRows(supabase, table, creatorId) {
  return fetchAllRanges(() => supabase
    .from(table)
    .select('id, game_id')
    .eq(GUIDE_STRUCT.creatorId, creatorId)
    .order('id', { ascending: true }));
}

async function writeIdChunks(supabase, ids, run) {
  for (const chunk of chunkList(ids, GAME_ID_CHUNK)) {
    const { error } = await run(chunk);
    if (error) return error;
  }
  return null;
}

/**
 * Löst nur die Video-Zuordnung. Guide-Texte (item_name, Gruppen, …) bleiben.
 * game_guides braucht edit_unlocked = true für veröffentlichte Spiele (trg_protect_published_guides).
 * game_guides.video_url ist nullable; staging_game_guides.video_url ist NOT NULL und wird geleert.
 * game_guide_creators ist eine View aus game_guides.creator_id und wird nicht beschrieben.
 */
export async function unlinkCreatorGuideVideos(supabase, creatorId) {
  const id = String(creatorId ?? '').trim();
  if (!id) return { error: new Error('Kein Creator ausgewählt.') };

  const [guides, staging, rohmaterial] = await Promise.all([
    fetchOwnedGuideRows(supabase, TABLES.guides, id),
    fetchOwnedGuideRows(supabase, TABLES.stagingGuides, id),
    fetchOwnedGuideRows(supabase, TABLES.guidesRohmaterial, id),
  ]);
  if (guides.error) return { error: guides.error };
  if (staging.error) return { error: staging.error };
  if (rohmaterial.error) return { error: rohmaterial.error };

  const guideError = await writeIdChunks(
    supabase,
    uniqueIds(guides.data, 'id'),
    (chunk) => supabase
      .from(TABLES.guides)
      .update({
        [GUIDE_STRUCT.creatorId]: null,
        [GUIDE_STRUCT.videoUrl]: null,
        edit_unlocked: true,
      })
      .in('id', chunk),
  );
  if (guideError) return { error: guideError };

  const stagingIds = uniqueIds(staging.data, 'id');
  let stagingError = await writeIdChunks(
    supabase,
    stagingIds,
    (chunk) => supabase
      .from(TABLES.stagingGuides)
      .update({
        [GUIDE_STRUCT.creatorId]: null,
        [GUIDE_STRUCT.videoUrl]: '',
        creator_input_url: null,
      })
      .in('id', chunk),
  );
  if (stagingError && /creator_input_url/i.test(String(stagingError.message ?? ''))) {
    stagingError = await writeIdChunks(
      supabase,
      stagingIds,
      (chunk) => supabase
        .from(TABLES.stagingGuides)
        .update({
          [GUIDE_STRUCT.creatorId]: null,
          [GUIDE_STRUCT.videoUrl]: '',
        })
        .in('id', chunk),
    );
  }
  if (stagingError) return { error: stagingError };

  const rohIds = uniqueIds(rohmaterial.data, 'id');
  let rohError = await writeIdChunks(
    supabase,
    rohIds,
    (chunk) => supabase
      .from(TABLES.guidesRohmaterial)
      .update({
        [GUIDE_STRUCT.creatorId]: null,
        [GUIDE_STRUCT.videoUrl]: null,
        playlist_url: null,
      })
      .in('id', chunk),
  );
  if (rohError) {
    rohError = await writeIdChunks(
      supabase,
      rohIds,
      (chunk) => supabase
        .from(TABLES.guidesRohmaterial)
        .update({
          [GUIDE_STRUCT.creatorId]: null,
          [GUIDE_STRUCT.videoUrl]: '',
        })
        .in('id', chunk),
    );
  }
  return { error: rohError };
}

async function unlockGamesLikeDiscard(supabase, gameIds) {
  for (const chunk of chunkList(gameIds, 80)) {
    const { data, error } = await supabase
      .from(TABLES.games)
      .select(`${GAME_PK}, ${GAME_STRUCT.status}, ${GAME_STRUCT.progress}`)
      .in(GAME_PK, chunk);
    if (error) return error;
    for (const game of data ?? []) {
      const nextStatus = statusAfterGuideDiscard(game[GAME_STRUCT.status]);
      const patch = {
        [GAME_STRUCT.isGuideLocked]: false,
        [GAME_STRUCT.status]: nextStatus,
      };
      if (String(game[GAME_STRUCT.progress] ?? '').trim().toUpperCase() === GUIDE_PUBLICATION.PUBLISHED) {
        patch[GAME_STRUCT.progress] = GUIDE_PUBLICATION.DONE;
      }
      const { error: updateError } = await supabase
        .from(TABLES.games)
        .update(patch)
        .eq(GAME_PK, game[GAME_PK]);
      if (updateError) return updateError;
    }
  }
  return null;
}

/**
 * Sperrt den Creator über tb_set_creator_blacklist. Die Zeile in content_creators bleibt.
 * mode 'unlink': Video-Verknüpfung lösen. mode 'delete': zugehörige Guide-Zeilen löschen,
 * nachdem die betroffenen Spiele wie discardIntranetGuide entsperrt wurden.
 */
export async function blacklistCreator(supabase, creatorId, { reason = '', mode = 'unlink' } = {}) {
  const id = String(creatorId ?? '').trim();
  if (!id) return { error: new Error('Kein Creator ausgewählt.') };
  const note = String(reason ?? '').trim();
  if (!note) return { error: new Error('Bitte einen Grund angeben.') };

  const { error: rpcError } = await supabase.rpc('tb_set_creator_blacklist', {
    p_creator_id: id,
    p_blacklist: true,
    p_reason: note,
  });
  if (rpcError) return { error: rpcError };

  if (mode === 'delete') {
    const [guides, staging, rohmaterial] = await Promise.all([
      fetchOwnedGuideRows(supabase, TABLES.guides, id),
      fetchOwnedGuideRows(supabase, TABLES.stagingGuides, id),
      fetchOwnedGuideRows(supabase, TABLES.guidesRohmaterial, id),
    ]);
    if (guides.error) return { error: guides.error };
    if (staging.error) return { error: staging.error };
    if (rohmaterial.error) return { error: rohmaterial.error };

    const unlockError = await unlockGamesLikeDiscard(supabase, uniqueIds(guides.data, 'game_id'));
    if (unlockError) return { error: unlockError };
    const deleteGuides = await writeIdChunks(
      supabase,
      uniqueIds(guides.data, 'id'),
      (chunk) => supabase.from(TABLES.guides).delete().in('id', chunk),
    );
    if (deleteGuides) return { error: deleteGuides };
    const deleteStaging = await writeIdChunks(
      supabase,
      uniqueIds(staging.data, 'id'),
      (chunk) => supabase.from(TABLES.stagingGuides).delete().in('id', chunk),
    );
    if (deleteStaging) return { error: deleteStaging };
    const deleteRohmaterial = await writeIdChunks(
      supabase,
      uniqueIds(rohmaterial.data, 'id'),
      (chunk) => supabase.from(TABLES.guidesRohmaterial).delete().in('id', chunk),
    );
    return { error: deleteRohmaterial };
  }

  const unlinked = await unlinkCreatorGuideVideos(supabase, id);
  return { error: unlinked.error };
}
