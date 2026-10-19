/**
 * Mobile Tinder-Leiste für Rohmaterial-Kandidaten auf der Spieleseite.
 */
function AdminRohmaterialTinderBar({
  batches = [],
  mode = 'productive',
  activeIndex = 0,
  hasProductiveGuide = false,
  busy = false,
  onModeChange,
  onIndexChange,
  onDiscard,
  onMatch,
  onPromote,
}) {
  const total = batches.length;
  if (total === 0) return null;

  const safeIndex = Math.min(Math.max(activeIndex, 0), total - 1);
  const batch = batches[safeIndex];
  const inRohmaterial = mode === 'rohmaterial';

  const goPrev = () => onIndexChange?.(safeIndex <= 0 ? total - 1 : safeIndex - 1);
  const goNext = () => onIndexChange?.(safeIndex >= total - 1 ? 0 : safeIndex + 1);

  return (
    <div className="mb-4 space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 sm:p-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onModeChange?.('productive')}
          className={`rounded-xl border px-3 py-2 text-[11px] font-mono font-bold uppercase tracking-wider transition ${
            !inRohmaterial
              ? 'border-[#00ff66]/40 bg-[#00ff66]/10 text-[#00ff66]'
              : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'
          } disabled:opacity-40`}
        >
          Produktiver Guide{hasProductiveGuide ? '' : ' (leer)'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onModeChange?.('rohmaterial')}
          className={`rounded-xl border px-3 py-2 text-[11px] font-mono font-bold uppercase tracking-wider transition ${
            inRohmaterial
              ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
              : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'
          } disabled:opacity-40`}
        >
          🧪 Rohmaterial-Kandidaten ({total})
        </button>
      </div>

      {inRohmaterial && batch ? (
        <>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || total < 2}
              onClick={goPrev}
              className="shrink-0 rounded-lg border border-zinc-700 px-2.5 py-2 text-sm text-zinc-300 disabled:opacity-30"
              aria-label="Vorheriger Kandidat"
            >
              ‹
            </button>
            <p className="min-w-0 flex-1 text-center text-xs leading-relaxed text-zinc-200">
              <span className="font-mono text-amber-200">
                Kandidat {safeIndex + 1}/{total}
              </span>
              <span className="mx-1 text-zinc-500">:</span>
              <span className="break-all font-mono text-[11px] text-white">{batch.batchKey}</span>
              <span className="mt-0.5 block text-[11px] text-zinc-400">
                {batch.totalRows} Schritte
                {batch.creatorName ? ` · ${batch.creatorName}` : ''}
                {batch.batchStatus ? ` · ${batch.batchStatus}` : ''}
              </span>
            </p>
            <button
              type="button"
              disabled={busy || total < 2}
              onClick={goNext}
              className="shrink-0 rounded-lg border border-zinc-700 px-2.5 py-2 text-sm text-zinc-300 disabled:opacity-30"
              aria-label="Nächster Kandidat"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => onDiscard?.(batch)}
              className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-3 text-xs font-bold uppercase tracking-wider text-red-300 hover:bg-red-500/15 disabled:opacity-40"
            >
              ❌ Wegwerfen
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onMatch?.(batch)}
              className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-3 text-xs font-bold uppercase tracking-wider text-sky-300 hover:bg-sky-500/15 disabled:opacity-40"
            >
              📌 Match (für PC-Excel)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPromote?.(batch)}
              className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-3 text-xs font-bold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-40"
            >
              💚 Direkt als Guide übernehmen
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default AdminRohmaterialTinderBar;
