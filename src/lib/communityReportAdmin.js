import { TABLES } from './gameSchema';
import { REPORT_ENTITY_MAP } from './errorReport';

/**
 * Ziel-Tabelle für manuelles Approve aus community_reports.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} report
 */
export async function resolveApplyTarget(supabase, report) {
  const { content_type, field_name, content_key, source_identifier } = report;

  if (content_type === 'trophy') {
    const column = REPORT_ENTITY_MAP.trophy.fields[field_name];
    if (!column) return { target: null, error: `Unbekanntes Trophäen-Feld: ${field_name}` };
    return {
      target: {
        table: TABLES.trophies,
        pkColumn: 'trophy_id',
        pkValue: content_key,
        column,
        gameId: source_identifier,
      },
      error: null,
    };
  }

  if (content_type === 'guide_step') {
    const column = REPORT_ENTITY_MAP.guide_step.fields[field_name] || 'item_name';
    return {
      target: {
        table: TABLES.chapters,
        pkColumn: 'guide_id',
        pkValue: content_key,
        column,
        gameId: source_identifier,
      },
      error: null,
    };
  }

  if (content_type === 'item_name') {
    const { data: bossRow } = await supabase
      .from(TABLES.bosses)
      .select('boss_id')
      .eq('boss_id', content_key)
      .eq('game_id', source_identifier)
      .maybeSingle();

    if (bossRow) {
      const column = REPORT_ENTITY_MAP.boss.fields[field_name] || 'boss_name';
      return {
        target: {
          table: TABLES.bosses,
          pkColumn: 'boss_id',
          pkValue: content_key,
          column,
          gameId: source_identifier,
        },
        error: null,
      };
    }

    const column = REPORT_ENTITY_MAP.guide_item.fields[field_name] || 'item_name';
    return {
      target: {
        table: TABLES.guides,
        pkColumn: 'guide_id',
        pkValue: content_key,
        column,
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

  const patch = { [target.column]: report.suggested_text };

  let query = supabase
    .from(target.table)
    .update(patch)
    .eq(target.pkColumn, target.pkValue);

  if (target.gameId) {
    query = query.eq('game_id', target.gameId);
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
