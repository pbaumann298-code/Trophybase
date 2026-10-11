import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { useLocale } from '../context/LocaleContext';
import { fetchQuickwinGames } from '../lib/gameQueries';
import { fetchChronologicalGroupLabels } from '../lib/guideQueries';
import { getGameUuid } from '../lib/gameModel';
import { paginateItems, SEARCH_PAGE_SIZE } from '../lib/gameSearch';
import {
  filterQuickwins,
  groupQuickwinsByPublisher,
  quickwinPublisherKey,
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

function formatPageStatus(template, page, total) {
  return String(template ?? '')
    .replace('{page}', String(page))
    .replace('{total}', String(total));
}

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
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [groupLabels, setGroupLabels] = useState(() => new Map());

  useEffect(() => {
    const previous = document.title;
    document.title = `${t('quickwinsTitle')} · TrophyBase.app`;
    return () => {
      document.title = previous;
    };
  }, [t]);

  useEffect(() => {
    setGroupLabels(new Map());
  }, [globalLocale]);

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

  const flat = useMemo(() => grouped.flatMap((group) => group.games), [grouped]);
  const paged = useMemo(
    () => paginateItems(flat, applied.page, SEARCH_PAGE_SIZE),
    [flat, applied.page],
  );
  const pageIdList = useMemo(
    () => paged.items.map((game) => getGameUuid(game)).filter(Boolean),
    [paged.items],
  );
  const groupByKey = useMemo(() => new Map(grouped.map((group) => [group.key, group])), [grouped]);

  useEffect(() => {
    const missing = pageIdList.filter((id) => !groupLabels.has(id));
    if (missing.length === 0) return undefined;
    let cancelled = false;
    fetchChronologicalGroupLabels(supabase, missing, globalLocale).then(({ byGameId, error }) => {
      if (cancelled) return;
      if (error) console.error('chronological_group:', error.message);
      setGroupLabels((prev) => {
        const next = new Map(prev);
        let changed = false;
        for (const id of missing) {
          if (next.has(id)) continue;
          next.set(id, byGameId.get(id) ?? []);
          changed = true;
        }
        return changed ? next : prev;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [pageIdList, globalLocale, groupLabels]);

  const commit = (next, { replace = false } = {}) => {
    setCollapsed(new Set());
    setApplied(next);
    setDraft({ title: next.title, publisher: next.publisher });
    navigateToQuickwins(next, { replace });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    commit({ ...applied, title: draft.title.trim(), publisher: draft.publisher, page: 1 });
  };

  const handleReset = () => {
    commit({ title: '', publisher: '', sort: 'title-asc', page: 1 }, { replace: true });
  };

  const handleSort = (event) => {
    commit({ ...applied, sort: event.target.value, page: 1 }, { replace: true });
  };

  const handlePage = (page) => {
    commit({ ...applied, page }, { replace: true });
  };

  const togglePublisher = (key) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderPager = () => {
    if (!paged.showPager) return null;
    return (
      <nav className="search-pager" aria-label={t('quickwinsTitle')}>
        <button
          type="button"
          className="search-pager-btn"
          disabled={paged.page <= 1}
          onClick={() => handlePage(paged.page - 1)}
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
          onClick={() => handlePage(paged.page + 1)}
        >
          {t('searchNextPage')}
        </button>
      </nav>
    );
  };

  let lastPublisher = null;
  const pageBlocks = [];
  for (const game of paged.items) {
    const key = quickwinPublisherKey(game);
    if (key !== lastPublisher) {
      lastPublisher = key;
      const group = groupByKey.get(key);
      const isOpen = !collapsed.has(key);
      pageBlocks.push(
        <section key={`publisher-${key || 'none'}`} className="guide-localisation">
          <button
            type="button"
            className="guide-localisation__header"
            aria-expanded={isOpen}
            onClick={() => togglePublisher(key)}
          >
            <span>
              {group?.label || t('quickwinsNoPublisher')}
              <span className="guide-localisation__count">
                ({formatQuickwinCount(
                  group?.games.length ?? 0,
                  t('quickwinsGameCountOne'),
                  t('quickwinsGameCount'),
                )})
              </span>
            </span>
            <span className="guide-localisation__chevron" aria-hidden>
              {isOpen ? '▲' : '▼'}
            </span>
          </button>
        </section>,
      );
    }
    if (collapsed.has(key)) continue;
    const gameId = getGameUuid(game);
    pageBlocks.push(
      <QuickwinGameCard
        key={gameId || titleKey(game)}
        game={game}
        groupNames={groupLabels.get(gameId) ?? []}
        openGame={openGame}
        onRequestLogin={onRequestLogin}
        isAdmin={isAdmin}
        sessionUser={sessionUser}
      />,
    );
  }

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
      ) : flat.length === 0 ? (
        <p className="quickwin-card-note">{t('searchNoResults')}</p>
      ) : (
        <>
          {renderPager()}
          <div className="quickwins-list">{pageBlocks}</div>
          {renderPager()}
        </>
      )}
    </div>
  );
}

function titleKey(game) {
  return String(game?.id ?? game?.slug ?? '');
}

export default QuickwinsPage;
