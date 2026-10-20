import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../context/LocaleContext';
import {
  detectContentKind,
  submitErrorReport,
  uploadErrorReportEvidenceBatch,
} from '../lib/errorReport';
import { supabase } from '../pages/supabaseClient';

const MAX_EVIDENCE_FILES = 2;
const SANDBOX_MIN_MS = 1800;
const SANDBOX_FAKE_WAIT_MS = 1100;
const SUCCESS_CLOSE_MS = 1400;

function EvidencePreview({ item, onRemove, removeLabel }) {
  return (
    <div className="relative group w-24 h-24 flex-shrink-0">
      <img
        src={item.previewUrl}
        alt={item.file.name}
        className="w-full h-full object-cover rounded-lg border border-zinc-800 bg-zinc-950"
      />
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 hover:bg-red-400 text-white text-sm font-bold leading-none shadow-md flex items-center justify-center transition-colors"
        aria-label={`${item.file.name} – ${removeLabel}`}
        title={removeLabel}
      >
        ×
      </button>
      <span className="absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[9px] font-mono text-zinc-300 bg-black/70 rounded-b-lg truncate">
        {item.file.name}
      </span>
    </div>
  );
}

function ErrorReportModal({ draft, sessionUser, onClose }) {
  const { t } = useLocale();
  const [suggestion, setSuggestion] = useState('');
  const [evidenceItems, setEvidenceItems] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [honeypot, setHoneypot] = useState('');
  const fileInputRef = useRef(null);
  const evidenceItemsRef = useRef([]);
  const openedAtRef = useRef(0);

  const revokeAllPreviews = (items) => {
    items.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
  };

  useEffect(() => {
    setSuggestion('');
    setHoneypot('');
    setEvidenceItems((prev) => {
      revokeAllPreviews(prev);
      return [];
    });
    setFeedback(null);
    openedAtRef.current = Date.now();
  }, [draft]);

  useEffect(() => {
    evidenceItemsRef.current = evidenceItems;
  }, [evidenceItems]);

  useEffect(() => () => revokeAllPreviews(evidenceItemsRef.current), []);

  const handleFilesSelected = (e) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;

    setEvidenceItems((prev) => {
      const remaining = MAX_EVIDENCE_FILES - prev.length;
      if (remaining <= 0) return prev;

      const toAdd = picked.slice(0, remaining).map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      return [...prev, ...toAdd];
    });

    e.target.value = '';
  };

  const removeEvidence = (id) => {
    setEvidenceItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  if (!draft) return null;

  const { metadata, markedContent, element } = draft;
  const contentKind = detectContentKind(element, markedContent);

  const showSandboxSuccess = async () => {
    await new Promise((resolve) => setTimeout(resolve, SANDBOX_FAKE_WAIT_MS));
    setSubmitting(false);
    setFeedback({
      type: 'success',
      text: t('reportSuccess'),
    });
    setTimeout(() => onClose(), SUCCESS_CLOSE_MS);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback(null);

    if (!suggestion.trim()) {
      setFeedback({ type: 'error', text: t('reportSuggestionRequired') });
      return;
    }

    setSubmitting(true);

    const elapsedMs = Date.now() - (openedAtRef.current || 0);
    if (honeypot.trim() !== '' || elapsedMs < SANDBOX_MIN_MS) {
      await showSandboxSuccess();
      return;
    }

    let imageUrls = [];
    if (evidenceItems.length > 0) {
      const { data: sessionData } = await supabase.auth.getSession();
      const upload = await uploadErrorReportEvidenceBatch(
        supabase,
        sessionData.session?.user?.id,
        evidenceItems.map((item) => item.file),
      );
      if (upload.error) {
        setSubmitting(false);
        setFeedback({
          type: 'error',
          text: t('reportUploadFailed'),
        });
        return;
      }
      imageUrls = upload.urls;
    }

    const { error } = await submitErrorReport(supabase, {
      metadata,
      markedContent,
      contentKind,
      suggestion,
      imageUrls,
      honeypot,
      elapsedMs,
    });

    setSubmitting(false);

    if (error) {
      setFeedback({
        type: 'error',
        text: error.message || t('reportFailed'),
      });
      return;
    }

    setFeedback({
      type: 'success',
      text: t('reportSuccess'),
    });
    setTimeout(() => onClose(), SUCCESS_CLOSE_MS);
  };

  const markedLabel =
    contentKind === 'image' || contentKind === 'video'
      ? contentKind === 'image'
        ? t('reportImage')
        : t('reportVideo')
      : `"${markedContent?.slice(0, 160)}${markedContent?.length > 160 ? '…' : ''}"`;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-report-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-[#1a1b1c] border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-[#121314]">
          <div>
            <h2 id="error-report-title" className="text-sm font-bold text-[#00ff66] font-mono uppercase tracking-wider">
              {t('reportError')}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">{t('reportErrorSubtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 text-xl leading-none px-2"
            aria-label={t('reportClose')}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto relative">
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '-9999px',
              width: '1px',
              height: '1px',
              overflow: 'hidden',
              opacity: 0,
              pointerEvents: 'none',
            }}
          >
            <label htmlFor="tb-verification-ref">
              Bestätigungs-Referenz (Pflichtfeld, bitte ausfüllen) *
            </label>
            <input
              id="tb-verification-ref"
              name="tb_verification_ref"
              type="text"
              tabIndex={-1}
              autoComplete="new-password"
              aria-required="true"
              value={honeypot}
              onChange={(event) => setHoneypot(event.target.value)}
            />
          </div>

          <div className="rounded-xl border border-zinc-800 bg-[#121314] p-4">
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 mb-2">
              Markierte Stelle
            </p>
            <p className="text-sm text-zinc-200 break-words leading-relaxed">{markedLabel}</p>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              {t('reportSuggestion')}
            </span>
            <textarea
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              rows={4}
              placeholder={t('reportSuggestionPlaceholder')}
              className="w-full rounded-xl border border-zinc-700 bg-[#121314] text-sm text-zinc-200 px-3 py-2.5 focus:outline-hidden focus:border-[#00ff66]/50 resize-y min-h-[96px]"
            />
          </label>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                {t('reportEvidence')}
              </span>
              <span className="text-[10px] font-mono text-zinc-600">
                {evidenceItems.length}/{MAX_EVIDENCE_FILES}
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFilesSelected}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={evidenceItems.length >= MAX_EVIDENCE_FILES}
                className="text-xs font-mono font-bold uppercase px-3 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:border-[#00ff66]/40 hover:text-[#00ff66] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t('reportSelectImages')}
              </button>
              {evidenceItems.length > 0 && (
                <span className="text-xs text-zinc-500">
                  {evidenceItems.length === 1
                    ? t('reportImagesOne')
                    : t('reportImagesMany').replaceAll('{n}', String(evidenceItems.length))}
                </span>
              )}
            </div>
            {evidenceItems.length > 0 && (
              <div className="flex flex-wrap gap-3 pt-1">
                {evidenceItems.map((item) => (
                  <EvidencePreview
                    key={item.id}
                    item={item}
                    onRemove={removeEvidence}
                    removeLabel={t('reportRemove')}
                  />
                ))}
              </div>
            )}
          </div>

          {feedback && (
            <p
              className={`text-xs rounded-lg px-3 py-2 ${
                feedback.type === 'success'
                  ? 'text-[#00ff66] bg-[#00ff66]/10 border border-[#00ff66]/25'
                  : 'text-red-400 bg-red-500/10 border border-red-500/25'
              }`}
            >
              {feedback.text}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 text-sm hover:bg-zinc-800/50 transition-colors"
            >
              {t('reportCancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl bg-[#00ff66] text-[#121314] text-sm font-bold hover:bg-[#00dd55] disabled:opacity-50 transition-colors"
            >
              {submitting ? t('reportSubmitting') : t('reportSubmit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ErrorReportModal;
