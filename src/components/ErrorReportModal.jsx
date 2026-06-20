import React, { useEffect, useRef, useState } from 'react';
import {
  detectContentKind,
  submitErrorReport,
  uploadErrorReportEvidenceBatch,
} from '../lib/errorReport';
import { supabase } from '../pages/supabaseClient';

const MAX_EVIDENCE_FILES = 8;

function EvidencePreview({ item, onRemove }) {
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
        aria-label={`${item.file.name} entfernen`}
        title="Entfernen"
      >
        ×
      </button>
      <span className="absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[9px] font-mono text-zinc-300 bg-black/70 rounded-b-lg truncate">
        {item.file.name}
      </span>
    </div>
  );
}

function ErrorReportModal({ draft, sessionUser, onClose, onRequestLogin }) {
  const [suggestion, setSuggestion] = useState('');
  const [evidenceItems, setEvidenceItems] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const fileInputRef = useRef(null);
  const evidenceItemsRef = useRef([]);

  const revokeAllPreviews = (items) => {
    items.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
  };

  useEffect(() => {
    setSuggestion('');
    setEvidenceItems((prev) => {
      revokeAllPreviews(prev);
      return [];
    });
    setFeedback(null);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback(null);

    if (!suggestion.trim()) {
      setFeedback({ type: 'error', text: 'Bitte einen Änderungsvorschlag eingeben (Pflichtfeld).' });
      return;
    }

    setSubmitting(true);

    await supabase.auth.getSession();

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
          text: 'Beleg konnte nicht hochgeladen werden. Meldung ohne Bild senden oder erneut versuchen.',
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
    });

    setSubmitting(false);

    if (error) {
      setFeedback({
        type: 'error',
        text: error.message || 'Meldung konnte nicht gespeichert werden.',
      });
      return;
    }

    setFeedback({
      type: 'success',
      text: 'Danke! Deine Fehlermeldung wurde übermittelt.',
    });
    setTimeout(() => onClose(), 1400);
  };

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
      <div className="w-full max-w-lg bg-[#1a1b1c] border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden animate-fadeIn">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-[#121314]">
          <div>
            <h2 id="error-report-title" className="text-sm font-bold text-[#00ff66] font-mono uppercase tracking-wider">
              Fehler melden
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">Datenkorrektur für TrophyBase</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 text-xl leading-none px-2"
            aria-label="Schließen"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <div className="rounded-xl border border-zinc-800 bg-[#121314] p-4 text-xs space-y-2">
            <div className="flex justify-between gap-2">
              <span className="text-zinc-500">original_text</span>
              <span className="text-zinc-300 text-right break-all max-w-[65%]">
                {contentKind === 'image' || contentKind === 'video' ? (
                  <span className="font-mono text-sky-400">{contentKind === 'image' ? 'Bild' : 'Video'}</span>
                ) : (
                  `"${markedContent?.slice(0, 120)}${markedContent?.length > 120 ? '…' : ''}"`
                )}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-zinc-500">content_type</span>
              <span className="text-zinc-300 font-mono">{metadata.contentType}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-zinc-500">field_name</span>
              <span className="text-zinc-300 font-mono">{metadata.fieldName}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-zinc-500">content_key</span>
              <span className="text-zinc-300 font-mono">{metadata.contentKey}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-zinc-500">source_identifier</span>
              <span className="text-zinc-300 font-mono">{metadata.sourceIdentifier}</span>
            </div>
            <div className="flex justify-between gap-2 text-[10px] text-zinc-600 pt-1 border-t border-zinc-800">
              <span>DB-Hinweis</span>
              <span className="text-right font-mono">
                {metadata.sourceTable}.{metadata.sourceColumn}
              </span>
            </div>
          </div>

          {!sessionUser?.id && evidenceItems.length > 0 && (
            <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              Für Beleg-Upload empfohlen: anmelden (Storage-Pfad).
            </p>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Dein Änderungsvorschlag
            </span>
            <textarea
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              rows={4}
              placeholder="z. B. korrekte Übersetzung, richtiger Eigenname, …"
              className="w-full rounded-xl border border-zinc-700 bg-[#121314] text-sm text-zinc-200 px-3 py-2.5 focus:outline-none focus:border-[#00ff66]/50 resize-y min-h-[96px]"
            />
          </label>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Belege (Screenshots / Fotos)
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
                Bilder auswählen
              </button>
              {evidenceItems.length > 0 && (
                <span className="text-xs text-zinc-500">
                  {evidenceItems.length} {evidenceItems.length === 1 ? 'Bild' : 'Bilder'}
                </span>
              )}
            </div>
            {evidenceItems.length > 0 && (
              <div className="flex flex-wrap gap-3 pt-1">
                {evidenceItems.map((item) => (
                  <EvidencePreview key={item.id} item={item} onRemove={removeEvidence} />
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
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl bg-[#00ff66] text-[#121314] text-sm font-bold hover:bg-[#00dd55] disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Senden…' : 'Meldung senden'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ErrorReportModal;
