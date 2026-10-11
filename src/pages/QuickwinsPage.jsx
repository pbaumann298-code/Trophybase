import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { useLocale } from '../context/LocaleContext';
import { fetchQuickwinGames } from '../lib/gameQueries';
import { getGameTitle, getGameUuid } from '../lib/gameModel';
import {
  filterQuickwins,
  groupQuickwinsByPublisher,
  quickwinPublisherOptions,
  sortQuickwins,
} from '../lib/quickwinCatalog';
import {
  getViewFromPath,
  navigateToQuickwins,
  parseQuickwinsParams,
} from '../lib/routeUtils';
import QuickwinGameCard, { formatQuickwinCount } from '../components/QuickwinGameCard';
import '../styles/quickwins.css';

function QuickwinsPage({
  openGame,
  onRequestLogin,
  onBack,
  includeReady = false,
  isAdmin = false,
  sessionUser = null,
}) {
  const { t, globalLocale } = useLocale();
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
    document.title = `${t('quickwinsTitle')} · TrophyBase.app`;
    return () => {
      document.title = previous;
    };
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchQuickwinGames(supabase, globalLocale, { includeReady }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error('Quickwins:', error.message);
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
  }, [globalLocale, includeReady]);

  useEffect(() => {
    const onPop = () => {
      if (getViewFromPath(window.location.pathname) !== 'quickwins') return;
      const next = parseQuickwinsParams();
      setApplied(next);
      setDraft({ title: next.title, publisher: next.publisher });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const publishers = useMemo(() => quickwinPublisherOptions(games), [games]);

  const grouped = useMemo(() => {
    const filtered = filterQuickwins(games, applied);
    return groupQuickwinsByPublisher(filtered, globalLocale, t('quickwinsNoPublisher')).map((group) => ({
      ...group,
      games: sortQuickwins(group.games, applied.sort, globalLocale),
    }));
  }, [games, applied, globalLocale, t]);

  const commit = (next, { replace = false } = {}) => {
    setOpenPublishers(new Set());
    setOpenGameId(null);
    setApplied(next);
    setDraft({ title: next.title, publisher: next.publisher });
    navigateToQuickwins(next, { replace });
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
                    <span>{getGameTitle(game, globalLocale)}</span>
                    <span aria-hidden>{titleOpen ? '▲' : '▼'}</span>
                  </button>
                  {titleOpen && (
                    <QuickwinGameCard
                      game={game}
                      openGame={openGame}
                      onRequestLogin={onRequestLogin}
                      isAdmin={isAdmin}
                      sessionUser={sessionUser}
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
      <h1 className="quickwins-title">{t('quickwinsTitle')}</h1>

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
