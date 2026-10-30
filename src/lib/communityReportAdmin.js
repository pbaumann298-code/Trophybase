import {
  TABLES,
  ACHIEVEMENT_PK,
  GAME_FK,
  GAME_I18N,
  GAME_PK,
  GAME_PLATFORM_ID,
  GUIDE_PK,
  GUIDE_I18N,
  GUIDE_STRUCT,
} from './gameSchema';
import { getLocale } from './locale';
import { isUuid } from './gameModel';
import { resolveGameUuid } from './gameQueries';
import { localizeJsonField, mergeLocalizedValue } from './translationUtils';
import { REPORT_ENTITY_MAP } from './errorReport';
import { formatIntranetTitles } from './intranetQueries';

const DEFAULT_REPORT_LANG = 'de';

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
  if (type === 'trophy') return `Trophäe #${key}`;
  if (type === 'guide_step' || type === 'item_name' || type === 'guide_item') {
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

  if (content_type === 'trophy') {
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
      },
      error: null,
    };
  }

  if (content_type === 'guide_step' || content_type === 'item_name') {
    const column =
      REPORT_ENTITY_MAP.guide_item.jsonLangFields?.[field_name] || GUIDE_I18N.itemName;
    const key = String(content_key ?? '').trim();
    const pkColumns = isUuid(key)
      ? { [GAME_FK]: gameId, [GUIDE_PK]: key }
      : { [GAME_FK]: gameId, [GUIDE_STRUCT.guideId]: key };

    return {
      target: {
        table: TABLES.guides,
        pkColumns,
        column,
        jsonLang: lang,
        gameId,
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
export async function applyReportToContentTable(supabase, report) {
  const { target, error: resolveError } = await resolveApplyTarget(supabase, report);
  if (resolveError) return { error: new Error(resolveError) };
  if (!target) return { error: new Error('Kein Update-Ziel') };

  let patch = { [target.column]: report.suggested_text };

  // JSONB-Sprachmap (z. B. item_name.de) – andere Sprachen erhalten
  if (target.jsonLang) {
    let fetchQuery = supabase.from(target.table).select(target.column);
    for (const [col, val] of Object.entries(target.pkColumns ?? {})) {
      fetchQuery = fetchQuery.eq(col, val);
    }
    const { data: existing, error: fetchError } = await fetchQuery.maybeSingle();
    if (fetchError) return { error: fetchError, target };

    let textToSet = report.suggested_text;
    const currentText = localizeJsonField(existing?.[target.column], target.jsonLang, undefined, { exact: true });
    const originalText = String(report.original_text ?? '').trim();
    const isPlaceholder = originalText === '[Bild / Icon]' || originalText === '[Video]' || originalText === '[Inhalt]';

    if (
      currentText &&
      originalText &&
      !isPlaceholder &&
      currentText.length > originalText.length &&
      currentText.includes(originalText)
    ) {
      textToSet = currentText.replace(originalText, report.suggested_text);
    }

    patch = {
      [target.column]: mergeLocalizedValue(
        existing?.[target.column],
        target.jsonLang,
        textToSet,
      ),
    };
  }

  let query = supabase.from(target.table).update(patch);

  if (target.pkColumns) {
    for (const [col, val] of Object.entries(target.pkColumns)) {
      query = query.eq(col, val);
    }
  } else if (target.pkColumn) {
    query = query.eq(target.pkColumn, target.pkValue);
  }

  const { error } = await query;
  return { error, target };
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
