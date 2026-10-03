import { useEffect, useState } from 'react';
import { isAdminUser } from '../lib/adminAccess';
import {
  isAdminFollowup,
  subscribeAdminFollowups,
  toggleAdminFollowup,
} from '../lib/adminFollowups';

/**
 * Merkt ein Spiel für die Intranet-Wiedervorlage. Nur für Admins sichtbar.
 */
function AdminFollowupButton({ user, gameId, title, className = '' }) {
  const userId = user?.id ?? '';
  const visible = isAdminUser(user) && Boolean(gameId);
  const [active, setActive] = useState(() => (visible ? isAdminFollowup(userId, gameId) : false));
  const [hint, setHint] = useState('');

  useEffect(() => {
    if (!visible) return undefined;
    setActive(isAdminFollowup(userId, gameId));
    return subscribeAdminFollowups(userId, (entries) => {
      setActive(entries.some((entry) => entry.id === gameId));
    });
  }, [visible, userId, gameId]);

  if (!visible) return null;

  const handleClick = () => {
    setHint('');
    try {
      const next = toggleAdminFollowup(userId, { id: gameId, title });
      const now = next.some((entry) => entry.id === gameId);
      setActive(now);
      setHint(now ? 'Auf der Wiedervorlage.' : 'Von der Wiedervorlage genommen.');
      window.setTimeout(() => setHint(''), 2200);
    } catch (error) {
      setHint(error.message || 'Wiedervorlage konnte nicht gespeichert werden.');
    }
  };

  return (
    <div className={`inline-flex flex-col items-stretch sm:items-end gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={active}
        title={active ? 'Von der Wiedervorlage nehmen' : 'Für eine spätere Anpassung merken'}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-mono font-bold uppercase tracking-wider transition-all duration-200 ${
          active
            ? 'border-amber-400/50 bg-amber-500/15 text-amber-300 hover:bg-amber-500/20'
            : 'border-zinc-700 bg-transparent text-zinc-400 hover:text-amber-200 hover:border-amber-500/30'
        }`}
      >
        <span aria-hidden className="text-base leading-none">{active ? '●' : '○'}</span>
        {active ? 'Wiedervorlage' : 'Zur Wiedervorlage'}
      </button>
      {hint ? <span className="text-[10px] font-mono text-zinc-500">{hint}</span> : null}
    </div>
  );
}

export default AdminFollowupButton;
