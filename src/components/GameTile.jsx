import { useState } from 'react';
import { getGameCover, getGameTitle, getGameUuid } from '../lib/gameModel';
import { GAME_FIELDS } from '../lib/gameSchema';
import { isGameDraftMode } from '../lib/guidePublication';
import { useLocale } from '../context/LocaleContext';
import { useVisibility } from '../context/VisibilityContext';
import { usePlatinumStatus } from '../context/PlatinumStatusContext';
import { pushGameHiddenToCloud } from '../lib/gameHiddenCloudBridge';
import { trophyTypeIcon, TROPHY_TYPE } from '../lib/trophyTypes';
import WatchlistButton from './WatchlistButton';
import GuideOnlineBadge from './GuideOnlineBadge';

const FADE_MS = 280;

function EyeOffIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9.3 3.1 11 7.5a11.4 11.4 0 0 1-1.7 3.1" />
      <path d="M6.1 6.1A11.3 11.3 0 0 0 1 12.5C2.7 16.9 7 20 12 20a9.9 9.9 0 0 0 4.2-.9" />
    </svg>
  );
}

/**
 * Cover-Overlays: Watchlist (oben rechts), Platin (unten links), Ausblenden (unten rechts).
 */
export function GameCoverOverlays({
  gameId,
  game = null,
  isAdmin = false,
  size = 'sm',
  showWatchlist = true,
  showHide = true,
  showPlatinum = true,
  onRequestLogin,
  onHideStart,
}) {
  const { t } = useLocale();
  const { setHidden, gameKey, isHidden } = useVisibility();
  const { isPlatinum } = usePlatinumStatus();
  const platinumSrc = trophyTypeIcon(TROPHY_TYPE.PLATINUM);
  const isPlatinActive = Boolean(showPlatinum && gameId && isPlatinum(gameId));
  const btnSize = size === 'md' ? 'w-8 h-8' : 'w-7 h-7';

  const handleHide = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!gameId) return;
    const key = gameKey(gameId);
    if (isHidden(key)) return;
    onHideStart?.();
    setHidden(key, true);
    pushGameHiddenToCloud(gameId, true);
  };

  return (
    <>
      <div className="home-tile-online">
        <GuideOnlineBadge game={game} visible={isAdmin} size={size === 'md' ? 'md' : 'sm'} />
      </div>

      {showWatchlist && gameId ? (
        <div className="home-tile-watchlist">
          <WatchlistButton
            gameId={gameId}
            onRequestLogin={onRequestLogin}
            size={size}
            variant="cover"
          />
        </div>
      ) : null}

      {showPlatinum && platinumSrc ? (
        <div
          className="home-tile-platinum"
          title={isPlatinActive ? t('platinumUnlocked') : t('platinized')}
          aria-label={isPlatinActive ? t('platinumUnlocked') : t('platinized')}
          role="img"
        >
          <span
            className={`home-tile-overlay-chip pointer-events-none transition-all duration-300 ${
              isPlatinActive
                ? 'home-tile-overlay-chip--platinum-active'
                : 'home-tile-overlay-chip--platinum-inactive'
            }`}
          >
            <img
              src={platinumSrc}
              alt=""
              width={size === 'md' ? 26 : 22}
              height={size === 'md' ? 26 : 22}
              draggable={false}
              className={isPlatinActive ? 'filter drop-shadow-[0_0_6px_rgba(234,179,8,0.9)]' : 'opacity-40 grayscale'}
            />
          </span>
        </div>
      ) : null}

      {showHide && gameId ? (
        <div className="home-tile-hide opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 max-md:opacity-50 transition-opacity duration-200">
          <button
            type="button"
            className={`home-tile-overlay-chip home-tile-overlay-chip--btn ${btnSize}`}
            title={t('hideGame')}
            aria-label={t('hideGame')}
            onClick={handleHide}
          >
            <EyeOffIcon className="w-[1.05rem] h-[1.05rem]" />
          </button>
        </div>
      ) : null}
    </>
  );
}

/**
 * Zentrale Spiel-Kachel (Startseite, Katalog, Related, …).
 */
function GameTile({
  game,
  href,
  onOpen,
  accent = '#00ff66',
  isAdmin = false,
  onRequestLogin,
  className = '',
  as = 'a',
  showConsole = true,
  showOverlays = true,
  'aria-expanded': ariaExpanded,
}) {
  const { globalLocale } = useLocale();
  const { getEntryState, gameKey } = useVisibility();
  const gameId = getGameUuid(game);
  const title = getGameTitle(game, globalLocale);
  const cover = getGameCover(game, globalLocale);
  const consoleLabel = game?.[GAME_FIELDS.console] ?? '';
  const visKey = gameKey(gameId || '');
  const entry = gameId ? getEntryState(visKey, { completed: false }) : { visible: true, dimmed: false };
  const [exiting, setExiting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed && !exiting) return null;
  if (!entry.visible && !exiting) return null;

  const handleHideStart = () => {
    setExiting(true);
    window.setTimeout(() => {
      setExiting(false);
      setDismissed(true);
    }, FADE_MS);
  };

  const shellClass = [
    'home-tile group h-full',
    entry.dimmed && !exiting ? 'home-tile--dimmed' : '',
    exiting ? 'home-tile--exiting' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <article className={shellClass} style={{ '--tile-accent': accent }}>
      <div className="home-tile-cover-wrap">
        {cover ? (
          <img src={cover} className="home-tile-cover" alt="" loading="lazy" />
        ) : (
          <div className="home-tile-cover home-tile-cover--empty">🎮</div>
        )}
        {showOverlays ? (
          <GameCoverOverlays
            gameId={gameId}
            game={game}
            isAdmin={isAdmin}
            onRequestLogin={onRequestLogin}
            onHideStart={handleHideStart}
          />
        ) : null}
        <div className="home-tile-shine" aria-hidden />
      </div>
      <div className="home-tile-meta">
        <p className="home-tile-title" title={title}>
          {title}
        </p>
        {isAdmin && isGameDraftMode(game) ? (
          <span
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/50"
            title="Video-Roadmap (Entwurf)"
          >
            🎬 Video-Roadmap (Entwurf)
          </span>
        ) : null}
        {showConsole && consoleLabel ? (
          <span className="home-tile-badge">{consoleLabel}</span>
        ) : null}
      </div>
    </article>
  );

  if (as === 'button') {
    return (
      <button
        type="button"
        className={className}
        aria-expanded={ariaExpanded}
        onClick={onOpen}
      >
        {body}
      </button>
    );
  }

  return (
    <a
      href={href || '#'}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        onOpen?.(event);
      }}
    >
      {body}
    </a>
  );
}

export default GameTile;
