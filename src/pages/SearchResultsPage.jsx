import { useEffect, useState } from 'react';
import { GAME_FIELDS } from '../lib/gameSchema';
import { getGameUuid, getRouteSlug, getGameTitle, getGameCover } from '../lib/gameModel';
import { isGameDraftMode } from '../lib/guidePublication';
import { publicStudioCredits } from '../lib/studioCredits';
import { paginateItems } from '../lib/gameSearch';
import { gameGuidePath } from '../lib/routeUtils';
import { useLocale } from '../context/LocaleContext';
import { useVisibility } from '../context/VisibilityContext';
import { GameCoverOverlays } from '../components/GameTile';
import '../styles/home.css';

const FADE_MS = 280;

function SearchResultRow({
  game,
  openGame,
  onRequestLogin,
  isAdmin,
  isWatchlist = false,
  onToggleDraftMode = null,
}) {
  const { globalLocale, t } = useLocale();
  const { getEntryState, gameKey } = useVisibility();
  const [exiting, setExiting] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState('');
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
  const isDraftRoadmap = Boolean(isAdmin && isGameDraftMode(game));

  const handleRowClick = (e) => {
    e.preventDefault();
    if (isDraftRoadmap) {
      openGame(game, { preferGuideTab: true });
    } else {
      openGame(game);
    }
  };

  const handleDraftToggleClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onToggleDraftMode || draftBusy) return;
    setDraftBusy(true);
    setDraftError('');
    const res = await onToggleDraftMode(game);
    setDraftBusy(false);
    if (res?.error) {
      setDraftError(res.error.message || 'Fehler beim Umschalten');
    }
  };

  return (
    <a
      key={watchlistId}
      href={href}
      onClick={handleRowClick}
      className={`w-full min-w-0 p-4 rounded-xl border flex flex-wrap sm:flex-nowrap gap-4 sm:gap-5 cursor-pointer transition-all items-start no-underline text-inherit ${
        isDraftRoadmap
          ? 'bg-[#1c1a14] border-amber-500/45 hover:border-amber-400/70 hover:bg-[#221f17]'
          : 'bg-[#1a1b1c] border-zinc-800 hover:border-zinc-700 hover:bg-[#202122]'
      } ${
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
        <div className="min-w-0 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex flex-col gap-1.5">
            <h4 className="font-bold text-white text-base md:text-lg hover:text-[#00ff66] transition break-words">
              {title}
              {game._translationFallback && game._locale && (
                <span className="ml-2 text-[10px] font-mono text-zinc-500 uppercase">
                  {game._locale}
                </span>
              )}
            </h4>
            {isDraftRoadmap && (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openGame(game, { preferGuideTab: true });
                  }}
                  title="Klicken, um direkt in die Guide-/Checklisten-Ansicht zu springen"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/50 shadow-sm hover:bg-amber-500/30 transition"
                >
                  🎬 Video-Roadmap (Entwurf)
                </span>
              </div>
            )}
          </div>

          {isAdmin && (isWatchlist || typeof onToggleDraftMode === 'function') && gameUuid && (
            <div className="flex flex-col items-end gap-1 shrink-0">
              <button
                type="button"
                onClick={handleDraftToggleClick}
                disabled={draftBusy}
                aria-pressed={isDraftRoadmap}
                title={
                  isDraftRoadmap
                    ? 'Video-Roadmap / Entwurfs-Modus deaktivieren'
                    : 'Als Video-Roadmap / Entwurf markieren (tb_set_game_draft_mode)'
                }
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider border transition cursor-pointer disabled:opacity-50 ${
                  isDraftRoadmap
                    ? 'bg-[#00ff66]/15 text-[#00ff66] border-[#00ff66]/45 hover:bg-[#00ff66]/25'
                    : 'bg-zinc-900/90 text-zinc-300 border-zinc-700 hover:border-amber-400/50 hover:text-amber-300'
                }`}
              >
                <span>🎬 Roadmap / Entwurf</span>
                <span className="text-[10px]">{draftBusy ? '…' : isDraftRoadmap ? 'AN' : 'AUS'}</span>
              </button>
              {draftError && (
                <span className="text-[10px] font-mono text-red-400">{draftError}</span>
              )}
            </div>
          )}
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
  isWatchlist = false,
  onToggleDraftMode = null,
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
                isWatchlist={isWatchlist}
                onToggleDraftMode={onToggleDraftMode}
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
