import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../pages/supabaseClient';
import { fetchGameByRouteRef, fetchGamesByIds, parseRouteGameRef } from '../lib/gameQueries';
import { GAME_FIELDS, GAME_PLATFORM_ID } from '../lib/gameSchema';
import { gameGuidePath, navigateToGame } from '../lib/routeUtils';
import {
  getGameUuid,
  getPlatformGameIds,
  getRouteSlug,
  getGameTitle,
  getGameCover,
} from '../lib/gameModel';
import { useVisibility } from '../context/VisibilityContext';
import { useWatchlist } from '../context/WatchlistContext';
import { useLocale } from '../context/LocaleContext';
import { canonicalizeWatchlistIds, watchlistIdsEqual } from '../lib/localWatchlist';

/** Ab so vielen Titeln lohnt die Startseiten-Leiste zum horizontalen Scrollen. */
export const HOME_WATCHLIST_MIN = 3;

const TILE_CLASS =
  'home-carousel-tile flex-shrink-0 snap-start w-[9.5rem] sm:w-44 lg:w-[calc((100%-3rem)/5)] max-w-[12rem] lg:max-w-none';

/**
 * Kompakte Watchlist-Leiste auf der Startseite (nur ab HOME_WATCHLIST_MIN Einträgen).
 * Volle Liste: /watchlist
 */
function Dashboard({ openGame, onOpenWatchlist }) {
  const { globalLocale, t } = useLocale();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { getEntryState, gameKey } = useVisibility();
  const { watchlistIdList, version, replaceWatchlistIds } = useWatchlist();
  const trackRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollHints = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadWatchlistGames() {
      const ids = watchlistIdList.filter((id) => parseRouteGameRef(id).valid);
      if (ids.length === 0) {
        if (!cancelled) {
          if (watchlistIdList.length > 0) {
            try {
              replaceWatchlistIds([]);
            } catch {
              /* Quota */
            }
          }
          setItems([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const { data: games, error: gamesError } = await fetchGamesByIds(
        supabase,
        ids,
        globalLocale,
      );

      if (cancelled) return;

      if (gamesError) {
        console.error('Watchlist-Leiste:', gamesError.message);
        setItems([]);
        setLoading(false);
        return;
      }

      const byRef = new Map();
      for (const game of games || []) {
        const uuid = getGameUuid(game);
        if (uuid) byRef.set(uuid, game);
        for (const npwr of getPlatformGameIds(game)) byRef.set(npwr, game);
      }

      const seenGames = new Set();
      const merged = [];
      for (const id of ids) {
        const game = byRef.get(id);
        if (!game) continue;
        const gameUuid = getGameUuid(game) || id;
        if (seenGames.has(gameUuid)) continue;
        seenGames.add(gameUuid);
        merged.push({
          gameUuid,
          routeSlug: getRouteSlug(game) || id,
          game,
        });
      }

      const canonical = canonicalizeWatchlistIds(watchlistIdList, (id) =>
        getGameUuid(byRef.get(id)),
      );
      if (!watchlistIdsEqual(canonical, watchlistIdList)) {
        try {
          replaceWatchlistIds(canonical);
        } catch {
          /* Quota */
        }
      }

      setItems(merged);
      setLoading(false);
    }

    loadWatchlistGames();
    return () => {
      cancelled = true;
    };
  }, [watchlistIdList, version, globalLocale, replaceWatchlistIds]);

  const visibleItems = items.filter((item) => {
    const key = gameKey(item.gameUuid || item.routeSlug);
    return getEntryState(key, { completed: false }).visible;
  });

  useEffect(() => {
    if (loading || visibleItems.length < HOME_WATCHLIST_MIN) return undefined;
    updateScrollHints();
    const el = trackRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(updateScrollHints);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, visibleItems.length, updateScrollHints]);

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

  if (loading || visibleItems.length < HOME_WATCHLIST_MIN) {
    return null;
  }

  const scrollByTiles = (direction) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: Math.round(el.clientWidth * 0.85) * direction, behavior: 'smooth' });
  };

  return (
    <section className="home-category w-full min-w-0 max-w-full" aria-labelledby="home-watchlist-title">
      <header className="home-category-header">
        <div className="home-category-heading min-w-0">
          {typeof onOpenWatchlist === 'function' ? (
            <button
              type="button"
              id="home-watchlist-title"
              className="home-category-title home-category-title--clickable"
              onClick={onOpenWatchlist}
              title={t('watchlistTitle')}
            >
              {t('watchlistTitle')}
              <span className="home-category-search-hint" aria-hidden>
                ↗
              </span>
            </button>
          ) : (
            <h2 id="home-watchlist-title" className="home-category-title">
              {t('watchlistTitle')}
            </h2>
          )}
        </div>
        <div className="home-category-nav flex-shrink-0">
          <button
            type="button"
            className="home-scroll-btn"
            aria-label={`${t('watchlistTitle')} nach links`}
            disabled={!canScrollLeft}
            onClick={() => scrollByTiles(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="home-scroll-btn"
            aria-label={`${t('watchlistTitle')} nach rechts`}
            disabled={!canScrollRight}
            onClick={() => scrollByTiles(1)}
          >
            ›
          </button>
        </div>
      </header>

      <div className="home-carousel-wrap">
        <div
          ref={trackRef}
          className="home-carousel-track scrollbar-hide"
          onScroll={updateScrollHints}
        >
          {visibleItems.map((item) => {
            const title = getGameTitle(item.game, globalLocale) || item.routeSlug || '—';
            const cover = getGameCover(item.game, globalLocale);
            const consoleLabel = item.game?.[GAME_FIELDS.console] ?? '';
            const href = item.game ? gameGuidePath(item.game, globalLocale) : '#';
            return (
              <a
                key={item.gameUuid || item.routeSlug}
                href={href}
                className={TILE_CLASS}
                onClick={(event) => {
                  event.preventDefault();
                  if (item.game) {
                    navigateToGame(item.game, { locale: globalLocale });
                  }
                  handleOpenGame(item);
                }}
              >
                <article className="home-tile group h-full" style={{ '--tile-accent': '#00ff66' }}>
                  <div className="home-tile-cover-wrap">
                    {cover ? (
                      <img src={cover} className="home-tile-cover" alt="" loading="lazy" />
                    ) : (
                      <div className="home-tile-cover home-tile-cover--empty">🎮</div>
                    )}
                    <div className="home-tile-shine" aria-hidden />
                  </div>
                  <div className="home-tile-meta">
                    <p className="home-tile-title" title={title}>
                      {title}
                    </p>
                    {consoleLabel ? <span className="home-tile-badge">{consoleLabel}</span> : null}
                  </div>
                </article>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default Dashboard;
