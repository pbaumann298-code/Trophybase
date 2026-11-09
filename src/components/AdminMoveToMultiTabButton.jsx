import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isAdminUser, setDraftReturnContext } from '../lib/adminAccess';
import { inspectGameMultiTabMove, moveGameToMultiTab } from '../lib/rohmaterialQueries';
import { supabase } from '../pages/supabaseClient';

function formatLangList(values) {
  return Array.isArray(values) && values.length > 0 ? values.join(', ') : 'keine';
}

function openMultiTabEditor(gameId) {
  setDraftReturnContext({
    gameId,
    activeDataSource: 'rohmaterial',
    staffPath: '/intranet.html#entwuerfe',
  });
  window.location.assign('/intranet.html#entwuerfe');
}

/**
 * Schiebt das aktuelle Spiel in game_guides_rohmaterial. Nur für Admins sichtbar.
 */
function ForeignDataWarning({ inspection, busy, errorText, onCancel, onConfirm }) {
  const dialog = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="multi-tab-foreign-title"
        className="w-full max-w-lg rounded-2xl border-2 border-red-500 bg-[#1a0f12] p-5 shadow-2xl shadow-red-950/40"
      >
        <p className="text-3xl leading-none" aria-hidden>⚠️</p>
        <h2 id="multi-tab-foreign-title" className="mt-3 text-lg font-black uppercase tracking-wide text-red-400">
          ACHTUNG: MEHRSPRACHIGE DATEN ERKANNT!
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-red-100">
          Dieses Spiel wird beim Verschieben in den Multi-Tab offline genommen.
          Veröffentlichte Guides wechseln auf FERTIG, die Live-Zeilen verlassen die öffentliche Guide-Tabelle.
        </p>
        <dl className="mt-4 space-y-2 rounded-xl border border-red-500/40 bg-black/30 px-3 py-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <dt className="font-mono text-[10px] uppercase tracking-wider text-red-300">Guide-Sprachen</dt>
            <dd className="font-semibold text-white">{formatLangList(inspection.foreignGuideLangs)}</dd>
          </div>
          {inspection.foreignTipLangs?.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              <dt className="font-mono text-[10px] uppercase tracking-wider text-red-300">Tipp-Sprachen</dt>
              <dd className="font-semibold text-white">{formatLangList(inspection.foreignTipLangs)}</dd>
            </div>
          ) : null}
          {inspection.foreignDescLangs?.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              <dt className="font-mono text-[10px] uppercase tracking-wider text-red-300">Beschreibungs-Sprachen</dt>
              <dd className="font-semibold text-white">{formatLangList(inspection.foreignDescLangs)}</dd>
            </div>
          ) : null}
          <div className="flex flex-col gap-0.5">
            <dt className="font-mono text-[10px] uppercase tracking-wider text-red-300">Veröffentlichte Locales</dt>
            <dd className="font-semibold text-white">{formatLangList(inspection.publishedLocales)}</dd>
          </div>
        </dl>
        {errorText ? <p className="mt-3 text-xs font-mono text-red-300">{errorText}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-2 text-xs font-bold text-zinc-200 hover:border-zinc-400 disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-xl border-2 border-red-500 bg-red-600/30 px-4 py-2 text-xs font-black uppercase tracking-wide text-red-100 hover:bg-red-600/50 disabled:opacity-50"
          >
            {busy ? 'Verschiebe…' : '⚠️ Trotzdem in Multi-Tab schieben'}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return dialog;
  return createPortal(dialog, document.body);
}

function AdminMoveToMultiTabButton({ user, gameId, className = '' }) {
  const visible = isAdminUser(user) && Boolean(gameId);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const [warning, setWarning] = useState(null);
  const moveLock = useRef(false);

  if (!visible) return null;

  const runMove = async ({ alreadyLocked = false } = {}) => {
    if (!alreadyLocked) {
      if (moveLock.current) return;
      moveLock.current = true;
    }
    setHint('');
    setBusy(true);
    try {
      const result = await moveGameToMultiTab(supabase, gameId);
      if (!result.ok) {
        moveLock.current = false;
        setHint(result.error?.message || 'Verschieben in die Multi-Tab-Tabelle ist fehlgeschlagen.');
        setBusy(false);
        return;
      }
      openMultiTabEditor(gameId);
    } catch (error) {
      moveLock.current = false;
      setHint(error?.message || 'Verschieben in die Multi-Tab-Tabelle ist fehlgeschlagen.');
      setBusy(false);
    }
  };

  const handleClick = async () => {
    if (moveLock.current || warning) return;
    moveLock.current = true;
    setHint('');
    setBusy(true);
    try {
      const inspection = await inspectGameMultiTabMove(supabase, gameId);
      if (inspection.error) {
        moveLock.current = false;
        setHint(inspection.error?.message || 'Sprachprüfung vor dem Multi-Tab-Umzug ist fehlgeschlagen.');
        setBusy(false);
        return;
      }
      if (!inspection.hasForeignData) {
        await runMove({ alreadyLocked: true });
        return;
      }
      moveLock.current = false;
      setWarning(inspection);
      setBusy(false);
    } catch (error) {
      moveLock.current = false;
      setHint(error?.message || 'Sprachprüfung vor dem Multi-Tab-Umzug ist fehlgeschlagen.');
      setBusy(false);
    }
  };

  return (
    <>
      <div className={`inline-flex w-full flex-col items-stretch sm:w-64 sm:items-end gap-1.5 ${className}`}>
        <button
          type="button"
          onClick={handleClick}
          disabled={busy}
          title="Guide offline nehmen und in game_guides_rohmaterial zur Multi-Tab-Bearbeitung schieben"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-purple-500/50 bg-purple-600/20 px-4 py-2.5 text-xs font-mono font-bold uppercase tracking-wider text-purple-200 transition hover:border-purple-400 hover:bg-purple-600/35 disabled:opacity-50"
        >
          <span aria-hidden className="text-base leading-none">📦</span>
          {busy ? 'Verschiebe…' : 'In Multi-Tab schieben'}
        </button>
        {hint && !warning ? <span className="text-[10px] font-mono text-red-300">{hint}</span> : null}
      </div>
      {warning ? (
        <ForeignDataWarning
          inspection={warning}
          busy={busy}
          errorText={hint}
          onCancel={() => {
            if (busy) return;
            setWarning(null);
            setHint('');
          }}
          onConfirm={() => runMove()}
        />
      ) : null}
    </>
  );
}

export default AdminMoveToMultiTabButton;
