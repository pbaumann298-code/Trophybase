import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { useLocale } from '../context/LocaleContext';
import { fetchGamesByType } from '../lib/gameQueries';
import { GAME_FIELDS, GAME_TYPE } from '../lib/gameSchema';
import { getGameCover, getGameTitle, getGameUuid } from '../lib/gameModel';
import {
  QUICKWIN_ALPHABET,
  QUICKWIN_PUBLISHER_MIN,
  buildQuickwinPublisherCanon,
  filterQuickwins,
  groupQuickwinsByAlphabet,
  groupQuickwinsByPublisher,
  quickwinPublisherIdentity,
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
import GuideOnlineBadge from '../components/GuideOnlineBadge';
import WatchlistButton from '../components/WatchlistButton';
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
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [openPublishers, setOpenPublishers] = useState(() => new Set());
  const [openGameId, setOpenGameId] = useState(null);
  const [activeLetter, setActiveLetter] = useState('');

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchGamesByType(supabase, gameType, globalLocale, { includeReady }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error(titleKey, error.message);
        setLoadError(true);
        setGames([]);
      } else {
        setLoadError(false);
        setGames(data || []);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [globalLocale, includeReady, gameType, titleKey]);

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

  const canon = useMemo(
    () => (alphabetCatalog || isAdmin ? null : buildQuickwinPublisherCanon(games)),
    [games, isAdmin, alphabetCatalog],
  );

  const visibleGames = useMemo(() => {
    if (alphabetCatalog || isAdmin) return games;
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
  }, [games, canon, isAdmin, publisherMin, alphabetCatalog]);

  const publishers = useMemo(
    () => (alphabetCatalog ? [] : quickwinPublisherOptions(visibleGames, canon)),
    [visibleGames, canon, alphabetCatalog],
  );

  const filteredGames = useMemo(() => {
    const filtered = filterQuickwins(
      visibleGames,
      alphabetCatalog ? { title: applied.title, publisher: '' } : applied,
      canon,
    );
    return alphabetCatalog
      ? sortQuickwins(filtered, 'title-asc', globalLocale)
      : filtered;
  }, [visibleGames, applied, canon, alphabetCatalog, globalLocale]);

  const alphabetGroups = useMemo(
    () => (alphabetCatalog ? groupQuickwinsByAlphabet(filteredGames, globalLocale) : []),
    [alphabetCatalog, filteredGames, globalLocale],
  );

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

  const handleSubmit = (event) => {
    event.preventDefault();
    commit({ ...applied, title: draft.title.trim(), publisher: draft.publisher });
  };

  const handleReset = () => {
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
          {alphabetGroups.map((group) => (
            <section
              key={group.key}
              id={`catalog-letter-${group.key}`}
              className="catalog-letter-section"
            >
              <h2 className="catalog-letter-heading">{group.key}</h2>
              <div className="catalog-tile-grid">
                {group.games.map((game, index) => {
                  const gameId = getGameUuid(game);
                  const title = getGameTitle(game, globalLocale);
                  const cover = getGameCover(game, globalLocale);
                  const consoleLabel = game[GAME_FIELDS.console] ?? '';
                  const isOpen = Boolean(gameId) && openGameId === gameId;
                  return (
                    <div
                      key={gameId || `${group.key}-${index}`}
                      className={`catalog-tile-wrap${isOpen ? ' is-open' : ''}`}
                    >
                      <div className="catalog-tile-shell">
                        <button
                          type="button"
                          className="catalog-tile"
                          aria-expanded={isOpen}
                          onClick={() => toggleGame(gameId)}
                        >
                          <article
                            className="home-tile group h-full"
                            style={{ '--tile-accent': '#00ff66' }}
                          >
                            <div className="home-tile-cover-wrap">
                              {cover ? (
                                <img src={cover} className="home-tile-cover" alt="" loading="lazy" />
                              ) : (
                                <div className="home-tile-cover home-tile-cover--empty">🎮</div>
                              )}
                              <div className="home-tile-online">
                                <GuideOnlineBadge game={game} visible={isAdmin} size="sm" />
                              </div>
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
                        </button>
                        <div className="home-tile-watchlist">
                          <WatchlistButton
                            gameId={gameId}
                            onRequestLogin={onRequestLogin}
                            size="sm"
                          />
                        </div>
                      </div>
                      {isOpen ? (
                        <div className="catalog-detail">
                          <QuickwinGameCard
                            game={game}
                            openGame={openGame}
                            onRequestLogin={onRequestLogin}
                            isAdmin={isAdmin}
                            sessionUser={sessionUser}
                            newerVersions={false}
                            includeReady={includeReady}
                            serverNotice={serverNotice}
                            serverNoticeText={pageCopy?.notice || ''}
                            allowFullGameNav={false}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );

  const pageBlocks = grouped.map((block) => {
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
            {block.games.map((game) => {
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

      {alphabetCatalog ? (
        renderAlphabetCatalog()
      ) : loading ? (
        <p className="quickwin-card-note">{t('searchLoading')}</p>
      ) : loadError ? (
        <p className="quickwin-card-note">{t('searchNoResults')}</p>
      ) : grouped.length === 0 ? (
        <p className="quickwin-card-note">{t('searchNoResults')}</p>
      ) : (
        <div className="quickwins-list">{pageBlocks}</div>
      )}
    </div>
  );
}

function fallbackKey(game) {
  return String(game?.id ?? game?.slug ?? '');
}

export default QuickwinsPage;
