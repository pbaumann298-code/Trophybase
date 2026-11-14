import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../../pages/supabaseClient';

const ROADMAP_MEDIA_BUCKET = 'admin-roadmap-media';
const SCREENSHOT_MAX_EDGE = 1600;
const SCREENSHOT_MAX_BYTES = 260 * 1024;
const SCREENSHOT_WEBP_QUALITY = 0.84;

const ACTIVE_STATUS_OPTIONS = [
  {
    value: 'IN_PROGRESS',
    shortLabel: 'WIP',
    label: '🔥 In Arbeit',
    badgeClass: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  },
  {
    value: 'PLANNED',
    shortLabel: 'PLAN',
    label: '📅 Geplant',
    badgeClass: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
  },
  {
    value: 'IDEA',
    shortLabel: 'IDEA',
    label: '💡 Idee',
    badgeClass: 'border-purple-500/40 bg-purple-500/15 text-purple-300',
  },
];

const ARCHIVE_STATUS_OPTIONS = [
  {
    value: 'DONE',
    shortLabel: 'DONE',
    label: '✅ Erledigt',
    badgeClass: 'border-[#00ff66]/40 bg-[#00ff66]/15 text-[#00ff66]',
  },
  {
    value: 'REJECTED',
    shortLabel: 'VERWORFEN',
    label: '❌ Verworfen',
    badgeClass: 'border-red-500/40 bg-red-500/15 text-red-300',
  },
];

const ALL_STATUS_OPTIONS = [...ACTIVE_STATUS_OPTIONS, ...ARCHIVE_STATUS_OPTIONS];

const CATEGORY_OPTIONS = [
  { value: 'Bugs', icon: '🐛', label: 'Bugs', style: 'border-rose-500/40 bg-rose-500/12 text-rose-300' },
  { value: 'Architektur', icon: '🏛️', label: 'Architektur', style: 'border-cyan-400/40 bg-cyan-500/10 text-cyan-300' },
  { value: 'Meilenstein', icon: '🏆', label: 'Meilenstein', style: 'border-amber-400/40 bg-amber-500/10 text-amber-300' },
  { value: 'Hub & Content', icon: '📚', label: 'Hub & Content', style: 'border-[#00ff66]/40 bg-[#00ff66]/10 text-[#00ff66]' },
  { value: 'Monetarisierung', icon: '💰', label: 'Monetarisierung', style: 'border-purple-400/40 bg-purple-500/10 text-purple-300' },
];

const DEFAULT_TOPIC_GROUPS = [
  'User-Bereich',
  'Entwürfe / Staging',
  'Krankenstation',
  'Übersetzer / i18n',
  'Steam & Xbox',
  'Hubs & Katalog',
  'Creator & Partner',
  'Affiliate & Handel',
  'Video-Pipeline',
  'Allgemein',
];

function isArchivedStatus(status) {
  return status === 'DONE' || status === 'REJECTED';
}

function getCategoryMeta(category) {
  return (
    CATEGORY_OPTIONS.find((c) => c.value === category) || {
      value: category || 'Bugs',
      icon: '📌',
      label: category || 'Bugs',
      style: 'border-zinc-700 bg-zinc-800 text-zinc-300',
    }
  );
}

function getStatusMeta(status) {
  return (
    ALL_STATUS_OPTIONS.find((s) => s.value === status) || {
      value: status || 'IDEA',
      shortLabel: status || 'IDEA',
      label: status || 'IDEA',
      badgeClass: 'border-zinc-700 bg-zinc-800 text-zinc-300',
    }
  );
}

function getTodayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayDDMM() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.`;
}

function formatDateShort(isoDateStr) {
  if (!isoDateStr) return null;
  const clean = String(isoDateStr).slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return clean;
  const [yyyy, mm, dd] = parts;
  const currentYear = String(new Date().getFullYear());
  return yyyy === currentYear ? `${dd}.${mm}.` : `${dd}.${mm}.${yyyy.slice(2)}`;
}

function normalizeCategory(rawCategory, fallback = 'Bugs') {
  if (!rawCategory) return fallback;
  const trimmed = String(rawCategory).trim();
  const exact = CATEGORY_OPTIONS.find((c) => c.value.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact.value;
  const low = trimmed.toLowerCase();
  if (low.includes('bug') || low.includes('bux') || low.includes('fix') || low.includes('fehler')) return 'Bugs';
  if (low.includes('hub') || low.includes('content')) return 'Hub & Content';
  if (low.includes('meilen')) return 'Meilenstein';
  if (low.includes('arch')) return 'Architektur';
  if (low.includes('monet') || low.includes('kapital')) return 'Monetarisierung';
  return fallback;
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
      reject(new Error('Bild konnte nicht gelesen werden.'));
    };
    img.src = url;
  });
}

function canvasToWebpBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/webp', quality);
  });
}

async function compressRoadmapScreenshot(file) {
  if (!file || !String(file.type || '').startsWith('image/')) return file;
  try {
    const img = await loadImageElement(file);
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) return file;

    const scale = Math.min(1, SCREENSHOT_MAX_EDGE / Math.max(srcW, srcH));
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    let quality = SCREENSHOT_WEBP_QUALITY;
    let blob = await canvasToWebpBlob(canvas, quality);
    if (!blob) return file;

    while (blob.size > SCREENSHOT_MAX_BYTES && quality > 0.48) {
      quality = Math.max(0.48, quality - 0.1);
      const next = await canvasToWebpBlob(canvas, quality);
      if (!next) break;
      blob = next;
    }

    return new File([blob], 'screenshot.webp', {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

async function uploadRoadmapScreenshot(file) {
  const compressed = await compressRoadmapScreenshot(file);
  const ext = compressed.type === 'image/png' ? 'png' : compressed.type === 'image/jpeg' ? 'jpg' : 'webp';
  const uuid = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `items/${uuid}.${ext}`;

  const { error } = await supabase.storage
    .from(ROADMAP_MEDIA_BUCKET)
    .upload(path, compressed, {
      upsert: false,
      contentType: compressed.type || 'image/webp',
    });

  if (error) {
    return { url: null, path: null, error };
  }

  const { data } = supabase.storage.from(ROADMAP_MEDIA_BUCKET).getPublicUrl(path);
  return { url: data?.publicUrl ?? null, path, error: null };
}

async function removeRoadmapScreenshots(paths) {
  const clean = [...new Set((paths ?? []).map((p) => String(p || '').trim()).filter(Boolean))];
  if (!clean.length) return;
  const { error } = await supabase.storage.from(ROADMAP_MEDIA_BUCKET).remove(clean);
  if (error) {
    console.warn('Screenshot-Bereinigung im Storage fehlgeschlagen:', error.message);
  }
}

function extractPastedImageFile(clipboardEvent) {
  const items = clipboardEvent?.clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (item.kind === 'file' && String(item.type || '').startsWith('image/')) {
      return item.getAsFile();
    }
  }
  return null;
}

function RoadmapRow({
  item,
  showCategoryBadge,
  isArchiveView,
  onUpdate,
  onArchive,
  onDelete,
  onOpenLightbox,
}) {
  const [expanded, setExpanded] = useState(false);
  const [titleState, setTitleState] = useState({ base: item.title ?? '', draft: item.title ?? '' });
  const [notesState, setNotesState] = useState({ base: item.notes ?? '', draft: item.notes ?? '' });
  const [groupState, setGroupState] = useState({
    base: item.topic_group ?? 'Allgemein',
    draft: item.topic_group ?? 'Allgemein',
  });
  const [quickDetail, setQuickDetail] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingShot, setUploadingShot] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [confirmDone, setConfirmDone] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInputRef = useRef(null);

  if (titleState.base !== (item.title ?? '')) {
    setTitleState({ base: item.title ?? '', draft: item.title ?? '' });
  }
  if (notesState.base !== (item.notes ?? '')) {
    setNotesState({ base: item.notes ?? '', draft: item.notes ?? '' });
  }
  if (groupState.base !== (item.topic_group ?? 'Allgemein')) {
    setGroupState({
      base: item.topic_group ?? 'Allgemein',
      draft: item.topic_group ?? 'Allgemein',
    });
  }

  useEffect(() => {
    if (!confirmDone) return undefined;
    const timer = window.setTimeout(() => setConfirmDone(false), 3200);
    return () => window.clearTimeout(timer);
  }, [confirmDone]);

  useEffect(() => {
    if (!confirmDelete) return undefined;
    const timer = window.setTimeout(() => setConfirmDelete(false), 3200);
    return () => window.clearTimeout(timer);
  }, [confirmDelete]);

  const showSavedFeedback = (msg = '✓ Gespeichert') => {
    setFeedback(msg);
    window.setTimeout(() => {
      setFeedback((prev) => (prev === msg ? '' : prev));
    }, 2000);
  };

  const title = titleState.draft;
  const notes = notesState.draft;
  const topicGroup = groupState.draft;
  const isDirtyTitle = title.trim() !== (item.title ?? '').trim() && Boolean(title.trim());
  const isDirtyNotes = notes !== (item.notes ?? '');
  const isDirtyGroup = topicGroup.trim() !== (item.topic_group ?? 'Allgemein').trim() && Boolean(topicGroup.trim());

  const savePatch = async (patch, msg = '✓ Gespeichert') => {
    setSaving(true);
    const ok = await onUpdate(item.id, patch);
    setSaving(false);
    if (ok) showSavedFeedback(msg);
    return ok;
  };

  const handleUploadFile = async (file) => {
    if (!file || uploadingShot) return;
    setUploadingShot(true);
    const oldPath = item.screenshot_path || null;
    const { url, path, error } = await uploadRoadmapScreenshot(file);
    if (error || !url) {
      setUploadingShot(false);
      showSavedFeedback(`⚠ Upload-Fehler: ${error?.message || 'Unbekannt'}`);
      return;
    }
    const ok = await onUpdate(item.id, {
      screenshot_url: url,
      screenshot_path: path,
    });
    if (ok && oldPath && oldPath !== path) {
      await removeRoadmapScreenshots([oldPath]);
    }
    setUploadingShot(false);
    if (ok) showSavedFeedback('📷 Screenshot gespeichert');
  };

  const handleRemoveScreenshot = async () => {
    if (!item.screenshot_url && !item.screenshot_path) return;
    setUploadingShot(true);
    const oldPath = item.screenshot_path;
    const ok = await onUpdate(item.id, {
      screenshot_url: null,
      screenshot_path: null,
    });
    if (ok && oldPath) {
      await removeRoadmapScreenshots([oldPath]);
    }
    setUploadingShot(false);
    if (ok) showSavedFeedback('🗑️ Bild entfernt');
  };

  const handleAppendDetail = async (e) => {
    e?.preventDefault();
    const text = quickDetail.trim();
    if (!text || saving) return;
    const stamp = getTodayDDMM();
    const newLine = `• [${stamp}] ${text}`;
    const updatedNotes = notes.trim() ? `${notes.trimEnd()}\n${newLine}` : newLine;
    setNotesState((prev) => ({ ...prev, draft: updatedNotes }));
    setQuickDetail('');
    await savePatch({ notes: updatedNotes }, '+ Detail ergänzt');
  };

  const statusMeta = getStatusMeta(item.status);
  const categoryMeta = getCategoryMeta(item.category);
  const targetIso = item.target_date ? String(item.target_date).slice(0, 10) : '';
  const dateLabel = formatDateShort(targetIso);
  const isOverdue = !isArchiveView && Boolean(targetIso) && targetIso < getTodayIso();
  const hasNotes = Boolean(String(item.notes ?? '').trim());
  const hasScreenshot = Boolean(item.screenshot_url);

  return (
    <div
      onPaste={(e) => {
        if (!expanded || isArchiveView) return;
        const pasted = extractPastedImageFile(e);
        if (pasted) {
          e.preventDefault();
          handleUploadFile(pasted);
        }
      }}
      className={`rounded-xl border transition ${
        item.is_urgent && !isArchiveView
          ? 'border-orange-500/45 bg-[#171312]'
          : expanded
            ? 'border-zinc-700 bg-[#151719]'
            : 'border-zinc-800/80 bg-[#121315] hover:border-zinc-700/80'
      }`}
    >
      {/* Kompakte 1-Zeilen-Ansicht (Mobil-optimiert) */}
      <div className="flex items-center gap-2 px-2.5 py-2 sm:px-3">
        {/* Schnell-Abhaken (2-Tap ohne Browser-Confirm) */}
        {!isArchiveView ? (
          <button
            type="button"
            disabled={saving}
            onClick={(e) => {
              e.stopPropagation();
              if (!confirmDone) {
                setConfirmDone(true);
                return;
              }
              setConfirmDone(false);
              onArchive(item, 'DONE');
            }}
            title={
              confirmDone
                ? 'Nochmal tippen: Als erledigt archivieren & Screenshot löschen'
                : 'Als erledigt markieren (Archiv)'
            }
            className={`shrink-0 rounded-lg border font-mono text-[10px] font-bold transition cursor-pointer ${
              confirmDone
                ? 'border-[#00ff66] bg-[#00ff66] px-2 py-1 text-black'
                : 'h-6 w-6 flex items-center justify-center border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-[#00ff66]/60 hover:text-[#00ff66]'
            }`}
          >
            {confirmDone ? '✓ Archiv?' : '✓'}
          </button>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={(e) => {
              e.stopPropagation();
              savePatch({ status: 'IDEA' }, '↩ Reaktiviert');
            }}
            title="Zurück in aktive Liste holen (IDEA)"
            className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300 hover:border-[#00ff66]/50 hover:text-[#00ff66] cursor-pointer"
          >
            ↩
          </button>
        )}

        {/* Dringend-Flamme (direkt toggelbar im Aktiv-Modus) */}
        {!isArchiveView && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              savePatch({ is_urgent: !item.is_urgent }, !item.is_urgent ? '🔥 Dringend' : 'Normal');
            }}
            title={item.is_urgent ? 'Dringend-Markierung aufheben' : 'Als 🔥 Dringend markieren'}
            className={`shrink-0 rounded-md px-1 py-0.5 text-xs transition cursor-pointer ${
              item.is_urgent
                ? 'bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40'
                : 'opacity-30 grayscale hover:opacity-80 hover:grayscale-0'
            }`}
          >
            🔥
          </button>
        )}

        {/* Status-Kurzbadge */}
        <span
          className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-mono font-bold tracking-tight ${statusMeta.badgeClass}`}
        >
          {statusMeta.shortLabel}
        </span>

        {/* Klickbarer Titel + kompakte Indikatoren */}
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left cursor-pointer"
        >
          <span
            className={`min-w-0 flex-1 text-xs sm:text-[13px] font-semibold leading-snug ${
              expanded ? 'whitespace-normal text-white' : 'line-clamp-2 sm:truncate text-zinc-100'
            }`}
          >
            {item.title}
          </span>

          {showCategoryBadge && (
            <span
              className={`hidden sm:inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-mono ${categoryMeta.style}`}
            >
              <span>{categoryMeta.icon}</span>
              <span>{categoryMeta.label}</span>
            </span>
          )}

          {dateLabel && (
            <span
              title={isOverdue ? `Überfällig (${targetIso})` : `Zieldatum: ${targetIso}`}
              className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-mono font-bold ${
                isOverdue
                  ? 'border-red-500/50 bg-red-500/15 text-red-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              }`}
            >
              {isOverdue ? '⚠ ' : '📅 '}
              {dateLabel}
            </span>
          )}

          {hasNotes && !expanded && (
            <span
              title={item.notes}
              className="shrink-0 text-[11px] text-zinc-500"
              aria-label="Hat Notizen"
            >
              📝
            </span>
          )}
        </button>

        {/* Rechts: Screenshot-Slot (wie video_url) + Aufklapp-Pfeil */}
        <div className="flex shrink-0 items-center gap-1.5">
          {hasScreenshot && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenLightbox(item.screenshot_url, item.title);
              }}
              title="Screenshot ansehen"
              className="group relative h-7 w-7 overflow-hidden rounded-lg border border-sky-500/40 bg-zinc-900 shadow-sm hover:border-[#00ff66] cursor-pointer"
            >
              <img
                src={item.screenshot_url}
                alt="Screenshot"
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
          )}

          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            title={expanded ? 'Zuklappen' : 'Details & Bearbeitung öffnen'}
            className="rounded-lg border border-transparent px-1.5 py-1 text-xs text-zinc-500 hover:border-zinc-700 hover:text-zinc-200 cursor-pointer"
          >
            {expanded ? '▴' : '▾'}
          </button>
        </div>
      </div>

      {/* Aufgeklappter Detail- & Edit-Bereich */}
      {expanded && (
        <div className="flex flex-col gap-3 border-t border-zinc-800/80 px-3 py-3 text-xs">
          {/* Status / Feedback-Zeile oben */}
          {(saving || uploadingShot || feedback) && (
            <div className="flex items-center justify-end gap-2 text-[11px] font-mono">
              {(saving || uploadingShot) && (
                <span className="text-amber-300 animate-pulse">
                  {uploadingShot ? 'Bild wird verarbeitet…' : 'Speichert…'}
                </span>
              )}
              {!saving && !uploadingShot && feedback && (
                <span className="text-[#00ff66] font-bold">{feedback}</span>
              )}
            </div>
          )}

          {/* 1. Titel bearbeiten */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitleState((prev) => ({ ...prev, draft: e.target.value }))}
              onBlur={() => {
                if (isDirtyTitle) {
                  savePatch({ title: title.trim() });
                }
              }}
              placeholder="Punkt / Bug-Titel…"
              className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-1.5 text-xs sm:text-sm font-bold text-white focus:border-[#00ff66] focus:outline-none"
            />
            {isDirtyTitle && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => savePatch({ title: title.trim() })}
                className="shrink-0 rounded-lg bg-[#00ff66] px-2.5 py-1.5 text-[11px] font-mono font-bold text-black hover:bg-[#00ff66]/90 cursor-pointer"
              >
                Speichern
              </button>
            )}
          </div>

          {/* 2. Metadaten-Grid: Status, Kategorie, Gruppe, Datum */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <select
              value={item.status}
              onChange={(e) => {
                const nextStatus = e.target.value;
                if (isArchivedStatus(nextStatus)) {
                  onArchive(item, nextStatus);
                } else {
                  savePatch({ status: nextStatus });
                }
              }}
              className={`rounded-xl border px-2.5 py-1.5 text-[11px] font-mono font-bold cursor-pointer focus:outline-none ${statusMeta.badgeClass}`}
            >
              {ALL_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-zinc-900 text-zinc-200">
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              value={item.category}
              onChange={(e) => savePatch({ category: e.target.value })}
              className={`rounded-xl border px-2.5 py-1.5 text-[11px] font-mono font-bold cursor-pointer focus:outline-none ${categoryMeta.style}`}
            >
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat.value} value={cat.value} className="bg-zinc-900 text-zinc-200">
                  {cat.icon} {cat.label}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1">
              <input
                type="text"
                list="roadmap-topic-groups"
                value={topicGroup}
                onChange={(e) => setGroupState((prev) => ({ ...prev, draft: e.target.value }))}
                onBlur={() => {
                  if (isDirtyGroup) {
                    savePatch({ topic_group: topicGroup.trim() }, '✓ Gruppe geändert');
                  }
                }}
                placeholder="Gruppe (z. B. User-Bereich)"
                title="Baustelle / Gruppe (analog Chrono/Collectibles)"
                className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-mono text-zinc-200 focus:border-[#00ff66] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1 rounded-xl border border-zinc-700/80 bg-zinc-900 px-2 py-1">
              <span className="text-[11px]">📅</span>
              <input
                type="date"
                value={targetIso}
                onChange={(e) => savePatch({ target_date: e.target.value || null })}
                className="min-w-0 flex-1 bg-transparent text-[11px] font-mono text-zinc-200 focus:outline-none"
              />
              {targetIso && (
                <button
                  type="button"
                  onClick={() => savePatch({ target_date: null })}
                  title="Zieldatum löschen"
                  className="px-1 text-[10px] text-zinc-400 hover:text-red-300 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* 3. Screenshot-Slot (max. 1 Bild, analog video_url) */}
          {!isArchiveView && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) handleUploadFile(file);
                }}
              />

              {hasScreenshot ? (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenLightbox(item.screenshot_url, item.title)}
                    className="overflow-hidden rounded-lg border border-zinc-700 hover:border-[#00ff66] cursor-pointer"
                  >
                    <img
                      src={item.screenshot_url}
                      alt="Screenshot Vorschau"
                      className="h-14 w-20 object-cover"
                    />
                  </button>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-semibold text-zinc-200">
                      Temporärer Screenshot angehängt
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      Wird beim Archivieren (Erledigt/Verworfen) automatisch gelöscht
                    </span>
                  </div>
                </div>
              ) : (
                <span className="text-[11px] font-mono text-zinc-400">
                  📷 Kein Screenshot (Button rechts oder <kbd className="rounded bg-zinc-800 px-1">Strg+V</kbd> zum Einfügen)
                </span>
              )}

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={uploadingShot}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[11px] font-mono text-zinc-200 hover:border-[#00ff66]/50 hover:text-[#00ff66] disabled:opacity-40 cursor-pointer"
                >
                  {hasScreenshot ? '🔄 Ersetzen' : '📷 Screenshot'}
                </button>
                {hasScreenshot && (
                  <button
                    type="button"
                    disabled={uploadingShot}
                    onClick={handleRemoveScreenshot}
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-mono text-red-300 hover:bg-red-500/20 disabled:opacity-40 cursor-pointer"
                  >
                    🗑️ Bild weg
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 4. Notizen + Schnell-Ergänzung */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                Notizen / Kontext / Lösung
              </span>
              {isDirtyNotes && (
                <button
                  type="button"
                  disabled={saving}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => savePatch({ notes })}
                  className="rounded-md bg-[#00ff66] px-2.5 py-0.5 text-[10px] font-mono font-bold text-black hover:bg-[#00ff66]/90 cursor-pointer"
                >
                  ✓ Notiz speichern
                </button>
              )}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotesState((prev) => ({ ...prev, draft: e.target.value }))}
              onBlur={() => {
                if (isDirtyNotes) {
                  savePatch({ notes });
                }
              }}
              rows={Math.min(8, Math.max(2, (notes.match(/\n/g)?.length ?? 0) + 2))}
              placeholder="Optionale Details, Repro-Schritte oder Grund fürs Verwerfen (z. B. Kapital)…"
              className="w-full resize-y rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-200 leading-relaxed placeholder-zinc-600 focus:border-[#00ff66]/60 focus:outline-none"
            />

            {!isArchiveView && (
              <form onSubmit={handleAppendDetail} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={quickDetail}
                  onChange={(e) => setQuickDetail(e.target.value)}
                  placeholder={`+ Kurze Notiz anhängen (• [${getTodayDDMM()}] …)`}
                  className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-[#00ff66] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!quickDetail.trim() || saving}
                  className="shrink-0 rounded-xl border border-[#00ff66]/40 bg-[#00ff66]/15 px-2.5 py-1.5 text-[11px] font-mono font-bold text-[#00ff66] hover:bg-[#00ff66]/25 disabled:opacity-40 cursor-pointer"
                >
                  + Anhängen
                </button>
              </form>
            )}
          </div>

          {/* 5. Aktions-Fußzeile (Archivieren / Verwerfen / Löschen) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/70 pt-2">
            <span className="text-[10px] font-mono text-zinc-500">
              {isArchiveView && item.archived_at
                ? `🗄️ Archiviert am ${new Date(item.archived_at).toLocaleDateString('de-DE')}`
                : item.updated_at
                  ? `Aktualisiert: ${new Date(item.updated_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                  : ''}
            </span>

            <div className="flex flex-wrap items-center gap-1.5">
              {!isArchiveView ? (
                <>
                  <button
                    type="button"
                    onClick={() => onArchive(item, 'DONE')}
                    className="rounded-lg border border-[#00ff66]/40 bg-[#00ff66]/12 px-2.5 py-1 text-[11px] font-mono font-bold text-[#00ff66] hover:bg-[#00ff66]/20 cursor-pointer"
                  >
                    ✅ Erledigt → Archiv
                  </button>
                  <button
                    type="button"
                    onClick={() => onArchive(item, 'REJECTED')}
                    title="Behält die Fach-Kategorie bei und wandert durchsuchbar ins Archiv"
                    className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-2.5 py-1 text-[11px] font-mono text-amber-300 hover:bg-amber-500/20 cursor-pointer"
                  >
                    ❌ Verwerfen → Archiv
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => savePatch({ status: 'IDEA' }, '↩ Reaktiviert')}
                  className="rounded-lg border border-[#00ff66]/40 bg-[#00ff66]/12 px-2.5 py-1 text-[11px] font-mono font-bold text-[#00ff66] hover:bg-[#00ff66]/20 cursor-pointer"
                >
                  ↩️ Wieder aktivieren
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  setConfirmDelete(false);
                  onDelete(item);
                }}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-mono transition cursor-pointer ${
                  confirmDelete
                    ? 'border-red-500 bg-red-500 font-bold text-white'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-red-500/40 hover:text-red-300'
                }`}
              >
                {confirmDelete ? 'Wirklich löschen?' : '🗑️'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function IntranetRoadmap() {
  const [activeItems, setActiveItems] = useState([]);
  const [archiveItems, setArchiveItems] = useState([]);
  const [archiveLoaded, setArchiveLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Ansichts- & Filter-State
  const [viewMode, setViewMode] = useState('active'); // 'active' | 'archive'
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [onlyUrgent, setOnlyUrgent] = useState(false);
  const [groupByGroup, setGroupByGroup] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState({});

  // Schnelleingabe (1 Zeile = 1 Bug/Punkt + optional 1 Screenshot)
  const [quickCategory, setQuickCategory] = useState('Bugs');
  const [quickGroup, setQuickGroup] = useState('User-Bereich');
  const [quickTitle, setQuickTitle] = useState('');
  const [quickUrgent, setQuickUrgent] = useState(false);
  const [quickExtraOpen, setQuickExtraOpen] = useState(false);
  const [quickNotes, setQuickNotes] = useState('');
  const [quickTargetDate, setQuickTargetDate] = useState('');
  const [quickFile, setQuickFile] = useState(null);
  const [quickPreviewUrl, setQuickPreviewUrl] = useState('');
  const [quickSubmitting, setQuickSubmitting] = useState(false);

  // Optionaler Batch-Import (Keep / Gemini)
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);

  // Lightbox für Screenshots
  const [lightbox, setLightbox] = useState(null); // { url, title }

  const quickTitleInputRef = useRef(null);
  const quickFileInputRef = useRef(null);
  const previewUrlRef = useRef('');

  const updateQuickFile = useCallback((nextFile) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = '';
    }
    if (!nextFile) {
      setQuickFile(null);
      setQuickPreviewUrl('');
      return;
    }
    const nextUrl = URL.createObjectURL(nextFile);
    previewUrlRef.current = nextUrl;
    setQuickFile(nextFile);
    setQuickPreviewUrl(nextUrl);
  }, []);

  useEffect(() => () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = '';
    }
  }, []);

  // 1. Nur aktive Einträge laden (0 Ballast durch DONE / REJECTED)
  const fetchActiveRoadmap = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: readErr } = await supabase
        .from('admin_roadmap')
        .select('*')
        .not('status', 'in', '("DONE","REJECTED")')
        .order('is_urgent', { ascending: false })
        .order('created_at', { ascending: false });

      if (readErr) {
        setError(`Fehler beim Laden: ${readErr.message}`);
        setActiveItems([]);
      } else {
        setActiveItems(data ?? []);
      }
    } catch (err) {
      setError(err.message || 'Unerwarteter Fehler beim Laden.');
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. Archiv nur bei Bedarf (Lazy) nachladen
  const fetchArchiveRoadmap = useCallback(async () => {
    setArchiveLoading(true);
    setError('');
    try {
      const { data, error: readErr } = await supabase
        .from('admin_roadmap')
        .select('*')
        .in('status', ['DONE', 'REJECTED'])
        .order('archived_at', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false });

      if (readErr) {
        setError(`Archiv-Fehler: ${readErr.message}`);
      } else {
        setArchiveItems(data ?? []);
        setArchiveLoaded(true);
      }
    } catch (err) {
      setError(err.message || 'Unerwarteter Fehler beim Laden des Archivs.');
    } finally {
      setArchiveLoading(false);
    }
  }, []);

  // Initialer Abruf + Hintergrund-Putzer für SQL-archivierte Screenshots
  useEffect(() => {
    let cancelled = false;

    async function initRoadmap() {
      try {
        const { data, error: readErr } = await supabase
          .from('admin_roadmap')
          .select('*')
          .not('status', 'in', '("DONE","REJECTED")')
          .order('is_urgent', { ascending: false })
          .order('created_at', { ascending: false });

        if (cancelled) return;
        if (readErr) {
          setError(`Fehler beim Laden: ${readErr.message}`);
          setActiveItems([]);
        } else {
          setActiveItems(data ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Unerwarteter Fehler beim Laden.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    async function reapOrphanArchivedScreenshots() {
      const { data } = await supabase
        .from('admin_roadmap')
        .select('id, screenshot_path')
        .in('status', ['DONE', 'REJECTED'])
        .not('screenshot_path', 'is', null);

      if (cancelled || !data?.length) return;
      const paths = data.map((r) => r.screenshot_path).filter(Boolean);
      const ids = data.map((r) => r.id);
      await removeRoadmapScreenshots(paths);
      await supabase
        .from('admin_roadmap')
        .update({ screenshot_path: null, screenshot_url: null })
        .in('id', ids);
    }

    initRoadmap();
    reapOrphanArchivedScreenshots();
    return () => {
      cancelled = true;
    };
  }, []);

  const switchToViewMode = (mode) => {
    setViewMode(mode);
    setFilterStatus('ALL');
    if (mode === 'archive' && !archiveLoaded) {
      fetchArchiveRoadmap();
    }
  };

  const selectCategoryFilter = (cat) => {
    setFilterCategory(cat);
    if (cat !== 'ALL') {
      setQuickCategory(cat);
    }
  };

  // Alle bekannten Gruppen für Autocomplete (<datalist>)
  const allTopicGroups = useMemo(() => {
    const dynamicGroups = [...activeItems, ...archiveItems]
      .map((i) => String(i.topic_group ?? '').trim())
      .filter(Boolean);
    return [...new Set([...DEFAULT_TOPIC_GROUPS, ...dynamicGroups])].sort((a, b) =>
      a.localeCompare(b, 'de'),
    );
  }, [activeItems, archiveItems]);

  // Schnellanlage: 1 Zeile + optional 1 Screenshot
  const handleQuickCreate = async (e) => {
    e?.preventDefault();
    const cleanTitle = quickTitle.trim();
    if (!cleanTitle || quickSubmitting) return;

    setQuickSubmitting(true);
    setError('');
    setNotice('');

    let uploadedUrl = null;
    let uploadedPath = null;

    if (quickFile) {
      const uploadRes = await uploadRoadmapScreenshot(quickFile);
      if (uploadRes.error || !uploadRes.url) {
        setError(`Screenshot-Upload fehlgeschlagen: ${uploadRes.error?.message || 'Unbekannt'}`);
        setQuickSubmitting(false);
        return;
      }
      uploadedUrl = uploadRes.url;
      uploadedPath = uploadRes.path;
    }

    const cleanGroup = quickGroup.trim() || 'Allgemein';
    const statusForNew = quickCategory === 'Bugs' ? 'PLANNED' : quickTargetDate ? 'PLANNED' : 'IDEA';

    const payload = {
      title: cleanTitle,
      category: quickCategory,
      topic_group: cleanGroup,
      status: statusForNew,
      is_urgent: quickUrgent,
      target_date: quickTargetDate || null,
      notes: quickNotes.trim(),
      screenshot_url: uploadedUrl,
      screenshot_path: uploadedPath,
    };

    const { data, error: insErr } = await supabase
      .from('admin_roadmap')
      .insert(payload)
      .select('*')
      .maybeSingle();

    setQuickSubmitting(false);

    if (insErr) {
      if (uploadedPath) {
        await removeRoadmapScreenshots([uploadedPath]);
      }
      setError(`Anlegen fehlgeschlagen: ${insErr.message}`);
      return;
    }

    if (data) {
      setActiveItems((prev) => [data, ...prev]);
    } else {
      fetchActiveRoadmap();
    }

    // Gruppe & Kategorie bleiben absichtlich erhalten, damit man unterwegs Serien-Einträge tippen kann!
    setQuickTitle('');
    setQuickNotes('');
    setQuickTargetDate('');
    setQuickUrgent(false);
    updateQuickFile(null);
    setQuickExtraOpen(false);
    setNotice(`✓ "${cleanTitle}" unter "${cleanGroup}" angelegt.`);
    quickTitleInputRef.current?.focus();
  };

  // Update eines bestehenden Eintrags (ohne Listen-Sprung durch updated_at!)
  const handleUpdateItem = async (id, patch) => {
    setError('');
    const { data, error: upErr } = await supabase
      .from('admin_roadmap')
      .update(patch)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (upErr) {
      setError(`Speichern fehlgeschlagen: ${upErr.message}`);
      return false;
    }

    const updatedRow = data || { ...patch };
    const nowArchived = isArchivedStatus(updatedRow.status);

    if (nowArchived) {
      setActiveItems((prev) => prev.filter((it) => it.id !== id));
      setArchiveItems((prev) => {
        const exists = prev.some((it) => it.id === id);
        return exists
          ? prev.map((it) => (it.id === id ? { ...it, ...updatedRow } : it))
          : [{ ...updatedRow }, ...prev];
      });
    } else {
      setArchiveItems((prev) => prev.filter((it) => it.id !== id));
      setActiveItems((prev) => {
        const exists = prev.some((it) => it.id === id);
        return exists
          ? prev.map((it) => (it.id === id ? { ...it, ...updatedRow } : it))
          : [{ ...updatedRow }, ...prev];
      });
    }

    return true;
  };

  // Archivieren (DONE oder REJECTED) + automatisches Löschen des Screenshots
  const handleArchiveItem = async (item, targetStatus = 'DONE') => {
    setError('');
    const oldShotPath = item.screenshot_path;

    const ok = await handleUpdateItem(item.id, {
      status: targetStatus,
      is_urgent: false,
      screenshot_url: null,
      screenshot_path: null,
    });

    if (!ok) return;

    if (oldShotPath) {
      await removeRoadmapScreenshots([oldShotPath]);
    }

    setNotice(
      targetStatus === 'DONE'
        ? `✅ "${item.title}" ins Archiv verschoben${oldShotPath ? ' (Screenshot gelöscht)' : ''}.`
        : `❌ "${item.title}" als verworfen archiviert${oldShotPath ? ' (Screenshot gelöscht)' : ''}.`,
    );
  };

  // Endgültig löschen + Screenshot abräumen
  const handleDeleteItem = async (item) => {
    setError('');
    const oldShotPath = item.screenshot_path;

    const { error: delErr } = await supabase.from('admin_roadmap').delete().eq('id', item.id);
    if (delErr) {
      setError(`Löschen fehlgeschlagen: ${delErr.message}`);
      return;
    }

    if (oldShotPath) {
      await removeRoadmapScreenshots([oldShotPath]);
    }

    setActiveItems((prev) => prev.filter((it) => it.id !== item.id));
    setArchiveItems((prev) => prev.filter((it) => it.id !== item.id));
    setNotice(`🗑️ "${item.title}" gelöscht.`);
  };

  // Jump-Helper für "+ Punkt" direkt in einer Gruppen-Überschrift
  const prefillGroupQuickAdd = (groupName, dominantCategory) => {
    setQuickGroup(groupName);
    if (dominantCategory) setQuickCategory(dominantCategory);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => quickTitleInputRef.current?.focus(), 120);
  };

  // Batch-Parser (unterstützt "+ [Suche] Text", "* [Kat | Gruppe | Datum] Titel :: Notiz" UND einfache Zeilen!)
  const parsedBatchLines = useMemo(() => {
    const rawLines = String(batchText ?? '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    return rawLines.map((line, index) => {
      // 1. Ergänzung an bestehenden aktiven Eintrag: + [Suchbegriff] Text
      const matchAppend = line.match(/^\+\s*\[\s*([^\]]+?)\s*\]\s*(.+)$/);
      if (matchAppend) {
        const searchTerm = matchAppend[1].trim();
        const detailText = matchAppend[2].trim();
        const targetItem = activeItems.find((it) =>
          String(it.title ?? '').toLowerCase().includes(searchTerm.toLowerCase()),
        );
        return {
          index,
          raw: line,
          type: 'APPEND',
          searchTerm,
          detailText,
          targetItem: targetItem || null,
        };
      }

      // 2. Strukturierte Neuanlage: * [Kategorie | Gruppe | YYYY-MM-DD] Titel :: Notiz
      const matchStruct = line.match(/^\*\s*\[\s*([^\]]+?)\s*\]\s*(.+)$/);
      if (matchStruct) {
        const parts = matchStruct[1].split('|').map((p) => p.trim()).filter(Boolean);
        const rest = matchStruct[2].trim();

        let cat = quickCategory;
        let grp = quickGroup.trim() || 'Allgemein';
        let targetDate = null;

        for (const p of parts) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(p)) {
            targetDate = p;
          } else if (/^\d{2}\.\d{2}\.\d{4}$/.test(p)) {
            const [d, m, y] = p.split('.');
            targetDate = `${y}-${m}-${d}`;
          } else if (CATEGORY_OPTIONS.some((c) => c.value.toLowerCase() === p.toLowerCase()) || /^(bug|arch|meilen|hub|monet)/i.test(p)) {
            cat = normalizeCategory(p, quickCategory);
          } else {
            grp = p;
          }
        }

        // Trennung Titel vs. Notiz nur bei " :: " oder " — ", damit Doppelpunkte im Titel heil bleiben!
        let parsedTitle = rest;
        let parsedNote = '';
        const sepMatch = rest.match(/\s+(?:::|—)\s+/);
        if (sepMatch && sepMatch.index != null) {
          parsedTitle = rest.slice(0, sepMatch.index).trim();
          parsedNote = rest.slice(sepMatch.index + sepMatch[0].length).trim();
        }

        return {
          index,
          raw: line,
          type: 'CREATE',
          category: cat,
          topicGroup: grp,
          targetDate,
          title: parsedTitle,
          notes: parsedNote,
          status: cat === 'Bugs' || targetDate ? 'PLANNED' : 'IDEA',
        };
      }

      // 3. Freitext / Aufzählungszeile ("- Punkt", "• Punkt" oder nackter Satz) -> direkt in aktuelle Quick-Kategorie + Gruppe!
      const stripped = line.replace(/^[-•*]\s+/, '').trim();
      return {
        index,
        raw: line,
        type: 'CREATE',
        category: quickCategory,
        topicGroup: quickGroup.trim() || 'Allgemein',
        targetDate: null,
        title: stripped,
        notes: '',
        status: quickCategory === 'Bugs' ? 'PLANNED' : 'IDEA',
      };
    });
  }, [batchText, activeItems, quickCategory, quickGroup]);

  const handleProcessBatch = async () => {
    if (!parsedBatchLines.length || batchBusy) return;
    setBatchBusy(true);
    setError('');
    setNotice('');

    let createdCount = 0;
    let appendedCount = 0;
    const errors = [];
    const stamp = getTodayDDMM();
    const localMap = new Map(activeItems.map((it) => [it.id, { ...it }]));

    try {
      for (const entry of parsedBatchLines) {
        if (entry.type === 'APPEND') {
          const target = [...localMap.values()].find((it) =>
            String(it.title ?? '').toLowerCase().includes(entry.searchTerm.toLowerCase()),
          );
          if (!target) {
            errors.push(`Kein aktives Thema für "[${entry.searchTerm}]" gefunden`);
            continue;
          }
          const baseNotes = String(target.notes ?? '').trimEnd();
          const nextNotes = baseNotes
            ? `${baseNotes}\n• [${stamp}] ${entry.detailText}`
            : `• [${stamp}] ${entry.detailText}`;

          const { error: upErr } = await supabase
            .from('admin_roadmap')
            .update({ notes: nextNotes })
            .eq('id', target.id);

          if (upErr) {
            errors.push(`Fehler bei "${target.title}": ${upErr.message}`);
          } else {
            target.notes = nextNotes;
            localMap.set(target.id, target);
            appendedCount += 1;
          }
        } else if (entry.type === 'CREATE' && entry.title) {
          const { data: inserted, error: insErr } = await supabase
            .from('admin_roadmap')
            .insert({
              title: entry.title,
              category: entry.category,
              topic_group: entry.topicGroup,
              target_date: entry.targetDate,
              status: entry.status,
              notes: entry.notes || '',
            })
            .select('*')
            .maybeSingle();

          if (insErr) {
            errors.push(`"${entry.title}": ${insErr.message}`);
          } else {
            if (inserted?.id) localMap.set(inserted.id, inserted);
            createdCount += 1;
          }
        }
      }

      await fetchActiveRoadmap();
      if (errors.length > 0) setError(errors.join(' | '));
      if (createdCount > 0 || appendedCount > 0) {
        setNotice(`⚡ Batch fertig: ${createdCount} angelegt, ${appendedCount} ergänzt.`);
        if (errors.length === 0) {
          setBatchText('');
          setBatchOpen(false);
        }
      }
    } finally {
      setBatchBusy(false);
    }
  };

  // Basisliste je nach Modus (Aktiv vs. Archiv)
  const sourceItems = viewMode === 'archive' ? archiveItems : activeItems;

  const categoryCounts = useMemo(() => {
    const counts = { ALL: sourceItems.length };
    for (const c of CATEGORY_OPTIONS) counts[c.value] = 0;
    for (const it of sourceItems) {
      const cat = it.category || 'Bugs';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [sourceItems]);

  const urgentCount = useMemo(
    () => activeItems.filter((it) => it.is_urgent).length,
    [activeItems],
  );

  // Gefilterte & stabil sortierte Liste
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sourceItems
      .filter((item) => {
        if (filterCategory !== 'ALL' && item.category !== filterCategory) return false;
        if (filterStatus !== 'ALL' && item.status !== filterStatus) return false;
        if (viewMode === 'active' && onlyUrgent && !item.is_urgent) return false;
        if (q) {
          const hay = `${item.title ?? ''} ${item.topic_group ?? ''} ${item.notes ?? ''} ${item.category ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (viewMode === 'archive') {
          const archA = a.archived_at ? Date.parse(a.archived_at) : 0;
          const archB = b.archived_at ? Date.parse(b.archived_at) : 0;
          return archB - archA;
        }
        // Aktiv: 1. Dringend oben, 2. IN_PROGRESS vor PLANNED vor IDEA, 3. Stabile created_at-Reihenfolge
        if (Boolean(a.is_urgent) !== Boolean(b.is_urgent)) {
          return a.is_urgent ? -1 : 1;
        }
        const rank = { IN_PROGRESS: 0, PLANNED: 1, IDEA: 2 };
        const rA = rank[a.status] ?? 3;
        const rB = rank[b.status] ?? 3;
        if (rA !== rB) return rA - rB;

        const cA = a.created_at ? Date.parse(a.created_at) : 0;
        const cB = b.created_at ? Date.parse(b.created_at) : 0;
        return cB - cA;
      });
  }, [sourceItems, filterCategory, filterStatus, viewMode, onlyUrgent, searchQuery]);

  // Gruppierung nach topic_group (analog Chrono/Collectibles bei Spielen)
  const sections = useMemo(() => {
    if (!groupByGroup) {
      return [{ key: '__FLAT__', title: null, urgentInGroup: 0, dominantCategory: null, items: filteredItems }];
    }

    const byGroup = new Map();
    for (const item of filteredItems) {
      const grp = String(item.topic_group || 'Allgemein').trim() || 'Allgemein';
      if (!byGroup.has(grp)) byGroup.set(grp, []);
      byGroup.get(grp).push(item);
    }

    return [...byGroup.entries()]
      .map(([grp, list]) => {
        const urgentInGroup = list.filter((i) => i.is_urgent).length;
        const firstCat = list[0]?.category || null;
        return {
          key: grp,
          title: grp,
          urgentInGroup,
          dominantCategory: firstCat,
          items: list,
        };
      })
      .sort((a, b) => {
        if ((a.urgentInGroup > 0) !== (b.urgentInGroup > 0)) {
          return a.urgentInGroup > 0 ? -1 : 1;
        }
        if (a.key === 'Allgemein') return 1;
        if (b.key === 'Allgemein') return -1;
        return a.title.localeCompare(b.title, 'de');
      });
  }, [filteredItems, groupByGroup]);

  const isCurrentLoading = viewMode === 'archive' ? archiveLoading : loading;

  return (
    <div className="flex flex-col gap-3.5 text-zinc-200">
      <datalist id="roadmap-topic-groups">
        {allTopicGroups.map((grp) => (
          <option key={grp} value={grp} />
        ))}
      </datalist>

      {/* Feedback- & Fehler-Banner */}
      {notice && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[#00ff66]/30 bg-[#00ff66]/10 px-3 py-2 text-xs text-[#00ff66]">
          <span className="min-w-0 truncate">{notice}</span>
          <button
            type="button"
            onClick={() => setNotice('')}
            className="shrink-0 text-zinc-400 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <span className="min-w-0 break-words">{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            className="shrink-0 text-zinc-400 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ==================== 1. KOMPAKTE SCHNELLEINGABE (Mobil & Unterwegs) ==================== */}
      {viewMode === 'active' && (
        <form
          onSubmit={handleQuickCreate}
          onPaste={(e) => {
            const pasted = extractPastedImageFile(e);
            if (pasted) {
              e.preventDefault();
              updateQuickFile(pasted);
            }
          }}
          className="rounded-2xl border border-zinc-800 bg-[#121415] p-2.5 sm:p-3.5 shadow-md flex flex-col gap-2"
        >
          {/* Oberzeile: Kategorie + Baustellen-Gruppe + Dringend + Extras */}
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              <select
                value={quickCategory}
                onChange={(e) => setQuickCategory(e.target.value)}
                aria-label="Kategorie für neuen Eintrag"
                className={`rounded-xl border px-2.5 py-1 text-[11px] font-mono font-bold cursor-pointer focus:outline-none ${getCategoryMeta(quickCategory).style}`}
              >
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat.value} value={cat.value} className="bg-zinc-900 text-zinc-200">
                    {cat.icon} {cat.label}
                  </option>
                ))}
              </select>

              <input
                type="text"
                list="roadmap-topic-groups"
                value={quickGroup}
                onChange={(e) => setQuickGroup(e.target.value)}
                placeholder="Gruppe (z. B. User-Bereich)…"
                title="Baustelle / Gruppe – bleibt für Serien-Eingaben stehen"
                className="w-40 sm:w-52 rounded-xl border border-zinc-700/80 bg-zinc-900 px-2.5 py-1 text-[11px] font-mono text-zinc-200 placeholder-zinc-500 focus:border-[#00ff66] focus:outline-none"
              />

              <button
                type="button"
                onClick={() => setQuickUrgent((prev) => !prev)}
                className={`rounded-xl border px-2 py-1 text-[11px] font-mono font-bold transition cursor-pointer ${
                  quickUrgent
                    ? 'border-orange-500/60 bg-orange-500/20 text-orange-300'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                🔥 {quickUrgent ? 'Dringend' : 'Normal'}
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setQuickExtraOpen((prev) => !prev)}
                className={`rounded-xl border px-2 py-1 text-[10px] font-mono transition cursor-pointer ${
                  quickExtraOpen
                    ? 'border-[#00ff66]/40 bg-[#00ff66]/10 text-[#00ff66]'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                + Details
              </button>
              <button
                type="button"
                onClick={() => setBatchOpen((prev) => !prev)}
                className={`rounded-xl border px-2 py-1 text-[10px] font-mono transition cursor-pointer ${
                  batchOpen
                    ? 'border-sky-500/40 bg-sky-500/15 text-sky-300'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                ⚡ Batch
              </button>
            </div>
          </div>

          {/* Haupt-Eingabezeile: 1 Bug/Punkt + 1 Screenshot + Speichern */}
          <div className="flex items-center gap-1.5">
            <input
              ref={quickFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) updateQuickFile(file);
              }}
            />

            <input
              ref={quickTitleInputRef}
              type="text"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              placeholder={`Neuer ${quickCategory === 'Bugs' ? 'Bug' : 'Punkt'} in "${quickGroup || 'Allgemein'}"… (Strg+V für Screenshot)`}
              className="min-w-0 flex-1 rounded-xl border border-zinc-700/80 bg-zinc-950 px-3 py-2 text-xs sm:text-sm text-white placeholder-zinc-500 focus:border-[#00ff66] focus:outline-none"
            />

            <button
              type="button"
              onClick={() => quickFileInputRef.current?.click()}
              title="Max. 1 Screenshot anhängen (wird als WebP komprimiert)"
              className={`shrink-0 rounded-xl border px-2.5 py-2 text-xs font-mono transition cursor-pointer ${
                quickFile
                  ? 'border-[#00ff66]/50 bg-[#00ff66]/15 text-[#00ff66]'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'
              }`}
            >
              📷
            </button>

            <button
              type="submit"
              disabled={!quickTitle.trim() || quickSubmitting}
              className="shrink-0 rounded-xl bg-[#00ff66] px-3.5 py-2 text-xs font-mono font-bold text-black hover:bg-[#00ff66]/90 disabled:opacity-40 transition cursor-pointer"
            >
              {quickSubmitting ? '…' : '+ Anlegen'}
            </button>
          </div>

          {/* Vorschau falls Screenshot ausgewählt */}
          {quickFile && quickPreviewUrl && (
            <div className="flex items-center justify-between rounded-xl border border-[#00ff66]/30 bg-[#00ff66]/5 px-2.5 py-1.5 text-[11px] font-mono">
              <div className="flex items-center gap-2 min-w-0">
                <img
                  src={quickPreviewUrl}
                  alt="Vorschau"
                  className="h-8 w-10 rounded object-cover border border-zinc-700"
                />
                <span className="truncate text-[#00ff66]">Screenshot bereit (wird als WebP gespeichert)</span>
              </div>
              <button
                type="button"
                onClick={() => updateQuickFile(null)}
                className="px-1.5 text-zinc-400 hover:text-red-300 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Optionale Zusatzfelder (Notiz + Zieldatum) */}
          {quickExtraOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1 border-t border-zinc-800/70">
              <textarea
                value={quickNotes}
                onChange={(e) => setQuickNotes(e.target.value)}
                rows={2}
                placeholder="Optionale Zusatznotiz / Kontext…"
                className="sm:col-span-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-[#00ff66] focus:outline-none"
              />
              <div className="flex flex-col justify-center gap-1 rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 py-1.5">
                <span className="text-[10px] font-mono text-zinc-500">Optionales Zieldatum</span>
                <input
                  type="date"
                  value={quickTargetDate}
                  onChange={(e) => setQuickTargetDate(e.target.value)}
                  className="bg-transparent text-xs font-mono text-zinc-200 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Optionaler Mehrzeilen-Batch-Import */}
          {batchOpen && (
            <div className="flex flex-col gap-2 border-t border-zinc-800/80 pt-2">
              <p className="text-[11px] font-mono text-zinc-400 leading-relaxed">
                Einfach Stichpunkte untereinander einfügen (landen in{' '}
                <strong className="text-white">{quickCategory} → {quickGroup || 'Allgemein'}</strong>) · oder{' '}
                <span className="text-sky-300">* [Bugs | User-Bereich] Titel :: Notiz</span> · oder{' '}
                <span className="text-[#00ff66]">+ [Suchwort] Ergänzung</span>
              </p>
              <textarea
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                rows={3}
                placeholder={'- Profilseite zeigt noch Platzhalter-Box\n- Watchlist-Zähler mobil abgeschnitten\n+ [Steam Integration] API-Key heute getestet'}
                className="w-full rounded-xl border border-zinc-700/80 bg-zinc-950 p-2.5 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-sky-400 focus:outline-none"
              />
              {parsedBatchLines.length > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-zinc-400">
                    {parsedBatchLines.length} Zeilen erkannt
                  </span>
                  <button
                    type="button"
                    disabled={batchBusy}
                    onClick={handleProcessBatch}
                    className="rounded-xl bg-sky-400 px-3 py-1.5 text-xs font-mono font-bold text-black hover:bg-sky-300 disabled:opacity-40 cursor-pointer"
                  >
                    {batchBusy ? 'Verarbeite…' : `⚡ ${parsedBatchLines.length} Zeilen importieren`}
                  </button>
                </div>
              )}
            </div>
          )}
        </form>
      )}

      {/* ==================== 2. KATEGORIE-REITER & ARCHIV-SCHALTER (Horizontal scrollbar) ==================== */}
      <div className="flex flex-col gap-2 rounded-2xl border border-zinc-800 bg-[#121314] p-2.5 sm:p-3">
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-0.5">
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => selectCategoryFilter('ALL')}
              className={`rounded-xl border px-2.5 py-1 text-[11px] font-mono font-bold whitespace-nowrap transition cursor-pointer ${
                filterCategory === 'ALL'
                  ? 'border-[#00ff66]/50 bg-[#00ff66]/15 text-[#00ff66]'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Alle ({categoryCounts.ALL || 0})
            </button>
            {CATEGORY_OPTIONS.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => selectCategoryFilter(cat.value)}
                className={`rounded-xl border px-2.5 py-1 text-[11px] font-mono font-bold whitespace-nowrap transition cursor-pointer ${
                  filterCategory === cat.value
                    ? cat.style
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {cat.icon} {cat.label} ({categoryCounts[cat.value] || 0})
              </button>
            ))}
          </div>

          {/* Aktiv vs. Archiv Toggle */}
          <button
            type="button"
            onClick={() => switchToViewMode(viewMode === 'active' ? 'archive' : 'active')}
            className={`shrink-0 rounded-xl border px-3 py-1 text-[11px] font-mono font-bold whitespace-nowrap transition cursor-pointer ${
              viewMode === 'archive'
                ? 'border-amber-400/50 bg-amber-500/20 text-amber-200'
                : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
            }`}
          >
            {viewMode === 'archive' ? '⬅ Zurück zu Aktiv' : '🗄️ Archiv'}
          </button>
        </div>

        {/* Kompakte Filter-Zeile darunter */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/70 pt-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {viewMode === 'active' && (
              <button
                type="button"
                onClick={() => setOnlyUrgent((prev) => !prev)}
                className={`rounded-xl border px-2.5 py-1 text-[11px] font-mono font-bold transition cursor-pointer ${
                  onlyUrgent
                    ? 'border-orange-500/60 bg-orange-500/20 text-orange-300'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                🔥 Dringend ({urgentCount})
              </button>
            )}

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] font-mono text-zinc-300 focus:border-[#00ff66] focus:outline-none"
            >
              <option value="ALL">
                {viewMode === 'archive' ? 'Status: Alle im Archiv' : 'Status: Alle aktiven'}
              </option>
              {(viewMode === 'archive' ? ARCHIVE_STATUS_OPTIONS : ACTIVE_STATUS_OPTIONS).map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setGroupByGroup((prev) => !prev)}
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] font-mono text-zinc-300 hover:border-zinc-600 cursor-pointer"
              title="Zwischen Baustellen-Gruppierung und flacher Liste wechseln"
            >
              {groupByGroup ? '📂 Nach Gruppe' : '📋 Flache Liste'}
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-1 sm:flex-initial justify-end">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={viewMode === 'archive' ? 'Archiv durchsuchen (z. B. Kapital)…' : 'Suche…'}
              className="min-w-0 flex-1 sm:w-52 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:border-[#00ff66] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => (viewMode === 'archive' ? fetchArchiveRoadmap() : fetchActiveRoadmap())}
              title="Neu laden"
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:text-[#00ff66] cursor-pointer"
            >
              🔄
            </button>
          </div>
        </div>
      </div>

      {/* Archiv-Hinweisbanner */}
      {viewMode === 'archive' && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] font-mono text-amber-200/90">
          🗄️ <strong>Archiv-Ansicht</strong> (Erledigtes &amp; Verworfenes). Diese Einträge belasten weder die Standard-Ansicht noch LLM-Abfragen, bleiben aber inkl. ursprünglicher Kategorie dauerhaft durchsuchbar.
        </div>
      )}

      {/* ==================== 3. GRUPPIERTE ZEILEN-ANSICHT ==================== */}
      {isCurrentLoading ? (
        <div className="flex h-36 items-center justify-center font-mono text-xs text-zinc-500 animate-pulse">
          Lade Einträge…
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-[#121314] px-4 py-10 text-center">
          <p className="text-xs font-bold text-white">Keine Einträge für diesen Filter</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {viewMode === 'archive'
              ? 'Im Archiv liegen noch keine passenden Einträge.'
              : 'Oben neuen Punkt eintragen oder Filter zurücksetzen.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sections.map((section) => {
            const isCollapsed = Boolean(collapsedGroups[section.key]);
            return (
              <section
                key={section.key}
                className="rounded-2xl border border-zinc-800/80 bg-[#0f1012] p-2 sm:p-3 flex flex-col gap-1.5"
              >
                {section.title && (
                  <div className="flex items-center justify-between gap-2 px-1 py-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedGroups((prev) => ({
                          ...prev,
                          [section.key]: !prev[section.key],
                        }))
                      }
                      className="flex min-w-0 items-center gap-2 text-left cursor-pointer"
                    >
                      <span className="text-xs text-zinc-500">{isCollapsed ? '▸' : '▾'}</span>
                      <h3 className="truncate text-xs font-mono font-bold uppercase tracking-wider text-zinc-200">
                        📂 {section.title}
                      </h3>
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-mono text-zinc-400">
                        {section.items.length}
                      </span>
                      {section.urgentInGroup > 0 && viewMode === 'active' && (
                        <span className="rounded-full bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-mono font-bold text-orange-300">
                          🔥 {section.urgentInGroup}
                        </span>
                      )}
                    </button>

                    {viewMode === 'active' && (
                      <button
                        type="button"
                        onClick={() => prefillGroupQuickAdd(section.title, section.dominantCategory)}
                        className="shrink-0 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] font-mono text-zinc-400 hover:border-[#00ff66]/40 hover:text-[#00ff66] cursor-pointer"
                      >
                        + Punkt
                      </button>
                    )}
                  </div>
                )}

                {!isCollapsed && (
                  <div className="flex flex-col gap-1.5">
                    {section.items.map((item) => (
                      <RoadmapRow
                        key={item.id}
                        item={item}
                        showCategoryBadge={filterCategory === 'ALL'}
                        isArchiveView={viewMode === 'archive'}
                        onUpdate={handleUpdateItem}
                        onArchive={handleArchiveItem}
                        onDelete={handleDeleteItem}
                        onOpenLightbox={(url, title) => setLightbox({ url, title })}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* ==================== 4. SCREENSHOT-LIGHTBOX ==================== */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-3 sm:p-6 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full max-w-5xl flex-col gap-2"
          >
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="truncate text-xs font-mono font-bold text-white">
                {lightbox.title}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={lightbox.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-mono text-zinc-200 hover:border-[#00ff66] no-underline"
                >
                  Original öffnen ↗
                </a>
                <button
                  type="button"
                  onClick={() => setLightbox(null)}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-mono text-zinc-300 hover:text-white cursor-pointer"
                >
                  ✕ Schließen
                </button>
              </div>
            </div>
            <img
              src={lightbox.url}
              alt={lightbox.title}
              className="max-h-[82vh] w-auto rounded-xl border border-zinc-800 object-contain shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
