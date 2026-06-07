import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GAME_PK } from '../lib/gameSchema';

const TILE_CLASS =
  'home-carousel-tile flex-shrink-0 snap-start w-[9.5rem] sm:w-44 lg:w-[calc((100%-3rem)/5)] max-w-[12rem] lg:max-w-none';

function CategoryCarousel({ category, games, openGame, getProp, loading, onCategorySearch }) {
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
    const gameId = g[GAME_PK] ?? getProp(g, [GAME_PK]);
    const title = getProp(g, ['Spieltitel', 'spieltitel']);
    const cover = getProp(g, ['Cover_URL', 'cover_url']);
    const consoleLabel = getProp(g, ['Konsole', 'konsole']);

    return (
      <a
        href={`/guide/${gameId}`}
        key={gameId || `${category.id}-${index}`}
        className={TILE_CLASS}
        onClick={(e) => {
          e.preventDefault();
          window.history.pushState({}, '', `/guide/${gameId}`);
          openGame(g);
        }}
      >
        <article
          className="home-tile group h-full"
          style={{ '--tile-accent': category.accent }}
        >
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
            {consoleLabel ? (
              <span className="home-tile-badge">{consoleLabel}</span>
            ) : null}
          </div>
        </article>
      </a>
    );
  };

  return (
    <section className="home-category w-full min-w-0 max-w-full" aria-labelledby={`cat-${category.id}`}>
      <header className="home-category-header">
        <div className="home-category-heading min-w-0">
          {category.searchTerm && onCategorySearch ? (
            <button
              type="button"
              id={`cat-${category.id}`}
              className="home-category-title home-category-title--clickable"
              onClick={() => onCategorySearch(category.searchTerm)}
              title={`Alle Spiele zu „${category.searchTerm}“ suchen`}
            >
              <span className="home-category-emoji" aria-hidden>
                {category.emoji}
              </span>
              {category.title}
              <span className="home-category-search-hint" aria-hidden>
                ↗
              </span>
            </button>
          ) : (
            <h2 id={`cat-${category.id}`} className="home-category-title">
              <span className="home-category-emoji" aria-hidden>
                {category.emoji}
              </span>
              {category.title}
            </h2>
          )}
          <p className="home-category-tagline">{category.tagline}</p>
        </div>
        <div className="home-category-nav flex-shrink-0">
          <button
            type="button"
            className="home-scroll-btn"
            aria-label={`${category.title} nach links`}
            disabled={!canScrollLeft}
            onClick={() => scrollByTiles(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="home-scroll-btn"
            aria-label={`${category.title} nach rechts`}
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
            Noch keine Treffer in dieser Kategorie – Datenbank wächst.
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
