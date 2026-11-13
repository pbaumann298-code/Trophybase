import { useEffect, useRef, useState } from 'react';
import GameFallbackCover from '../GameFallbackCover';
import { GAME_FIELDS } from '../../lib/gameSchema';
import { getGameCover, getGameTitle, getGameUuid } from '../../lib/gameModel';
import { isGuidePublished } from '../../lib/guidePublication';
import { fetchCreatorGameMedia } from '../../lib/creatorQueries';
import { gameGuidePath, guidePathWithTab } from '../../lib/routeUtils';
import { trophyTypeIcon, TROPHY_TYPE } from '../../lib/trophyTypes';
import { supabase } from '../../pages/supabaseClient';
import '../../styles/home.css';
import '../../styles/quickwins.css';

const PAGE_SIZE = 48;

const COPY = {
  de: {
    showVideos: 'Genutzte Videos anzeigen',
    empty: 'Keine Spiele für diesen Creator.',
    more: 'Weitere Spiele',
    close: 'Schließen',
    loading: 'Videos werden geladen…',
    mediaEmpty: 'In diesem Guide sind keine YouTube-Videos dieses Creators hinterlegt.',
    mediaError: 'Videos konnten nicht geladen werden.',
    youtube: 'Auf YouTube öffnen',
    guide: 'Zum Guide-Abschnitt',
    video: 'Video',
    playlist: 'Playlist',
    draft: 'Entwurf',
    platinum: 'Platin',
  },
  en: {
    showVideos: 'Show videos used',
    empty: 'No games for this creator.',
    more: 'More games',
    close: 'Close',
    loading: 'Loading videos…',
    mediaEmpty: 'This guide has no YouTube videos from this creator.',
    mediaError: 'Videos could not be loaded.',
    youtube: 'Open on YouTube',
    guide: 'Jump to guide section',
    video: 'Video',
    playlist: 'Playlist',
    draft: 'Draft',
    platinum: 'Platinum',
  },
};

function copyFor(locale) {
  return locale === 'de' ? COPY.de : COPY.en;
}

function hasFsk(value) {
  return value !== null && value !== undefined && value !== '';
}

function CreatorGameCard({ game, locale, copy, showDraftState, onOpen, onShowMedia }) {
  const title = getGameTitle(game, locale);
  const cover = getGameCover(game, locale);
  const consoleLabel = game?.[GAME_FIELDS.console] ?? '';
  const platinumSrc = trophyTypeIcon(TROPHY_TYPE.PLATINUM);
  const trophyCount = Number(game?.anzahl_trophaeen);
  const draft = showDraftState && !isGuidePublished(game, locale);
  const fsk = game?.fsk;

  return (
    <div className="catalog-tile-shell min-w-0 w-full flex flex-col">
      <button type="button" className="catalog-tile w-full text-left" onClick={() => onOpen(game)}>
        <article className="home-tile group h-full" style={{ '--tile-accent': '#00ff66' }}>
          <div className="home-tile-cover-wrap">
            <GameFallbackCover
              src={cover}
              title={title}
              variant="card"
              imgClassName="home-tile-cover"
              className="h-full w-full"
            />
            {platinumSrc ? (
              <div
                className="home-tile-platinum"
                title={Number.isFinite(trophyCount) && trophyCount > 0
                  ? `${copy.platinum} · ${trophyCount}`
                  : copy.platinum}
              >
                <span className="home-tile-overlay-chip home-tile-overlay-chip--platinum-inactive">
                  <img src={platinumSrc} alt="" width={22} height={22} draggable={false} />
                </span>
              </div>
            ) : null}
            <div className="home-tile-shine" aria-hidden />
          </div>
          <div className="home-tile-meta">
            <p className="home-tile-title" title={title}>{title}</p>
            {draft ? (
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/50">
                {copy.draft}
              </span>
            ) : null}
            <div className="flex flex-wrap gap-1 mt-1">
              {consoleLabel ? (
                <span className="home-tile-badge tb-bidi-isolate text-sky-400 border-sky-500/30" dir="ltr">
                  {consoleLabel}
                </span>
              ) : null}
              {hasFsk(fsk) ? (
                <span className="home-tile-badge text-zinc-200 border-zinc-500/40">{`FSK ${fsk}`}</span>
              ) : null}
              {game?.steam_app_id ? (
                <span className="home-tile-badge text-emerald-400 border-emerald-500/30">Steam</span>
              ) : null}
            </div>
          </div>
        </article>
      </button>
      <button
        type="button"
        className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-[#1a1b1c] px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-300 hover:border-[#00ff66]/40 hover:text-[#00ff66]"
        onClick={() => onShowMedia(game)}
      >
        {copy.showVideos}
      </button>
    </div>
  );
}

function MediaDrawer({ game, creatorId, locale, copy, onOpenGame, onClose }) {
  const title = getGameTitle(game, locale);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const onCloseRef = useRef(onClose);
  const gameId = getGameUuid(game);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);

    async function load() {
      setLoading(true);
      setError('');
      const { data, error: mediaError } = await fetchCreatorGameMedia(
        supabase,
        creatorId,
        gameId,
        locale,
      );
      if (cancelled) return;
      if (mediaError) {
        setItems([]);
        setError(mediaError.message || copy.mediaError);
      } else {
        setItems(Array.isArray(data) ? data : []);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [creatorId, gameId, locale, copy.mediaError]);

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/60" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="creator-media-title"
        className="flex h-full w-full max-w-md flex-col border-l border-zinc-800 bg-[#121314] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{copy.showVideos}</p>
            <h2 id="creator-media-title" className="truncate text-base font-bold text-white">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:text-white"
          >
            {copy.close}
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loading ? <p className="text-sm text-zinc-500">{copy.loading}</p> : null}
          {error ? (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">{error}</p>
          ) : null}
          {!loading && !error && items.length === 0 ? (
            <p className="text-sm text-zinc-500">{copy.mediaEmpty}</p>
          ) : null}
          {items.map((item) => {
            const href = guidePathWithTab(gameGuidePath(game, locale), item.tab);
            return (
              <article
                key={`${item.type}-${item.url}`}
                className="rounded-xl border border-zinc-800 bg-[#1a1b1c] p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    item.type === 'playlist'
                      ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                      : 'bg-red-500/15 text-red-300 border border-red-500/30'
                  }`}
                  >
                    {item.type === 'playlist' ? copy.playlist : copy.video}
                  </span>
                  {item.guideId ? (
                    <span className="text-[10px] font-mono text-zinc-500">#{item.guideId}</span>
                  ) : null}
                </div>
                <p className="text-sm font-semibold text-zinc-100">{item.title}</p>
                {item.stepContext ? (
                  <p className="text-xs text-zinc-500">{item.stepContext}</p>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-[#ff0000] px-3 py-1.5 text-[11px] font-bold text-white no-underline hover:bg-[#e00000]"
                  >
                    {copy.youtube}
                  </a>
                  <a
                    href={href}
                    className="rounded-lg border border-[#00ff66]/40 px-3 py-1.5 text-[11px] font-bold text-[#00ff66] no-underline hover:bg-[#00ff66]/10"
                    onClick={(event) => {
                      if (!onOpenGame) return;
                      event.preventDefault();
                      onOpenGame(game, { tab: item.tab });
                    }}
                  >
                    {copy.guide}
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

function CreatorShowcaseGrid({
  games = [],
  creatorId,
  locale = 'de',
  onOpenGame,
  showDraftState = false,
  emptyLabel = '',
}) {
  const copy = copyFor(locale);
  const listKey = `${creatorId}:${games.length}:${getGameUuid(games[0]) || ''}`;
  const [pageState, setPageState] = useState({ key: listKey, count: PAGE_SIZE });
  const [mediaGame, setMediaGame] = useState(null);
  if (pageState.key !== listKey) {
    setPageState({ key: listKey, count: PAGE_SIZE });
  }
  const visibleCount = pageState.key === listKey ? pageState.count : PAGE_SIZE;
  const shown = games.slice(0, visibleCount);

  if (!games.length) {
    return <p className="text-sm text-zinc-500">{emptyLabel || copy.empty}</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
        {shown.map((game) => {
          const id = getGameUuid(game);
          return (
            <CreatorGameCard
              key={id || getGameTitle(game, locale)}
              game={game}
              locale={locale}
              copy={copy}
              showDraftState={showDraftState}
              onOpen={(entry) => {
                if (onOpenGame) onOpenGame(entry);
                else window.location.assign(gameGuidePath(entry, locale));
              }}
              onShowMedia={setMediaGame}
            />
          );
        })}
      </div>
      {visibleCount < games.length ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:text-white"
            onClick={() => setPageState((prev) => ({ ...prev, count: prev.count + PAGE_SIZE }))}
          >
            {copy.more} ({games.length - visibleCount})
          </button>
        </div>
      ) : null}
      {mediaGame ? (
        <MediaDrawer
          game={mediaGame}
          creatorId={creatorId}
          locale={locale}
          copy={copy}
          onOpenGame={onOpenGame}
          onClose={() => setMediaGame(null)}
        />
      ) : null}
    </>
  );
}

export default CreatorShowcaseGrid;
