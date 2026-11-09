import { useRef, useState } from 'react';
import { getGameCover, getGameDescription, getGameTitle, getGameUuid } from '../lib/gameModel';
import { GAME_FIELDS } from '../lib/gameSchema';
import { isGameDraftMode } from '../lib/guidePublication';
import { useLocale } from '../context/LocaleContext';
import { useVisibility } from '../context/VisibilityContext';
import { usePlatinumStatus } from '../context/PlatinumStatusContext';
import { TILE_DESCRIPTION_SLIDE, useUserPreferences } from '../lib/userPreferences';
import { pushGameHiddenToCloud } from '../lib/gameHiddenCloudBridge';
import { trophyTypeIcon, TROPHY_TYPE } from '../lib/trophyTypes';
import { supabase } from '../pages/supabaseClient';
import WatchlistButton from './WatchlistButton';
import GuideOnlineBadge from './GuideOnlineBadge';
import AdminCoverInspector from './AdminCoverInspector';

/** Einmaliger Nachlade-Cache für Kachel-Beschreibungen (Startseiten-Rails laden `beschreibung` nicht mit). */
const tileDescriptionCache = new Map();

const FSK_BADGE_CLASS = {
  0: 'text-zinc-200 border-zinc-500/40',
  6: 'text-amber-300 border-amber-400/40',
  12: 'text-emerald-400 border-emerald-500/40',
  16: 'text-sky-400 border-sky-500/40',
  18: 'text-rose-400 border-rose-500/40',
};

function fskBadgeClass(fsk) {
  const key = Number(fsk);
  return FSK_BADGE_CLASS[key] || 'text-zinc-200 border-zinc-500/40';
}

function hasFskValue(fsk) {
  return fsk !== null && fsk !== undefined && fsk !== '';
}

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
  const { isPlatinum } = usePlatinumStatus();
  const { hidePlatinumedGames, tileDescriptionSlide } = useUserPreferences();
  const gameId = getGameUuid(game);
  const [localGamePatch, setLocalGamePatch] = useState(null);
  const [descMounted, setDescMounted] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [descText, setDescText] = useState('');
  const [descLoading, setDescLoading] = useState(false);
  const descIntent = useRef(0);
  const effectiveGame = localGamePatch ? { ...game, ...localGamePatch } : game;
  const title = getGameTitle(effectiveGame, globalLocale);
  const cover = getGameCover(effectiveGame, globalLocale);
  const consoleLabel = effectiveGame?.[GAME_FIELDS.console] ?? '';
  const visKey = gameKey(gameId || '');
  const entry = gameId ? getEntryState(visKey, { completed: false }) : { visible: true, dimmed: false };
  const [exiting, setExiting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed && !exiting) return null;
  if (!entry.visible && !exiting) return null;
  if (hidePlatinumedGames && gameId && isPlatinum(gameId)) return null;

  const handleHideStart = () => {
    setExiting(true);
    window.setTimeout(() => {
      setExiting(false);
      setDismissed(true);
    }, FADE_MS);
  };

  const fromRight = tileDescriptionSlide !== TILE_DESCRIPTION_SLIDE.LEFT;
  const fsk = effectiveGame?.fsk ?? null;
  const showFsk = hasFskValue(fsk);

  const applyFetchedRow = (row) => {
    if (!row) return '';
    tileDescriptionCache.set(gameId, row);
    if (hasFskValue(row.fsk)) {
      setLocalGamePatch((prev) => ({ ...(prev || {}), fsk: row.fsk }));
    }
    return getGameDescription(
      { ...effectiveGame, beschreibung: row.beschreibung },
      globalLocale,
      { exact: false },
    );
  };

  const toggleDescription = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (descOpen) {
      descIntent.current += 1;
      setDescOpen(false);
      return;
    }
    const intent = descIntent.current + 1;
    descIntent.current = intent;
    setDescMounted(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (descIntent.current === intent) setDescOpen(true);
      });
    });

    let text = getGameDescription(effectiveGame, globalLocale, { exact: false });
    if (text) {
      setDescText(text);
      return;
    }
    if (!gameId) {
      setDescText('');
      return;
    }
    const cached = tileDescriptionCache.get(gameId);
    if (cached) {
      setDescText(applyFetchedRow(cached));
      return;
    }
    setDescLoading(true);
    try {
      const { data, error } = await supabase
        .from('games')
        .select('beschreibung, fsk')
        .eq('id', gameId)
        .maybeSingle();
      if (error || !data) {
        setDescText('');
        return;
      }
      setDescText(applyFetchedRow(data));
    } finally {
      setDescLoading(false);
    }
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
            game={effectiveGame}
            isAdmin={isAdmin}
            onRequestLogin={onRequestLogin}
            onHideStart={handleHideStart}
          />
        ) : null}
        <button
          type="button"
          className={`absolute top-1/2 z-30 flex h-8 w-5 -translate-y-1/2 items-center justify-center rounded-sm border border-white/20 bg-black/70 text-sm font-bold leading-none text-zinc-100 backdrop-blur-sm ${
            fromRight ? 'right-1' : 'left-1'
          }`}
          aria-expanded={descOpen}
          aria-label={descOpen ? 'Beschreibung schließen' : 'Spielbeschreibung einblenden'}
          onClick={toggleDescription}
        >
          {fromRight ? (descOpen ? '›' : '‹') : (descOpen ? '‹' : '›')}
        </button>
        {descMounted ? (
          <div
            className={`absolute inset-0 z-20 bg-[#121314]/95 backdrop-blur-md p-2.5 overflow-y-auto transition-transform duration-200 ${
              descOpen
                ? 'translate-x-0'
                : `pointer-events-none ${fromRight ? 'translate-x-full' : '-translate-x-full'}`
            }`}
            aria-hidden={!descOpen}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <p className="text-[11px] leading-relaxed text-zinc-200">
              {descLoading
                ? '…'
                : descText || 'Keine Beschreibung vorhanden.'}
            </p>
          </div>
        ) : null}
        <div className="home-tile-shine" aria-hidden />
      </div>
      <div className="home-tile-meta">
        {isAdmin && gameId && effectiveGame?.cover_status !== 'valid' ? (
          <div className="tb-admin-bar tb-admin-bar--col mb-1.5 w-full">
            <AdminCoverInspector
              game={effectiveGame}
              hideThumb
              onUpdated={(patch) => setLocalGamePatch((prev) => ({ ...(prev || {}), ...patch }))}
            />
          </div>
        ) : null}
        <p className="home-tile-title" title={title}>
          {title}
        </p>
        {isAdmin && isGameDraftMode(effectiveGame) ? (
          <span
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/50"
            title="Video-Roadmap (Entwurf)"
          >
            🎬 Video-Roadmap (Entwurf)
          </span>
        ) : null}
        {showConsole && (
          <div className="flex flex-wrap gap-1 mt-1">
            {consoleLabel ? (
              <span className="home-tile-badge tb-bidi-isolate text-sky-400 border-sky-500/30" dir="ltr">
                {consoleLabel}
              </span>
            ) : null}
            {showFsk ? (
              <span className={`home-tile-badge ${fskBadgeClass(fsk)}`}>
                {`FSK ${fsk}`}
              </span>
            ) : null}
            {(effectiveGame?.steam_app_id || effectiveGame?.platforms?.includes('Steam')) ? (
              <span className="home-tile-badge text-emerald-400 border-emerald-500/30">
                Steam
              </span>
            ) : null}
            {effectiveGame?.platforms?.includes('Xbox') ? (
              <span className="home-tile-badge text-green-400 border-green-500/30">
                Xbox
              </span>
            ) : null}
          </div>
        )}
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
