import React from 'react';

const STATUS_STYLES = {
  active: 'bg-[#00ff66]/10 text-[#00ff66] border-[#00ff66]/25',
  aktiv: 'bg-[#00ff66]/10 text-[#00ff66] border-[#00ff66]/25',
  playing: 'bg-[#00ff66]/10 text-[#00ff66] border-[#00ff66]/25',
  completed: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
  abgeschlossen: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
  paused: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
  pausiert: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
  dropped: 'bg-zinc-500/10 text-zinc-400 border-zinc-600/40',
};

function WatchlistStatusBadge({ status }) {
  const label = status ? String(status) : 'active';
  const key = label.toLowerCase();
  const style = STATUS_STYLES[key] || STATUS_STYLES.active;

  return (
    <span
      className={`inline-flex items-center text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${style}`}
    >
      {label}
    </span>
  );
}

export default WatchlistStatusBadge;
