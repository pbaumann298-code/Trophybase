import React from 'react';
import { useVisibility } from '../context/VisibilityContext';

function VisibilityModeToggle() {
  const { displayMode, setDisplayMode, modes } = useVisibility();
  const isDim = displayMode === modes.DIM;

  return (
    <div
      className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-[#121314] p-0.5 flex-shrink-0"
      role="group"
      aria-label="Anzeige ausgeblendeter Einträge"
    >
      <button
        type="button"
        onClick={() => setDisplayMode(modes.DIM)}
        className={`px-2 sm:px-3 py-1 rounded-md text-[10px] sm:text-xs font-mono uppercase tracking-wide transition whitespace-nowrap ${
          isDim
            ? 'bg-[#00ff66]/15 text-[#00ff66] border border-[#00ff66]/25'
            : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
        }`}
        title="Ausgeblendete Einträge bleiben sichtbar, aber ausgegraut"
      >
        Einblenden
      </button>
      <button
        type="button"
        onClick={() => setDisplayMode(modes.FILTER)}
        className={`px-2 sm:px-3 py-1 rounded-md text-[10px] sm:text-xs font-mono uppercase tracking-wide transition whitespace-nowrap ${
          !isDim
            ? 'bg-[#00ff66]/15 text-[#00ff66] border border-[#00ff66]/25'
            : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
        }`}
        title="Ausgeblendete Einträge werden komplett entfernt"
      >
        Ausblenden
      </button>
    </div>
  );
}

export default VisibilityModeToggle;
