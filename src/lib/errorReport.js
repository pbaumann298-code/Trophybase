import { TABLES } from './gameSchema';
import { getLocale } from './locale';
import { readReportableDataset } from './reportableAttrs';

export const ERROR_REPORT_STORAGE_BUCKET = 'error-report-evidence';

/** data-type → Supabase-Tabelle & Spalten (nur UI / Admin-Routing) */
export const REPORT_ENTITY_MAP = {
  trophy: {
    table: TABLES.trophies,
    pkColumn: 'trophy_id',
    fields: {
      name: 'trophy_name',
      description: 'trophy_desc',
      guide_tip: 'guide_tip',
      icon_url: 'icon_url',
      video_url: 'video_url',
    },
  },
  guide_step: {
    table: TABLES.chapters,
    pkColumn: 'guide_id',
    fields: {
      name: 'item_name',
    },
  },
  guide_item: {
    table: TABLES.guides,
    pkColumn: 'guide_id',
    fields: {
      name: 'item_name',
    },
  },
  item_name: {
    table: TABLES.guides,
    pkColumn: 'guide_id',
    fields: {
      name: 'item_name',
    },
  },
  boss: {
    table: TABLES.bosses,
    pkColumn: 'boss_id',
    fields: {
      name: 'boss_name',
    },
  },
};

/** data-type (HTML) → community_reports.content_type */
const CONTENT_TYPE_TO_DB = {
  trophy: 'trophy',
  guide_step: 'guide_step',
  guide_item: 'item_name',
  item_name: 'item_name',
  boss: 'item_name',
  ui_text: 'ui_text',
};

/**
 * @param {{ source: string, type: string, key: string, field: string }} attrs
 */
export function resolveReportMetadata(attrs) {
  if (!attrs) return null;
  const entity = REPORT_ENTITY_MAP[attrs.type];
  if (!entity) return null;
  const column = entity.fields[attrs.field];
  if (!column) return null;

  return {
    sourceIdentifier: attrs.source,
    contentType: CONTENT_TYPE_TO_DB[attrs.type] ?? attrs.type,
    contentKey: String(attrs.key),
    fieldName: attrs.field,
    sourceTable: entity.table,
    sourceColumn: column,
    pkColumn: entity.pkColumn,
  };
}

/**
 * @param {Element} element
 */
export function metadataFromElement(element) {
  const attrs = readReportableDataset(element);
  return resolveReportMetadata(attrs);
}

/**
 * @param {Element} element
 * @returns {'text'|'image'|'video'}
 */
export function detectContentKind(element, selectedText) {
  if (!element) return 'text';
  const tag = element.tagName?.toUpperCase();
  if (tag === 'IMG') return 'image';
  if (tag === 'VIDEO' || tag === 'IFRAME') return 'video';
  if (element.dataset?.field === 'icon_url') return 'image';
  if (element.dataset?.field === 'video_url') return 'video';
  return selectedText ? 'text' : 'text';
}

/** @param {string} markedContent @param {'text'|'image'|'video'} contentKind */
export function normalizeOriginalText(markedContent, contentKind) {
  const text = markedContent?.trim();
  if (text) return text;
  if (contentKind === 'image') return '[Bild / Icon]';
  if (contentKind === 'video') return '[Video]';
  return '[Inhalt]';
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} [userId]
 * @param {File} file
 */
export async function uploadErrorReportEvidence(supabase, userId, file) {
  const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 80);
  const folder = userId || 'anonymous';
  const path = `${folder}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from(ERROR_REPORT_STORAGE_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined });

  if (error) {
    console.error('error-report evidence upload:', error.message);
    return { url: null, error };
  }

  const { data } = supabase.storage.from(ERROR_REPORT_STORAGE_BUCKET).getPublicUrl(path);
  return { url: data?.publicUrl ?? null, error: null };
}

/**
 * Insert in public.community_reports
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   metadata: ReturnType<typeof resolveReportMetadata>,
 *   markedContent: string,
 *   contentKind: string,
 *   suggestion: string,
 *   imageUrl?: string | null,
 *   languageCode?: string,
 *   userId?: string | null,
 * }} payload
 */
export async function submitErrorReport(supabase, payload) {
  const {
    metadata,
    markedContent,
    contentKind,
    suggestion,
    imageUrl = null,
    languageCode = getLocale(),
    userId = null,
  } = payload;

  if (!metadata) {
    return { data: null, error: new Error('Kein meldbarer Datenkontext') };
  }

  const originalText = normalizeOriginalText(markedContent, contentKind);
  const suggestedText = suggestion?.trim();

  if (!suggestedText) {
    return { data: null, error: new Error('Änderungsvorschlag ist erforderlich.') };
  }

  const row = {
    source_identifier: metadata.sourceIdentifier,
    content_type: metadata.contentType,
    content_key: metadata.contentKey,
    field_name: metadata.fieldName,
    original_text: originalText,
    suggested_text: suggestedText,
    language_code: languageCode,
    image_url: imageUrl,
    user_id: userId || null,
    status: 'pending',
  };

  const { data, error } = await supabase
    .from(TABLES.communityReports)
    .insert(row)
    .select('id')
    .single();

  if (error) {
    console.error('community_reports insert:', error.message, row);
  }

  return { data, error };
}
