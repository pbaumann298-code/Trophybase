import { useEffect, useState } from 'react';
import { supabase } from '../pages/supabaseClient';
import { getGameSupabaseDeepLinks } from '../lib/supabaseDeepLink';
import { listPipelineStatusEntries } from '../lib/gamePipelineStatus';
import { removeIntranetStatusKey } from '../lib/intranetGameEdits';
import { GAME_PK, GAME_STRUCT, TABLES } from '../lib/gameSchema';

async function countRows(table, gameId) {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('game_id', gameId);
  if (error) return null;
  return count ?? 0;
}

/**
 * Supabase-Sprung und Status-Chips aus der Multi-Tab-Kopfzeile,
 * für die Admin-Ansicht der Spielseite. Status-Keys lassen sich
 * wie in der Datenbank-Suche per × löschen.
 */
export default function AdminGameDbPanel({ game, gameId, onStatusChange }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState('');
  const [removing, setRemoving] = useState('');
  const [error, setError] = useState('');
  const [counts, setCounts] = useState(null);
  const [guideTyp, setGuideTyp] = useState(game?.guide_typ || '');
  const links = gameId ? getGameSupabaseDeepLinks(gameId) : null;
  const statusEntries = listPipelineStatusEntries(game?.status);

  useEffect(() => {
    if (!open || !gameId) return undefined;
    let cancelled = false;
    Promise.all([
      countRows(TABLES.guides, gameId),
      countRows(TABLES.guidesRohmaterial, gameId),
      countRows(TABLES.stagingGuides, gameId),
      supabase
        .from(TABLES.games)
        .select(GAME_STRUCT.guideTyp)
        .eq(GAME_PK, gameId)
        .maybeSingle(),
    ]).then(([guides, roh, staging, gameRow]) => {
      if (cancelled) return;
      setCounts({ guides, roh, staging });
      const loaded = gameRow?.data?.[GAME_STRUCT.guideTyp];
      if (loaded) setGuideTyp(String(loaded));
    });
    return () => {
      cancelled = true;
    };
  }, [open, gameId]);

  const removeStatus = async (statusKey, value) => {
    if (!gameId || removing) return;
    if (!window.confirm(`Status „${statusKey}“ (${value}) wirklich löschen?`)) return;
    setRemoving(statusKey);
    setError('');
    const { status, error: removeError } = await removeIntranetStatusKey(supabase, gameId, statusKey);
    setRemoving('');
    if (removeError) {
      setError(removeError.message || `Status „${statusKey}“ konnte nicht gelöscht werden.`);
      return;
    }
    onStatusChange?.(status);
  };

  if (!gameId || !links) return null;

  return (
    <div className="mb-4 flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="Direkter Supabase-Tabellensprung"
        className={`inline-flex w-fit items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-mono font-bold transition cursor-pointer ${
          open
            ? 'border-[#00ff66] bg-[#00ff66]/20 text-[#00ff66]'
            : 'border-zinc-700 bg-zinc-900/90 text-zinc-200 hover:border-[#00ff66]/50 hover:text-[#00ff66]'
        }`}
      >
        🗄️ Supabase / DB
      </button>

      {open ? (
        <div className="rounded-xl border border-emerald-500/40 bg-zinc-950/95 p-3 shadow-xl flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
            <div className="min-w-0 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#00ff66]">
                🗄️ Supabase Deep-Links
              </span>
              <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300 select-all">
                {gameId}
              </code>
              {copied ? (
                <span className="rounded bg-[#00ff66]/15 border border-[#00ff66]/40 px-1.5 py-0.5 text-[10px] font-mono font-bold text-[#00ff66]">
                  ✓ UUID kopiert ({copied})
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer"
              title="Schließen"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {links.items.map((item) => (
              <a
                key={item.key}
                href={item.url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  navigator.clipboard?.writeText(gameId);
                  setCopied(item.key);
                }}
                title={`${item.tableName} (${item.filterText}) in Supabase öffnen und game_id kopieren`}
                className="inline-flex items-center justify-between gap-1 rounded-lg border border-zinc-700/90 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-mono font-bold text-zinc-100 hover:border-[#00ff66] hover:bg-[#00ff66]/10 hover:text-[#00ff66] no-underline transition"
              >
                <span className="truncate">{item.label}</span>
              </a>
            ))}
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5 flex flex-col gap-2 text-[11px] font-mono">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              <div className="rounded border border-zinc-800 bg-zinc-950/80 px-2 py-1">
                <span className="block text-[9px] uppercase text-zinc-500">spiel_typ</span>
                <span className="font-bold text-zinc-100">{game?.spiel_typ || '—'}</span>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950/80 px-2 py-1">
                <span className="block text-[9px] uppercase text-zinc-500">guide_typ</span>
                <span className="font-bold text-[#00ff66]">{guideTyp || game?.guide_typ || '—'}</span>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950/80 px-2 py-1">
                <span className="block text-[9px] uppercase text-zinc-500">Tabellen-Zeilen (DB)</span>
                <span className="text-zinc-200">
                  guides: <strong className="text-white">{counts?.guides ?? '…'}</strong>
                  {' · '}roh: <strong className="text-white">{counts?.roh ?? '…'}</strong>
                  {' · '}staging: <strong className="text-white">{counts?.staging ?? '…'}</strong>
                </span>
              </div>
            </div>

            <div className="rounded border border-zinc-800 bg-zinc-950/80 px-2 py-1.5">
              <span className="block text-[9px] uppercase text-zinc-500 mb-1">games.status</span>
              {statusEntries.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {statusEntries.map((entry) => (
                    <span
                      key={entry.key}
                      className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-200"
                    >
                      <span className="text-zinc-400">{entry.key}:</span>{' '}
                      <strong className="text-[#00ff66]">{entry.value}</strong>
                      <button
                        type="button"
                        disabled={removing === entry.key}
                        onClick={() => removeStatus(entry.key, entry.value)}
                        aria-label={`${entry.key} löschen`}
                        title={`${entry.key} löschen`}
                        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[11px] leading-none text-zinc-500 hover:bg-red-500/15 hover:text-red-400 disabled:opacity-40 cursor-pointer"
                      >
                        {removing === entry.key ? '…' : '×'}
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-zinc-500">&#123;&#125; (leer)</span>
              )}
              {error ? <p className="mt-1 text-[10px] text-red-400">{error}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
