import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import SearchResultsPage from './SearchResultsPage';
import { fetchGamesByIds, parseRouteGameRef } from '../lib/gameQueries';
import { getGameUuid, getPlatformGameIds } from '../lib/gameModel';
import { canonicalizeWatchlistIds, watchlistIdsEqual } from '../lib/localWatchlist';
import { useWatchlist } from '../context/WatchlistContext';
import { useLocale } from '../context/LocaleContext';
import { useVisibility } from '../context/VisibilityContext';

/**
 * Volle Watchlist in Suchergebnis-Optik.
 */
function WatchlistPage({
  openGame,
  onBack,
  onRequestLogin,
  isAdmin = false,
}) {
  const { globalLocale, t } = useLocale();
  const { watchlistIdList, version, replaceWatchlistIds } = useWatchlist();
  const { getEntryState, gameKey } = useVisibility();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const previous = document.title;
    document.title = `${t('watchlistTitle')} · TrophyBase.app`;
    return () => {
      document.title = previous;
    };
  }, [t]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
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
          setGames([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const { data, error } = await fetchGamesByIds(supabase, ids, globalLocale);
      if (cancelled) return;

      if (error) {
        console.error('Watchlist-Seite:', error.message);
        setGames([]);
        setLoading(false);
        return;
      }

      const byRef = new Map();
      for (const game of data || []) {
        const uuid = getGameUuid(game);
        if (uuid) byRef.set(uuid, game);
        for (const npwr of getPlatformGameIds(game)) byRef.set(npwr, game);
      }

      const seen = new Set();
      const ordered = [];
      for (const id of ids) {
        const game = byRef.get(id);
        if (!game) continue;
        const uuid = getGameUuid(game) || id;
        if (seen.has(uuid)) continue;
        seen.add(uuid);
        ordered.push(game);
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

      setGames(ordered);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [watchlistIdList, version, globalLocale, replaceWatchlistIds]);

  const visibleGames = games.filter((game) => {
    const id = getGameUuid(game);
    if (!id) return true;
    return getEntryState(gameKey(id), { completed: false }).visible;
  });

  return (
    <SearchResultsPage
      searchResults={visibleGames}
      openGame={openGame}
      loading={loading}
      onRequestLogin={onRequestLogin}
      onBack={onBack}
      isAdmin={isAdmin}
      page={page}
      onPageChange={setPage}
      resultsTitle={t('watchlistTitle')}
      emptyMessage={t('watchlistEmpty')}
    />
  );
}

export default WatchlistPage;
