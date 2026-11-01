import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import Dashboard from '../components/Dashboard';
import CategoryCarousel from '../components/CategoryCarousel';
import CustomizeTrophyBaseModal from '../components/CustomizeTrophyBaseModal';
import {
  dedupeGames,
  fetchHomeCategoriesForIds,
  getHomeCategoriesByIds,
} from '../lib/homeCategories';
import { HOME_LAYOUT_MODE, useUserPreferences } from '../lib/userPreferences';
import { isAdminUser } from '../lib/adminAccess';
import { useLocale } from '../context/LocaleContext';
import { useVisibility } from '../context/VisibilityContext';
import { usePlatinumStatus } from '../context/PlatinumStatusContext';
import SearchSkipQuickwins from '../components/SearchSkipQuickwins';
import SearchIncludeTrophiesOnly from '../components/SearchIncludeTrophiesOnly';
import GameTile from '../components/GameTile';
import WatchlistButton from '../components/WatchlistButton';
import { GAME_FIELDS } from '../lib/gameSchema';
import { getGameCover, getGameTitle, getGameUuid } from '../lib/gameModel';
import { gameGuidePath, navigateToGame } from '../lib/routeUtils';
import '../styles/home.css';

const HOME_FEATURE_KEYS = [
  ['homeFeatureChecklistsTitle', 'homeFeatureChecklistsBody'],
  ['homeFeatureVideoTitle', 'homeFeatureVideoBody'],
  ['homeFeatureFeedTitle', 'homeFeatureFeedBody'],
  ['homeFeatureSpamTitle', 'homeFeatureSpamBody'],
  ['homeFeatureReportTitle', 'homeFeatureReportBody'],
];

const HOME_FEATURE_EMOJIS = ['✅', '🎬', '👁️‍🗨️', '🛡️', '🛠️'];

const GRID_TILE_CLASS = 'home-poster-tile';

function HomePosterGrid({ games, openGame, loading, onRequestLogin, isAdmin }) {
  const { globalLocale, t } = useLocale();

  if (loading) {
    return (
      <div className="home-poster-grid" aria-hidden>
        {Array.from({ length: 18 }).map((_, index) => (
          <div key={index} className={`${GRID_TILE_CLASS} home-tile-skeleton`} />
        ))}
      </div>
    );
  }

  if (games.length === 0) {
    return <p className="home-category-empty">{t('homeGridEmpty')}</p>;
  }

  return (
    <div className="home-poster-grid">
      {games.map((game, index) => {
        const routeKey = getGameUuid(game) || getGameTitle(game, globalLocale) || String(index);
        return (
          <GameTile
            key={routeKey}
            game={game}
            href={gameGuidePath(game, globalLocale)}
            className={GRID_TILE_CLASS}
            isAdmin={isAdmin}
            onRequestLogin={onRequestLogin}
            onOpen={() => {
              navigateToGame(game, { locale: globalLocale });
              openGame(game);
            }}
          />
        );
      })}
    </div>
  );
}

function HomeGamesTable({ games, openGame, loading }) {
  const { globalLocale, t } = useLocale();
  const { getEntryState, gameKey } = useVisibility();
  const { isPlatinum } = usePlatinumStatus();
  const { hidePlatinumedGames } = useUserPreferences();

  if (loading) {
    return <p className="home-category-empty">{t('homeTableLoading')}</p>;
  }

  const rows = games.filter((game) => {
    const id = getGameUuid(game);
    if (!id) return true;
    if (hidePlatinumedGames && isPlatinum(id)) return false;
    return getEntryState(gameKey(id), { completed: false }).visible;
  });

  if (rows.length === 0) {
    return <p className="home-category-empty">{t('homeGridEmpty')}</p>;
  }

  return (
    <div className="home-data-table-wrap">
      <table className="home-data-table">
        <thead>
          <tr>
            <th scope="col">{t('homeTableCover')}</th>
            <th scope="col">{t('homeTableTitle')}</th>
            <th scope="col">{t('homeTableConsole')}</th>
            <th scope="col" className="home-data-table-tags">
              {t('homeTableTags')}
            </th>
            <th scope="col">
              <span className="sr-only">{t('watchlistTitle')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((game, index) => {
            const id = getGameUuid(game);
            const title = getGameTitle(game, globalLocale);
            const cover = getGameCover(game, globalLocale);
            const consoleLabel = game?.[GAME_FIELDS.console] ?? '';
            const tags = game?.[GAME_FIELDS.genre] ?? '';
            return (
              <tr key={id || title || String(index)}>
                <td>
                  <a
                    href={gameGuidePath(game, globalLocale)}
                    className="home-data-cover-link"
                    onClick={(event) => {
                      event.preventDefault();
                      navigateToGame(game, { locale: globalLocale });
                      openGame(game);
                    }}
                  >
                    {cover ? (
                      <img src={cover} alt="" className="home-data-cover" loading="lazy" />
                    ) : (
                      <span className="home-data-cover home-data-cover--empty">🎮</span>
                    )}
                  </a>
                </td>
                <td>
                  <a
                    href={gameGuidePath(game, globalLocale)}
                    className="home-data-title"
                    onClick={(event) => {
                      event.preventDefault();
                      navigateToGame(game, { locale: globalLocale });
                      openGame(game);
                    }}
                  >
                    {title}
                  </a>
                </td>
                <td>
                  {consoleLabel ? <span className="home-tile-badge">{consoleLabel}</span> : '—'}
                </td>
                <td className="home-data-table-tags">
                  <span className="home-data-tags">{tags || '—'}</span>
                </td>
                <td className="home-data-star">
                  {id ? <WatchlistButton gameId={id} size="sm" variant="icon" /> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HomePage({
  openGame,
  searchQuery,
  setSearchQuery,
  handleSearchSubmit,
  onCategorySearch,
  onRequestLogin,
  onOpenAdvancedSearch,
  onOpenWatchlist,
  onOpenGuideHelp,
  onCustomizeHome,
  sessionUser = null,
  excludeQuickwins = true,
  onExcludeQuickwinsChange,
  includeTrophiesOnly = false,
  onIncludeTrophiesOnlyChange,
}) {
  const { globalLocale, t } = useLocale();
  const { homeLayoutMode, orderedHomeCategories } = useUserPreferences();
  const [categoryGames, setCategoryGames] = useState({});
  const [loading, setLoading] = useState(true);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const searchFormRef = useRef(null);
  const isAdmin = isAdminUser(sessionUser);
  const isMinimal = homeLayoutMode === HOME_LAYOUT_MODE.MINIMAL;
  const openCustomize = () => {
    if (onCustomizeHome) onCustomizeHome();
    else setCustomizeOpen(true);
  };

  const visibleCategories = useMemo(
    () => getHomeCategoriesByIds(orderedHomeCategories),
    [orderedHomeCategories],
  );

  const mergedGames = useMemo(() => {
    const rows = visibleCategories.flatMap((category) => categoryGames[category.id] || []);
    return dedupeGames(rows, globalLocale).sort((a, b) =>
      getGameTitle(a, globalLocale).localeCompare(getGameTitle(b, globalLocale), globalLocale),
    );
  }, [visibleCategories, categoryGames, globalLocale]);

  useEffect(() => {
    if (isMinimal) return undefined;

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const byId = await fetchHomeCategoriesForIds(
          supabase,
          globalLocale,
          orderedHomeCategories,
        );
        if (!cancelled) setCategoryGames(byId);
      } catch (err) {
        console.error('Startseite: Kategorien konnten nicht geladen werden:', err);
        if (!cancelled) setCategoryGames({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [globalLocale, orderedHomeCategories, isMinimal]);

  const railsToShow = visibleCategories.filter(
    (category) => loading || (categoryGames[category.id] || []).length > 0,
  );

  return (
    <div className="home-landing w-full min-w-0 overflow-x-hidden box-border">
      <header className="home-hero">
        <h1 className="home-hero-brand">
          <a href="/" className="tb-brand" aria-label="TrophyBase.app">
            <span className="tb-name">TrophyBase</span>
            <span className="tb-tld">.app</span>
          </a>
        </h1>

        {isMinimal ? null : (
          <details className="home-hero-features">
            <summary className="home-hero-features-summary">
              <span className="home-hero-features-copy">
                <span className="home-hero-features-line">{t('homeFeaturesToggleLead')}</span>
                <span className="home-hero-features-line home-hero-features-line--accent">
                  {t('homeFeaturesToggleAccent')}
                  <span className="home-hero-features-chevron" aria-hidden="true">▾</span>
                </span>
              </span>
            </summary>
            <ul className="home-hero-features-list">
              {HOME_FEATURE_KEYS.map(([titleKey, bodyKey], index) => {
                let body = t(bodyKey);
                if (titleKey === 'homeFeatureReportTitle') {
                  const [before = '', after = ''] = t('homeFeatureReportBody').split('{link}');
                  body = (
                    <>
                      {before}
                      <a
                        href="/kurz-erklaert#fehler"
                        className="home-hero-features-link"
                        onClick={(event) => {
                          if (!onOpenGuideHelp) return;
                          event.preventDefault();
                          onOpenGuideHelp('fehler');
                        }}
                      >
                        {t('homeFeatureReportLink')}
                      </a>
                      {after}
                    </>
                  );
                }
                return (
                  <li key={titleKey}>
                    <span className="home-hero-features-emoji" aria-hidden="true">
                      {HOME_FEATURE_EMOJIS[index]}
                    </span>
                    <strong>{t(titleKey)}</strong>
                    {' '}
                    {body}
                  </li>
                );
              })}
            </ul>
          </details>
        )}

        <div className="home-search-block">
          <form ref={searchFormRef} onSubmit={handleSearchSubmit} className="home-search">
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="home-search-input"
              aria-label={t('searchAria')}
            />
            <div className="home-search-submit-row">
              <div className="home-search-options">
                <SearchSkipQuickwins
                  id="home-skip-quickwins"
                  checked={excludeQuickwins}
                  onChange={onExcludeQuickwinsChange}
                />
                {sessionUser ? (
                  <SearchIncludeTrophiesOnly
                    id="home-include-trophies-only"
                    checked={includeTrophiesOnly}
                    onChange={onIncludeTrophiesOnlyChange}
                  />
                ) : null}
              </div>
              <button
                type="button"
                className="home-search-icon"
                aria-label={t('searchStartAria')}
                onClick={() => searchFormRef.current?.requestSubmit()}
              >
                🔍
              </button>
            </div>
          </form>
          <div className="home-search-links">
            <a
              href="/suche"
              className="home-advanced-search"
              onClick={(e) => {
                e.preventDefault();
                onOpenAdvancedSearch?.();
              }}
            >
              {t('advancedSearch')}
            </a>
          </div>
        </div>
      </header>

      <Dashboard
        openGame={openGame}
        onOpenWatchlist={onOpenWatchlist}
        isAdmin={isAdmin}
        minItems={isMinimal ? 1 : undefined}
        showEmpty={isMinimal}
      />

      {isMinimal ? null : homeLayoutMode === HOME_LAYOUT_MODE.GRID ? (
        <HomePosterGrid
          games={mergedGames}
          openGame={openGame}
          loading={loading}
          onRequestLogin={onRequestLogin}
          isAdmin={isAdmin}
        />
      ) : homeLayoutMode === HOME_LAYOUT_MODE.TABLE ? (
        <HomeGamesTable
          games={mergedGames}
          openGame={openGame}
          loading={loading}
        />
      ) : (
        <div className="home-categories" role="list">
          {railsToShow.map((category) => (
            <CategoryCarousel
              key={category.id}
              category={category}
              games={categoryGames[category.id] || []}
              openGame={openGame}
              loading={loading}
              onCategorySearch={onCategorySearch}
              onRequestLogin={onRequestLogin}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      {onCustomizeHome ? null : (
        <CustomizeTrophyBaseModal open={customizeOpen} onClose={() => setCustomizeOpen(false)} />
      )}
    </div>
  );
}

export default HomePage;
