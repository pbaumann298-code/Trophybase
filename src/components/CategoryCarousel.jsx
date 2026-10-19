import { useCallback, useEffect, useRef, useState } from 'react';
import { getGameUuid, getRouteSlug } from '../lib/gameModel';
import { gameGuidePath, navigateToGame } from '../lib/routeUtils';
import { useLocale } from '../context/LocaleContext';
import GameTile from './GameTile';

const TILE_CLASS =
  'home-carousel-tile flex-shrink-0 snap-start w-[9.5rem] sm:w-44 lg:w-[calc((100%-3rem)/5)] max-w-[12rem] lg:max-w-none';

function CategoryCarousel({
  category,
  games,
  openGame,
  loading,
  onCategorySearch,
  onRequestLogin,
  isAdmin = false,
}) {
  const { globalLocale, t } = useLocale();
  const trackRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const displayTitle = category.titleKey ? t(category.titleKey) : category.title;
  const searchTerm = category.searchTerm || category.title;

  const updateScrollHints = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    updateScrollHints();
    const el = trackRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(updateScrollHints);
    ro.observe(el);
    return () => ro.disconnect();
  }, [games.length, loading, updateScrollHints]);

  const scrollByTiles = (direction) => {
    const el = trackRef.current;
    if (!el) return;
    const amount = Math.round(el.clientWidth * 0.85) * direction;
    el.scrollBy({ left: amount, behavior: 'smooth' });
  };

  const renderTile = (g, index) => {
    const routeSlug = getRouteSlug(g);
    const watchlistGameId = getGameUuid(g);
    return (
      <GameTile
        key={routeSlug || watchlistGameId || `${category.id}-${index}`}
        game={g}
        href={gameGuidePath(g, globalLocale)}
        className={TILE_CLASS}
        accent={category.accent}
        isAdmin={isAdmin}
        onRequestLogin={onRequestLogin}
        onOpen={() => {
          navigateToGame(g, { locale: globalLocale });
          openGame(g);
        }}
      />
    );
  };

  return (
    <section className="home-category w-full min-w-0 max-w-full" aria-labelledby={`cat-${category.id}`}>
      <header className="home-category-header">
        <div className="home-category-heading min-w-0">
          {(category.search || category.searchTerm) && onCategorySearch ? (
            <button
              type="button"
              id={`cat-${category.id}`}
              className="home-category-title home-category-title--clickable"
              onClick={() => onCategorySearch(searchTerm)}
              title={t('homeCategoryShowAll').replaceAll('{title}', displayTitle)}
            >
              <span className="home-category-emoji" aria-hidden>
                {category.emoji}
              </span>
              {displayTitle}
              <span className="home-category-search-hint" aria-hidden>
                ↗
              </span>
            </button>
          ) : (
            <h2 id={`cat-${category.id}`} className="home-category-title">
              <span className="home-category-emoji" aria-hidden>
                {category.emoji}
              </span>
              {displayTitle}
            </h2>
          )}
        </div>
        <div className="home-category-nav flex-shrink-0">
          <button
            type="button"
            className="home-scroll-btn"
            aria-label={t('homeCategoryScrollLeft').replaceAll('{title}', displayTitle)}
            disabled={!canScrollLeft}
            onClick={() => scrollByTiles(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="home-scroll-btn"
            aria-label={t('homeCategoryScrollRight').replaceAll('{title}', displayTitle)}
            disabled={!canScrollRight}
            onClick={() => scrollByTiles(1)}
          >
            ›
          </button>
        </div>
      </header>

      <div className="home-carousel-wrap">
        {loading ? (
          <div className="home-carousel-track home-carousel-track--loading" ref={trackRef}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`${TILE_CLASS} home-tile-skeleton`} />
            ))}
          </div>
        ) : games.length === 0 ? (
          <p className="home-category-empty">
            {t('homeCategoryEmpty')}
          </p>
        ) : (
          <div
            ref={trackRef}
            className="home-carousel-track scrollbar-hide"
            onScroll={updateScrollHints}
          >
            {games.map(renderTile)}
          </div>
        )}
      </div>
    </section>
  );
}

export default CategoryCarousel;
