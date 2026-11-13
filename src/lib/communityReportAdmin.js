import {
  TABLES,
  ACHIEVEMENT_PK,
  ACHIEVEMENT_I18N,
  ACHIEVEMENT_STRUCT,
  GAME_FK,
  GAME_I18N,
  GAME_PK,
  GAME_PLATFORM_ID,
  GUIDE_PK,
  GUIDE_STRUCT,
} from './gameSchema';
import { getLocale } from './locale';
import { isUuid } from './gameModel';
import { resolveGameUuid } from './gameQueries';
import { localizeJsonField, mergeLocalizedValue } from './translationUtils';
import { REPORT_ENTITY_MAP } from './errorReport';
import { formatIntranetTitles } from './intranetQueries';
import { collectHardwareSegments, formatHardwareValue } from './gameSlug';
import { fixGameCover, normalizeCoverInputUrl } from './intranetGameEdits';

const DEFAULT_REPORT_LANG = 'de';

const HINT_ONLY_FIELDS = new Set([
  'home_tags',
  'quick_fact',
  'trophies_total',
  'trophies_missable',
  'trophies_online',
  'creator_credit',
  'flags',
]);

const GUIDE_CONTENT_TYPES = new Set(['guide_step', 'item_name', 'guide_item', 'boss']);
const GUIDE_LABEL_FIELDS = new Set([
  'spiel_region',
  'chronological_group',
  'category_group',
  'boss_group',
]);

const PLACEHOLDER_ORIGINALS = new Set(['[Bild / Icon]', '[Video]', '[Inhalt]']);

const HINT_ONLY_APPLY_MESSAGE =
  'Struktureller Hinweis – dieses Feld wird nicht automatisch überschrieben. Nach der Prüfung über „✓ Erledigt“ schließen.';

const HARDWARE_HINT =
  'Bitte Vorschlag vor dem Übernehmen auf gültige Konsole (z. B. PS4/PS5) kürzen oder manuell ändern & auf „Erledigt“ klicken.';

const YEAR_HINT =
  'Bitte Vorschlag vor dem Übernehmen auf genau eine Jahreszahl (1970–2100) kürzen oder manuell ändern & auf „Erledigt“ klicken.';

const PLAYTIME_HINT =
  'Bitte Vorschlag vor dem Übernehmen auf eine Zahl kürzen (z. B. 25 oder 12,5) oder manuell ändern & auf „Erledigt“ klicken.';

const COVER_HINT =
  'Kein Bild-Link im Vorschlag – bitte über den „🖼️ Cover“-Button daneben neues Cover setzen und danach „✓ Erledigt“ klicken.';

const TIMESTAMP_HINT =
  'Bitte Vorschlag vor dem Übernehmen auf einen Zeitstempel kürzen (z. B. 12:30) oder manuell ändern & auf „Erledigt“ klicken.';

const GAME_REPORT_LABELS = {
  title: 'Titel',
  description: 'Beschreibung',
  status_explanation: 'Kurztext',
  cover_url: 'Cover',
  hardware: 'Hardware',
  release_jahr: 'Release-Jahr',
  entwickler: 'Studio',
  publisher: 'Publisher',
  home_tags: 'Tags',
  trophies_total: 'Trophäen',
  trophies_missable: 'Verpassbare Trophäen',
  trophies_online: 'Online-Trophäen',
  quick_fact: 'Hinweis',
  creator_credit: 'Creator',
};

const GUIDE_REPORT_LABELS = {
  timestamp: 'Zeitstempel',
  spiel_region: 'Gebiet',
  chronological_group: 'Walkthrough-Gruppe',
  category_group: 'Sammelobjekt-Gruppe',
  boss_group: 'Boss-Gruppe',
};

/** Reine Hinweis-Felder: kein blindes Auto-Patch, Abschluss über „Erledigt“. */
export function isHintOnlyReport(report) {
  return HINT_ONLY_FIELDS.has(String(report?.field_name ?? '').trim());
}

function formatGameReportLabel(fieldName, key) {
  const field = String(fieldName ?? '').trim();
  if (field === 'radar_axis') return key ? `Spiel · Platin-Radar (${key})` : 'Spiel · Platin-Radar';
  if (field === 'radar_summary') return 'Spiel · Platin-Radar';
  if (field === 'spielzeit_hauptstory') return 'Spiel · Spieldauer (Hauptstory)';
  if (field === 'spielzeit_komplettierer') return 'Spiel · Spieldauer (Komplett)';
  const label = GAME_REPORT_LABELS[field] || field || 'Spiel';
  if ((field === 'quick_fact' || field === 'home_tags') && key) return `Spiel · ${label} (${key})`;
  return `Spiel · ${label}`;
}

function replacementText(currentText, originalText, suggestedText) {
  const current = String(currentText ?? '');
  const original = String(originalText ?? '').trim();
  const suggested = String(suggestedText ?? '');
  if (
    current &&
    original &&
    !PLACEHOLDER_ORIGINALS.has(original) &&
    current.length > original.length &&
    current.includes(original)
  ) {
    return current.replace(original, suggested);
  }
  return suggested;
}

function extractSingleYear(value) {
  const years = String(value ?? '').match(/\b(?:19[7-9]\d|20\d{2}|2100)\b/g);
  if (!years || years.length !== 1) return null;
  const year = Number(years[0]);
  if (!Number.isInteger(year) || year < 1970 || year > 2100) return null;
  return year;
}

function parseCleanHours(value) {
  const raw = String(value ?? '').trim().replace(/\s+/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours < 0 || hours > 9999) return null;
  return hours;
}

function hardwareFromSuggestion(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const tokens = raw.split(/[/+,|&]|\bund\b|\band\b/i).map((part) => part.trim()).filter(Boolean);
  if (tokens.length === 0) return '';

  const segments = [];
  for (const token of tokens) {
    const found = collectHardwareSegments(token);
    if (found.length !== 1) return '';
    const compact = token.replace(/\s+/g, '').toLowerCase();
    const label = formatHardwareValue(found).replace(/\s+/g, '').toLowerCase();
    const segment = found[0];
    const aliases = new Set([segment, label]);
    if (segment === 'ps5') aliases.add('playstation5').add('ps5');
    if (segment === 'ps4') aliases.add('playstation4').add('ps4');
    if (segment === 'ps3') aliases.add('playstation3').add('ps3');
    if (segment === 'psvita') aliases.add('playstationvita').add('vita').add('psvita');
    if (segment === 'psp') aliases.add('playstationportable').add('psp');
    if (!aliases.has(compact)) return '';
    segments.push(segment);
  }

  return formatHardwareValue(segments);
}

function coverUrlFromSuggestion(value) {
  const url = normalizeCoverInputUrl(value);
  if (!url) return null;
  if (/igdb\.com/i.test(url)) return url;
  if (/\.(?:png|jpe?g|webp|gif|avif)(?:$|[?#])/i.test(url)) return url;
  return null;
}

function cleanTimestamp(value) {
  const raw = String(value ?? '').trim().replace(/^▶\s*/, '');
  if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(raw)) return null;
  return raw;
}

async function fetchPaged(supabase, table, columns, filters) {
  const pageSize = 1000;
  const rows = [];
  let from = 0;
  for (;;) {
    let query = supabase.from(table).select(columns);
    for (const [col, val] of Object.entries(filters)) {
      query = query.eq(col, val);
    }
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) return { rows: [], error };
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return { rows, error: null };
    from += pageSize;
  }
}

async function updateByPk(supabase, target, patch) {
  const next = target.unlockEdit ? { ...patch, edit_unlocked: true } : patch;
  let query = supabase.from(target.table).update(next);
  for (const [col, val] of Object.entries(target.pkColumns ?? {})) {
    query = query.eq(col, val);
  }
  const { error } = await query;
  return { error, target };
}

function hasDisplayValue(value) {
  if (value == null || value === '') return false;
  if (typeof value === 'object') {
    if (Array.isArray(value)) return value.some((item) => String(item ?? '').trim());
    return Object.values(value).some((item) => String(item ?? '').trim());
  }
  return Boolean(String(value).trim());
}

/**
 * Lesbare NPWR aus JSONB-Array oder String.
 * @param {unknown} value
 */
export function formatReportNpwr(value) {
  if (Array.isArray(value)) {
    const first = value.map((item) => String(item ?? '').trim()).find(Boolean);
    return first || '—';
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '—';
    if (trimmed.startsWith('[')) {
      try {
        return formatReportNpwr(JSON.parse(trimmed));
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  return '—';
}

/**
 * Spieltitel aus community_reports.spieltitel (JSONB oder String).
 * @param {unknown} value
 */
export function formatReportGameTitle(value) {
  const label = formatIntranetTitles(value);
  if (label && label !== '—') {
    // formatIntranetTitles liefert "DE Title · EN Title" – für die Karte reicht der erste.
    return label.split(' · ')[0].replace(/^[A-Z]{2}\s+/, '') || label;
  }
  return '—';
}

/**
 * Lesbare Positionsangabe (Trophäe #14 / Guide-Schritt #5).
 * @param {object} report
 */
export function formatReportDisplayKey(report) {
  const explicit = String(report?.display_key ?? '').trim();
  if (explicit) return explicit;

  const key = String(report?.content_key ?? '').trim();
  if (!key) return '—';

  const type = String(report?.content_type ?? '').trim();
  const field = String(report?.field_name ?? '').trim();
  if (type === 'game') return formatGameReportLabel(field, key);
  if (type === 'trophy' && field === 'spielname') return key ? `DLC · ${key}` : 'DLC-Titel';
  if (type === 'trophy') return `Trophäe #${key}`;
  if (type === 'guide_step' || type === 'item_name' || type === 'guide_item' || type === 'boss') {
    const label = GUIDE_REPORT_LABELS[field];
    if (label) return key ? `Guide · ${label} (${key})` : `Guide · ${label}`;
    return `Guide-Schritt #${key}`;
  }
  return key;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} report
 */
export async function resolveApplyTarget(supabase, report) {
  const { content_type, field_name, content_key, source_identifier } = report;
  const lang = report.language_code || getLocale() || DEFAULT_REPORT_LANG;

  const { uuid: gameId, error: resolveError } = await resolveGameUuid(
    supabase,
    source_identifier,
  );
  if (resolveError) return { target: null, error: resolveError.message };
  if (!gameId) return { target: null, error: 'Spiel zur Meldung nicht gefunden.' };

  if (isHintOnlyReport(report)) {
    return { target: null, error: HINT_ONLY_APPLY_MESSAGE };
  }

  if (content_type === 'game') {
    const entity = REPORT_ENTITY_MAP.game;
    const jsonField = entity?.jsonLangFields?.[field_name];
    const structField = entity?.structFields?.[field_name];
    const column = jsonField ?? structField;
    if (!column) return { target: null, error: `Unbekanntes Spiel-Feld: ${field_name}` };

    let mode = 'scalar';
    let jsonLang = null;
    if (field_name === 'cover_url') mode = 'cover';
    else if (field_name === 'radar_summary' || field_name === 'radar_axis') {
      mode = 'radar';
      jsonLang = lang;
    }
    else if (field_name === 'hardware') mode = 'hardware';
    else if (field_name === 'release_jahr') mode = 'year';
    else if (field_name === 'spielzeit_hauptstory' || field_name === 'spielzeit_komplettierer') mode = 'playtime';
    else if (jsonField) {
      mode = 'json';
      jsonLang = lang;
    }

    return {
      target: {
        table: TABLES.games,
        pkColumns: { [GAME_PK]: gameId },
        column,
        jsonLang,
        gameId,
        mode,
        axisKey: field_name === 'radar_axis' ? String(content_key ?? '').trim() : '',
      },
      error: null,
    };
  }

  if (content_type === 'trophy') {
    if (field_name === 'spielname') {
      return {
        target: {
          table: TABLES.achievements,
          pkColumns: { [GAME_FK]: gameId },
          column: ACHIEVEMENT_I18N.groupName,
          jsonLang: lang,
          gameId,
          mode: 'trophy_group',
        },
        error: null,
      };
    }

    const jsonField = REPORT_ENTITY_MAP.trophy.jsonLangFields[field_name];
    const structField = REPORT_ENTITY_MAP.trophy.structFields[field_name];
    const column = jsonField ?? structField;

    if (!column) {
      return { target: null, error: `Unbekanntes Trophäen-Feld: ${field_name}` };
    }

    return {
      target: {
        table: TABLES.achievements,
        pkColumns: {
          [GAME_FK]: gameId,
          [ACHIEVEMENT_PK]: content_key,
        },
        column,
        jsonLang: jsonField ? lang : null,
        gameId,
        mode: jsonField ? 'json' : 'scalar',
      },
      error: null,
    };
  }

  if (GUIDE_CONTENT_TYPES.has(content_type)) {
    const field = String(field_name ?? '').trim() || 'name';
    const entity = REPORT_ENTITY_MAP.guide_item;
    const jsonField = entity?.jsonLangFields?.[field];
    const structField = entity?.structFields?.[field];
    if (!jsonField && !structField) {
      return { target: null, error: `Unbekanntes Guide-Feld: ${field}` };
    }
    const column = jsonField ?? structField;
    const key = String(content_key ?? '').trim();

    if (GUIDE_LABEL_FIELDS.has(field)) {
      return {
        target: {
          table: TABLES.guides,
          pkColumns: { [GAME_FK]: gameId },
          column,
          jsonLang: lang,
          gameId,
          mode: 'guide_label',
          unlockEdit: true,
        },
        error: null,
      };
    }

    const pkColumns = isUuid(key)
      ? { [GAME_FK]: gameId, [GUIDE_PK]: key }
      : { [GAME_FK]: gameId, [GUIDE_STRUCT.guideId]: key };

    return {
      target: {
        table: TABLES.guides,
        pkColumns,
        column,
        jsonLang: jsonField ? lang : null,
        gameId,
        mode: field === 'timestamp' ? 'timestamp' : (jsonField ? 'json' : 'scalar'),
        unlockEdit: field === 'timestamp',
      },
      error: null,
    };
  }

  if (content_type === 'ui_text') {
    return { target: null, error: 'UI-Texte haben noch kein DB-Update-Ziel.' };
  }

  return { target: null, error: `Unbekannter content_type: ${content_type}` };
}

const REPORT_GAME_COLUMNS = [
  GAME_PK,
  'slug',
  GAME_I18N.title,
  'hardware',
  'ecosystem',
  'spiel_typ',
  GAME_I18N.coverUrl,
  'cover_status',
  'cover_notes',
  GAME_PLATFORM_ID,
].join(', ');

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function fetchCommunityReports(supabase) {
  const { data, error } = await supabase
    .from(TABLES.communityReports)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return { reports: [], error };

  const reports = data ?? [];
  if (reports.length === 0) return { reports: [], error: null };

  const uuidSet = new Set();
  const npwrSet = new Set();
  const slugSet = new Set();

  for (const row of reports) {
    const src = String(row.source_identifier ?? '').trim();
    if (src) {
      if (isUuid(src)) {
        uuidSet.add(src);
      } else if (/^NPWR/i.test(src)) {
        npwrSet.add(src.toUpperCase());
      } else {
        slugSet.add(src.toLowerCase());
      }
    }
    const npwrFromCol = formatReportNpwr(row.platform_game_id);
    if (npwrFromCol && npwrFromCol !== '—' && /^NPWR/i.test(npwrFromCol)) {
      npwrSet.add(npwrFromCol.toUpperCase());
    }
  }

  const queries = [];
  if (uuidSet.size > 0) {
    queries.push(
      supabase.from(TABLES.games).select(REPORT_GAME_COLUMNS).in(GAME_PK, [...uuidSet]),
    );
  }
  if (slugSet.size > 0) {
    queries.push(
      supabase.from(TABLES.games).select(REPORT_GAME_COLUMNS).in('slug', [...slugSet]),
    );
  }
  if (npwrSet.size > 0) {
    const orFilter = [...npwrSet]
      .slice(0, 100)
      .map((npwr) => `${GAME_PLATFORM_ID}.cs.["${npwr}"]`)
      .join(',');
    if (orFilter) {
      queries.push(supabase.from(TABLES.games).select(REPORT_GAME_COLUMNS).or(orFilter));
    }
  }

  const byId = new Map();
  const bySlug = new Map();
  const byNpwr = new Map();

  if (queries.length > 0) {
    const results = await Promise.all(queries);
    for (const res of results) {
      if (res.error) {
        console.error('community_reports game lookup:', res.error.message);
        continue;
      }
      for (const game of res.data ?? []) {
        if (game[GAME_PK]) byId.set(String(game[GAME_PK]).trim(), game);
        if (game.slug) bySlug.set(String(game.slug).trim().toLowerCase(), game);
        const npwrs = Array.isArray(game[GAME_PLATFORM_ID])
          ? game[GAME_PLATFORM_ID]
          : [game[GAME_PLATFORM_ID]];
        for (const n of npwrs) {
          const clean = String(n ?? '').trim().toUpperCase();
          if (clean) byNpwr.set(clean, game);
        }
      }
    }
  }

  const enriched = reports.map((row) => {
    const src = String(row.source_identifier ?? '').trim();
    const npwrCol = formatReportNpwr(row.platform_game_id);
    let game = null;
    if (src) {
      if (isUuid(src)) game = byId.get(src) ?? null;
      else if (/^NPWR/i.test(src)) game = byNpwr.get(src.toUpperCase()) ?? null;
      else game = bySlug.get(src.toLowerCase()) ?? null;
    }
    if (!game && npwrCol && npwrCol !== '—') {
      game = byNpwr.get(npwrCol.toUpperCase()) ?? null;
    }
    if (!game) return { ...row, game: null };
    return {
      ...row,
      game,
      spieltitel: hasDisplayValue(row.spieltitel) ? row.spieltitel : game[GAME_I18N.title],
      platform_game_id: hasDisplayValue(row.platform_game_id)
        ? row.platform_game_id
        : game[GAME_PLATFORM_ID],
    };
  });

  return { reports: enriched, error: null };
}

/**
 * Löscht eine Fehlermeldung endgültig aus community_reports.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number|string} reportId
 */
export async function deleteCommunityReport(supabase, reportId) {
  const { error } = await supabase
    .from(TABLES.communityReports)
    .delete()
    .eq('id', reportId);
  return { error: error ?? null };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} report
 */
function patchRadarProfile(profile, lang, kind, axisKey, originalText, suggestedText) {
  const next = profile && typeof profile === 'object' && !Array.isArray(profile)
    ? JSON.parse(JSON.stringify(profile))
    : {};
  const useRoot = lang === 'de' && (typeof next.summary === 'string' || Array.isArray(next.axes));
  const bucket = useRoot
    ? next
    : (next[lang] && typeof next[lang] === 'object' && !Array.isArray(next[lang]) ? next[lang] : {});

  if (kind === 'summary') {
    bucket.summary = replacementText(bucket.summary, originalText, suggestedText);
  } else {
    if (!Array.isArray(bucket.axes)) {
      return {
        profile: null,
        error: 'Platin-Radar hat in dieser Sprache keine Achsen. Bitte manuell prüfen und „✓ Erledigt“ klicken.',
      };
    }
    const axis = bucket.axes.find((item) => String(item?.key ?? '') === axisKey);
    if (!axis) {
      return {
        profile: null,
        error: `Platin-Radar-Achse „${axisKey}“ nicht gefunden. Bitte manuell prüfen und „✓ Erledigt“ klicken.`,
      };
    }
    axis.reason = replacementText(axis.reason, originalText, suggestedText);
  }

  if (!useRoot) next[lang] = bucket;
  return { profile: next, error: null };
}

async function applyRadarReport(supabase, target, report) {
  const { data: existing, error: fetchError } = await supabase
    .from(TABLES.games)
    .select(target.column)
    .eq(GAME_PK, target.gameId)
    .maybeSingle();
  if (fetchError) return { error: fetchError, target };

  const kind = report.field_name === 'radar_axis' ? 'axis' : 'summary';
  const { profile, error: patchError } = patchRadarProfile(
    existing?.[target.column],
    target.jsonLang || report.language_code || DEFAULT_REPORT_LANG,
    kind,
    target.axisKey,
    report.original_text,
    report.suggested_text,
  );
  if (patchError) return { error: new Error(patchError), target };
  return updateByPk(supabase, target, { [target.column]: profile });
}

async function applyGuideLabel(supabase, target, report) {
  const { rows, error } = await fetchPaged(
    supabase,
    TABLES.guides,
    `${GUIDE_PK}, ${target.column}`,
    { [GAME_FK]: target.gameId },
  );
  if (error) return { error, target };

  const key = String(report.content_key ?? '').trim();
  const original = String(report.original_text ?? '').trim();
  const matches = rows.filter((row) => {
    const current = String(
      localizeJsonField(row[target.column], target.jsonLang, undefined, { exact: true }) ?? '',
    ).trim();
    if (!current) return false;
    if (current === key) return true;
    return Boolean(original) && !PLACEHOLDER_ORIGINALS.has(original) && current === original;
  });

  if (matches.length === 0) {
    return {
      error: new Error('Keine Guide-Zeile mit diesem Namen gefunden. Bitte manuell prüfen und „✓ Erledigt“ klicken.'),
      target,
    };
  }

  for (const row of matches) {
    const current = localizeJsonField(row[target.column], target.jsonLang, undefined, { exact: true });
    const textToSet = replacementText(current, report.original_text, report.suggested_text);
    const { error: updateError } = await supabase
      .from(TABLES.guides)
      .update({
        [target.column]: mergeLocalizedValue(row[target.column], target.jsonLang, textToSet),
        edit_unlocked: true,
      })
      .eq(GUIDE_PK, row[GUIDE_PK])
      .eq(GAME_FK, target.gameId);
    if (updateError) return { error: updateError, target };
  }

  return { error: null, target };
}

async function applyTrophyGroupName(supabase, target, report) {
  const groupKey = String(report.content_key ?? '').trim();
  const { rows, error } = await fetchPaged(
    supabase,
    TABLES.achievements,
    `${ACHIEVEMENT_PK}, ${target.column}`,
    {
      [GAME_FK]: target.gameId,
      [ACHIEVEMENT_STRUCT.trophyGroup]: groupKey,
    },
  );
  if (error) return { error, target };
  if (rows.length === 0) {
    return {
      error: new Error('Keine Trophäen dieser DLC-Gruppe gefunden. Bitte manuell prüfen und „✓ Erledigt“ klicken.'),
      target,
    };
  }

  for (const row of rows) {
    const current = localizeJsonField(row[target.column], target.jsonLang, undefined, { exact: true });
    const textToSet = replacementText(current, report.original_text, report.suggested_text);
    const { error: updateError } = await supabase
      .from(TABLES.achievements)
      .update({
        [target.column]: mergeLocalizedValue(row[target.column], target.jsonLang, textToSet),
      })
      .eq(GAME_FK, target.gameId)
      .eq(ACHIEVEMENT_PK, row[ACHIEVEMENT_PK]);
    if (updateError) return { error: updateError, target };
  }

  return { error: null, target };
}

export async function applyReportToContentTable(supabase, report) {
  const { target, error: resolveError } = await resolveApplyTarget(supabase, report);
  if (resolveError) return { error: new Error(resolveError) };
  if (!target) return { error: new Error('Kein Update-Ziel') };

  if (target.mode === 'cover') {
    const url = coverUrlFromSuggestion(report.suggested_text);
    if (!url) return { error: new Error(COVER_HINT), target };
    const { error } = await fixGameCover(supabase, target.gameId, url);
    return { error, target };
  }

  if (target.mode === 'hardware') {
    const formatted = hardwareFromSuggestion(report.suggested_text);
    if (!formatted) return { error: new Error(HARDWARE_HINT), target };
    return updateByPk(supabase, target, { [target.column]: formatted });
  }

  if (target.mode === 'year') {
    const year = extractSingleYear(report.suggested_text);
    if (year == null) return { error: new Error(YEAR_HINT), target };
    return updateByPk(supabase, target, { [target.column]: year });
  }

  if (target.mode === 'playtime') {
    const hours = parseCleanHours(report.suggested_text);
    if (hours == null) return { error: new Error(PLAYTIME_HINT), target };
    return updateByPk(supabase, target, { [target.column]: hours });
  }

  if (target.mode === 'timestamp') {
    const stamp = cleanTimestamp(report.suggested_text);
    if (!stamp) return { error: new Error(TIMESTAMP_HINT), target };
    return updateByPk(supabase, target, { [target.column]: stamp });
  }

  if (target.mode === 'radar') {
    return applyRadarReport(supabase, target, report);
  }

  if (target.mode === 'guide_label') return applyGuideLabel(supabase, target, report);
  if (target.mode === 'trophy_group') return applyTrophyGroupName(supabase, target, report);

  let patch = { [target.column]: String(report.suggested_text ?? '').trim() };
  if (target.mode === 'scalar' && !patch[target.column]) {
    return { error: new Error('Vorschlag ist leer. Bitte kürzen oder über „✓ Erledigt“ schließen.'), target };
  }

  if (target.jsonLang) {
    let fetchQuery = supabase.from(target.table).select(target.column);
    for (const [col, val] of Object.entries(target.pkColumns ?? {})) {
      fetchQuery = fetchQuery.eq(col, val);
    }
    const { data: existing, error: fetchError } = await fetchQuery.maybeSingle();
    if (fetchError) return { error: fetchError, target };

    const currentText = localizeJsonField(existing?.[target.column], target.jsonLang, undefined, { exact: true });
    const textToSet = replacementText(currentText, report.original_text, report.suggested_text);
    patch = {
      [target.column]: mergeLocalizedValue(
        existing?.[target.column],
        target.jsonLang,
        textToSet,
      ),
    };
  }

  return updateByPk(supabase, target, patch);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number|string} reportId
 * @param {'approved'|'rejected'} status
 * @param {object} [reportRow] – volle Zeile für Approve (DB-Patch)
 */
export async function setReportStatus(supabase, reportId, status, reportRow = null) {
  if (status === 'approved' && reportRow) {
    const { error: applyError } = await applyReportToContentTable(supabase, reportRow);
    if (applyError) return { error: applyError };
  }

  const { data, error } = await supabase
    .from(TABLES.communityReports)
    .update({ status })
    .eq('id', reportId)
    .select('id, status')
    .single();

  return { data, error };
}
