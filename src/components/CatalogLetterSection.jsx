import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getGameUuid } from '../lib/gameModel';
import { useLocale } from '../context/LocaleContext';
import { usePlatinumStatus } from '../context/PlatinumStatusContext';
import { useUserPreferences } from '../lib/userPreferences';
import QuickwinGameCard from './QuickwinGameCard';
import GameTile from './GameTile';

export const CATALOG_ROW_PREVIEW = 10;
const EXPANDED_CHUNK_SIZE = 60;

const TILE_SHELL_CLASS =
  'catalog-tile-shell catalog-tile-shell--carousel flex-shrink-0 snap-start w-[9.25rem] sm:w-[10.5rem] lg:w-[11.25rem] max-w-[11.25rem]';
const GRID_TILE_SHELL_CLASS = 'catalog-tile-shell min-w-0 w-full';

const GRID_COLUMN_QUERIES = [
  ['(min-width: 1024px)', 6],
  ['(min-width: 768px)', 5],
  ['(min-width: 640px)', 4],
];

function catalogSectionDomId(letter) {
  const slug = String(letter ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'section';
}

function readGridColumns() {
  if (typeof window === 'undefined') return 2;
  const match = GRID_COLUMN_QUERIES.find(([query]) => window.matchMedia(query).matches);
  return match ? match[1] : 2;
}

function subscribeGridColumns(onChange) {
  const medias = GRID_COLUMN_QUERIES.map(([query]) => window.matchMedia(query));
  medias.forEach((media) => media.addEventListener('change', onChange));
  return () => medias.forEach((media) => media.removeEventListener('change', onChange));
}

/**
 * Ein Buchstaben-Block: horizontale Reihe (max. ~10). „Alle anzeigen“ zeigt
 * dieselben 3:4-Kacheln nebeneinander im Grid.
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
  newerVersions = false,
  serverNotice = false,
  serverNoticeText = '',
  tileAccent = '#00ff66',
  onClose = null,
}) {
  const { t } = useLocale();
  const { isPlatinum } = usePlatinumStatus();
  const { hidePlatinumedGames } = useUserPreferences();
  const trackRef = useRef(null);
  const expandedMoreRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(EXPANDED_CHUNK_SIZE);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const gridColumns = useSyncExternalStore(subscribeGridColumns, readGridColumns, () => 2);

  const filteredGames = hidePlatinumedGames
    ? games.filter((game) => {
        const id = getGameUuid(game);
        return !(id && isPlatinum(id));
      })
    : games;

  const hasOverflow = filteredGames.length > CATALOG_ROW_PREVIEW;
  const previewGames = hasOverflow && !expanded ? filteredGames.slice(0, CATALOG_ROW_PREVIEW) : filteredGames;
  const expandedGames = expanded ? filteredGames.slice(0, visibleCount) : [];
  const hasMoreExpanded = expanded && filteredGames.length > visibleCount;

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
    setVisibleCount(EXPANDED_CHUNK_SIZE);
  }, [letter]);

  useEffect(() => {
    if (!hasMoreExpanded) return undefined;
    const node = expandedMoreRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((prev) => prev + EXPANDED_CHUNK_SIZE);
        }
      },
      { rootMargin: '320px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreExpanded, expandedGames.length]);

  const scrollByTiles = (direction) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: Math.round(el.clientWidth * 0.85) * direction, behavior: 'smooth' });
  };

  const openCarouselGame = !expanded
    ? previewGames.find((game) => getGameUuid(game) === openGameId) || null
    : null;
  const openGridGame = expanded
    ? expandedGames.find((game) => getGameUuid(game) === openGameId) || null
    : null;
  const openGridIndex = openGridGame
    ? expandedGames.findIndex((game) => getGameUuid(game) === openGameId)
    : -1;
  const openGridInsertAt = openGridIndex >= 0
    ? Math.min(expandedGames.length, (Math.floor(openGridIndex / gridColumns) + 1) * gridColumns)
    : -1;
  const sectionDomId = catalogSectionDomId(letter);

  const renderTile = (game, index, shellClass = TILE_SHELL_CLASS) => {
    const gameId = getGameUuid(game);
    const isOpen = Boolean(gameId) && openGameId === gameId;
    return (
      <div key={gameId || `${letter}-${index}`} className={shellClass}>
        <GameTile
          game={game}
          as="button"
          className="catalog-tile w-full"
          accent={tileAccent}
          isAdmin={isAdmin}
          onRequestLogin={onRequestLogin}
          aria-expanded={isOpen}
          onOpen={() => onToggleGame(gameId)}
        />
      </div>
    );
  };

  const renderOpenCard = (game) => (
    <QuickwinGameCard
      game={game}
      openGame={openGame}
      onRequestLogin={onRequestLogin}
      isAdmin={isAdmin}
      sessionUser={sessionUser}
      newerVersions={newerVersions}
      includeReady={includeReady}
      serverNotice={serverNotice}
      serverNoticeText={serverNoticeText}
    />
  );

  return (
    <section
      id={`catalog-letter-${sectionDomId}`}
      className="catalog-letter-section home-category w-full min-w-0 max-w-full"
      aria-labelledby={`catalog-letter-title-${sectionDomId}`}
    >
      <header className="home-category-header">
        <div className="home-category-heading min-w-0">
          {hasOverflow ? (
            <button
              type="button"
              id={`catalog-letter-title-${sectionDomId}`}
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
            <h2 id={`catalog-letter-title-${sectionDomId}`} className="home-category-title">
              {letter}
            </h2>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {onClose ? (
            <button type="button" className="publisher-detail-close" onClick={onClose}>
              ✕ {t('reportClose')}
            </button>
          ) : null}
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
        </div>
      </header>

      {expanded ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {expandedGames.map((game, index) => (
            <Fragment key={getGameUuid(game) || `${letter}-grid-${index}`}>
              {renderTile(game, index, GRID_TILE_SHELL_CLASS)}
              {openGridGame && index + 1 === openGridInsertAt ? (
                <div className="col-span-full catalog-detail catalog-detail--below-row">
                  {renderOpenCard(openGridGame)}
                </div>
              ) : null}
            </Fragment>
          ))}
          {hasMoreExpanded ? (
            <div ref={expandedMoreRef} className="col-span-full catalog-load-more">
              <span className="catalog-load-more-spacer" />
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="home-carousel-wrap">
            <div
              ref={trackRef}
              className="home-carousel-track scrollbar-hide"
              onScroll={updateScrollHints}
            >
              {previewGames.map((game, index) => renderTile(game, index))}
            </div>
          </div>
          {openCarouselGame ? (
            <div className="catalog-detail catalog-detail--below-row">
              {renderOpenCard(openCarouselGame)}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export default CatalogLetterSection;
