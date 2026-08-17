import React, { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import Dashboard from '../components/Dashboard';
import CategoryCarousel from '../components/CategoryCarousel';
import { HOME_CATEGORIES, fetchAllHomeCategories } from '../lib/homeCategories';
import { navigateToProfile } from '../lib/routeUtils';
import { useLocale } from '../context/LocaleContext';
import '../styles/home.css';

function HomePage({
  openGame,
  getProp,
  searchQuery,
  setSearchQuery,
  handleSearchSubmit,
  onCategorySearch,
  sessionUser,
  setCurrentView,
  onRequestLogin,
}) {
  const { globalLocale, t } = useLocale();
  const [categoryGames, setCategoryGames] = useState({});
  const [loading, setLoading] = useState(true);
  const searchFormRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const byId = await fetchAllHomeCategories(supabase, getProp);
        if (!cancelled) setCategoryGames(byId);
      } catch (err) {
        console.error('Startseite: Kategorien konnten nicht geladen werden:', err);
        if (!cancelled) setCategoryGames({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [getProp, globalLocale]);

  return (
    <div className="home-landing w-full min-w-0 overflow-x-hidden box-border">
      <header className="home-hero">
        <span className="home-hero-kicker">{t('homeKicker')}</span>
        <h1 className="home-hero-title">{t('homeTitle')}</h1>
        <p className="home-hero-sub">{t('homeSub')}</p>
        <form ref={searchFormRef} onSubmit={handleSearchSubmit} className="home-search">
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="home-search-input"
            aria-label="Spielsuche"
          />
          <button
            type="button"
            className="home-search-icon"
            aria-label="Suche starten"
            onClick={() => searchFormRef.current?.requestSubmit()}
          >
            🔍
          </button>
        </form>
      </header>

      {sessionUser && (
        <Dashboard sessionUser={sessionUser} openGame={openGame} />
      )}

      {sessionUser && (
        <div className="home-inbox-link">
          <button
            type="button"
            onClick={() => {
              setCurrentView('profile');
              navigateToProfile();
            }}
            className="text-xs font-mono uppercase tracking-wider text-zinc-500 hover:text-[#00ff66] transition bg-transparent border-none cursor-pointer"
          >
            Postfach im Profil →
          </button>
        </div>
      )}

      <div className="home-categories" role="list">
        {HOME_CATEGORIES.map((category) => (
          <CategoryCarousel
            key={category.id}
            category={category}
            games={categoryGames[category.id] || []}
            openGame={openGame}
            getProp={getProp}
            loading={loading}
            onCategorySearch={onCategorySearch}
            onRequestLogin={onRequestLogin}
          />
        ))}
      </div>
    </div>
  );
}

export default HomePage;
