import React, { useEffect, useRef, useState } from 'react';
import {
  detectContentKind,
  submitErrorReport,
  uploadErrorReportEvidence,
} from '../lib/errorReport';
import { supabase } from '../pages/supabaseClient';

function ErrorReportModal({ draft, sessionUser, onClose, onRequestLogin }) {
  const [suggestion, setSuggestion] = useState('');
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setSuggestion('');
    setEvidenceFile(null);
    setPreviewUrl(null);
    setFeedback(null);
  }, [draft]);

  useEffect(() => {
    if (!evidenceFile) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(evidenceFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [evidenceFile]);

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

    let imageUrl = null;
    if (evidenceFile) {
      const upload = await uploadErrorReportEvidence(
        supabase,
        sessionUser?.id,
        evidenceFile,
      );
      if (upload.error) {
        setSubmitting(false);
        setFeedback({
          type: 'error',
          text: 'Beleg konnte nicht hochgeladen werden. Meldung ohne Bild senden oder erneut versuchen.',
        });
        return;
      }
      imageUrl = upload.url;
    }

    const { error } = await submitErrorReport(supabase, {
      metadata,
      markedContent,
      contentKind,
      suggestion,
      imageUrl,
      userId: sessionUser?.id ?? null,
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

          {!sessionUser?.id && evidenceFile && (
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
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Beleg (Screenshot / Foto)
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-mono font-bold uppercase px-3 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:border-[#00ff66]/40 hover:text-[#00ff66] transition-colors"
              >
                Bild auswählen
              </button>
              {evidenceFile && (
                <span className="text-xs text-zinc-500 truncate max-w-[200px]">{evidenceFile.name}</span>
              )}
            </div>
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Beleg-Vorschau"
                className="max-h-32 rounded-lg border border-zinc-800 object-contain self-start"
              />
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
