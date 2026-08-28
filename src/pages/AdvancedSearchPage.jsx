import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import SearchResultsPage from './SearchResultsPage';
import { CONSOLE_FILTER_OPTIONS, searchGamesAdvanced } from '../lib/gameSearch';
import {
  getViewFromPath,
  navigateToAdvancedSearch,
  parseAdvancedSearchParams,
} from '../lib/routeUtils';
import { useLocale } from '../context/LocaleContext';
import '../styles/home.css';

function emptyFilters() {
  return { title: '', developer: '', genre: '', console: '' };
}

function hasAnyFilter(filters) {
  return Object.values(filters).some((value) => String(value ?? '').trim());
}

function AdvancedSearchPage({ openGame, onRequestLogin, onBack }) {
  const { t, globalLocale } = useLocale();
  const [filters, setFilters] = useState(() => parseAdvancedSearchParams());
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [formError, setFormError] = useState(false);

  const runSearch = async (nextFilters, { replace = true, updateUrl = true } = {}) => {
    if (!hasAnyFilter(nextFilters)) {
      setFormError(true);
      return;
    }

    setFormError(false);
    setLoading(true);
    setHasSearched(true);
    if (updateUrl) navigateToAdvancedSearch(nextFilters, { replace });

    const { data, error } = await searchGamesAdvanced(supabase, nextFilters, {
      locale: globalLocale,
    });
    if (error) {
      console.error('Erweiterte Suche:', error.message);
    }
    setResults(data || []);
    setLoading(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const previous = document.title;
    document.title = `${t('advancedSearch')} · TrophyBase.app`;
    return () => {
      document.title = previous;
    };
  }, [t]);

  useEffect(() => {
    const initial = parseAdvancedSearchParams();
    if (hasAnyFilter(initial)) {
      runSearch(initial, { replace: true });
    }

    const onPop = () => {
      if (getViewFromPath(window.location.pathname) !== 'advanced-search') return;
      const next = parseAdvancedSearchParams();
      setFilters(next);
      if (hasAnyFilter(next)) {
        runSearch(next, { updateUrl: false });
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
    setResults([]);
    setHasSearched(false);
    setFormError(false);
    navigateToAdvancedSearch(next, { replace: true });
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
            value={filters.console}
            onChange={updateField('console')}
          >
            {CONSOLE_FILTER_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.labelKey ? t(option.labelKey) : option.label}
              </option>
            ))}
          </select>
        </div>

        {formError ? (
          <p className="advanced-search-error">{t('advancedSearchEmpty')}</p>
        ) : null}

        <div className="advanced-search-actions">
          <button type="submit" className="advanced-search-submit">
            {t('searchSubmit')}
          </button>
          <button type="button" className="advanced-search-reset" onClick={handleReset}>
            {t('searchReset')}
          </button>
        </div>
      </form>

      {hasSearched && (
        <SearchResultsPage
          searchResults={results}
          openGame={openGame}
          loading={loading}
          onRequestLogin={onRequestLogin}
          compact
        />
      )}
    </div>
  );
}

export default AdvancedSearchPage;
