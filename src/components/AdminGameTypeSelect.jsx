import { useState } from 'react';
import { supabase } from '../pages/supabaseClient';
import { GAME_TYPE } from '../lib/gameSchema';
import { setIntranetGameType } from '../lib/intranetGameEdits';

const GAME_TYPES = Object.values(GAME_TYPE);

/**
 * spiel_typ direkt am Spieltitel. Speichert über setIntranetGameType,
 * damit easy_platin und Quickwin noindex bleiben.
 */
function AdminGameTypeSelect({ gameId, gameType, onSaved, className = '' }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const current = String(gameType ?? '').trim();
  const options = !current || GAME_TYPES.includes(current) ? GAME_TYPES : [current, ...GAME_TYPES];

  const handleChange = async (event) => {
    const next = event.target.value;
    if (!gameId || !next || next === current || saving) return;
    setSaving(true);
    setError('');
    const { gameType: saved, error: saveError } = await setIntranetGameType(supabase, gameId, next);
    setSaving(false);
    if (saveError) {
      setError(saveError.message || 'Spieltyp konnte nicht gespeichert werden.');
      return;
    }
    onSaved?.(saved);
  };

  return (
    <span className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <select
        value={current}
        disabled={saving || !gameId}
        aria-label="spiel_typ"
        onChange={handleChange}
        className="rounded-md border border-zinc-600 bg-zinc-800/80 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-zinc-200 disabled:opacity-50"
      >
        {!current ? <option value="">Typ wählen</option> : null}
        {options.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
      {error ? <span className="text-[10px] font-mono normal-case tracking-normal text-red-400">{error}</span> : null}
    </span>
  );
}

export default AdminGameTypeSelect;
