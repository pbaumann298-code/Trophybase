/**
 * Mehrfachauswahl der Allowlist home_tag_defs.
 */
function HomeTagChecks({ defs, selected, disabled = false, onToggle, wrap = false, className = '' }) {
  const chosen = new Set(selected ?? []);

  if (!defs?.length) {
    return (
      <p className={`text-[10px] font-mono text-zinc-600 ${className}`}>
        Keine Einträge in home_tag_defs.
      </p>
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
            checked={chosen.has(def.slug)}
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
