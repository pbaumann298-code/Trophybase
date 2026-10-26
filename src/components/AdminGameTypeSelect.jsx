import { useState, useRef, useEffect } from 'react';
import { supabase } from '../pages/supabaseClient';
import { GAME_TYPE, parseGameTypes } from '../lib/gameSchema';
import { setIntranetGameType } from '../lib/intranetGameEdits';

const ALL_GAME_TYPES = Object.values(GAME_TYPE);

/**
 * Multi-Select Dropdown (Checkbox-Badges / Tags, maximal 2 auswählbar)
 * für games.spiel_typ. Speichert Änderungen direkt über setIntranetGameType in Supabase.
 */
function AdminGameTypeSelect({ gameId, gameType, onSaved, className = '' }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef(null);

  const selectedTypes = parseGameTypes(gameType);

  // Popover schliessen beim Klick ausserhalb
  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleToggleType = async (type) => {
    if (!gameId || saving) return;

    let nextTypes;
    if (selectedTypes.includes(type)) {
      nextTypes = selectedTypes.filter((t) => t !== type);
    } else {
      if (selectedTypes.length >= 2) return;
      nextTypes = [...selectedTypes, type];
    }

    setSaving(true);
    setError('');

    const { gameType: saved, error: saveError } = await setIntranetGameType(
      supabase,
      gameId,
      nextTypes,
    );
    setSaving(false);

    if (saveError) {
      setError(saveError.message || 'Spieltyp konnte nicht gespeichert werden.');
      return;
    }

    onSaved?.(saved);
  };

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        disabled={saving || !gameId}
        aria-expanded={open}
        aria-label="spiel_typ"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/90 px-2.5 py-1 text-[11px] font-mono font-medium text-zinc-200 transition hover:border-[#00ff66]/50 hover:bg-zinc-800 disabled:opacity-50"
      >
        {selectedTypes.length === 0 ? (
          <span className="text-zinc-400">Typ wählen</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            {selectedTypes.map((t) => (
              <span
                key={t}
                className="inline-flex items-center rounded bg-[#00ff66]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#00ff66] border border-[#00ff66]/30"
              >
                {t}
              </span>
            ))}
          </div>
        )}
        <span aria-hidden className="text-zinc-500 text-[10px] ml-0.5">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1.5 w-52 rounded-xl border border-zinc-700 bg-[#16181a] p-2 shadow-2xl backdrop-blur-md">
          <div className="mb-1.5 px-1.5 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400 border-b border-zinc-800 flex items-center justify-between">
            <span>Spiel-Typen</span>
            <span className="text-zinc-500 font-normal">Max. 2</span>
          </div>

          <div className="flex flex-col gap-0.5 max-h-60 overflow-y-auto">
            {ALL_GAME_TYPES.map((type) => {
              const isChecked = selectedTypes.includes(type);
              const isDisabled = !isChecked && selectedTypes.length >= 2;

              return (
                <label
                  key={type}
                  className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-xs font-mono cursor-pointer transition select-none ${
                    isChecked
                      ? 'bg-[#00ff66]/10 text-[#00ff66] font-bold'
                      : isDisabled
                        ? 'opacity-40 cursor-not-allowed text-zinc-500'
                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={saving || isDisabled}
                      onChange={() => handleToggleType(type)}
                      className="rounded border-zinc-700 bg-zinc-900 text-[#00ff66] focus:ring-0 focus:ring-offset-0 accent-[#00ff66]"
                    />
                    <span>{type}</span>
                  </div>
                  {isChecked && <span className="text-[10px] font-bold text-[#00ff66]">✓</span>}
                </label>
              );
            })}
          </div>

          {selectedTypes.length >= 2 && (
            <p className="mt-1.5 px-1.5 text-[9px] font-mono text-amber-400/80">
              Maximal 2 Spieltypen gleichzeitig.
            </p>
          )}

          {error && (
            <p className="mt-1 px-1.5 text-[10px] font-mono text-red-400">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminGameTypeSelect;
