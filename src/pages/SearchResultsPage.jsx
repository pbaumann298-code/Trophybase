import { useEffect, useState } from 'react';
import { GAME_FIELDS } from '../lib/gameSchema';
import { getGameUuid, getRouteSlug, getGameTitle, getGameCover } from '../lib/gameModel';
import { publicStudioCredits } from '../lib/studioCredits';
import { paginateItems } from '../lib/gameSearch';
import { gameGuidePath } from '../lib/routeUtils';
import { useLocale } from '../context/LocaleContext';
import { useVisibility } from '../context/VisibilityContext';
import { GameCoverOverlays } from '../components/GameTile';
import '../styles/home.css';

const FADE_MS = 280;

function SearchResultRow({ game, openGame, onRequestLogin, isAdmin }) {
  const { globalLocale, t } = useLocale();
  const { getEntryState, gameKey } = useVisibility();
  const [exiting, setExiting] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const gameUuid = getGameUuid(game);
  const entry = gameUuid
    ? getEntryState(gameKey(gameUuid), { completed: false })
    : { visible: true, dimmed: false };

  if (dismissed && !exiting) return null;
  if (!entry.visible && !exiting) return null;

  const title = getGameTitle(game, globalLocale);
  const cover = getGameCover(game, globalLocale);
  const href = gameGuidePath(game, globalLocale);
  const credits = publicStudioCredits(game);
  const watchlistId = gameUuid || getRouteSlug(game);

  return (
    <a
      key={watchlistId}
      href={href}
      onClick={(e) => {
        e.preventDefault();
        openGame(game);
      }}
      className={`w-full min-w-0 bg-[#1a1b1c] p-4 rounded-xl border border-zinc-800 flex flex-wrap sm:flex-nowrap gap-4 sm:gap-5 cursor-pointer hover:border-zinc-700 hover:bg-[#202122] transition-all items-start no-underline text-inherit ${
        exiting ? 'opacity-0 scale-[0.98] pointer-events-none' : ''
      } ${entry.dimmed && !exiting ? 'opacity-40' : ''}`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <div className="relative group w-24 h-32 flex-shrink-0 rounded-lg overflow-hidden shadow-lg border border-zinc-800">
        {cover ? (
          <img src={cover} className="w-full h-full object-cover" alt="" />
        ) : (
          <div className="w-full h-full bg-[#121314]" aria-hidden />
        )}
        <GameCoverOverlays
          gameId={gameUuid}
          game={game}
          isAdmin={isAdmin}
          size="sm"
          onRequestLogin={onRequestLogin}
          onHideStart={() => {
            setExiting(true);
            window.setTimeout(() => {
              setExiting(false);
              setDismissed(true);
            }, FADE_MS);
          }}
        />
      </div>

      <div className="flex-1 min-w-0 flex flex-col h-full justify-between pt-1">
        <div className="min-w-0 flex items-start justify-between gap-3">
          <h4 className="font-bold text-white text-base md:text-lg hover:text-[#00ff66] transition break-words">
            {title}
            {game._translationFallback && game._locale && (
              <span className="ml-2 text-[10px] font-mono text-zinc-500 uppercase">
                {game._locale}
              </span>
            )}
          </h4>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-4 pt-4 border-t border-zinc-800/60 text-xs min-w-0 w-full">
          <div>
            <span className="block text-zinc-500 text-[10px] uppercase tracking-wider font-mono mb-0.5">
              {t('searchConsole')}
            </span>
            <span className="text-zinc-300 font-medium">
              {game[GAME_FIELDS.console] || '—'}
            </span>
          </div>
          <div>
            <span className="block text-zinc-500 text-[10px] uppercase tracking-wider font-mono mb-0.5">
              {t('yearLabel')}
            </span>
            <span className="text-zinc-300 font-medium">
              {game[GAME_FIELDS.year] || '—'}
            </span>
          </div>
          <div>
            <span className="block text-zinc-500 text-[10px] uppercase tracking-wider font-mono mb-0.5">
              {t('searchGenre')}
            </span>
            <span className="text-zinc-300 font-medium truncate block">
              {game[GAME_FIELDS.genre] || '—'}
            </span>
          </div>
          <div>
            <span className="block text-zinc-500 text-[10px] uppercase tracking-wider font-mono mb-0.5">
              {t('studioLabel')}
            </span>
            <span className="text-zinc-300 font-medium truncate block">
              {credits.studio || '—'}
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}

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
  resultsTitle,
  emptyMessage,
}) {
  const { t } = useLocale();
  const paged = paginateItems(searchResults, page);
  const heading = resultsTitle || t('searchResults');
  const emptyText = emptyMessage || t('searchNoResults');

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
        {heading} ({paged.total})
      </h3>

      {paged.total === 0 ? (
        <p className="text-sm text-zinc-500 bg-[#1a1b1c] p-6 rounded-xl border border-zinc-800 text-center">
          {emptyText}
        </p>
      ) : (
        <>
          {renderPager()}
          <div className="flex flex-col gap-4">
            {paged.items.map((g, i) => (
              <SearchResultRow
                key={getGameUuid(g) || getRouteSlug(g) || i}
                game={g}
                openGame={openGame}
                onRequestLogin={onRequestLogin}
                isAdmin={isAdmin}
              />
            ))}
          </div>
          {renderPager()}
        </>
      )}
    </div>
  );
}

export default SearchResultsPage;
