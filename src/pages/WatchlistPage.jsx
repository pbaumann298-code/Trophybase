import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import SearchResultsPage from './SearchResultsPage';
import { fetchGamesByIds, parseRouteGameRef } from '../lib/gameQueries';
import { GAME_STRUCT } from '../lib/gameSchema';
import { getGameUuid, getPlatformGameIds } from '../lib/gameModel';
import { isGameDraftMode, parseStatusMap, setGameDraftMode } from '../lib/guidePublication';
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

  const handleToggleDraftMode = async (game) => {
    const uuid = getGameUuid(game);
    if (!uuid || !isAdmin) return { error: new Error('Keine Berechtigung') };
    const nextEnable = !isGameDraftMode(game);
    const { status: rpcStatus, error } = await setGameDraftMode(supabase, uuid, nextEnable);
    if (error) {
      console.error('tb_set_game_draft_mode:', error.message);
      return { error };
    }
    setGames((prev) =>
      prev.map((item) => {
        if (getGameUuid(item) !== uuid) return item;
        const currentStatus = parseStatusMap(item[GAME_STRUCT.status] ?? item.status);
        const nextStatus =
          rpcStatus && Object.keys(rpcStatus).length > 0
            ? rpcStatus
            : {
                ...currentStatus,
                production_roadmap: nextEnable ? 'ACTIVE' : 'INACTIVE',
                guide_de: nextEnable
                  ? currentStatus.guide_de || 'DRAFT'
                  : currentStatus.guide_de === 'DRAFT'
                    ? undefined
                    : currentStatus.guide_de,
              };
        return {
          ...item,
          [GAME_STRUCT.status]: nextStatus,
          status: nextStatus,
        };
      }),
    );
    return { error: null };
  };

  const handleOpenWatchlistGame = (game, options = {}) => {
    if (isAdmin && (isGameDraftMode(game) || options?.preferGuideTab)) {
      openGame(game, { ...options, preferGuideTab: true });
      return;
    }
    openGame(game, options);
  };

  return (
    <SearchResultsPage
      searchResults={visibleGames}
      openGame={handleOpenWatchlistGame}
      loading={loading}
      onRequestLogin={onRequestLogin}
      onBack={onBack}
      isAdmin={isAdmin}
      isWatchlist
      onToggleDraftMode={isAdmin ? handleToggleDraftMode : null}
      page={page}
      onPageChange={setPage}
      resultsTitle={t('watchlistTitle')}
      emptyMessage={t('watchlistEmpty')}
    />
  );
}

export default WatchlistPage;
