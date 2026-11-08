import { useState } from 'react';
import { isAdminUser, setDraftReturnContext } from '../lib/adminAccess';
import { moveGameToMultiTab } from '../lib/rohmaterialQueries';
import { supabase } from '../pages/supabaseClient';

const CONFIRM_TEXT = [
  'Dieses Spiel wird in die Multi-Tab-Tabelle zur Bearbeitung geschoben.',
  'Ein veröffentlichter Guide geht dabei offline (Status FERTIG).',
  'Die Guide-Zeilen wechseln von game_guides nach game_guides_rohmaterial.',
  'Liegt das Spiel schon dort, wird nichts doppelt angelegt.',
  'Danach öffnet sich der Multi-Tab-Editor.',
].join('\n\n');

function openMultiTabEditor(gameId) {
  setDraftReturnContext({
    gameId,
    activeDataSource: 'rohmaterial',
    staffPath: '/intranet.html#entwuerfe',
  });
  window.location.assign('/intranet.html#entwuerfe');
}

/**
 * Schiebt das aktuelle Spiel in game_guides_rohmaterial. Nur für Admins sichtbar.
 */
function AdminMoveToMultiTabButton({ user, gameId, className = '' }) {
  const visible = isAdminUser(user) && Boolean(gameId);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');

  if (!visible) return null;

  const handleClick = async () => {
    if (busy) return;
    if (!window.confirm(CONFIRM_TEXT)) return;
    setHint('');
    setBusy(true);
    try {
      const result = await moveGameToMultiTab(supabase, gameId);
      if (!result.ok) {
        setHint(result.error?.message || 'Verschieben in die Multi-Tab-Tabelle ist fehlgeschlagen.');
        setBusy(false);
        return;
      }
      openMultiTabEditor(gameId);
    } catch (error) {
      setHint(error?.message || 'Verschieben in die Multi-Tab-Tabelle ist fehlgeschlagen.');
      setBusy(false);
    }
  };

  return (
    <div className={`inline-flex w-full flex-col items-stretch sm:w-64 sm:items-end gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        title="Guide offline nehmen und in game_guides_rohmaterial zur Multi-Tab-Bearbeitung schieben"
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-purple-500/50 bg-purple-600/20 px-4 py-2.5 text-xs font-mono font-bold uppercase tracking-wider text-purple-200 transition hover:border-purple-400 hover:bg-purple-600/35 disabled:opacity-50"
      >
        <span aria-hidden className="text-base leading-none">📦</span>
        {busy ? 'Verschiebe…' : 'In Multi-Tab schieben'}
      </button>
      {hint ? <span className="text-[10px] font-mono text-red-300">{hint}</span> : null}
    </div>
  );
}

export default AdminMoveToMultiTabButton;
