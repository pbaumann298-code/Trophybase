/**
 * Mehrfachauswahl der Allowlist home_tag_defs.
 */
import { useState } from 'react';
import { homeTagKey } from '../lib/homeTagDefs';

function HomeTagChecks({
  defs,
  selected,
  disabled = false,
  onToggle,
  wrap = false,
  compact = false,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const chosen = new Set((selected ?? []).map(homeTagKey));

  if (!defs?.length) {
    return (
      <p className={`text-[10px] font-mono text-zinc-600 ${className}`}>
        Keine Einträge in home_tag_defs.
      </p>
    );
  }

  if (compact) {
    const activeDefs = defs.filter((def) => chosen.has(homeTagKey(def.slug)));
    return (
      <div className={`flex flex-col gap-1.5 max-w-[16rem] ${className}`}>
        <div className="flex flex-wrap items-center gap-1">
          {activeDefs.map((def) => (
            <button
              key={def.slug}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(def.slug)}
              title={`${def.slug} entfernen`}
              className="inline-flex items-center gap-1 rounded border border-[#00ff66]/35 bg-[#00ff66]/10 px-1.5 py-0.5 text-[10px] text-[#00ff66] hover:bg-red-500/15 hover:border-red-500/40 hover:text-red-300 disabled:opacity-40 cursor-pointer"
            >
              <span>{def.label || def.slug}</span>
              <span aria-hidden>×</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-[#121314] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 hover:border-[#00ff66]/40 hover:text-zinc-200 cursor-pointer"
          >
            {open ? '▲ Tags' : `+ Tags (${activeDefs.length})`}
          </button>
        </div>
        {open ? (
          <div className="flex flex-wrap gap-x-2.5 gap-y-1 rounded-lg border border-zinc-800 bg-[#121314] p-2">
            {defs.map((def) => (
              <label
                key={def.slug}
                title={def.slug}
                className="inline-flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={chosen.has(homeTagKey(def.slug))}
                  disabled={disabled}
                  onChange={() => onToggle(def.slug)}
                  className="accent-[#00ff66]"
                />
                <span>{def.label || def.slug}</span>
              </label>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`${wrap ? 'flex max-w-[22rem] flex-wrap gap-x-3 gap-y-1' : 'flex flex-col gap-1'} ${className}`}>
      {defs.map((def) => (
        <label
          key={def.slug}
          title={def.slug}
          className="inline-flex items-center gap-2 text-[11px] text-zinc-300"
        >
          <input
            type="checkbox"
            checked={chosen.has(homeTagKey(def.slug))}
            disabled={disabled}
            onChange={() => onToggle(def.slug)}
            className="accent-[#00ff66]"
          />
          <span>{def.label || def.slug}</span>
        </label>
      ))}
    </div>
  );
}

export default HomeTagChecks;
