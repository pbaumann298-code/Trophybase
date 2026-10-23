import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import SearchResultsPage from './SearchResultsPage';
import { CONSOLE_FILTER_OPTIONS, searchGamesAdvanced } from '../lib/gameSearch';
import { fetchHomeTagDefs, translateHomeTag } from '../lib/homeTagDefs';
import {
  QUICKWINS_PATH,
  getViewFromPath,
  navigateToAdvancedSearch,
  parseAdvancedSearchParams,
  parseExcludeQuickwins,
  parseIncludeTrophiesOnly,
  parseSearchPageParam,
} from '../lib/routeUtils';
import { useLocale } from '../context/LocaleContext';
import SearchSkipQuickwins from '../components/SearchSkipQuickwins';
import SearchIncludeTrophiesOnly from '../components/SearchIncludeTrophiesOnly';
import '../styles/home.css';

/** Fallback-Pfade, falls App die lokalisierten URLs nicht übergibt. */
const FALLBACK_QUICKWINS = '/quickwins';
const FALLBACK_EASY = '/easy-platins';
const FALLBACK_SERVERTOT = '/servertot';

function emptyFilters() {
  return { title: '', developer: '', genre: '', console: '', tag: '', onlineMode: '' };
}

function hasAnyFilter(filters) {
  return Object.values(filters).some((value) => String(value ?? '').trim());
}

function CatalogTile({ href, onClick, src, title, linked = false }) {
  const className = linked ? 'advanced-search-tile' : 'advanced-search-tile advanced-search-tile--static';
  const body = (
    <article className="home-tile" style={{ '--tile-accent': '#00ff66' }}>
      <div className="home-tile-cover-wrap">
        <img src={src} className="home-tile-cover" alt="" loading="lazy" />
        <div className="home-tile-shine" aria-hidden />
      </div>
      <div className="home-tile-meta">
        <p className="home-tile-title">{title}</p>
      </div>
    </article>
  );

  if (!linked) {
    return <div className={className}>{body}</div>;
  }

  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        onClick?.();
      }}
    >
      {body}
    </a>
  );
}

function AdvancedSearchPage({
  openGame,
  onRequestLogin,
  onBack,
  onOpenQuickwins,
  onOpenEasyPlatins,
  onOpenServertot,
  quickwinsPath = FALLBACK_QUICKWINS,
  easyPlatinsPath = FALLBACK_EASY,
  servertotPath = FALLBACK_SERVERTOT,
  includeReady = false,
  sessionUser = null,
}) {
  const { t, globalLocale } = useLocale();
  const [filters, setFilters] = useState(() => parseAdvancedSearchParams());
  const [tagOptions, setTagOptions] = useState([]);
  const [excludeQuickwins, setExcludeQuickwins] = useState(() => parseExcludeQuickwins());
  const [includeTrophiesOnly, setIncludeTrophiesOnly] = useState(
    () => Boolean(sessionUser) && parseIncludeTrophiesOnly(),
  );
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [formError, setFormError] = useState(false);
  const [page, setPage] = useState(() => parseSearchPageParam());

  const runSearch = async (
    nextFilters,
    {
      replace = true,
      updateUrl = true,
      exclude = excludeQuickwins,
      trophiesOnly = includeTrophiesOnly,
    } = {},
  ) => {
    if (!hasAnyFilter(nextFilters)) {
      setFormError(true);
      return;
    }

    const allowTrophies = Boolean(sessionUser) && trophiesOnly;
    setFormError(false);
    setLoading(true);
    setHasSearched(true);
    if (updateUrl) {
      setPage(1);
      navigateToAdvancedSearch(nextFilters, {
        replace,
        page: 1,
        excludeQuickwins: exclude,
        includeTrophiesOnly: allowTrophies,
      });
    }

    const { data, error } = await searchGamesAdvanced(supabase, nextFilters, {
      locale: globalLocale,
      includeReady: allowTrophies ? false : includeReady,
      excludeQuickwins: exclude,
      includeTrophiesOnly: allowTrophies,
    });
    if (error) {
      console.error('Erweiterte Suche:', error.message);
    }
    setResults(data || []);
    setLoading(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    let cancelled = false;
    fetchHomeTagDefs(supabase).then(({ data }) => {
      if (!cancelled && data) {
        setTagOptions(data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const previous = document.title;
    document.title = `${t('advancedSearch')} · TrophyBase.app`;
    return () => {
      document.title = previous;
    };
  }, [t]);

  useEffect(() => {
    if (!sessionUser && includeTrophiesOnly) setIncludeTrophiesOnly(false);
  }, [sessionUser, includeTrophiesOnly]);

  useEffect(() => {
    const initial = parseAdvancedSearchParams();
    const initialExclude = parseExcludeQuickwins();
    const initialTrophies = Boolean(sessionUser) && parseIncludeTrophiesOnly();
    if (hasAnyFilter(initial)) {
      runSearch(initial, {
        replace: true,
        updateUrl: false,
        exclude: initialExclude,
        trophiesOnly: initialTrophies,
      });
    }

    const onPop = () => {
      if (getViewFromPath(window.location.pathname) !== 'advanced-search') return;
      const next = parseAdvancedSearchParams();
      const nextExclude = parseExcludeQuickwins();
      const nextTrophies = Boolean(sessionUser) && parseIncludeTrophiesOnly();
      setFilters(next);
      setExcludeQuickwins(nextExclude);
      setIncludeTrophiesOnly(nextTrophies);
      setPage(parseSearchPageParam());
      if (hasAnyFilter(next)) {
        runSearch(next, { updateUrl: false, exclude: nextExclude, trophiesOnly: nextTrophies });
      } else {
        setResults([]);
        setHasSearched(false);
        setFormError(false);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // Deep-Link: nur beim ersten Öffnen der Seite anstoßen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateField = (key) => (event) => {
    setFilters((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    runSearch(filters, { replace: false });
  };

  const handleReset = () => {
    const next = emptyFilters();
    setFilters(next);
    setExcludeQuickwins(true);
    setIncludeTrophiesOnly(false);
    setResults([]);
    setHasSearched(false);
    setFormError(false);
    navigateToAdvancedSearch(next, {
      replace: true,
      excludeQuickwins: true,
      includeTrophiesOnly: false,
    });
  };

  return (
    <div className="advanced-search-page">
      <button
        type="button"
        onClick={onBack}
        className="text-xs font-mono text-zinc-500 hover:text-[#00ff66] bg-transparent border-none cursor-pointer mb-6 px-0"
      >
        {t('searchBack')}
      </button>

      <h1 className="text-2xl font-bold text-white tracking-tight mb-2">
        {t('advancedSearch')}
      </h1>
      <p className="text-sm text-zinc-500 leading-relaxed max-w-xl">
        {t('advancedSearchHint')}
      </p>

      <form onSubmit={handleSubmit} className="advanced-search-form">
        <div className="advanced-search-field">
          <label htmlFor="advanced-title">{t('searchTitle')}</label>
          <input
            id="advanced-title"
            type="text"
            value={filters.title}
            onChange={updateField('title')}
            autoComplete="off"
          />
        </div>
        <div className="advanced-search-field">
          <label htmlFor="advanced-developer">{t('searchDeveloper')}</label>
          <input
            id="advanced-developer"
            type="text"
            value={filters.developer}
            onChange={updateField('developer')}
            autoComplete="off"
          />
        </div>
        <div className="advanced-search-field">
          <label htmlFor="advanced-genre">{t('searchGenre')}</label>
          <input
            id="advanced-genre"
            type="text"
            value={filters.genre}
            onChange={updateField('genre')}
            autoComplete="off"
          />
        </div>
        <div className="advanced-search-field">
          <label htmlFor="advanced-console">{t('searchConsole')}</label>
          <select
            id="advanced-console"
            value={filters.console || ''}
            onChange={updateField('console')}
          >
            {CONSOLE_FILTER_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.labelKey ? t(option.labelKey) : option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="advanced-search-field">
          <label htmlFor="advanced-tag">{t('searchCategoryLabel')}</label>
          <select
            id="advanced-tag"
            value={filters.tag || ''}
            onChange={updateField('tag')}
          >
            <option value="">{t('searchCategoryAll')}</option>
            {tagOptions.map((opt) => (
              <option key={opt.slug} value={opt.slug}>
                {translateHomeTag(opt.slug, globalLocale, opt.label)}
              </option>
            ))}
          </select>
        </div>
        <div className="advanced-search-field">
          <label htmlFor="advanced-online">{t('searchOnlineLabel')}</label>
          <select
            id="advanced-online"
            value={filters.onlineMode || ''}
            onChange={updateField('onlineMode')}
          >
            <option value="">{t('searchOnlineAll')}</option>
            <option value="offline">{t('searchOnlineOffline')}</option>
            <option value="online">{t('searchOnlineWith')}</option>
          </select>
        </div>

        {formError ? (
          <p className="advanced-search-error">{t('advancedSearchEmpty')}</p>
        ) : null}

        <div className="advanced-search-options">
          <SearchSkipQuickwins
            id="advanced-skip-quickwins"
            checked={excludeQuickwins}
            onChange={setExcludeQuickwins}
          />
          {sessionUser ? (
            <SearchIncludeTrophiesOnly
              id="advanced-include-trophies-only"
              checked={includeTrophiesOnly}
              onChange={setIncludeTrophiesOnly}
            />
          ) : null}
        </div>

        <div className="advanced-search-actions">
          <button type="submit" className="advanced-search-submit">
            {t('searchSubmit')}
          </button>
          <button type="button" className="advanced-search-reset" onClick={handleReset}>
            {t('searchReset')}
          </button>
        </div>
      </form>

      <div className="advanced-search-tiles" aria-label={t('advancedSearch')}>
        <CatalogTile
          linked
          href={quickwinsPath}
          onClick={onOpenQuickwins}
          src="/images/quickwins-tile.jpg"
          title={t('quickwinsTitle')}
        />
        <CatalogTile
          linked
          href={easyPlatinsPath}
          onClick={onOpenEasyPlatins}
          src="/images/easy-platins-tile.jpg"
          title={t('easyPlatinsTitle')}
        />
        <CatalogTile
          linked
          href={servertotPath}
          onClick={onOpenServertot}
          src="/images/unobtainable-platins-tile.jpg"
          title={t('servertotTitle')}
        />
      </div>

      {hasSearched && (
        <SearchResultsPage
          searchResults={results}
          openGame={openGame}
          loading={loading}
          onRequestLogin={onRequestLogin}
          compact
          isAdmin={includeReady}
          page={page}
          onPageChange={(nextPage) => {
            setPage(nextPage);
            navigateToAdvancedSearch(filters, {
              replace: true,
              page: nextPage,
              excludeQuickwins,
              includeTrophiesOnly: Boolean(sessionUser) && includeTrophiesOnly,
            });
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}
    </div>
  );
}

export default AdvancedSearchPage;
