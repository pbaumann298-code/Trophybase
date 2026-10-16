import { useEffect, useRef, useState } from 'react';
import { supabase } from '../pages/supabaseClient';
import { setGameHardware } from '../lib/intranetGameEdits';
import {
  URL_HARDWARE_SEGMENTS,
  collectHardwareSegments,
  formatHardwareValue,
  hardwareLabel,
  hardwareToUrlSegment,
} from '../lib/gameSlug';

const OPTIONS = URL_HARDWARE_SEGMENTS.map((segment) => ({
  segment,
  label: hardwareLabel(segment),
}));

/**
 * Mehrfachauswahl für games.hardware. Gespeichert wird „PS4/PS5“.
 * Die öffentliche URL und die Sitemap nutzen nur die neueste Konsole.
 */
function AdminHardwareSelect({ gameId, hardware, onSaved }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const rootRef = useRef(null);
  const selected = collectHardwareSegments(hardware);
  const label = formatHardwareValue(selected) || hardwareLabel(hardware) || 'Konsole wählen';

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const toggle = async (segment) => {
    if (!gameId || saving) return;
    const next = selected.includes(segment)
      ? selected.filter((item) => item !== segment)
      : [...selected, segment];
    if (next.length === 0) {
      setError('Mindestens eine Konsole bleibt ausgewählt.');
      return;
    }
    const previousUrl = hardwareToUrlSegment(hardware);
    setSaving(true);
    setError('');
    const { hardware: saved, error: saveError } = await setGameHardware(supabase, gameId, next);
    setSaving(false);
    if (saveError) {
      setError(saveError.message || 'Konsole konnte nicht gespeichert werden.');
      return;
    }
    onSaved?.(saved, hardwareToUrlSegment(saved) !== previousUrl);
  };

  return (
    <div ref={rootRef} className="relative text-right">
      <button
        type="button"
        disabled={!gameId || saving}
        aria-expanded={open}
        aria-label="hardware"
        onClick={() => setOpen((value) => !value)}
        className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-right text-sm font-semibold text-sky-300 disabled:opacity-50"
      >
        {saving ? '…' : label}
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-zinc-700 bg-[#1a1b1c] p-3 text-left">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            Konsolen
          </p>
          <div className="flex flex-col gap-1.5">
            {OPTIONS.map((option) => (
              <label
                key={option.segment}
                className="flex cursor-pointer items-center gap-2 text-xs text-zinc-200"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option.segment)}
                  disabled={saving}
                  onChange={() => toggle(option.segment)}
                  className="h-3.5 w-3.5 rounded-sm border-zinc-600 bg-[#121314] text-[#00ff66] focus:ring-0"
                />
                {option.label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
            Mehrere Haken landen als PS4/PS5 in der Datenbank. Sitemap und öffentliche Adresse
            nutzen nur die neueste Konsole. Ein zusätzlicher Haken erzeugt keine zweite URL.
            Wechselt die neueste, ändert sich die Adresse.
          </p>
        </div>
      ) : null}
      {error ? <p className="mt-1 text-[10px] font-mono text-red-400">{error}</p> : null}
    </div>
  );
}

export default AdminHardwareSelect;
