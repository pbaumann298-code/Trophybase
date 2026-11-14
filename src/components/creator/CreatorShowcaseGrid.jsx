import { useEffect, useMemo, useRef, useState } from 'react';
import GameFallbackCover from '../GameFallbackCover';
import { GAME_FIELDS } from '../../lib/gameSchema';
import { getGameCover, getGameTitle, getGameUuid } from '../../lib/gameModel';
import { isGuidePublished } from '../../lib/guidePublication';
import { fetchCreatorGameMedia } from '../../lib/creatorQueries';
import {
  buildCreatorShowcaseSections,
  classifyCreatorGameSegment,
  filterCreatorCatalogGames,
  resolveEffectiveGrouping,
} from '../../lib/creatorShowcaseModel';
import { QUICKWIN_ALPHABET } from '../../lib/quickwinCatalog';
import { gameGuidePath, guidePathWithTab } from '../../lib/routeUtils';
import { trophyTypeIcon, TROPHY_TYPE } from '../../lib/trophyTypes';
import { supabase } from '../../pages/supabaseClient';
import CreatorShowcaseBuilder from './CreatorShowcaseBuilder';
import '../../styles/home.css';
import '../../styles/quickwins.css';

const PAGE_SIZE = 48;
const RAIL_PREVIEW_LIMIT = 14;
const AZ_GAME_CHUNK = 72;

const COPY = {
  de: {
    myGuides: 'Meine Guides',
    allGuides: 'Guides & Spiele',
    customizeBtn: '🎨 Build your TrophyBase',
    closeCustomizeBtn: '✕ Layout-Editor schließen',
    searchPlaceholder: 'Guides filtern (Titel, Reihe, Publisher, Genre)…',
    segAll: 'Alle',
    segMain: '🎮 Hauptspiele',
    segEasy: '✨ Easy Platin',
    segQuickwin: '⚡ Quickwins',
    modeRails: '🎬 Reihen',
    modeAz: '🔤 A–Z',
    modeGrid: '🔲 Kacheln',
    showAllRail: 'Alle {count} anzeigen',
    collapseRail: 'Kompakt',
    noFilterMatch: 'Keine Guides passend zum Filter gefunden.',
    showVideos: 'Genutzte Videos anzeigen',
    empty: 'Keine Spiele für diesen Creator.',
    more: 'Weitere Spiele laden',
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
    myGuides: 'My Guides',
    allGuides: 'Guides & Games',
    customizeBtn: '🎨 Build your TrophyBase',
    closeCustomizeBtn: '✕ Close layout editor',
    searchPlaceholder: 'Filter guides (title, series, publisher, genre)…',
    segAll: 'All',
    segMain: '🎮 Main Games',
    segEasy: '✨ Easy Platinum',
    segQuickwin: '⚡ Quickwins',
    modeRails: '🎬 Rows',
    modeAz: '🔤 A–Z',
    modeGrid: '🔲 Grid',
    showAllRail: 'Show all {count}',
    collapseRail: 'Collapse',
    noFilterMatch: 'No guides match the active filter.',
    showVideos: 'Show videos used',
    empty: 'No games for this creator.',
    more: 'Load more games',
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

function CreatorGameCard({
  game,
  locale,
  copy,
  showDraftState,
  onOpen,
  onShowMedia,
  railMode = false,
}) {
  const title = getGameTitle(game, locale);
  const cover = getGameCover(game, locale);
  const consoleLabel = game?.[GAME_FIELDS.console] ?? '';
  const platinumSrc = trophyTypeIcon(TROPHY_TYPE.PLATINUM);
  const trophyCount = Number(game?.anzahl_trophaeen);
  const draft = showDraftState && !isGuidePublished(game, locale);
  const fsk = game?.fsk;

  return (
    <div
      className={
        railMode
          ? 'catalog-tile-shell flex-shrink-0 snap-start w-[9.5rem] sm:w-[10.5rem] lg:w-[11rem] flex flex-col'
          : 'catalog-tile-shell min-w-0 w-full flex flex-col'
      }
    >
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
                title={
                  Number.isFinite(trophyCount) && trophyCount > 0
                    ? `${copy.platinum} · ${trophyCount}`
                    : copy.platinum
                }
              >
                <span className="home-tile-overlay-chip home-tile-overlay-chip--platinum-inactive">
                  <img src={platinumSrc} alt="" width={22} height={22} draggable={false} />
                </span>
              </div>
            ) : null}
            <div className="home-tile-shine" aria-hidden />
          </div>
          <div className="home-tile-meta">
            <p className="home-tile-title" title={title}>
              {title}
            </p>
            {draft ? (
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/50">
                {copy.draft}
              </span>
            ) : null}
            <div className="flex flex-wrap gap-1 mt-1">
              {consoleLabel ? (
                <span
                  className="home-tile-badge tb-bidi-isolate text-sky-400 border-sky-500/30"
                  dir="ltr"
                >
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
        className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-[#1a1b1c] px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-300 hover:border-[#00ff66]/40 hover:text-[#00ff66] cursor-pointer"
        onClick={() => onShowMedia(game)}
      >
        {copy.showVideos}
      </button>
    </div>
  );
}

function CreatorHorizontalRail({
  row,
  locale,
  copy,
  showDraftState,
  onOpen,
  onShowMedia,
}) {
  const scrollRef = useRef(null);
  const [expanded, setExpanded] = useState(false);

  const scrollByDir = (dir) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir * 560, behavior: 'smooth' });
  };

  const canExpand = row.games.length > RAIL_PREVIEW_LIMIT;
  const visibleGames = expanded ? row.games : row.games.slice(0, RAIL_PREVIEW_LIMIT);

  return (
    <section className="home-category w-full min-w-0">
      <header className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {row.kind === 'pinned' ? (
            <span className="rounded-md border border-[#00ff66]/40 bg-[#00ff66]/10 px-1.5 py-0.5 text-[10px] font-mono font-bold text-[#00ff66]">
              ★
            </span>
          ) : null}
          <h3 className="truncate text-sm sm:text-base font-bold tracking-tight text-white">
            {row.title}
          </h3>
          <span className="text-xs font-mono text-zinc-500">({row.games.length})</span>
        </div>

        <div className="flex items-center gap-1.5">
          {canExpand ? (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="rounded-lg border border-zinc-800 bg-[#141517] px-2.5 py-1 text-[11px] font-mono text-zinc-300 hover:border-[#00ff66]/40 hover:text-[#00ff66] cursor-pointer"
            >
              {expanded
                ? copy.collapseRail
                : copy.showAllRail.replace('{count}', String(row.games.length))}
            </button>
          ) : null}
          {!expanded && row.games.length > 4 ? (
            <div className="hidden sm:flex items-center gap-1">
              <button
                type="button"
                onClick={() => scrollByDir(-1)}
                aria-label="Scroll left"
                className="rounded-lg border border-zinc-800 bg-[#141517] px-2 py-1 text-xs text-zinc-400 hover:border-zinc-600 hover:text-white cursor-pointer"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => scrollByDir(1)}
                aria-label="Scroll right"
                className="rounded-lg border border-zinc-800 bg-[#141517] px-2 py-1 text-xs text-zinc-400 hover:border-zinc-600 hover:text-white cursor-pointer"
              >
                ›
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {expanded ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {visibleGames.map((game) => (
            <CreatorGameCard
              key={getGameUuid(game) || getGameTitle(game, locale)}
              game={game}
              locale={locale}
              copy={copy}
              showDraftState={showDraftState}
              onOpen={onOpen}
              onShowMedia={onShowMedia}
            />
          ))}
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin"
        >
          {visibleGames.map((game) => (
            <CreatorGameCard
              key={getGameUuid(game) || getGameTitle(game, locale)}
              game={game}
              locale={locale}
              copy={copy}
              showDraftState={showDraftState}
              onOpen={onOpen}
              onShowMedia={onShowMedia}
              railMode
            />
          ))}
        </div>
      )}
    </section>
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
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              {copy.showVideos}
            </p>
            <h2 id="creator-media-title" className="truncate text-base font-bold text-white">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:text-white cursor-pointer"
          >
            {copy.close}
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loading ? <p className="text-sm text-zinc-500">{copy.loading}</p> : null}
          {error ? (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">
              {error}
            </p>
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
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
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
  creatorName = '',
  showcaseConfig = null,
  canCustomize = false,
  isOwnerView = false,
  savingShowcase = false,
  showcaseNotice = '',
  showcaseError = '',
  onSaveShowcase,
  locale = 'de',
  onOpenGame,
  showDraftState = false,
  emptyLabel = '',
}) {
  const copy = copyFor(locale);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [previewConfig, setPreviewConfig] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSegment, setActiveSegment] = useState('all');
  const [userViewOverride, setUserViewOverride] = useState('');
  const [activeLetter, setActiveLetter] = useState('');
  const [gridLimit, setGridLimit] = useState(PAGE_SIZE);
  const [azLimit, setAzLimit] = useState(AZ_GAME_CHUNK);
  const [mediaGame, setMediaGame] = useState(null);

  const effectiveConfig = builderOpen && previewConfig ? previewConfig : showcaseConfig;

  const segmentCounts = useMemo(() => {
    const counts = { all: games.length, main: 0, easy_platin: 0, quickwin: 0 };
    for (const g of games) {
      counts[classifyCreatorGameSegment(g)] += 1;
    }
    return counts;
  }, [games]);

  const activeSegmentCount = useMemo(() => {
    let types = 0;
    if (segmentCounts.main > 0) types += 1;
    if (segmentCounts.easy_platin > 0) types += 1;
    if (segmentCounts.quickwin > 0) types += 1;
    return types;
  }, [segmentCounts]);

  const filteredGames = useMemo(
    () =>
      filterCreatorCatalogGames(games, {
        query: searchQuery,
        segment: activeSegment,
        locale,
      }),
    [games, searchQuery, activeSegment, locale],
  );

  const sections = useMemo(
    () => buildCreatorShowcaseSections(filteredGames, effectiveConfig, locale),
    [filteredGames, effectiveConfig, locale],
  );

  const defaultMode = resolveEffectiveGrouping(effectiveConfig, games.length);
  const activeViewMode = userViewOverride || defaultMode;

  const showCatalogToolbar =
    games.length > 8 || sections.config.pinnedShelves.length > 0 || Boolean(searchQuery);

  const handleOpenGame = (entry) => {
    if (onOpenGame) onOpenGame(entry);
    else window.location.assign(gameGuidePath(entry, locale));
  };

  if (!games.length && !canCustomize) {
    return <p className="text-sm text-zinc-500">{emptyLabel || copy.empty}</p>;
  }

  // Für A–Z Ansicht: angepinnte Reihen oben behalten (falls keine Suche aktiv) + A–Z Sektionen
  const azBaseSections =
    activeViewMode === 'a_z'
      ? activeLetter
        ? sections.alphabetSections.filter((sec) => sec.key === activeLetter)
        : sections.alphabetSections
      : [];

  const availableLetters = new Set(sections.alphabetSections.map((sec) => sec.key));

  // Chunking über A–Z Sektionen bei 1.300+ Spielen (z. B. Scorpio)
  const chunkedAzSections = (() => {
    if (activeViewMode !== 'a_z') return { list: [], total: 0 };
    let remainingBudget = azLimit;
    let total = 0;
    const list = [];
    for (const sec of azBaseSections) {
      total += sec.games.length;
      if (remainingBudget <= 0) continue;
      const slice = sec.games.slice(0, remainingBudget);
      remainingBudget -= slice.length;
      list.push({ key: sec.key, games: slice, fullCount: sec.games.length });
    }
    return { list, total };
  })();

  const isFilteredByText = Boolean(searchQuery.trim());

  return (
    <div className="w-full min-w-0 space-y-5">
      {/* Sektionstitel ("Meine Guides" im Creator-Bereich oder "Build your TrophyBase" Button) */}
      {(isOwnerView || canCustomize || showCatalogToolbar) ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white">
                {isOwnerView ? `🎬 ${copy.myGuides}` : copy.allGuides}
              </h2>
              <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-xs font-mono text-zinc-300">
                {filteredGames.length}
                {filteredGames.length !== games.length ? ` / ${games.length}` : ''}
              </span>
            </div>

            {canCustomize ? (
              <button
                type="button"
                onClick={() => {
                  setBuilderOpen((prev) => !prev);
                  setPreviewConfig(null);
                }}
                className={`rounded-xl border px-3.5 py-1.5 text-xs font-mono font-bold transition cursor-pointer ${
                  builderOpen
                    ? 'border-zinc-600 bg-zinc-900 text-zinc-200'
                    : 'border-[#00ff66]/45 bg-[#00ff66]/10 text-[#00ff66] hover:bg-[#00ff66]/20'
                }`}
              >
                {builderOpen ? copy.closeCustomizeBtn : copy.customizeBtn}
              </button>
            ) : null}
          </div>

          {canCustomize && builderOpen ? (
            <CreatorShowcaseBuilder
              games={games}
              initialConfig={showcaseConfig}
              creatorName={creatorName}
              locale={locale}
              saving={savingShowcase}
              saveNotice={showcaseNotice}
              saveError={showcaseError}
              onPreviewChange={setPreviewConfig}
              onSave={(nextCfg) => onSaveShowcase?.(nextCfg)}
            />
          ) : null}

          {showCatalogToolbar ? (
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 rounded-2xl border border-zinc-800/90 bg-[#121315] p-3">
              {/* Lokales Suchfeld */}
              <div className="relative flex-1 min-w-0 max-w-md">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500"
                >
                  🔍
                </span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setGridLimit(PAGE_SIZE);
                    setAzLimit(AZ_GAME_CHUNK);
                  }}
                  placeholder={copy.searchPlaceholder}
                  className="w-full rounded-xl border border-zinc-700/90 bg-[#0c0d0f] pl-8 pr-7 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-[#00ff66]/60 focus:outline-hidden"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 justify-between lg:justify-end">
                {/* Segment-Pills (Hauptspiele / Easy Platin / Quickwins) – nur wenn gemischtes Portfolio */}
                {activeSegmentCount > 1 ? (
                  <div className="flex flex-wrap items-center gap-1">
                    {[
                      { id: 'all', label: copy.segAll, count: segmentCounts.all },
                      { id: 'main', label: copy.segMain, count: segmentCounts.main },
                      { id: 'easy_platin', label: copy.segEasy, count: segmentCounts.easy_platin },
                      { id: 'quickwin', label: copy.segQuickwin, count: segmentCounts.quickwin },
                    ]
                      .filter((seg) => seg.id === 'all' || seg.count > 0)
                      .map((seg) => (
                        <button
                          key={seg.id}
                          type="button"
                          onClick={() => {
                            setActiveSegment(seg.id);
                            setActiveLetter('');
                            setGridLimit(PAGE_SIZE);
                            setAzLimit(AZ_GAME_CHUNK);
                          }}
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-mono transition cursor-pointer ${
                            activeSegment === seg.id
                              ? 'border-[#00ff66]/60 bg-[#00ff66]/15 text-[#00ff66] font-bold'
                              : 'border-zinc-800 bg-[#0c0d0f] text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {seg.label} ({seg.count})
                        </button>
                      ))}
                  </div>
                ) : null}

                {/* Ansichts-Umschalter */}
                <div className="inline-flex rounded-xl border border-zinc-800 bg-[#0c0d0f] p-0.5">
                  {[
                    { id: 'by_genre', label: copy.modeRails },
                    { id: 'a_z', label: copy.modeAz },
                    { id: 'grid', label: copy.modeGrid },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        setUserViewOverride(mode.id);
                        setActiveLetter('');
                      }}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-mono transition cursor-pointer ${
                        activeViewMode === mode.id
                          ? 'bg-zinc-800 text-white font-bold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Leerer Zustand */}
      {!games.length ? (
        <p className="text-sm text-zinc-500">{emptyLabel || copy.empty}</p>
      ) : filteredGames.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">{copy.noFilterMatch}</p>
      ) : isFilteredByText ? (
        /* Bei aktiver Textsuche direkt kompaktes Ergebnis-Raster zeigen */
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {filteredGames.slice(0, gridLimit).map((game) => (
              <CreatorGameCard
                key={getGameUuid(game) || getGameTitle(game, locale)}
                game={game}
                locale={locale}
                copy={copy}
                showDraftState={showDraftState}
                onOpen={handleOpenGame}
                onShowMedia={setMediaGame}
              />
            ))}
          </div>
          {gridLimit < filteredGames.length ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:text-white cursor-pointer"
                onClick={() => setGridLimit((prev) => prev + PAGE_SIZE)}
              >
                {copy.more} ({filteredGames.length - gridLimit})
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          {/* 1. Angepinnte Creator-Top-Reihen (z. B. Five Nights at Freddy's, Assassin's Creed) */}
          {sections.pinnedRows.length > 0 && activeViewMode !== 'grid' ? (
            <div className="space-y-6">
              {sections.pinnedRows.map((row) => (
                <CreatorHorizontalRail
                  key={row.id}
                  row={row}
                  locale={locale}
                  copy={copy}
                  showDraftState={showDraftState}
                  onOpen={handleOpenGame}
                  onShowMedia={setMediaGame}
                />
              ))}
            </div>
          ) : null}

          {/* 2A. Modus: Nach Genre in Netflix-Reihen */}
          {activeViewMode === 'by_genre' ? (
            <div className="space-y-6">
              {sections.genreRows.map((row) => (
                <CreatorHorizontalRail
                  key={row.id}
                  row={row}
                  locale={locale}
                  copy={copy}
                  showDraftState={showDraftState}
                  onOpen={handleOpenGame}
                  onShowMedia={setMediaGame}
                />
              ))}
            </div>
          ) : null}

          {/* 2B. Modus: Quickwins / Easy-Platins A–Z Katalog */}
          {activeViewMode === 'a_z' ? (
            <div className="space-y-5">
              <nav
                aria-label="A–Z"
                className="flex flex-wrap items-center gap-1 rounded-xl border border-zinc-800 bg-[#121315] p-2"
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveLetter('');
                    setAzLimit(AZ_GAME_CHUNK);
                  }}
                  className={`rounded-lg px-2 py-1 text-[11px] font-mono font-bold transition cursor-pointer ${
                    !activeLetter
                      ? 'bg-[#00ff66] text-[#121314]'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {copy.segAll}
                </button>
                {[...QUICKWIN_ALPHABET, '#'].map((letter) => {
                  const enabled = availableLetters.has(letter);
                  const selected = activeLetter === letter;
                  return (
                    <button
                      key={letter}
                      type="button"
                      disabled={!enabled}
                      onClick={() => {
                        setActiveLetter(selected ? '' : letter);
                        setAzLimit(AZ_GAME_CHUNK);
                      }}
                      className={`min-w-[1.65rem] rounded-lg px-1.5 py-1 text-[11px] font-mono font-bold transition ${
                        selected
                          ? 'bg-[#00ff66] text-[#121314] cursor-pointer'
                          : enabled
                            ? 'text-zinc-200 hover:bg-zinc-800 cursor-pointer'
                            : 'text-zinc-700 cursor-default'
                      }`}
                    >
                      {letter}
                    </button>
                  );
                })}
              </nav>

              <div className="space-y-6">
                {chunkedAzSections.list.map((sec) => (
                  <section key={sec.key} className="space-y-2.5">
                    <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-1.5">
                      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-[#00ff66]/15 px-2 font-mono text-xs font-extrabold text-[#00ff66]">
                        {sec.key}
                      </span>
                      <span className="text-xs font-mono text-zinc-500">
                        {sec.fullCount}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                      {sec.games.map((game) => (
                        <CreatorGameCard
                          key={getGameUuid(game) || getGameTitle(game, locale)}
                          game={game}
                          locale={locale}
                          copy={copy}
                          showDraftState={showDraftState}
                          onOpen={handleOpenGame}
                          onShowMedia={setMediaGame}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              {azLimit < chunkedAzSections.total ? (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:text-white cursor-pointer"
                    onClick={() => setAzLimit((prev) => prev + AZ_GAME_CHUNK)}
                  >
                    {copy.more} ({chunkedAzSections.total - azLimit})
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* 2C. Modus: Flaches Kachel-Raster */}
          {activeViewMode === 'grid' ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                {filteredGames.slice(0, gridLimit).map((game) => (
                  <CreatorGameCard
                    key={getGameUuid(game) || getGameTitle(game, locale)}
                    game={game}
                    locale={locale}
                    copy={copy}
                    showDraftState={showDraftState}
                    onOpen={handleOpenGame}
                    onShowMedia={setMediaGame}
                  />
                ))}
              </div>
              {gridLimit < filteredGames.length ? (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:text-white cursor-pointer"
                    onClick={() => setGridLimit((prev) => prev + PAGE_SIZE)}
                  >
                    {copy.more} ({filteredGames.length - gridLimit})
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      )}

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
    </div>
  );
}

export default CreatorShowcaseGrid;
