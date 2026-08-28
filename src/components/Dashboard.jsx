import React, { useEffect, useState } from 'react';
import { supabase } from '../pages/supabaseClient';
import { fetchGameByRouteRef, fetchGamesByIds, parseRouteGameRef } from '../lib/gameQueries';
import { GAME_PK, GAME_FIELDS, GAME_PLATFORM_ID } from '../lib/gameSchema';
import { navigateToGame } from '../lib/routeUtils';
import { getGameUuid, getRouteSlug, getGameTitle, getGameCover } from '../lib/gameModel';
import { useVisibility } from '../context/VisibilityContext';
import { useWatchlist } from '../context/WatchlistContext';
import { useLocale } from '../context/LocaleContext';

function Dashboard({ openGame }) {
  const { globalLocale, t } = useLocale();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { toggleHidden, isHidden, getEntryState, gameKey } = useVisibility();
  const { watchlistIdList, version } = useWatchlist();

  useEffect(() => {
    let cancelled = false;

    async function loadWatchlistGames() {
      const ids = watchlistIdList.filter((id) => parseRouteGameRef(id).valid);
      if (ids.length === 0) {
        if (!cancelled) {
          setItems([]);
          setError(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);

      const { data: games, error: gamesError } = await fetchGamesByIds(
        supabase,
        ids,
        globalLocale,
      );

      if (cancelled) return;

      if (gamesError) {
        setError(gamesError.message);
        setItems([]);
        setLoading(false);
        return;
      }

      const byRef = new Map();
      for (const game of games || []) {
        const uuid = getGameUuid(game);
        const slug = getRouteSlug(game);
        const platformId = game[GAME_PLATFORM_ID];
        if (uuid) byRef.set(String(uuid), game);
        if (slug) byRef.set(String(slug), game);
        if (platformId) byRef.set(String(platformId), game);
        if (game[GAME_PK]) byRef.set(String(game[GAME_PK]), game);
      }

      const merged = ids
        .map((id) => {
          const game = byRef.get(id) ?? null;
          if (!game) return null;
          return {
            gameUuid: getGameUuid(game) || id,
            routeSlug: getRouteSlug(game) || id,
            game,
          };
        })
        .filter(Boolean);

      setItems(merged);
      setLoading(false);
    }

    loadWatchlistGames();
    return () => {
      cancelled = true;
    };
  }, [watchlistIdList, version, globalLocale]);

  const handleOpenGame = async (item) => {
    if (item.game) {
      openGame(item.game);
      return;
    }
    if (!item.routeSlug && !item.gameUuid) return;

    const { data: game, error: gameError } = await fetchGameByRouteRef(
      supabase,
      item.routeSlug ?? item.gameUuid,
      globalLocale,
    );

    if (gameError) {
      console.error('Watchlist-Spiel:', gameError.message);
    }

    if (game) {
      openGame(game);
      return;
    }

    navigateToGame(item.routeSlug ?? item.gameUuid);
    openGame({ id: item.gameUuid, [GAME_PLATFORM_ID]: item.routeSlug });
  };

  const visibleItems = items.filter((item) => {
    const key = gameKey(item.gameUuid || item.routeSlug);
    return getEntryState(key, { completed: false }).visible;
  });

  const countLabel =
    visibleItems.length === 1 ? t('watchlistCountOne') : t('watchlistCountMany').replace('{n}', String(visibleItems.length));

  return (
    <section className="w-full min-w-0 rounded-2xl border border-zinc-800 bg-gradient-to-b from-[#1a1b1c] to-[#161718] p-5 sm:p-6 shadow-xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
            {t('watchlistTitle')}
          </h2>
        </div>
        {!loading && (
          <span className="text-xs font-mono text-zinc-500 flex-shrink-0">{countLabel}</span>
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
        <p className="text-xs text-zinc-500 italic py-2">{t('watchlistEmpty')}</p>
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
            const visKey = gameKey(item.gameUuid || item.routeSlug);
            const { visible, dimmed } = getEntryState(visKey, { completed: false });
            if (!visible) return null;

            const title = getGameTitle(item.game, globalLocale) || item.routeSlug || 'Unbekanntes Spiel';
            const cover = getGameCover(item.game, globalLocale);
            const userHidden = isHidden(visKey);

            return (
              <li key={item.gameUuid || item.routeSlug}>
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
                      <p className="text-sm sm:text-base font-bold text-zinc-100 break-words min-w-0 group-hover:text-[#00ff66] transition-colors">
                        {title}
                      </p>
                      {item.game?.[GAME_FIELDS.console] && (
                        <p className="text-[10px] text-zinc-500 font-mono mt-1 truncate">
                          {item.game[GAME_FIELDS.console]}
                          {item.game[GAME_FIELDS.genre]
                            ? ` · ${item.game[GAME_FIELDS.genre]}`
                            : ''}
                        </p>
                      )}
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
