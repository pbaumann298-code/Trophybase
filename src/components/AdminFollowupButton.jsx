import { useEffect, useState } from 'react';
import { isAdminUser } from '../lib/adminAccess';
import {
  loadAdminFollowups,
  subscribeAdminFollowups,
  toggleAdminFollowup,
} from '../lib/adminFollowups';

/**
 * Merkt ein Spiel für die Intranet-Wiedervorlage. Nur für Admins sichtbar.
 */
function AdminFollowupButton({ user, gameId, className = '' }) {
  const userId = user?.id ?? '';
  const visible = isAdminUser(user) && Boolean(gameId);
  const [active, setActive] = useState(false);
  const [freitext, setFreitext] = useState('');
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState('');

  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    setFreitext('');
    setActive(false);
    const apply = (entries) => {
      if (cancelled) return;
      const entry = entries.find((item) => item.id === gameId);
      setActive(Boolean(entry));
      if (entry) setFreitext(String(entry.freitext ?? ''));
    };

    loadAdminFollowups().then(apply).catch((error) => {
      if (!cancelled) setHint(error.message || 'Wiedervorlage konnte nicht geladen werden.');
    });

    const unsubscribe = subscribeAdminFollowups(apply);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [visible, gameId]);

  if (!visible) return null;

  const handleClick = async () => {
    if (saving) return;
    setHint('');
    setSaving(true);
    try {
      const next = await toggleAdminFollowup(userId, { id: gameId, freitext });
      const now = next.some((entry) => entry.id === gameId);
      setActive(now);
      if (!now) setFreitext('');
      setHint(now ? 'Auf der Wiedervorlage.' : 'Von der Wiedervorlage genommen.');
      window.setTimeout(() => setHint(''), 2200);
    } catch (error) {
      setHint(error.message || 'Wiedervorlage konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`inline-flex flex-col items-stretch sm:items-end gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={saving}
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
      <label className="flex w-full flex-col gap-1 sm:w-64 sm:items-end">
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Freitext</span>
        <textarea
          value={freitext}
          onChange={(event) => setFreitext(event.target.value)}
          disabled={saving || active}
          rows={3}
          placeholder="Notiz zur späteren Anpassung"
          className="w-full resize-y rounded-xl border border-zinc-700 bg-[#121314] px-3 py-2 text-left text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500/40 focus:outline-hidden disabled:opacity-60"
        />
      </label>
      {hint ? <span className="text-[10px] font-mono text-zinc-500">{hint}</span> : null}
    </div>
  );
}

export default AdminFollowupButton;
