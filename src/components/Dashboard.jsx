import React, { useEffect, useState } from 'react';
import { supabase } from '../pages/supabaseClient';
import {
  TABLES,
  GAME_PK,
  GAME_FK,
  WATCHLIST,
  GAME_FIELDS,
  isActiveWatchlistStatus,
  clampProgressPercent,
} from '../lib/gameSchema';
import WatchlistProgressBar from './WatchlistProgressBar';
import WatchlistStatusBadge from './WatchlistStatusBadge';
import { useVisibility } from '../context/VisibilityContext';

function Dashboard({ sessionUser, openGame }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { toggleHidden, isHidden, getEntryState, gameKey } = useVisibility();

  useEffect(() => {
    if (!sessionUser?.id) {
      setItems([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadActiveWatchlist() {
      setLoading(true);
      setError(null);

      const { data: watchlistRows, error: watchError } = await supabase
        .from(TABLES.watchlist)
        .select(`id, ${GAME_FK}, ${WATCHLIST.progress}, ${WATCHLIST.status}, last_played_at, updated_at`)
        .eq('user_id', sessionUser.id)
        .order('last_played_at', { ascending: false });

      if (cancelled) return;

      if (watchError) {
        setError(watchError.message);
        setItems([]);
        setLoading(false);
        return;
      }

      const activeRows = (watchlistRows || []).filter((row) =>
        isActiveWatchlistStatus(row[WATCHLIST.status]),
      );

      const gameIds = [...new Set(activeRows.map((row) => row[GAME_FK]).filter(Boolean))];

      let gamesByNpwr = new Map();
      if (gameIds.length > 0) {
        const { data: games, error: gamesError } = await supabase
          .from(TABLES.games)
          .select(`${GAME_PK}, ${GAME_FIELDS.title}, ${GAME_FIELDS.cover}, ${GAME_FIELDS.console}, ${GAME_FIELDS.genre}`)
          .in(GAME_PK, gameIds);

        if (cancelled) return;

        if (gamesError) {
          setError(gamesError.message);
          setItems([]);
          setLoading(false);
          return;
        }

        for (const game of games || []) {
          gamesByNpwr.set(game[GAME_PK], game);
        }
      }

      if (cancelled) return;

      const merged = activeRows.map((row) => {
        const npwrId = row[GAME_FK];
        const game = gamesByNpwr.get(npwrId) ?? null;
        return {
          watchlistId: row.id,
          npwrId,
          game,
          progressPercent: clampProgressPercent(row[WATCHLIST.progress]),
          status: row[WATCHLIST.status] || 'active',
          lastPlayedAt: row.last_played_at || row.updated_at,
        };
      });

      setItems(merged);
      setLoading(false);
    }

    loadActiveWatchlist();
    return () => {
      cancelled = true;
    };
  }, [sessionUser?.id]);

  const handleOpenGame = (item) => {
    if (item.game) {
      openGame(item.game);
      return;
    }
    if (item.npwrId) {
      window.history.pushState({}, '', `/guide/${item.npwrId}`);
    }
  };

  const visibleItems = items.filter((item) => {
    const key = gameKey(item.npwrId);
    const completed = item.progressPercent >= 100;
    return getEntryState(key, { completed }).visible;
  });

  if (!sessionUser) {
    return (
      <section className="w-full min-w-0 rounded-2xl border border-zinc-800 bg-[#1a1b1c] p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-2">
          Aktive Spiele
        </h2>
        <p className="text-sm text-zinc-500">
          Melde dich an, um deine Watchlist mit Live-Fortschritt aus Supabase zu sehen.
        </p>
      </section>
    );
  }

  return (
    <section className="w-full min-w-0 rounded-2xl border border-zinc-800 bg-gradient-to-b from-[#1a1b1c] to-[#161718] p-5 sm:p-6 shadow-xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#00ff66] border border-[#00ff66]/20 bg-[#00ff66]/10 px-2 py-0.5 rounded">
            Dein Dashboard
          </span>
          <h2 className="mt-2 text-lg sm:text-xl font-extrabold text-white tracking-tight">
            Aktive Spiele
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Watchlist · verknüpft über <span className="font-mono text-zinc-400">{GAME_FK}</span> →{' '}
            <span className="font-mono text-zinc-400">{GAME_PK}</span>
          </p>
        </div>
        {!loading && (
          <span className="text-xs font-mono text-zinc-500 flex-shrink-0">
            {visibleItems.length} aktiv
          </span>
        )}
      </div>

      {loading && (
        <div className="space-y-3 py-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-20 rounded-xl bg-zinc-800/40 animate-pulse border border-zinc-800/60"
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-900/40 rounded-lg p-3">
          Watchlist konnte nicht geladen werden: {error}
        </p>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="text-xs text-zinc-500 italic py-2">
          Keine aktiven Spiele in deiner Watchlist. Setze den Status auf{' '}
          <span className="font-mono text-zinc-400">active</span>, um Einträge hier zu sehen.
        </p>
      )}

      {!loading && !error && items.length > 0 && visibleItems.length === 0 && (
        <p className="text-xs text-zinc-500 italic py-2">
          Alle Spiele sind ausgeblendet. Wechsle im Header auf „Einblenden“, um sie ausgegraut zu
          sehen.
        </p>
      )}

      {!loading && !error && visibleItems.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const visKey = gameKey(item.npwrId);
            const completed = item.progressPercent >= 100;
            const { visible, dimmed } = getEntryState(visKey, { completed });
            if (!visible) return null;

            const title = item.game?.[GAME_FIELDS.title] || item.npwrId || 'Unbekanntes Spiel';
            const cover = item.game?.[GAME_FIELDS.cover];
            const userHidden = isHidden(visKey);

            return (
              <li key={item.watchlistId || item.npwrId}>
                <div
                  className={`group w-full min-w-0 bg-[#121314] border border-zinc-800 hover:border-[#00ff66]/30 rounded-xl p-3 sm:p-4 flex gap-3 sm:gap-4 items-stretch transition ${
                    dimmed ? 'opacity-30' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleOpenGame(item)}
                    className="flex flex-1 min-w-0 gap-3 sm:gap-4 items-stretch text-left bg-transparent border-none cursor-pointer p-0"
                  >
                    <div className="w-14 sm:w-[4.5rem] flex-shrink-0 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 aspect-[3/4] max-h-24">
                      {cover ? (
                        <img src={cover} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600 text-lg">
                          🎮
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="text-sm sm:text-base font-bold text-zinc-100 truncate group-hover:text-[#00ff66] transition-colors">
                          {title}
                        </p>
                        <WatchlistStatusBadge status={item.status} />
                        {completed && (
                          <span className="text-[9px] font-mono uppercase text-[#00ff66]/80 border border-[#00ff66]/20 px-1.5 py-0.5 rounded">
                            Platin
                          </span>
                        )}
                      </div>

                      {item.game?.[GAME_FIELDS.console] && (
                        <p className="text-[10px] text-zinc-500 font-mono mb-2 truncate">
                          {item.game[GAME_FIELDS.console]}
                          {item.game[GAME_FIELDS.genre]
                            ? ` · ${item.game[GAME_FIELDS.genre]}`
                            : ''}
                        </p>
                      )}

                      {item.lastPlayedAt && (
                        <p className="text-[10px] text-zinc-600 font-mono mb-2">
                          Zuletzt gezockt:{' '}
                          {new Date(item.lastPlayedAt).toLocaleDateString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </p>
                      )}

                      <WatchlistProgressBar percent={item.progressPercent} />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleHidden(visKey)}
                    className="flex-shrink-0 self-center text-lg bg-transparent border-none cursor-pointer px-1"
                    aria-label={userHidden ? 'Spiel einblenden' : 'Spiel ausblenden'}
                    title={userHidden ? 'Einblenden' : 'Ausblenden'}
                  >
                    {userHidden ? '👁️‍🗨️' : '👁️'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default Dashboard;
