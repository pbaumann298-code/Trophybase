import { TABLES, ACHIEVEMENT_PK, GAME_FK, GUIDE_PK, GUIDE_I18N } from './gameSchema';
import { getLocale } from './locale';
import { mergeLocalizedValue } from './translationUtils';
import { REPORT_ENTITY_MAP } from './errorReport';

const DEFAULT_REPORT_LANG = 'de';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} report
 */
export async function resolveApplyTarget(supabase, report) {
  const { content_type, field_name, content_key, source_identifier } = report;
  const lang = getLocale() || DEFAULT_REPORT_LANG;

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
          [GAME_FK]: source_identifier,
          [ACHIEVEMENT_PK]: content_key,
        },
        column,
        jsonLang: jsonField ? lang : null,
        gameId: source_identifier,
      },
      error: null,
    };
  }

  if (content_type === 'guide_step' || content_type === 'item_name') {
    const column =
      REPORT_ENTITY_MAP.guide_item.jsonLangFields?.[field_name] || GUIDE_I18N.itemName;

    return {
      target: {
        table: TABLES.guides,
        pkColumns: {
          [GAME_FK]: source_identifier,
          [GUIDE_PK]: content_key,
        },
        column,
        jsonLang: lang,
        gameId: source_identifier,
      },
      error: null,
    };
  }

  if (content_type === 'ui_text') {
    return { target: null, error: 'UI-Texte haben noch kein DB-Update-Ziel.' };
  }

  return { target: null, error: `Unbekannter content_type: ${content_type}` };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function fetchCommunityReports(supabase) {
  const { data, error } = await supabase
    .from(TABLES.communityReports)
    .select('*')
    .order('created_at', { ascending: false });

  return { reports: data ?? [], error };
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

    patch = {
      [target.column]: mergeLocalizedValue(
        existing?.[target.column],
        target.jsonLang,
        report.suggested_text,
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
