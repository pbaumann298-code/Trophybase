import React from 'react';
import WatchlistButton from './WatchlistButton';

/**
 * Konsole + Watchlist direkt über der Spielbeschreibung.
 */
function GameDetailMetaBar({ consoleLabel, gameId, onRequestLogin }) {
  const consoleText = String(consoleLabel ?? '').trim();

  return (
    <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-zinc-800/80 bg-[#121314]/80 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        {consoleText ? (
          <span className="inline-flex items-center gap-2 rounded-lg border border-sky-500/25 bg-sky-950/40 px-3 py-1.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400/80">
              Konsole
            </span>
            <span className="text-sm font-bold text-sky-200">{consoleText}</span>
          </span>
        ) : (
          <span className="text-xs text-zinc-500 font-mono">Konsole: —</span>
        )}
        {gameId && (
          <span className="text-[10px] font-mono text-zinc-600 truncate" title={gameId}>
            {gameId}
          </span>
        )}
      </div>

      <WatchlistButton
        gameId={gameId}
        onRequestLogin={onRequestLogin}
        variant="detail"
        className="sm:flex-shrink-0"
      />
    </div>
  );
}

export default GameDetailMetaBar;
