import React, { useState } from 'react';

/**
 * Wiederverwendbare Accordion-Kachel für 100%-Layout (Trophäen, Guides, Bosse).
 */
function CollapsibleSectionCard({
  sectionId,
  title,
  subtitle,
  badge,
  defaultOpen = false,
  accent = 'green',
  children,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const accentStyles =
    accent === 'purple'
      ? 'border-purple-500/30 hover:border-purple-500/50'
      : accent === 'amber'
        ? 'border-amber-500/30 hover:border-amber-500/50'
        : 'border-[#00ff66]/20 hover:border-[#00ff66]/40';

  const titleAccent =
    accent === 'purple' ? 'text-purple-400' : accent === 'amber' ? 'text-amber-400' : 'text-[#00ff66]';

  return (
    <section
      id={sectionId}
      className={`rounded-2xl border border-zinc-800 bg-[#1a1b1c] shadow-xl overflow-hidden transition-all duration-300 ${accentStyles} ${className}`}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 bg-[#121314] border-b border-zinc-800/80 text-left cursor-pointer transition-colors duration-300 hover:bg-zinc-900/80"
        aria-expanded={isOpen}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={`text-sm font-bold uppercase tracking-wider font-mono ${titleAccent}`}>
              {title}
            </h3>
            {badge && (
              <span className="text-[10px] font-mono text-zinc-500 bg-zinc-800/80 border border-zinc-700 px-2 py-0.5 rounded">
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-zinc-500 mt-1 truncate">{subtitle}</p>
          )}
        </div>
        <span
          className="text-zinc-500 text-sm flex-shrink-0 transition-transform duration-300"
          aria-hidden
        >
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      <div
        className={`grid transition-all duration-300 ease-in-out ${
          isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="p-4 sm:p-5">{children}</div>
        </div>
      </div>
    </section>
  );
}

export default CollapsibleSectionCard;
