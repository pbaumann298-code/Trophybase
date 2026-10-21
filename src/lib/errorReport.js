import {
  TABLES,
  ACHIEVEMENT_PK,
  ACHIEVEMENT_STRUCT,
  ACHIEVEMENT_I18N,
  GUIDE_PK,
  GUIDE_I18N,
} from './gameSchema';
import { getLocale } from './locale';
import { readReportableDataset } from './reportableAttrs';

export const ERROR_REPORT_STORAGE_BUCKET = 'error-report-evidence';

const EVIDENCE_MAX_EDGE = 1280;
const EVIDENCE_MAX_BYTES = 150 * 1024;
const EVIDENCE_WEBP_QUALITY = 0.8;

/** Alle Guide-Reiter melden auf dieselbe Spalte in game_guides. */
const GUIDE_REPORT_TARGET = {
  table: TABLES.guides,
  pkColumn: GUIDE_PK,
  jsonLangFields: {
    name: GUIDE_I18N.itemName,
  },
};

/**
 * data-type → Supabase-Ziel.
 * jsonLangFields sind JSONB-Sprachmaps, structFields einfache Textspalten.
 */
export const REPORT_ENTITY_MAP = {
  trophy: {
    table: TABLES.achievements,
    pkColumn: ACHIEVEMENT_PK,
    jsonLangFields: {
      name: ACHIEVEMENT_I18N.name,
      description: ACHIEVEMENT_I18N.desc,
      ai_translation: ACHIEVEMENT_I18N.aiTranslation,
      guide_tip: ACHIEVEMENT_I18N.guideTip,
      guide_tip_long: ACHIEVEMENT_I18N.guideTipLong,
    },
    structFields: {
      video_url: ACHIEVEMENT_STRUCT.videoUrl,
      icon_url: ACHIEVEMENT_STRUCT.iconUrl,
    },
  },
  guide_step: GUIDE_REPORT_TARGET,
  guide_item: GUIDE_REPORT_TARGET,
  item_name: GUIDE_REPORT_TARGET,
  boss: GUIDE_REPORT_TARGET,
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
  const column =
    entity.jsonLangFields?.[attrs.field] ?? entity.structFields?.[attrs.field];
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

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Bild konnte nicht geladen werden.'));
    };
    img.src = url;
  });
}

function canvasToWebpBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      'image/webp',
      quality,
    );
  });
}

/**
 * Skaliert ein Beleg-Bild auf max. 1280px Kante und liefert WebP (< ~150 KB).
 * Bei Canvas-Fehler bleibt die Originaldatei.
 * @param {File} file
 * @returns {Promise<File>}
 */
export async function compressEvidenceImage(file) {
  if (!file || typeof file !== 'object') return file;
  if (!String(file.type || '').startsWith('image/')) return file;

  try {
    const image = await loadImageElement(file);
    const srcW = image.naturalWidth || image.width;
    const srcH = image.naturalHeight || image.height;
    if (!srcW || !srcH) return file;

    const scale = Math.min(1, EVIDENCE_MAX_EDGE / Math.max(srcW, srcH));
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(image, 0, 0, width, height);

    let quality = EVIDENCE_WEBP_QUALITY;
    let blob = await canvasToWebpBlob(canvas, quality);
    if (!blob) return file;

    while (blob.size > EVIDENCE_MAX_BYTES && quality > 0.45) {
      quality = Math.max(0.45, quality - 0.1);
      const next = await canvasToWebpBlob(canvas, quality);
      if (!next) break;
      blob = next;
    }

    const baseName = String(file.name || 'evidence').replace(/\.[^.]+$/, '') || 'evidence';
    const safeName = `${baseName.replace(/[^\w.-]+/g, '_').slice(0, 70)}.webp`;
    return new File([blob], safeName, { type: 'image/webp', lastModified: Date.now() });
  } catch {
    return file;
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} [userId]
 * @param {File} file
 */
export async function uploadErrorReportEvidence(supabase, userId, file) {
  const compressed = await compressEvidenceImage(file);
  const safeName = compressed.name.replace(/[^\w.-]+/g, '_').slice(0, 80);
  const folder = userId || 'anonymous';
  const path = `${folder}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from(ERROR_REPORT_STORAGE_BUCKET)
    .upload(path, compressed, {
      upsert: false,
      contentType: compressed.type || 'image/webp',
    });

  if (error) {
    console.error('error-report evidence upload:', error.message);
    return { url: null, error };
  }

  const { data } = supabase.storage.from(ERROR_REPORT_STORAGE_BUCKET).getPublicUrl(path);
  return { url: data?.publicUrl ?? null, error: null };
}

/** Mehrere Belege parallel hochladen. */
export async function uploadErrorReportEvidenceBatch(supabase, userId, files) {
  const list = files?.filter(Boolean) ?? [];
  if (list.length === 0) return { urls: [], error: null };

  const results = await Promise.all(
    list.map((file) => uploadErrorReportEvidence(supabase, userId, file)),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return { urls: results.map((r) => r.url).filter(Boolean), error: failed.error };
  }

  return { urls: results.map((r) => r.url).filter(Boolean), error: null };
}

/**
 * Speichert 1..n URLs in image_url (TEXT).
 * Ein Bild = plain URL; mehrere = JSON-Array (abwärtskompatibel).
 * @param {string[]} urls
 */
export function serializeReportImageUrls(urls) {
  const clean = (urls ?? []).filter(Boolean);
  if (clean.length === 0) return null;
  if (clean.length === 1) return clean[0];
  return JSON.stringify(clean);
}

/** Liest image_url – einzelne URL oder JSON-Array. */
export function parseReportImageUrls(imageUrl) {
  if (!imageUrl) return [];
  const trimmed = String(imageUrl).trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [trimmed];
    } catch {
      return [trimmed];
    }
  }
  return [trimmed];
}

/**
 * Schleuse: public.tb_submit_error_report (Honeypot + elapsed_ms serverseitig).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   metadata: ReturnType<typeof resolveReportMetadata>,
 *   markedContent: string,
 *   contentKind: string,
 *   suggestion: string,
 *   imageUrl?: string | null,
 *   imageUrls?: string[],
 *   languageCode?: string,
 *   honeypot?: string,
 *   elapsedMs?: number,
 * }} payload
 */
export async function submitErrorReport(supabase, payload) {
  const {
    metadata,
    markedContent,
    contentKind,
    suggestion,
    imageUrl = null,
    imageUrls,
    languageCode = getLocale(),
    honeypot = '',
    elapsedMs = 0,
  } = payload;

  if (!metadata) {
    return { data: null, error: new Error('Kein meldbarer Datenkontext') };
  }

  const originalText = normalizeOriginalText(markedContent, contentKind);
  const suggestedText = suggestion?.trim();

  if (!suggestedText) {
    return { data: null, error: new Error('Änderungsvorschlag ist erforderlich.') };
  }

  const storedImageUrl =
    imageUrls?.length > 0
      ? serializeReportImageUrls(imageUrls)
      : imageUrl;

  const { data, error } = await supabase.rpc('tb_submit_error_report', {
    p_source: metadata.sourceIdentifier,
    p_content_type: metadata.contentType,
    p_content_key: metadata.contentKey,
    p_field_name: metadata.fieldName,
    p_original_text: originalText,
    p_suggested_text: suggestedText,
    p_language_code: languageCode,
    p_image_url: storedImageUrl,
    p_honeypot: String(honeypot ?? ''),
    p_elapsed_ms: Number(elapsedMs) || 0,
  });

  if (error) {
    console.error('tb_submit_error_report:', error.message);
    if (error.code === '42501' || /row-level security/i.test(error.message)) {
      return {
        data: null,
        error: new Error(
          'Speichern blockiert (RLS). Bitte in Supabase die RPC tb_submit_error_report prüfen oder neu anmelden.',
        ),
      };
    }
  }

  return { data, error };
}
