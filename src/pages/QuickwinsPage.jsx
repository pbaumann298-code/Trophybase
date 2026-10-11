import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { useLocale } from '../context/LocaleContext';
import { fetchGamesByType } from '../lib/gameQueries';
import { GAME_TYPE } from '../lib/gameSchema';
import { getGameTitle, getGameUuid } from '../lib/gameModel';
import {
  QUICKWIN_PUBLISHER_MIN,
  buildQuickwinPublisherCanon,
  filterQuickwins,
  groupQuickwinsByPublisher,
  quickwinPublisherIdentity,
  quickwinPublisherOptions,
  sortQuickwins,
} from '../lib/quickwinCatalog';
import {
  QUICKWINS_PATH,
  SERVERTOT_PATH,
  getViewFromPath,
  navigateToQuickwins,
  parseQuickwinsParams,
} from '../lib/routeUtils';
import QuickwinGameCard, { formatQuickwinCount } from '../components/QuickwinGameCard';
import { parseServertotPath, servertotPageCopy, servertotPublicPath } from '../lib/servertotPage';
import { normalizeLocale } from '../lib/locale';
import '../styles/quickwins.css';

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
  localizedPath = false,
  serverNotice = false,
}) {
  const { t, globalLocale } = useLocale();
  const [pathLocale, setPathLocale] = useState(() => (
    localizedPath && typeof window !== 'undefined'
      ? parseServertotPath(window.location.pathname)?.locale || null
      : null
  ));
  const copyLocale = pathLocale || normalizeLocale(globalLocale);
  const pageCopy = localizedPath ? servertotPageCopy(copyLocale) : null;
  const activePath = localizedPath ? servertotPublicPath(copyLocale) : basePath;
  const initial = parseQuickwinsParams();
  const [draft, setDraft] = useState(() => ({ title: initial.title, publisher: initial.publisher }));
  const [applied, setApplied] = useState(() => initial);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [openPublishers, setOpenPublishers] = useState(() => new Set());
  const [openGameId, setOpenGameId] = useState(null);

  useEffect(() => {
    const previous = document.title;
    document.title = `${pageCopy?.title || t(titleKey)} · TrophyBase.app`;
    return () => {
      document.title = previous;
    };
  }, [t, titleKey, pageCopy]);

  useEffect(() => {
    if (!localizedPath) return undefined;
    const alignPath = () => {
      const parsed = parseServertotPath(window.location.pathname);
      if (!parsed) return;
      const locale = parsed.locale || normalizeLocale(globalLocale);
      setPathLocale(locale);
      const target = servertotPublicPath(locale);
      const current = window.location.pathname.replace(/\/$/, '') || '/';
      if (current === target) return;
      navigateToQuickwins(
        {
          title: applied.title,
          publisher: applied.publisher,
          sort: applied.sort,
        },
        { replace: true, path: target },
      );
    };
    alignPath();
    window.addEventListener('popstate', alignPath);
    return () => window.removeEventListener('popstate', alignPath);
  }, [localizedPath, globalLocale, applied.title, applied.publisher, applied.sort]);

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
      const viewName = localizedPath || basePath === SERVERTOT_PATH ? 'servertot' : 'quickwins';
      if (getViewFromPath(window.location.pathname) !== viewName) return;
      const next = parseQuickwinsParams();
      setApplied(next);
      setDraft({ title: next.title, publisher: next.publisher });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const canon = useMemo(
    () => (isAdmin ? null : buildQuickwinPublisherCanon(games)),
    [games, isAdmin],
  );

  const visibleGames = useMemo(() => {
    if (isAdmin) return games;
    const counts = new Map();
    for (const game of games) {
      const identity = quickwinPublisherIdentity(game, canon);
      if (!identity.key) continue;
      counts.set(identity.key, (counts.get(identity.key) || 0) + 1);
    }
    return games.filter((game) => {
      const identity = quickwinPublisherIdentity(game, canon);
      return identity.key && (counts.get(identity.key) || 0) >= QUICKWIN_PUBLISHER_MIN;
    });
  }, [games, canon, isAdmin]);

  const publishers = useMemo(
    () => quickwinPublisherOptions(visibleGames, canon),
    [visibleGames, canon],
  );

  const grouped = useMemo(() => {
    const filtered = filterQuickwins(visibleGames, applied, canon);
    return groupQuickwinsByPublisher(filtered, globalLocale, t('quickwinsNoPublisher'), canon).map((group) => ({
      ...group,
      games: sortQuickwins(group.games, applied.sort, globalLocale),
    }));
  }, [visibleGames, applied, globalLocale, t, canon]);

  const commit = (next, { replace = false } = {}) => {
    setOpenPublishers(new Set());
    setOpenGameId(null);
    setApplied(next);
    setDraft({ title: next.title, publisher: next.publisher });
    navigateToQuickwins(next, { replace, path: activePath });
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
                <div key={gameId || titleKey(game)} className="quickwin-title-block">
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
    <div className="quickwins-page">
      <button type="button" className="quickwins-back" onClick={onBack}>
        {t('searchBack')}
      </button>
      <h1 className="quickwins-title">{pageCopy?.title || t(titleKey)}</h1>
      {pageCopy?.lead ? <p className="quickwins-lead">{pageCopy.lead}</p> : null}

      <form className="quickwins-form" onSubmit={handleSubmit}>
        <div className="advanced-search-field">
          <label htmlFor="quickwins-title">{t('searchTitle')}</label>
          <input
            id="quickwins-title"
            value={draft.title}
            onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
          />
        </div>
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
        <div className="quickwins-actions">
          <button type="submit" className="advanced-search-submit">
            {t('searchSubmit')}
          </button>
          <button type="button" className="advanced-search-reset" onClick={handleReset}>
            {t('searchReset')}
          </button>
          <label className="quickwins-sort">
            <span>{t('quickwinsSort')}</span>
            <select value={applied.sort} onChange={handleSort} aria-label={t('quickwinsSort')}>
              <option value="title-asc">{t('quickwinsSortTitleAsc')}</option>
              <option value="title-desc">{t('quickwinsSortTitleDesc')}</option>
              <option value="year-asc">{t('quickwinsSortYearAsc')}</option>
              <option value="year-desc">{t('quickwinsSortYearDesc')}</option>
            </select>
          </label>
        </div>
      </form>

      {loading ? (
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

function titleKey(game) {
  return String(game?.id ?? game?.slug ?? '');
}

export default QuickwinsPage;
