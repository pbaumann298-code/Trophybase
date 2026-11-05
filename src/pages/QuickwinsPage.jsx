import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { useLocale } from '../context/LocaleContext';
import { CATALOG_FETCH_PAGE, fetchGamesByType } from '../lib/gameQueries';
import { GAME_TYPE } from '../lib/gameSchema';
import { translateHomeTag } from '../lib/homeTagDefs';
import {
  QUICKWIN_ALPHABET,
  buildQuickwinPublisherCanon,
  filterQuickwins,
  groupQuickwinsByAlphabet,
  quickwinBrandCore,
  quickwinPublisherIdentity,
  quickwinPublisherKey,
  sortQuickwins,
  titleAlphabetKey,
} from '../lib/quickwinCatalog';
import {
  QUICKWINS_PATH,
  getViewFromPath,
  navigateToQuickwins,
  parseQuickwinsParams,
} from '../lib/routeUtils';
import CatalogLetterSection from '../components/CatalogLetterSection';
import PublisherTile from '../components/PublisherTile';
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
const PUBLISHER_ROW_PREVIEW = 6;

const TILE_SHELL_CLASS =
  'catalog-tile-shell catalog-tile-shell--carousel flex-shrink-0 snap-start w-[9.25rem] sm:w-[10.5rem] lg:w-[11.25rem] max-w-[11.25rem]';

const OTHER_PUBLISHER_KEY = '__other_publishers__';
const OWN_PUBLISHER_MIN = 30;

function otherPublisherLabel(locale) {
  return locale === 'de' ? 'Weitere Publisher (< 30 Spiele)' : 'Other Publishers (< 30 Games)';
}

function publisherGameCounts(source, canon) {
  const counts = new Map();
  for (const game of source || []) {
    const identity = quickwinPublisherIdentity(game, canon);
    if (!identity.key) continue;
    counts.set(identity.key, (counts.get(identity.key) || 0) + 1);
  }
  return counts;
}

/** Eigene Kachel: explizit veröffentlicht, oder unbekannt und mindestens 30 Spiele. */
function ownsPublisherTile(identity, count) {
  if (!identity?.key) return false;
  if (identity.published === true) return true;
  if (identity.published === false) return false;
  return count >= OWN_PUBLISHER_MIN;
}

function PublisherLetterSection({
  letter,
  publishers,
  selectedPublisherKey,
  onSelectPublisher,
  onClosePublisher,
  openGameId,
  onToggleGame,
  openGame,
  onRequestLogin,
  isAdmin,
  sessionUser,
  includeReady,
  newerVersions,
  serverNotice,
  serverNoticeText,
}) {
  const trackRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const useGrid = expanded || publishers.length < PUBLISHER_ROW_PREVIEW;
  const selectedGroup = publishers.find((group) => group.key === selectedPublisherKey) || null;

  const updateScrollHints = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    if (useGrid) return undefined;
    updateScrollHints();
    const el = trackRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(updateScrollHints);
    observer.observe(el);
    return () => observer.disconnect();
  }, [publishers.length, useGrid, updateScrollHints]);

  const scrollByTiles = (direction) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: Math.round(el.clientWidth * 0.85) * direction, behavior: 'smooth' });
  };

  const renderTile = (group) => (
    <PublisherTile
      key={group.key || group.label}
      group={group}
      selected={selectedPublisherKey === group.key}
      onSelect={() => onSelectPublisher(group.key)}
    />
  );

  return (
    <section
      id={`catalog-letter-${letter}`}
      className="catalog-letter-section home-category w-full min-w-0 max-w-full"
      aria-labelledby={`catalog-letter-title-${letter}`}
    >
      <header className="home-category-header">
        <div className="home-category-heading min-w-0">
          {publishers.length >= PUBLISHER_ROW_PREVIEW ? (
            <button
              type="button"
              id={`catalog-letter-title-${letter}`}
              className="home-category-title home-category-title--clickable"
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
            >
              {letter}
              <span className="catalog-show-all-label">
                {publishers.length}
              </span>
            </button>
          ) : (
            <h2 id={`catalog-letter-title-${letter}`} className="home-category-title">
              {letter}
              <span className="catalog-show-all-label">{publishers.length}</span>
            </h2>
          )}
        </div>
        {!useGrid ? (
          <div className="home-category-nav flex-shrink-0">
            <button
              type="button"
              className="home-scroll-btn"
              aria-label={`${letter} nach links`}
              disabled={!canScrollLeft}
              onClick={() => scrollByTiles(-1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="home-scroll-btn"
              aria-label={`${letter} nach rechts`}
              disabled={!canScrollRight}
              onClick={() => scrollByTiles(1)}
            >
              ›
            </button>
          </div>
        ) : null}
      </header>

      {useGrid ? (
        <div className="publisher-tile-grid">
          {publishers.map(renderTile)}
        </div>
      ) : (
        <div className="home-carousel-wrap">
          <div
            ref={trackRef}
            className="home-carousel-track scrollbar-hide"
            onScroll={updateScrollHints}
          >
            {publishers.map((group) => (
              <div key={group.key || group.label} className={TILE_SHELL_CLASS}>
                {renderTile(group)}
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedGroup ? (
        <div className="catalog-detail catalog-detail--below-row publisher-detail">
          <CatalogLetterSection
            letter={`${selectedGroup.label} (${selectedGroup.games.length})`}
            games={selectedGroup.games}
            openGameId={openGameId}
            onToggleGame={onToggleGame}
            openGame={openGame}
            onRequestLogin={onRequestLogin}
            isAdmin={isAdmin}
            sessionUser={sessionUser}
            includeReady={includeReady}
            newerVersions={newerVersions}
            serverNotice={serverNotice}
            serverNoticeText={serverNoticeText}
            onClose={onClosePublisher}
          />
        </div>
      ) : null}
    </section>
  );
}

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
  const [selectedPublisherKey, setSelectedPublisherKey] = useState(null);
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

  const visibleGames = games;

  const publishers = useMemo(() => {
    if (alphabetCatalog) return [];
    const counts = publisherGameCounts(games, canon);
    const names = new Set();
    for (const game of games) {
      const identity = quickwinPublisherIdentity(game, canon);
      const count = identity.key ? (counts.get(identity.key) || 0) : 0;
      if (ownsPublisherTile(identity, count) && identity.label) names.add(identity.label);
    }
    return [...names].sort((a, b) => a.localeCompare(b, globalLocale || 'de', { sensitivity: 'base' }));
  }, [alphabetCatalog, games, canon, globalLocale]);

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

  const grouped = useMemo(() => {
    if (alphabetCatalog) return [];
    const counts = publisherGameCounts(games, canon);
    const buckets = new Map();
    const otherGames = [];
    for (const game of filteredGames) {
      const identity = quickwinPublisherIdentity(game, canon);
      const count = identity.key ? (counts.get(identity.key) || 0) : 0;
      if (!ownsPublisherTile(identity, count)) {
        otherGames.push(game);
        continue;
      }
      const existing = buckets.get(identity.key);
      if (existing) existing.games.push(game);
      else {
        buckets.set(identity.key, {
          key: identity.key,
          label: identity.label || t('quickwinsNoPublisher'),
          sortPos: identity.sortPos,
          games: [game],
        });
      }
    }
    const groups = [...buckets.values()].map((group) => ({
      ...group,
      games: sortQuickwins(group.games, applied.sort, globalLocale),
    }));
    groups.sort((a, b) => {
      const posA = Number.isFinite(Number(a.sortPos)) ? Number(a.sortPos) : null;
      const posB = Number.isFinite(Number(b.sortPos)) ? Number(b.sortPos) : null;
      if (posA !== null && posB !== null && posA !== posB) return posA - posB;
      if (posA !== null && posB === null) return -1;
      if (posA === null && posB !== null) return 1;
      return a.label.localeCompare(b.label, globalLocale || 'de', { sensitivity: 'base' });
    });
    if (otherGames.length > 0) {
      groups.push({
        key: OTHER_PUBLISHER_KEY,
        label: otherPublisherLabel(globalLocale),
        games: sortQuickwins(otherGames, applied.sort, globalLocale),
      });
    }
    return groups;
  }, [alphabetCatalog, games, filteredGames, globalLocale, t, canon, applied.sort]);

  const publisherLetterGroups = useMemo(() => {
    if (alphabetCatalog) return [];
    const buckets = new Map();
    for (const group of grouped) {
      const key = group.key === OTHER_PUBLISHER_KEY ? '#' : titleAlphabetKey(group.label, globalLocale);
      const list = buckets.get(key);
      if (list) list.push(group);
      else buckets.set(key, [group]);
    }
    for (const list of buckets.values()) {
      list.sort((a, b) => {
        if (a.key === OTHER_PUBLISHER_KEY) return 1;
        if (b.key === OTHER_PUBLISHER_KEY) return -1;
        return a.label.localeCompare(b.label, globalLocale || 'de', { sensitivity: 'base' });
      });
    }
    return [...QUICKWIN_ALPHABET, '#']
      .filter((key) => buckets.has(key))
      .map((key) => ({ key, publishers: buckets.get(key) }));
  }, [alphabetCatalog, grouped, globalLocale]);

  const letterHasEntries = useMemo(() => {
    const source = alphabetCatalog ? alphabetGroups : publisherLetterGroups;
    return new Set(source.map((group) => group.key));
  }, [alphabetCatalog, alphabetGroups, publisherLetterGroups]);

  const hasMoreDomChunks = alphabetCatalog ? hasMoreAlphabetDom : false;

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
  }, [hasMoreDomChunks, visibleAlphabetGroups.length]);

  const commit = (next, { replace = false } = {}) => {
    setSelectedPublisherKey(null);
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

  const selectPublisher = (key) => {
    setSelectedPublisherKey((current) => (current === key ? null : key));
    setOpenGameId(null);
  };

  const toggleGame = (gameId) => {
    setOpenGameId((current) => (current === gameId ? null : gameId));
  };

  const autoOpenSignatureRef = useRef('');
  useEffect(() => {
    if (alphabetCatalog) return;
    const titleActive = Boolean(String(applied.title || '').trim());
    const publisherActive = Boolean(applied.publisher);
    const autoKey = (publisherActive || titleActive) && grouped.length === 1 ? grouped[0].key : '';
    const signature = `${applied.publisher}|${applied.title}|${autoKey}`;
    if (autoKey && autoOpenSignatureRef.current !== signature) {
      autoOpenSignatureRef.current = signature;
      setSelectedPublisherKey(autoKey);
      return;
    }
    autoOpenSignatureRef.current = signature;
    setSelectedPublisherKey((current) => {
      if (!current) return current;
      return grouped.some((group) => group.key === current) ? current : null;
    });
  }, [alphabetCatalog, applied.title, applied.publisher, grouped]);

  const jumpToLetter = (letter) => {
    if (!letterHasEntries.has(letter)) return;
    setActiveLetter(letter);
    const scroll = () => {
      const node = document.getElementById(`catalog-letter-${letter}`);
      if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    if (alphabetCatalog) {
      let neededCount = 0;
      for (const group of alphabetGroups) {
        neededCount += group.games.length;
        if (group.key === letter) break;
      }
      if (neededCount > visibleCount) {
        setVisibleCount(Math.ceil(neededCount / DOM_CHUNK_SIZE) * DOM_CHUNK_SIZE);
        window.requestAnimationFrame(scroll);
        return;
      }
    }
    scroll();
  };

  useEffect(() => {
    const source = alphabetCatalog ? alphabetGroups : publisherLetterGroups;
    if (source.length === 0) return undefined;

    const nodes = source
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
  }, [alphabetCatalog, alphabetGroups, publisherLetterGroups]);

  const renderAlphabetNav = () => (
      <nav className="catalog-alpha" aria-label="Alphabet">
        <div className="catalog-alpha-track">
          {QUICKWIN_ALPHABET.map((letter) => {
            const enabled = letterHasEntries.has(letter);
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
          {letterHasEntries.has('#') ? (
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
  );

  const renderAlphabetCatalog = () => (
    <>
      {renderAlphabetNav()}

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

  return (
    <div className="quickwins-page catalog-page">
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

      {!alphabetCatalog ? renderAlphabetNav() : null}

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
      ) : Boolean(applied.title.trim()) || Boolean(applied.publisher) ? (
        <div className="catalog-list">
          {publisherLetterGroups.map((section) => (
            <div key={section.key} id={`catalog-letter-${section.key}`} className="catalog-list">
              {section.publishers.map((group) => (
                <CatalogLetterSection
                  key={group.key}
                  letter={`${group.label} (${group.games.length})`}
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
            </div>
          ))}
        </div>
      ) : (
        <div className="catalog-list">
            {publisherLetterGroups.map((section) => (
              <PublisherLetterSection
                key={section.key}
                letter={section.key}
                publishers={section.publishers}
                selectedPublisherKey={selectedPublisherKey}
                onSelectPublisher={selectPublisher}
                onClosePublisher={() => {
                  setSelectedPublisherKey(null);
                  setOpenGameId(null);
                }}
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
        </div>
      )}
    </div>
  );
}

export default QuickwinsPage;
