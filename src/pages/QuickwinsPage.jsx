import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { useLocale } from '../context/LocaleContext';
import { CATALOG_FETCH_PAGE, fetchGamesByType } from '../lib/gameQueries';
import { GAME_TYPE } from '../lib/gameSchema';
import { getGameTitle, getGameUuid } from '../lib/gameModel';
import { translateHomeTag } from '../lib/homeTagDefs';
import {
  QUICKWIN_ALPHABET,
  QUICKWIN_PUBLISHER_MIN,
  buildQuickwinPublisherCanon,
  filterQuickwins,
  groupQuickwinsByAlphabet,
  groupQuickwinsByPublisher,
  quickwinBrandCore,
  quickwinPublisherIdentity,
  quickwinPublisherKey,
  quickwinPublisherOptions,
  sortQuickwins,
} from '../lib/quickwinCatalog';
import {
  QUICKWINS_PATH,
  getViewFromPath,
  navigateToQuickwins,
  parseQuickwinsParams,
} from '../lib/routeUtils';
import QuickwinGameCard, { formatQuickwinCount } from '../components/QuickwinGameCard';
import CatalogLetterSection from '../components/CatalogLetterSection';
import { normalizeLocale } from '../lib/locale';
import '../styles/home.css';
import '../styles/quickwins.css';

/**
 * @typedef {{
 *   viewName: string,
 *   pageCopy: (locale: string) => { title: string, lead?: string, notice?: string },
 *   publicPath: (locale: string) => string,
 *   parsePath: (pathname?: string) => { locale: string|null, slug: string, legacy?: boolean }|null,
 * }} LocalizedCatalog
 */

const EASY_PLATINS_SERIES = [
  { label: 'Enigmatis', title: 'Enigmatis' },
  { label: 'Grim Legends', title: 'Grim Legends' },
  { label: 'Nightmares from the Deep', title: 'Nightmares from the Deep' },
  { label: 'Steins;Gate', title: 'Steins;Gate' },
  { label: 'AI: The Somnium Files', title: 'Somnium Files' },
  { label: 'Collar X Malice', title: 'Collar' },
  { labelKey: 'easyPlatinsSeriesFmv', tag: 'fmv' },
];

const EASY_PLATINS_TAGS = [
  { tag: 'hidden_object', icon: '🔍', keywords: ['wimmelbild', 'hidden object'] },
  { tag: 'visual_novel', icon: '📖', keywords: ['visual novel'] },
  { tag: 'fmv', icon: '🎬', keywords: ['fmv', 'interaktiver film', 'interactive film', 'interactive movie'] },
  { tag: 'mystery_crime', icon: '🕵️', keywords: ['mystery', 'crime', 'detektiv', 'krimi'] },
  { tag: 'scifi_cyberpunk', icon: '🚀', keywords: ['sci-fi', 'scifi', 'cyberpunk'] },
  { tag: 'otome_romance', icon: '💘', keywords: ['otome', 'romance', 'romantik'] },
  { tag: 'psych_horror', icon: '🧠', keywords: ['horror', 'psychological', 'psychologisch'] },
  { tag: 'point_and_click', icon: '🖱️', keywords: ['point', 'click'] },
];

function gameMatchesTag(game, tagSlug) {
  if (!game || !tagSlug) return false;

  const rawTags = game.home_tags;
  let tagList = [];
  if (Array.isArray(rawTags)) {
    tagList = rawTags;
  } else if (typeof rawTags === 'string') {
    try {
      const parsed = JSON.parse(rawTags);
      if (Array.isArray(parsed)) tagList = parsed;
      else tagList = [rawTags];
    } catch {
      tagList = [rawTags];
    }
  }

  return tagList.some((t) => String(t).toLowerCase() === tagSlug.toLowerCase());
}

const DOM_CHUNK_SIZE = 60;

function QuickwinsPage({
  openGame,
  onRequestLogin,
  onBack,
  includeReady = false,
  isAdmin = false,
  sessionUser = null,
  gameType = GAME_TYPE.QUICKWIN,
  basePath = QUICKWINS_PATH,
  titleKey = 'quickwinsTitle',
  newerVersions = false,
  serverNotice = false,
  publisherMin = QUICKWIN_PUBLISHER_MIN,
  /** A–Z-Kacheln, sticky Alphabet, keine Publisher, keine Vollseite */
  alphabetCatalog = false,
  /** @type {LocalizedCatalog|null} */
  localizedCatalog = null,
}) {
  const { t, globalLocale } = useLocale();
  const [pathLocale, setPathLocale] = useState(() => (
    localizedCatalog && typeof window !== 'undefined'
      ? localizedCatalog.parsePath(window.location.pathname)?.locale || null
      : null
  ));
  const copyLocale = pathLocale || normalizeLocale(globalLocale);
  const pageCopy = localizedCatalog ? localizedCatalog.pageCopy(copyLocale) : null;
  const activePath = localizedCatalog ? localizedCatalog.publicPath(copyLocale) : basePath;
  const catalogViewName = localizedCatalog?.viewName || 'quickwins';
  const initial = parseQuickwinsParams();
  const [draft, setDraft] = useState(() => ({
    title: initial.title,
    publisher: alphabetCatalog ? '' : initial.publisher,
  }));
  const [applied, setApplied] = useState(() => (
    alphabetCatalog ? { ...initial, publisher: '', sort: 'title-asc' } : initial
  ));
  const [selectedTag, setSelectedTag] = useState('');
  const [games, setGames] = useState([]);
  const [publisherDefs, setPublisherDefs] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const loading = initialLoading;
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [visibleCount, setVisibleCount] = useState(DOM_CHUNK_SIZE);
  const [openPublishers, setOpenPublishers] = useState(() => new Set());
  const [openGameId, setOpenGameId] = useState(null);
  const [activeLetter, setActiveLetter] = useState('');
  const loadMoreRef = useRef(null);

  useEffect(() => {
    const previous = document.title;
    document.title = `${pageCopy?.title || t(titleKey)} · TrophyBase.app`;
    return () => {
      document.title = previous;
    };
  }, [t, titleKey, pageCopy]);

  useEffect(() => {
    if (!localizedCatalog) return undefined;
    const alignPath = () => {
      const parsed = localizedCatalog.parsePath(window.location.pathname);
      if (!parsed) return;
      const locale = parsed.locale || normalizeLocale(globalLocale);
      setPathLocale(locale);
      const target = localizedCatalog.publicPath(locale);
      const current = window.location.pathname.replace(/\/$/, '') || '/';
      if (current === target) return;
      navigateToQuickwins(
        {
          title: applied.title,
          publisher: alphabetCatalog ? '' : applied.publisher,
          sort: alphabetCatalog ? 'title-asc' : applied.sort,
        },
        { replace: true, path: target },
      );
    };
    alignPath();
    window.addEventListener('popstate', alignPath);
    return () => window.removeEventListener('popstate', alignPath);
  }, [localizedCatalog, globalLocale, applied.title, applied.publisher, applied.sort, alphabetCatalog]);

  const fetchMode = alphabetCatalog ? 'tiles' : 'list';

  useEffect(() => {
    setVisibleCount(DOM_CHUNK_SIZE);
  }, [applied.title, applied.publisher, applied.sort, selectedTag, gameType, globalLocale]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setInitialLoading(true);
    setLoadingMore(false);
    setLoadError(false);
    setHasMore(false);

    fetchGamesByType(supabase, gameType, globalLocale, {
      includeReady,
      mode: fetchMode,
      signal: controller.signal,
      onBatch: (batchRows, meta) => {
        if (cancelled) return;
        const rows = batchRows || [];
        setGames(rows);
        if (meta.isFirstBatch) {
          setInitialLoading(false);
        }
        setLoadingMore(!meta.done);
        setHasMore(!meta.done);
      },
    })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error(titleKey, error.message);
          if (games.length === 0) {
            setLoadError(true);
          }
        } else if (data) {
          setGames(data);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(titleKey, err);
        setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) {
          setInitialLoading(false);
          setLoadingMore(false);
          setHasMore(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalLocale, includeReady, gameType, titleKey, fetchMode]);

  useEffect(() => {
    if (alphabetCatalog) return undefined;
    let cancelled = false;
    supabase
      .from('quickwin_publisher_defs')
      .select('match_key, publisher, published, sort_pos')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data || data.length === 0) {
          setPublisherDefs(null);
        } else {
          setPublisherDefs(data);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [alphabetCatalog]);

  useEffect(() => {
    const onPop = () => {
      if (getViewFromPath(window.location.pathname) !== catalogViewName) return;
      const next = parseQuickwinsParams();
      setApplied(alphabetCatalog ? { ...next, publisher: '', sort: 'title-asc' } : next);
      setDraft({ title: next.title, publisher: alphabetCatalog ? '' : next.publisher });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [alphabetCatalog, catalogViewName]);

  const defMap = useMemo(() => {
    if (alphabetCatalog || !publisherDefs || publisherDefs.length === 0) return null;
    const map = new Map();
    for (const def of publisherDefs) {
      if (!def?.match_key) continue;
      const core = quickwinBrandCore(def.match_key);
      const entry = {
        key: def.match_key,
        label: def.publisher || def.match_key,
        published: Boolean(def.published),
        sortPos: Number.isFinite(Number(def.sort_pos)) ? Number(def.sort_pos) : null,
      };
      if (core) map.set(core, entry);
      map.set(def.match_key, entry);
    }
    return map.size > 0 ? map : null;
  }, [publisherDefs, alphabetCatalog]);

  const canon = useMemo(() => {
    if (alphabetCatalog) return null;
    if (defMap) {
      const map = new Map();
      for (const game of games) {
        const rawKey = quickwinPublisherKey(game);
        if (!rawKey) continue;
        const core = quickwinBrandCore(rawKey);
        const def = defMap.get(core) || defMap.get(rawKey);
        if (def) {
          map.set(rawKey, {
            key: def.key,
            label: def.label,
            published: def.published,
            sortPos: def.sortPos,
          });
        }
      }
      return map;
    }
    if (isAdmin) return null;
    return buildQuickwinPublisherCanon(games);
  }, [games, isAdmin, alphabetCatalog, defMap]);

  const visibleGames = useMemo(() => {
    if (alphabetCatalog) return games;
    if (defMap) {
      return games.filter((game) => {
        const rawKey = quickwinPublisherKey(game);
        if (!rawKey) return false;
        const identity = quickwinPublisherIdentity(game, canon);
        if (!identity || !identity.key) return false;
        if (!isAdmin && identity.published !== true) return false;
        return true;
      });
    }
    if (isAdmin) return games;
    const counts = new Map();
    for (const game of games) {
      const identity = quickwinPublisherIdentity(game, canon);
      if (!identity.key) continue;
      counts.set(identity.key, (counts.get(identity.key) || 0) + 1);
    }
    return games.filter((game) => {
      const identity = quickwinPublisherIdentity(game, canon);
      return identity.key && (counts.get(identity.key) || 0) >= publisherMin;
    });
  }, [games, canon, isAdmin, publisherMin, alphabetCatalog, defMap]);

  const publishers = useMemo(
    () => (alphabetCatalog ? [] : quickwinPublisherOptions(visibleGames, canon)),
    [visibleGames, canon, alphabetCatalog],
  );

  const filteredGames = useMemo(() => {
    let filtered = filterQuickwins(
      visibleGames,
      alphabetCatalog ? { title: applied.title, publisher: '' } : applied,
      canon,
    );
    if (gameType === GAME_TYPE.EASY_PLATIN && selectedTag) {
      filtered = filtered.filter((game) => gameMatchesTag(game, selectedTag));
    }
    return alphabetCatalog
      ? sortQuickwins(filtered, 'title-asc', globalLocale)
      : filtered;
  }, [visibleGames, applied, canon, alphabetCatalog, globalLocale, gameType, selectedTag]);

  const alphabetGroups = useMemo(
    () => (alphabetCatalog ? groupQuickwinsByAlphabet(filteredGames, globalLocale) : []),
    [alphabetCatalog, filteredGames, globalLocale],
  );

  // Client-Chunking: initial maximal 60 Karten im DOM rendern, beim Scrollen +60 nachladen
  const { visibleAlphabetGroups, hasMoreAlphabetDom } = useMemo(() => {
    if (!alphabetCatalog) {
      return { visibleAlphabetGroups: [], hasMoreAlphabetDom: false };
    }
    let budget = visibleCount;
    const slicedGroups = [];
    let totalCards = 0;
    for (const group of alphabetGroups) {
      totalCards += group.games.length;
      if (budget <= 0) continue;
      const slicedGames = group.games.slice(0, budget);
      slicedGroups.push({
        ...group,
        games: slicedGames,
      });
      budget -= slicedGames.length;
    }
    return {
      visibleAlphabetGroups: slicedGroups,
      hasMoreAlphabetDom: totalCards > visibleCount,
    };
  }, [alphabetCatalog, alphabetGroups, visibleCount]);

  const letterHasGames = useMemo(() => {
    const set = new Set(alphabetGroups.map((group) => group.key));
    return set;
  }, [alphabetGroups]);

  const grouped = useMemo(() => {
    if (alphabetCatalog) return [];
    return groupQuickwinsByPublisher(filteredGames, globalLocale, t('quickwinsNoPublisher'), canon).map((group) => ({
      ...group,
      games: sortQuickwins(group.games, applied.sort, globalLocale),
    }));
  }, [alphabetCatalog, filteredGames, globalLocale, t, canon, applied.sort]);

  const visibleGrouped = useMemo(
    () => (alphabetCatalog ? [] : grouped.slice(0, visibleCount)),
    [alphabetCatalog, grouped, visibleCount],
  );
  const hasMoreGroupedDom = !alphabetCatalog && grouped.length > visibleCount;
  const hasMoreDomChunks = alphabetCatalog ? hasMoreAlphabetDom : hasMoreGroupedDom;

  useEffect(() => {
    if (!hasMoreDomChunks) return undefined;
    const node = loadMoreRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((prev) => prev + DOM_CHUNK_SIZE);
        }
      },
      { rootMargin: '360px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreDomChunks, visibleAlphabetGroups.length, visibleGrouped.length]);

  const commit = (next, { replace = false } = {}) => {
    setOpenPublishers(new Set());
    setOpenGameId(null);
    const payload = alphabetCatalog
      ? { title: next.title, publisher: '', sort: 'title-asc' }
      : next;
    setApplied(payload);
    setDraft({ title: payload.title, publisher: payload.publisher });
    navigateToQuickwins(payload, { replace, path: activePath });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSeriesClick = (item) => {
    if (item.tag) {
      if (selectedTag === item.tag) {
        setSelectedTag('');
      } else {
        setSelectedTag(item.tag);
        setDraft((prev) => ({ ...prev, title: '' }));
        setApplied((prev) => ({ ...prev, title: '' }));
      }
      return;
    }

    if (applied.title === item.title) {
      setDraft((prev) => ({ ...prev, title: '' }));
      setApplied((prev) => ({ ...prev, title: '' }));
      setSelectedTag('');
    } else {
      setDraft((prev) => ({ ...prev, title: item.title }));
      setApplied((prev) => ({ ...prev, title: item.title }));
      setSelectedTag('');
    }
  };

  const handleTagClick = (tagSlug) => {
    if (selectedTag === tagSlug) {
      setSelectedTag('');
    } else {
      setSelectedTag(tagSlug);
      setDraft((prev) => ({ ...prev, title: '' }));
      setApplied((prev) => ({ ...prev, title: '' }));
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    commit({ ...applied, title: draft.title.trim(), publisher: draft.publisher });
  };

  const handleReset = () => {
    setSelectedTag('');
    commit({ title: '', publisher: '', sort: 'title-asc' }, { replace: true });
  };

  const handleSort = (event) => {
    commit({ ...applied, sort: event.target.value }, { replace: true });
  };

  const togglePublisher = (key, gameIds) => {
    const closing = openPublishers.has(key);
    setOpenPublishers((prev) => {
      const next = new Set(prev);
      if (prev.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (closing) {
      setOpenGameId((current) => (gameIds.has(current) ? null : current));
    }
  };

  const toggleGame = (gameId) => {
    setOpenGameId((current) => (current === gameId ? null : gameId));
  };

  const jumpToLetter = (letter) => {
    if (!letterHasGames.has(letter)) return;
    setActiveLetter(letter);
    let neededCount = 0;
    for (const group of alphabetGroups) {
      neededCount += group.games.length;
      if (group.key === letter) break;
    }
    if (neededCount > visibleCount) {
      setVisibleCount(Math.ceil(neededCount / DOM_CHUNK_SIZE) * DOM_CHUNK_SIZE);
      window.requestAnimationFrame(() => {
        const node = document.getElementById(`catalog-letter-${letter}`);
        if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return;
    }
    const node = document.getElementById(`catalog-letter-${letter}`);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (!alphabetCatalog || alphabetGroups.length === 0) return undefined;

    const nodes = alphabetGroups
      .map((group) => document.getElementById(`catalog-letter-${group.key}`))
      .filter(Boolean);
    if (nodes.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0]?.target?.id?.replace('catalog-letter-', '');
        if (first) setActiveLetter(first);
      },
      { rootMargin: '-20% 0px -65% 0px', threshold: 0 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [alphabetCatalog, alphabetGroups]);

  const renderAlphabetCatalog = () => (
    <>
      <nav className="catalog-alpha" aria-label="Alphabet">
        <div className="catalog-alpha-track">
          {QUICKWIN_ALPHABET.map((letter) => {
            const enabled = letterHasGames.has(letter);
            return (
              <button
                key={letter}
                type="button"
                className={`catalog-alpha-btn${enabled ? '' : ' is-disabled'}${
                  activeLetter === letter ? ' is-active' : ''
                }`}
                disabled={!enabled}
                onClick={() => jumpToLetter(letter)}
              >
                {letter}
              </button>
            );
          })}
          {letterHasGames.has('#') ? (
            <button
              type="button"
              className={`catalog-alpha-btn${activeLetter === '#' ? ' is-active' : ''}`}
              onClick={() => jumpToLetter('#')}
            >
              #
            </button>
          ) : null}
        </div>
      </nav>

      {loading ? (
        <p className="quickwin-card-note">{t('searchLoading')}</p>
      ) : loadError || alphabetGroups.length === 0 ? (
        <p className="quickwin-card-note">{t('searchNoResults')}</p>
      ) : (
        <div className="catalog-list">
          {visibleAlphabetGroups.map((group) => (
            <CatalogLetterSection
              key={group.key}
              letter={group.key}
              games={group.games}
              openGameId={openGameId}
              onToggleGame={toggleGame}
              openGame={openGame}
              onRequestLogin={onRequestLogin}
              isAdmin={isAdmin}
              sessionUser={sessionUser}
              includeReady={includeReady}
              newerVersions={newerVersions}
              serverNotice={serverNotice}
              serverNoticeText={pageCopy?.notice || ''}
            />
          ))}
          {hasMoreAlphabetDom ? (
            <div ref={loadMoreRef} className="catalog-load-more">
              <span className="catalog-load-more-spacer" />
            </div>
          ) : null}
        </div>
      )}
    </>
  );

  const pageBlocks = visibleGrouped.map((block) => {
    const isOpen = openPublishers.has(block.key);
    const gameIds = new Set(block.games.map((game) => getGameUuid(game)).filter(Boolean));
    return (
      <section key={`publisher-${block.key || 'none'}`} className="guide-localisation">
        <button
          type="button"
          className="guide-localisation__header"
          aria-expanded={isOpen}
          onClick={() => togglePublisher(block.key, gameIds)}
        >
          <span>
            {block.label || t('quickwinsNoPublisher')}
            <span className="guide-localisation__count">
              ({formatQuickwinCount(
                block.games.length,
                t('quickwinsGameCountOne'),
                t('quickwinsGameCount'),
              )})
            </span>
          </span>
          <span className="guide-localisation__chevron" aria-hidden>
            {isOpen ? '▲' : '▼'}
          </span>
        </button>
        {isOpen && (
          <div className="guide-localisation__body quickwin-titles">
            {block.games.slice(0, visibleCount).map((game) => {
              const gameId = getGameUuid(game);
              const titleOpen = Boolean(gameId) && openGameId === gameId;
              return (
                <div key={gameId || fallbackKey(game)} className="quickwin-title-block">
                  <button
                    type="button"
                    className="quickwin-title"
                    aria-expanded={titleOpen}
                    onClick={() => toggleGame(gameId)}
                  >
                    <span className="quickwin-title-name">
                      <span>{getGameTitle(game, globalLocale)}</span>
                      {isAdmin ? (
                        <span className="quickwin-type">
                          {String(game.spiel_typ ?? '').trim() || '—'}
                        </span>
                      ) : null}
                    </span>
                    <span aria-hidden>{titleOpen ? '▲' : '▼'}</span>
                  </button>
                  {titleOpen && (
                    <QuickwinGameCard
                      game={game}
                      openGame={openGame}
                      onRequestLogin={onRequestLogin}
                      isAdmin={isAdmin}
                      sessionUser={sessionUser}
                      newerVersions={newerVersions}
                      includeReady={includeReady}
                      serverNotice={serverNotice}
                      serverNoticeText={pageCopy?.notice || ''}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  });

  return (
    <div className={`quickwins-page${alphabetCatalog ? ' catalog-page' : ''}`}>
      <button type="button" className="quickwins-back" onClick={onBack}>
        {t('searchBack')}
      </button>
      <h1 className="quickwins-title">{pageCopy?.title || t(titleKey)}</h1>
      {pageCopy?.lead ? <p className="quickwins-lead">{pageCopy.lead}</p> : null}

      {gameType === GAME_TYPE.EASY_PLATIN && (
        <div className="rounded-2xl border border-zinc-800 bg-[#1a1b1c] p-4 sm:p-5 mb-6 shadow-xl">
          <div className="mb-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 mb-2">
              {t('easyPlatinsSeriesHeading')}
            </h3>
            <div className="flex flex-wrap gap-2">
              {EASY_PLATINS_SERIES.map((item) => {
                const isActive = item.tag
                  ? selectedTag === item.tag
                  : applied.title === item.title;
                const displayLabel = item.labelKey ? t(item.labelKey) : item.label;
                return (
                  <button
                    key={item.labelKey || item.label}
                    type="button"
                    onClick={() => handleSeriesClick(item)}
                    className={
                      isActive
                        ? 'rounded-xl border border-[#00ff66]/50 bg-[#00ff66]/15 text-[#00ff66] font-medium px-3 py-1.5 text-xs sm:text-sm transition-colors cursor-pointer'
                        : 'rounded-xl border border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-zinc-700 hover:text-white font-medium px-3 py-1.5 text-xs sm:text-sm transition-colors cursor-pointer'
                    }
                  >
                    {displayLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 mb-2">
              {t('easyPlatinsSubgenresHeading')}
            </h3>
            <div className="flex flex-wrap gap-2">
              {EASY_PLATINS_TAGS.map((item) => {
                const isActive = selectedTag === item.tag;
                const tagLabel = translateHomeTag(item.tag, copyLocale);
                return (
                  <button
                    key={item.tag}
                    type="button"
                    onClick={() => handleTagClick(item.tag)}
                    className={
                      isActive
                        ? 'rounded-xl border border-[#00ff66]/50 bg-[#00ff66]/15 text-[#00ff66] font-medium px-3 py-1.5 text-xs sm:text-sm transition-colors cursor-pointer'
                        : 'rounded-xl border border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-zinc-700 hover:text-white font-medium px-3 py-1.5 text-xs sm:text-sm transition-colors cursor-pointer'
                    }
                  >
                    {`${item.icon} ${tagLabel}`}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <form className="quickwins-form" onSubmit={handleSubmit}>
        <div className={`advanced-search-field${alphabetCatalog ? ' quickwins-form-title-only' : ''}`}>
          <label htmlFor="quickwins-title">{t('searchTitle')}</label>
          <input
            id="quickwins-title"
            value={draft.title}
            onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
          />
        </div>
        {!alphabetCatalog ? (
          <div className="advanced-search-field">
            <label htmlFor="quickwins-publisher">{t('publisherLabel')}</label>
            <select
              id="quickwins-publisher"
              value={draft.publisher}
              onChange={(event) => setDraft((prev) => ({ ...prev, publisher: event.target.value }))}
            >
              <option value="">{t('quickwinsPublisherAll')}</option>
              {draft.publisher && !publishers.includes(draft.publisher) ? (
                <option value={draft.publisher}>{draft.publisher}</option>
              ) : null}
              {publishers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="quickwins-actions">
          <button type="submit" className="advanced-search-submit">
            {t('searchSubmit')}
          </button>
          <button type="button" className="advanced-search-reset" onClick={handleReset}>
            {t('searchReset')}
          </button>
          {!alphabetCatalog ? (
            <label className="quickwins-sort">
              <span>{t('quickwinsSort')}</span>
              <select value={applied.sort} onChange={handleSort} aria-label={t('quickwinsSort')}>
                <option value="title-asc">{t('quickwinsSortTitleAsc')}</option>
                <option value="title-desc">{t('quickwinsSortTitleDesc')}</option>
                <option value="year-asc">{t('quickwinsSortYearAsc')}</option>
                <option value="year-desc">{t('quickwinsSortYearDesc')}</option>
              </select>
            </label>
          ) : null}
        </div>
      </form>

      {!loading && games.length > 0 && (
        <div
          className="mb-4 flex items-center justify-between rounded-xl border border-zinc-800 bg-[#161718] px-3.5 py-2 text-xs font-mono text-zinc-300"
          role="status"
          aria-live="polite"
        >
          <span>
            {loadingMore || hasMore
              ? `⚡ ${games.length} Spiele geladen (lade weitere...)`
              : `✅ Alle ${games.length} Spiele geladen`}
          </span>
          {filteredGames.length !== games.length ? (
            <span className="text-zinc-500">{filteredGames.length} gefiltert</span>
          ) : null}
        </div>
      )}

      {alphabetCatalog ? (
        renderAlphabetCatalog()
      ) : loading && games.length === 0 ? (
        <p className="quickwin-card-note">{t('searchLoading')}</p>
      ) : loadError && games.length === 0 ? (
        <p className="quickwin-card-note">{t('searchNoResults')}</p>
      ) : grouped.length === 0 ? (
        <p className="quickwin-card-note">
          {hasMore || loadingMore ? t('searchLoading') : t('searchNoResults')}
        </p>
      ) : (
        <div className="quickwins-list">
          {pageBlocks}
          {hasMoreGroupedDom ? (
            <div ref={loadMoreRef} className="catalog-load-more">
              <span className="catalog-load-more-spacer" />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function fallbackKey(game) {
  return String(game?.id ?? game?.slug ?? '');
}

export default QuickwinsPage;
