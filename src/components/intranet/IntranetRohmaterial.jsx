import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../pages/supabaseClient';
import { handleStaffGamePreviewClick } from '../../lib/adminAccess';
import {
  discardRohmaterialBatch,
  fetchAllRohmaterialOverview,
} from '../../lib/rohmaterialQueries';
import IntranetDrafts from './IntranetDrafts';

const FILTERS = [
  { id: 'all', label: 'Alle' },
  { id: 'open', label: 'Offen' },
  { id: 'matched', label: 'Matched für PC' },
];

function statusTone(status) {
  const value = String(status ?? '').trim().toUpperCase();
  if (value === 'MATCHED') return 'text-sky-300 bg-sky-500/10 border-sky-500/30';
  return 'text-amber-300 bg-amber-500/10 border-amber-500/30';
}

function previewHref(row) {
  const id = String(row.gameId || row.platformGameId || '').trim();
  if (!id) return '';
  return `/guide/${encodeURIComponent(id)}?rohmaterial=1`;
}

function IntranetRohmaterial() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [busyKey, setBusyKey] = useState('');
  const [editorGameId, setEditorGameId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: loadError } = await fetchAllRohmaterialOverview(supabase);
      if (loadError) throw loadError;
      setRows(data ?? []);
    } catch (err) {
      console.error('Rohmaterial Load Fehler:', err);
      setError(err?.message || 'Rohmaterial konnte nicht geladen werden.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    if (filter === 'matched') {
      return rows.filter((row) => String(row.batchStatus ?? '').toUpperCase() === 'MATCHED');
    }
    if (filter === 'open') {
      return rows.filter((row) => String(row.batchStatus ?? '').toUpperCase() !== 'MATCHED');
    }
    return rows;
  }, [rows, filter]);

  const handleDiscard = async (batchKey) => {
    if (!batchKey || busyKey) return;
    if (!window.confirm(`Batch „${batchKey}" wirklich löschen?`)) return;
    setBusyKey(batchKey);
    const { error: discardError } = await discardRohmaterialBatch(supabase, batchKey);
    setBusyKey('');
    if (discardError) {
      setError(discardError.message || 'Batch konnte nicht gelöscht werden.');
      return;
    }
    setRows((prev) => prev.filter((row) => row.batchKey !== batchKey));
  };

  if (editorGameId) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs text-amber-200 font-mono">
            <span>📦 Rohmaterial Multi-Tab & Gruppen-Konsolidierung</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditorGameId(null);
              load();
            }}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-[11px] font-mono font-bold text-zinc-200 hover:border-zinc-500"
          >
            ← Zurück zur Batch-Übersicht
          </button>
        </div>
        <IntranetDrafts
          initialDataSource="rohmaterial"
          initialGameId={editorGameId === '__ALL__' ? null : editorGameId}
        />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="mb-1 text-lg font-bold text-white">Rohmaterial</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-zinc-500">
          Offene Kandidaten aus Scraper Ultra in <span className="font-mono text-zinc-400">game_guides_rohmaterial</span>.
          Auf dem Handy prüfst du sie per Tinder-Leiste auf der Spieleseite.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`rounded-xl border px-3 py-2 text-[11px] font-mono font-bold uppercase tracking-wider ${
              filter === item.id
                ? 'border-[#00ff66]/40 bg-[#00ff66]/10 text-[#00ff66]'
                : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-xl border border-zinc-700 px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
        >
          Neu laden
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="font-mono text-sm text-zinc-500">Rohmaterial wird geladen…</p>
      ) : null}

      {!loading && visible.length === 0 ? (
        <p className="text-sm text-zinc-500">Keine Batches für diesen Filter.</p>
      ) : null}

      {!loading && visible.length > 0 ? (
        <ul className="space-y-3">
          {visible.map((row) => {
            const href = previewHref(row);
            return (
              <li
                key={row.batchKey}
                className="rounded-2xl border border-zinc-800 bg-[#1a1b1c] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="break-all font-mono text-sm font-bold text-white">{row.batchKey}</p>
                    <p className="text-xs text-zinc-400">
                      {row.totalRows} Zeilen
                      {row.creatorName ? ` · ${row.creatorName}` : ''}
                      {row.platformGameId ? ` · ${row.platformGameId}` : ''}
                      {row.gameId ? (
                        <span className="ml-1 font-mono text-[10px] text-zinc-600">
                          ({String(row.gameId).slice(0, 8)}…)
                        </span>
                      ) : null}
                    </p>
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${statusTone(row.batchStatus)}`}
                    >
                      {row.batchStatus || 'OPEN'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setEditorGameId(row.gameId || row.platformGameId || '__ALL__')}
                      className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] font-mono font-bold uppercase tracking-wider text-amber-300 hover:bg-amber-500/20"
                    >
                      🔬 Gruppen & Batch-Editor
                    </button>
                    {href ? (
                      <a
                        href={href}
                        onClick={(event) => handleStaffGamePreviewClick(event, href)}
                        className="rounded-xl border border-[#00ff66]/35 bg-[#00ff66]/10 px-3 py-2 text-[11px] font-mono font-bold uppercase tracking-wider text-[#00ff66] no-underline hover:bg-[#00ff66]/15"
                      >
                        Auf Website prüfen
                      </a>
                    ) : null}
                    <button
                      type="button"
                      disabled={busyKey === row.batchKey}
                      onClick={() => handleDiscard(row.batchKey)}
                      className="rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-[11px] font-mono font-bold uppercase tracking-wider text-red-300 hover:bg-red-500/15 disabled:opacity-40"
                      title="Batch löschen"
                    >
                      🗑 Löschen
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

export default IntranetRohmaterial;
