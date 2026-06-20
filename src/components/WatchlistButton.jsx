import React, { useState } from 'react';
import { useWatchlist } from '../context/WatchlistContext';

/**
 * Lesezeichen für die Watchlist – Toggle wenn eingeloggt, Hinweis sonst.
 */
function WatchlistButton({
  gameId,
  onRequestLogin,
  size = 'md',
  className = '',
  showLabel = false,
}) {
  const { isOnWatchlist, toggleWatchlist, isLoggedIn, loading } = useWatchlist();
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');

  if (!gameId) return null;

  const active = isOnWatchlist(gameId);
  const dim = !isLoggedIn;

  const sizeClass =
    size === 'sm'
      ? 'w-7 h-7 text-sm'
      : size === 'lg'
        ? 'w-10 h-10 text-lg'
        : 'w-8 h-8 text-base';

  const handleClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isLoggedIn) {
      setHint('Watchlist nur für eingeloggte Nutzer.');
      return;
    }

    setHint('');
    setBusy(true);
    const result = await toggleWatchlist(gameId);
    setBusy(false);

    if (result.needsLogin) {
      setHint('Bitte anmelden, um Spiele zu merken.');
      onRequestLogin?.();
      return;
    }

    if (result.error) {
      setHint(result.error.message || 'Watchlist konnte nicht aktualisiert werden.');
      return;
    }

    setHint(active ? 'Von Watchlist entfernt.' : 'Zur Watchlist hinzugefügt.');
    window.setTimeout(() => setHint(''), 2200);
  };

  return (
    <div className={`inline-flex flex-col items-end gap-1 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy || loading}
        title={
          !isLoggedIn
            ? 'Anmelden für Watchlist'
            : active
              ? 'Von Watchlist entfernen'
              : 'Zur Watchlist hinzufügen'
        }
        aria-label={
          !isLoggedIn
            ? 'Watchlist – Anmeldung erforderlich'
            : active
              ? 'Von Watchlist entfernen'
              : 'Zur Watchlist hinzufügen'
        }
        aria-pressed={isLoggedIn ? active : undefined}
        className={`${sizeClass} rounded-full border flex items-center justify-center transition-all duration-200 shadow-md disabled:opacity-50 ${
          active
            ? 'bg-[#00ff66] border-[#00ff66] text-[#121314]'
            : dim
              ? 'bg-black/50 border-zinc-600 text-zinc-400 hover:border-zinc-400'
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
      {hint && (
        <span
          className={`text-[10px] font-mono max-w-[10rem] text-right leading-snug ${
            hint.includes('hinzugefügt') || hint.includes('entfernt')
              ? 'text-[#00ff66]'
              : 'text-amber-400'
          }`}
        >
          {hint}
        </span>
      )}
    </div>
  );
}

export default WatchlistButton;
