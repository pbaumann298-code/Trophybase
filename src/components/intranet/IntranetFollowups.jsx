import { useEffect, useState } from 'react';
import { supabase } from '../../pages/supabaseClient';
import { fetchIntranetGamesByIds } from '../../lib/intranetQueries';
import { toggleAdminFollowup } from '../../lib/adminFollowups';
import { useAdminFollowups } from '../../hooks/useAdminFollowups';
import IntranetGameTable from './IntranetGameTable';

function IntranetFollowups({ sessionUser }) {
  const userId = sessionUser?.id ?? '';
  const entries = useAdminFollowups(userId);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const entryKey = entries.map((entry) => entry.id).join('|');

  useEffect(() => {
    let cancelled = false;
    const ids = entryKey ? entryKey.split('|') : [];

    async function load() {
      if (!ids.length) {
        setGames([]);
        setLoading(false);
        setErrorMessage('');
        return;
      }

      setLoading(true);
      const { data, error } = await fetchIntranetGamesByIds(supabase, ids);
      if (cancelled) return;
      if (error) {
        setErrorMessage(error.message || 'Wiedervorlage konnte nicht geladen werden.');
        setGames([]);
      } else {
        setErrorMessage('');
        setGames(data);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [entryKey]);

  const foundIds = new Set(games.map((game) => game.id));
  const missing = entries.filter((entry) => !foundIds.has(entry.id));

  const handlePatch = (gameId, partial) => {
    setGames((prev) => prev.map((game) => (game.id === gameId ? { ...game, ...partial } : game)));
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Wiedervorlage</h2>
        <p className="text-sm text-zinc-500 max-w-3xl leading-relaxed">
          Spiele, die beim Durchsehen des Guides noch eine Anpassung brauchen. Markieren geht
          hier über <span className="text-zinc-400">Merken</span> und in der Guide-Ansicht über
          <span className="text-zinc-400"> Zur Wiedervorlage</span>. Die Liste bleibt in diesem
          Browser gespeichert.
        </p>
      </div>

      {errorMessage ? (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">
          {errorMessage}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500 font-mono">Wiedervorlage wird geladen…</p>
      ) : null}

      {!loading && entries.length === 0 ? (
        <p className="text-sm text-zinc-500">Noch keine Spiele auf der Wiedervorlage.</p>
      ) : null}

      {!loading && games.length > 0 ? (
        <IntranetGameTable games={games} sessionUser={sessionUser} onGamePatch={handlePatch} />
      ) : null}

      {!loading && missing.length > 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-[#1a1b1c] p-4 space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            Nicht mehr in der Datenbank
          </p>
          {missing.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-zinc-300">{entry.title || entry.id}</span>
              <button
                type="button"
                onClick={() => toggleAdminFollowup(userId, { id: entry.id, title: entry.title })}
                className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 hover:text-red-300"
              >
                Entfernen
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default IntranetFollowups;
