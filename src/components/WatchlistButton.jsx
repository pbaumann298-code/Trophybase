import { useState } from 'react';
import { useWatchlist } from '../context/WatchlistContext';
import { useLocale } from '../context/LocaleContext';
import { markHintSeen } from '../lib/featureHints';

/**
 * Lesezeichen für die Watchlist – lokal im Browser, ohne Login.
 */
function WatchlistButton({
  gameId,
  size = 'md',
  variant = 'icon',
  className = '',
  showLabel = false,
}) {
  const { isOnWatchlist, toggleWatchlist, loading } = useWatchlist();
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(null);

  if (!gameId) return null;

  const active = isOnWatchlist(gameId);

  const sizeClass =
    size === 'sm'
      ? 'w-7 h-7 text-sm'
      : size === 'lg'
        ? 'w-10 h-10 text-lg'
        : 'w-8 h-8 text-base';

  const handleClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    setHint(null);
    setBusy(true);
    let result;
    try {
      result = await toggleWatchlist(gameId);
    } finally {
      setBusy(false);
    }

    if (result.error) {
      setHint({ text: result.error.message || t('watchlistFailed'), ok: false });
      return;
    }

    markHintSeen('watchlist');
    setHint({
      text: result.added ? t('watchlistAdded') : t('watchlistRemoved'),
      ok: true,
    });
    window.setTimeout(() => setHint(null), 2200);
  };

  const hintClass = hint?.ok ? 'text-[#00ff66]' : 'text-amber-400';

  if (variant === 'detail') {
    return (
      <div className={`inline-flex flex-col items-stretch sm:items-end gap-1.5 ${className}`}>
        <button
          type="button"
          onClick={handleClick}
          disabled={busy || loading}
          className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-mono font-bold uppercase tracking-wider transition-all duration-200 disabled:opacity-50 ${
            active
              ? 'border-[#00ff66]/40 bg-[#00ff66]/10 text-[#00ff66] hover:bg-[#00ff66]/15'
              : 'border-zinc-700 bg-[#1a1b1c] text-zinc-300 hover:border-[#00ff66]/35 hover:text-[#00ff66]'
          }`}
        >
          <span aria-hidden className="text-base leading-none">
            {active ? '★' : '☆'}
          </span>
          {active ? t('watchlistOn') : t('watchlistAdd')}
        </button>
        {hint ? (
          <span className={`text-[10px] font-mono text-right leading-snug ${hintClass}`}>{hint.text}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`inline-flex flex-col items-end gap-1 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy || loading}
        title={active ? t('watchlistRemoveTitle') : t('watchlistAddTitle')}
        aria-label={active ? t('watchlistRemoveTitle') : t('watchlistAddTitle')}
        aria-pressed={active}
        className={`${sizeClass} rounded-full border flex items-center justify-center transition-all duration-200 shadow-md disabled:opacity-50 ${
          active
            ? 'bg-[#00ff66] border-[#00ff66] text-[#121314]'
            : 'bg-black/60 border-zinc-700 text-zinc-200 hover:border-[#00ff66]/50 hover:text-[#00ff66]'
        }`}
      >
        {active ? '★' : '☆'}
      </button>
      {showLabel && (
        <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">
          Watchlist
        </span>
      )}
      {hint ? (
        <span className={`text-[10px] font-mono max-w-[10rem] text-right leading-snug ${hintClass}`}>
          {hint.text}
        </span>
      ) : null}
    </div>
  );
}

export default WatchlistButton;
