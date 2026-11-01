import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../pages/supabaseClient';
import {
  clearIntranetCover,
  markGameCoverValid,
  setIntranetIgdbCover,
} from '../lib/intranetGameEdits';

function extractCoverUrl(rawCover) {
  if (!rawCover) return '';
  if (typeof rawCover === 'string') return rawCover.trim();
  if (typeof rawCover === 'object' && !Array.isArray(rawCover)) {
    const preferred = rawCover.de || rawCover.en || Object.values(rawCover).find(Boolean);
    return typeof preferred === 'string' ? preferred.trim() : '';
  }
  return '';
}

function extractGameTitle(rawTitle) {
  if (!rawTitle) return 'Spiel';
  if (typeof rawTitle === 'string') return rawTitle.trim() || 'Spiel';
  if (typeof rawTitle === 'object' && !Array.isArray(rawTitle)) {
    return String(rawTitle.de || rawTitle.en || Object.values(rawTitle).find(Boolean) || 'Spiel').trim();
  }
  return 'Spiel';
}

export default function AdminCoverInspector({
  game,
  size = 'md',
  hideThumb = false,
  onUpdated,
}) {
  const gameId = String(game?.id ?? game?.game_id ?? '').trim();
  const [localCoverUrl, setLocalCoverUrl] = useState(() => extractCoverUrl(game?.cover_url ?? game?.cover));
  const [localCoverStatus, setLocalCoverStatus] = useState(() =>
    game?.cover_status !== undefined ? game.cover_status : undefined,
  );
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [igdbOpen, setIgdbOpen] = useState(false);
  const [igdbInput, setIgdbInput] = useState('');

  useEffect(() => {
    setLocalCoverUrl(extractCoverUrl(game?.cover_url ?? game?.cover));
    setLocalCoverStatus(game?.cover_status !== undefined ? game.cover_status : undefined);
    setErrorMsg('');
  }, [gameId, game?.cover_url, game?.cover, game?.cover_status]);

  useEffect(() => {
    if (!gameId || hideThumb || localCoverStatus !== undefined) return undefined;
    let cancelled = false;
    supabase
      .from('games')
      .select('cover_status')
      .eq('id', gameId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) {
          setLocalCoverStatus(data.cover_status ?? null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, localCoverStatus]);

  if (!gameId) return null;

  const stopEvent = (event) => {
    if (!event) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const handleClear = async (event) => {
    stopEvent(event);
    if (busy || !localCoverUrl) return;
    const confirmed = window.confirm(
      'Cover wirklich löschen? Der IGDB-Status wird dabei mit entfernt.',
    );
    if (!confirmed) return;

    setBusy(true);
    setErrorMsg('');
    const { status, error } = await clearIntranetCover(supabase, gameId);
    setBusy(false);
    if (error) {
      setErrorMsg(error.message || 'Cover konnte nicht gelöscht werden.');
      return;
    }
    setLocalCoverUrl('');
    setLocalCoverStatus(null);
    onUpdated?.({
      cover_url: {},
      coverUrl: '',
      cover_status: null,
      ...(status ? { status } : {}),
    });
  };

  const handleSaveIgdb = async (event) => {
    stopEvent(event);
    if (busy || !igdbInput.trim()) return;

    setBusy(true);
    setErrorMsg('');
    const { coverUrl, coverMap, status, error } = await setIntranetIgdbCover(
      supabase,
      gameId,
      igdbInput,
    );
    setBusy(false);
    if (error) {
      setErrorMsg(error.message || 'IGDB-Link konnte nicht gespeichert werden.');
      return;
    }
    setLocalCoverUrl(coverUrl || '');
    setLocalCoverStatus('valid');
    setIgdbOpen(false);
    setIgdbInput('');
    onUpdated?.({
      cover_url: coverMap || { de: coverUrl, en: coverUrl },
      coverUrl: coverUrl || '',
      cover_status: 'valid',
      cover_notes: null,
      ...(status ? { status } : {}),
    });
  };

  const handleVerifyStatus = async (event) => {
    stopEvent(event);
    if (busy) return;
    setBusy(true);
    setErrorMsg('');
    const { error } = await markGameCoverValid(supabase, gameId);
    setBusy(false);
    if (error) {
      setErrorMsg(error.message || 'Cover-Status konnte nicht verifiziert werden.');
      return;
    }
    setLocalCoverStatus('valid');
    onUpdated?.({
      cover_status: 'valid',
      cover_notes: null,
    });
  };

  const thumbSizeClass =
    size === 'lg'
      ? 'h-28 w-21'
      : size === 'sm'
        ? 'h-14 w-11'
        : 'h-20 w-16';

  const statusValue = localCoverStatus || 'ungeprüft';
  const isVerified = localCoverStatus === 'valid';
  const isInvalid = localCoverStatus === 'invalid';

  const modalNode =
    igdbOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 px-4"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
              e.stopPropagation();
              if (!busy) setIgdbOpen(false);
            }}
          >
            <form
              onSubmit={handleSaveIgdb}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-zinc-700 bg-[#1a1b1c] p-5 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-white">Neuer IGDB-Link</h2>
                  <p className="mt-0.5 truncate text-xs text-zinc-400">
                    {extractGameTitle(game?.spieltitel ?? game?.title)}
                  </p>
                </div>
                {localCoverUrl ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleClear}
                    className="shrink-0 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-red-300 hover:bg-red-500/20 disabled:opacity-50 cursor-pointer"
                  >
                    Cover löschen
                  </button>
                ) : null}
              </div>

              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Bildlink von <code className="text-zinc-300">images.igdb.com</code> einfügen. Ersetzt das Cover, setzt{' '}
                <code className="text-zinc-300">status.igdb = COMPLETED</code> und verifiziert{' '}
                <code className="text-zinc-300">cover_status = valid</code>.
              </p>

              <input
                type="text"
                inputMode="url"
                value={igdbInput}
                onChange={(e) => setIgdbInput(e.target.value)}
                placeholder="https://images.igdb.com/igdb/image/upload/…"
                autoFocus
                className="mt-3 w-full rounded-xl border border-zinc-700 bg-[#121314] px-3 py-2 text-sm text-zinc-200 focus:border-[#00ff66]/40 focus:outline-none"
              />

              {errorMsg ? (
                <p className="mt-2 font-mono text-[11px] text-red-300">{errorMsg}</p>
              ) : null}

              <div className="mt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setIgdbOpen(false)}
                  className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={busy || !igdbInput.trim()}
                  className="rounded-xl bg-[#00ff66] px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[#121314] hover:bg-[#00ff66]/90 disabled:opacity-50 cursor-pointer"
                >
                  {busy ? 'Speichere…' : 'Cover speichern'}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className={`flex flex-col ${hideThumb ? 'w-full' : 'items-start shrink-0'} gap-1`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={`flex items-start gap-1.5 ${hideThumb ? 'w-full justify-between' : ''}`}>
        {!hideThumb ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              stopEvent(e);
              setErrorMsg('');
              setIgdbOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                stopEvent(e);
                setErrorMsg('');
                setIgdbOpen(true);
              }
            }}
            title="Klicken, um IGDB-Link zu hinterlegen"
            className={`group relative ${thumbSizeClass} shrink-0 overflow-hidden rounded-lg border border-zinc-700/80 bg-[#121314] shadow-md transition hover:border-[#00ff66]/60 cursor-pointer`}
          >
            {localCoverUrl ? (
              <img
                src={localCoverUrl}
                alt="Cover"
                loading="lazy"
                className="h-full w-full object-cover transition group-hover:opacity-85"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center px-1 text-center font-mono text-[8px] font-bold uppercase leading-tight text-amber-300">
                Kein Cover
              </span>
            )}
          </span>
        ) : null}

        <div className={`flex ${hideThumb ? 'flex-row w-full gap-1' : 'flex-col gap-1'}`}>
          <span
            role="button"
            tabIndex={0}
            onClick={handleClear}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') handleClear(e);
            }}
            title="Falsches Cover löschen und status.igdb entfernen"
            className={`rounded-md border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-center font-mono text-[9px] font-bold uppercase tracking-wider text-red-300 transition hover:bg-red-500/20 cursor-pointer whitespace-nowrap select-none ${
              hideThumb ? 'flex-1' : ''
            } ${busy || !localCoverUrl ? 'opacity-40 pointer-events-none' : ''}`}
          >
            {busy ? '…' : 'Cover löschen'}
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              stopEvent(e);
              if (busy) return;
              setErrorMsg('');
              setIgdbOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                stopEvent(e);
                if (busy) return;
                setErrorMsg('');
                setIgdbOpen(true);
              }
            }}
            title="Neuen IGDB-Bildlink als Cover hinterlegen"
            className={`rounded-md border border-[#00ff66]/40 bg-[#00ff66]/10 px-1.5 py-0.5 text-center font-mono text-[9px] font-bold uppercase tracking-wider text-[#00ff66] transition hover:bg-[#00ff66]/20 cursor-pointer whitespace-nowrap select-none ${
              hideThumb ? 'flex-1' : ''
            } ${busy ? 'opacity-50 pointer-events-none' : ''}`}
          >
            IGDB Link
          </span>
        </div>
      </div>

      <span
        role="button"
        tabIndex={0}
        onClick={handleVerifyStatus}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleVerifyStatus(e);
        }}
        title="Klick darauf verifiziert das Cover (setzt cover_status = 'valid')"
        className={`w-full rounded-md border px-1.5 py-0.5 text-center font-mono text-[9px] font-bold transition cursor-pointer whitespace-nowrap select-none ${
          busy ? 'opacity-50 pointer-events-none' : ''
        } ${
          isVerified
            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
            : isInvalid
              ? 'border-red-500/40 bg-red-500/15 text-red-300 hover:bg-red-500/25'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:border-[#00ff66]/50 hover:bg-[#00ff66]/15 hover:text-[#00ff66]'
        }`}
      >
        {isVerified ? '✓ cover_status: valid' : `cover_status: ${statusValue}`}
      </span>

      {errorMsg && !igdbOpen ? (
        <p className="max-w-[11rem] font-mono text-[9px] text-red-400 leading-tight m-0">{errorMsg}</p>
      ) : null}

      {modalNode}
    </div>
  );
}
