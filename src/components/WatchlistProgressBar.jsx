import React from 'react';
import { clampProgressPercent } from '../lib/gameSchema';

function WatchlistProgressBar({ percent, className = '' }) {
  const value = clampProgressPercent(percent);

  return (
    <div className={`w-full min-w-0 ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
          Trophäen-Fortschritt
        </span>
        <span className="text-xs font-mono font-bold text-[#00ff66] tabular-nums">
          {value}%
        </span>
      </div>
      <div className="relative h-2.5 sm:h-3 w-full rounded-full bg-zinc-800/90 overflow-hidden border border-zinc-700/50">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#00cc52] via-[#00ff66] to-[#66ff99] transition-all duration-700 ease-out shadow-[0_0_12px_rgba(0,255,102,0.55)]"
          style={{ width: `${value}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white/20 mix-blend-overlay transition-all duration-700"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export default WatchlistProgressBar;
