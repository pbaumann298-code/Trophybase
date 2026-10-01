import { useEffect } from 'react';
import WatchlistButton from '../components/WatchlistButton';
import GuideOnlineBadge from '../components/GuideOnlineBadge';
import { GAME_FIELDS } from '../lib/gameSchema';
import { getGameUuid, getRouteSlug, getGameTitle, getGameCover } from '../lib/gameModel';
import { paginateItems } from '../lib/gameSearch';
import { gameGuidePath } from '../lib/routeUtils';
import { useLocale } from '../context/LocaleContext';
import '../styles/home.css';

function formatPageStatus(template, page, total) {
  return String(template ?? '')
    .replace('{page}', String(page))
    .replace('{total}', String(total));
}

function SearchResultsPage({
  searchResults,
  openGame,
  loading,
  onRequestLogin,
  compact = false,
  page = 1,
  onPageChange,
  onBack,
  isAdmin = false,
}) {
  const { globalLocale, t } = useLocale();
  const paged = paginateItems(searchResults, page);

  useEffect(() => {
    if (paged.page !== page && typeof onPageChange === 'function') {
      onPageChange(paged.page);
    }
  }, [paged.page, page, onPageChange]);

  if (loading) {
    return <div className="text-center pt-12 text-zinc-400 text-sm">{t('searchLoading')}</div>;
  }

  const renderPager = () => {
    if (!paged.showPager || typeof onPageChange !== 'function') return null;
    return (
      <nav className="search-pager" aria-label={t('searchResults')}>
        <button
          type="button"
          className="search-pager-btn"
          disabled={paged.page <= 1}
          onClick={() => onPageChange(paged.page - 1)}
        >
          {t('searchPrevPage')}
        </button>
        <span className="search-pager-status">
          {formatPageStatus(t('searchPageStatus'), paged.page, paged.totalPages)}
        </span>
        <button
          type="button"
          className="search-pager-btn"
          disabled={paged.page >= paged.totalPages}
          onClick={() => onPageChange(paged.page + 1)}
        >
          {t('searchNextPage')}
        </button>
      </nav>
    );
  };

  return (
    <div
      className={
        compact
          ? 'w-full min-w-0 overflow-x-hidden box-border'
          : 'w-full max-w-4xl min-w-0 overflow-x-hidden mx-auto px-4 sm:px-6 pt-8 pb-10 box-border'
      }
    >
      {typeof onBack === 'function' ? (
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-mono text-zinc-500 hover:text-[#00ff66] bg-transparent border-none cursor-pointer mb-6 px-0"
        >
          {t('searchBack')}
        </button>
      ) : null}

      <h3 className="text-sm font-bold text-zinc-400 mb-6 uppercase tracking-wider">
        {t('searchResults')} ({paged.total})
      </h3>

      {paged.total === 0 ? (
        <p className="text-sm text-zinc-500 bg-[#1a1b1c] p-6 rounded-xl border border-zinc-800 text-center">
          {t('searchNoResults')}
        </p>
      ) : (
        <>
          {renderPager()}
          <div className="flex flex-col gap-4">
            {paged.items.map((g, i) => {
              const watchlistId = getGameUuid(g) || getRouteSlug(g);
              const title = getGameTitle(g, globalLocale);
              const cover = getGameCover(g, globalLocale);
              const href = gameGuidePath(g, globalLocale);
              return (
                <a
                  key={watchlistId || i}
                  href={href}
                  onClick={(e) => {
                    e.preventDefault();
                    openGame(g);
                  }}
                  className="w-full min-w-0 bg-[#1a1b1c] p-4 rounded-xl border border-zinc-800 flex flex-wrap sm:flex-nowrap gap-4 sm:gap-5 cursor-pointer hover:border-zinc-700 hover:bg-[#202122] transition items-start no-underline text-inherit"
                >
                  {cover ? (
                    <img
                      src={cover}
                      className="w-24 h-32 object-cover rounded-lg shadow-lg flex-shrink-0 border border-zinc-800"
                      alt=""
                    />
                  ) : (
                    <div
                      className="w-24 h-32 rounded-lg flex-shrink-0 border border-zinc-800 bg-[#121314]"
                      aria-hidden
                    />
                  )}

                  <div className="flex-1 min-w-0 flex flex-col h-full justify-between pt-1">
                    <div className="min-w-0 flex items-start justify-between gap-3">
                      <h4 className="font-bold text-white text-base md:text-lg hover:text-[#00ff66] transition break-words">
                        {title}
                        {g._translationFallback && g._locale && (
                          <span className="ml-2 text-[10px] font-mono text-zinc-500 uppercase">
                            {g._locale}
                          </span>
                        )}
                      </h4>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <GuideOnlineBadge game={g} visible={isAdmin} size="md" />
                        <WatchlistButton
                          gameId={watchlistId}
                          onRequestLogin={onRequestLogin}
                          size="md"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-4 pt-4 border-t border-zinc-800/60 text-xs min-w-0 w-full">
                      <div>
                        <span className="block text-zinc-500 text-[10px] uppercase tracking-wider font-mono mb-0.5">
                          Plattform
                        </span>
                        <span className="text-zinc-300 font-medium">
                          {g[GAME_FIELDS.console] || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-zinc-500 text-[10px] uppercase tracking-wider font-mono mb-0.5">
                          Jahr
                        </span>
                        <span className="text-zinc-300 font-medium">
                          {g[GAME_FIELDS.year] || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-zinc-500 text-[10px] uppercase tracking-wider font-mono mb-0.5">
                          Genre
                        </span>
                        <span className="text-zinc-300 font-medium truncate block">
                          {g[GAME_FIELDS.genre] || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-zinc-500 text-[10px] uppercase tracking-wider font-mono mb-0.5">
                          Entwickler
                        </span>
                        <span className="text-zinc-300 font-medium truncate block">
                          {g[GAME_FIELDS.developer] || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
          {renderPager()}
        </>
      )}
    </div>
  );
}

export default SearchResultsPage;
