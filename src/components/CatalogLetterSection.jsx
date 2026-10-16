import { useCallback, useEffect, useRef, useState } from 'react';
import { getGameCover, getGameTitle, getGameUuid } from '../lib/gameModel';
import { GAME_FIELDS } from '../lib/gameSchema';
import { useLocale } from '../context/LocaleContext';
import GuideOnlineBadge from './GuideOnlineBadge';
import WatchlistButton from './WatchlistButton';
import QuickwinGameCard from './QuickwinGameCard';

export const CATALOG_ROW_PREVIEW = 10;

const TILE_CLASS =
  'home-carousel-tile flex-shrink-0 snap-start w-[9.5rem] sm:w-44 lg:w-[calc((100%-3rem)/5)] max-w-[12rem] lg:max-w-none';

/**
 * Ein Buchstaben-Block: horizontale Reihe (max. ~10), bei mehr Titeln „Alle anzeigen“
 * als vertikale Liste wie Suchergebnisse.
 */
function CatalogLetterSection({
  letter,
  games,
  openGameId,
  onToggleGame,
  openGame,
  onRequestLogin,
  isAdmin = false,
  sessionUser = null,
  includeReady = false,
  serverNotice = false,
  serverNoticeText = '',
  tileAccent = '#00ff66',
}) {
  const { t, globalLocale } = useLocale();
  const trackRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const hasOverflow = games.length > CATALOG_ROW_PREVIEW;
  const previewGames = hasOverflow && !expanded ? games.slice(0, CATALOG_ROW_PREVIEW) : games;

  const updateScrollHints = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    if (expanded) return undefined;
    updateScrollHints();
    const el = trackRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(updateScrollHints);
    ro.observe(el);
    return () => ro.disconnect();
  }, [previewGames.length, expanded, updateScrollHints]);

  useEffect(() => {
    setExpanded(false);
  }, [letter]);

  const scrollByTiles = (direction) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: Math.round(el.clientWidth * 0.85) * direction, behavior: 'smooth' });
  };

  const openCarouselGame = !expanded
    ? previewGames.find((game) => getGameUuid(game) === openGameId) || null
    : null;

  const renderTile = (game, index) => {
    const gameId = getGameUuid(game);
    const title = getGameTitle(game, globalLocale);
    const cover = getGameCover(game, globalLocale);
    const consoleLabel = game[GAME_FIELDS.console] ?? '';
    const isOpen = Boolean(gameId) && openGameId === gameId;
    return (
      <div key={gameId || `${letter}-${index}`} className="catalog-tile-shell catalog-tile-shell--carousel">
        <button
          type="button"
          className={`catalog-tile ${TILE_CLASS}`}
          aria-expanded={isOpen}
          onClick={() => onToggleGame(gameId)}
        >
          <article className="home-tile group h-full" style={{ '--tile-accent': tileAccent }}>
            <div className="home-tile-cover-wrap">
              {cover ? (
                <img src={cover} className="home-tile-cover" alt="" loading="lazy" />
              ) : (
                <div className="home-tile-cover home-tile-cover--empty">🎮</div>
              )}
              <div className="home-tile-online">
                <GuideOnlineBadge game={game} visible={isAdmin} size="sm" />
              </div>
              <div className="home-tile-shine" aria-hidden />
            </div>
            <div className="home-tile-meta">
              <p className="home-tile-title" title={title}>
                {title}
              </p>
              {consoleLabel ? <span className="home-tile-badge">{consoleLabel}</span> : null}
            </div>
          </article>
        </button>
        <div className="home-tile-watchlist">
          <WatchlistButton gameId={gameId} onRequestLogin={onRequestLogin} size="sm" />
        </div>
      </div>
    );
  };

  const renderListRow = (game, index) => {
    const gameId = getGameUuid(game);
    const title = getGameTitle(game, globalLocale);
    const cover = getGameCover(game, globalLocale);
    const consoleLabel = game[GAME_FIELDS.console] ?? '';
    const isOpen = Boolean(gameId) && openGameId === gameId;
    return (
      <div key={gameId || `${letter}-list-${index}`} className="catalog-list-row">
        <button
          type="button"
          className="catalog-list-row-btn"
          aria-expanded={isOpen}
          onClick={() => onToggleGame(gameId)}
        >
          {cover ? (
            <img src={cover} className="catalog-list-row-cover" alt="" loading="lazy" />
          ) : (
            <div className="catalog-list-row-cover catalog-list-row-cover--empty">🎮</div>
          )}
          <span className="catalog-list-row-meta">
            <span className="catalog-list-row-title">{title}</span>
            {consoleLabel ? <span className="catalog-list-row-console">{consoleLabel}</span> : null}
          </span>
          <span className="catalog-list-row-chevron" aria-hidden>
            {isOpen ? '▲' : '▼'}
          </span>
        </button>
        <div className="catalog-list-row-watch">
          <WatchlistButton gameId={gameId} onRequestLogin={onRequestLogin} size="sm" />
        </div>
        {isOpen ? (
          <div className="catalog-detail">
            <QuickwinGameCard
              game={game}
              openGame={openGame}
              onRequestLogin={onRequestLogin}
              isAdmin={isAdmin}
              sessionUser={sessionUser}
              newerVersions={false}
              includeReady={includeReady}
              serverNotice={serverNotice}
              serverNoticeText={serverNoticeText}
              allowFullGameNav={false}
            />
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section
      id={`catalog-letter-${letter}`}
      className="catalog-letter-section home-category w-full min-w-0 max-w-full"
      aria-labelledby={`catalog-letter-title-${letter}`}
    >
      <header className="home-category-header">
        <div className="home-category-heading min-w-0">
          {hasOverflow ? (
            <button
              type="button"
              id={`catalog-letter-title-${letter}`}
              className="home-category-title home-category-title--clickable"
              onClick={() => setExpanded((prev) => !prev)}
              title={expanded ? t('catalogShowLess') : t('catalogShowAll')}
              aria-expanded={expanded}
            >
              {letter}
              <span className="home-category-search-hint" aria-hidden>
                {expanded ? '↖' : '↗'}
              </span>
              <span className="catalog-show-all-label">
                {expanded ? t('catalogShowLess') : t('catalogShowAll')}
              </span>
            </button>
          ) : (
            <h2 id={`catalog-letter-title-${letter}`} className="home-category-title">
              {letter}
            </h2>
          )}
        </div>
        {!expanded ? (
          <div className="home-category-nav flex-shrink-0">
            <button
              type="button"
              className="home-scroll-btn"
              aria-label={`${letter} nach links`}
              disabled={!canScrollLeft}
              onClick={() => scrollByTiles(-1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="home-scroll-btn"
              aria-label={`${letter} nach rechts`}
              disabled={!canScrollRight}
              onClick={() => scrollByTiles(1)}
            >
              ›
            </button>
          </div>
        ) : null}
      </header>

      {expanded ? (
        <div className="catalog-expanded-list">{games.map(renderListRow)}</div>
      ) : (
        <>
          <div className="home-carousel-wrap">
            <div
              ref={trackRef}
              className="home-carousel-track scrollbar-hide"
              onScroll={updateScrollHints}
            >
              {previewGames.map(renderTile)}
            </div>
          </div>
          {openCarouselGame ? (
            <div className="catalog-detail catalog-detail--below-row">
              <QuickwinGameCard
                game={openCarouselGame}
                openGame={openGame}
                onRequestLogin={onRequestLogin}
                isAdmin={isAdmin}
                sessionUser={sessionUser}
                newerVersions={false}
                includeReady={includeReady}
                serverNotice={serverNotice}
                serverNoticeText={serverNoticeText}
                allowFullGameNav={false}
              />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export default CatalogLetterSection;
