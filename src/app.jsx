import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './pages/supabaseClient';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import SearchResultsPage from './pages/SearchResultsPage';
import GameDetailPage from "./pages/GameDetailPage";
import { CollectibleKacheln } from './pages/CollectibleKacheln';
import LoginPage from './pages/LoginPage';
import SocialLinkPage from './pages/SocialLinkPage';
import TesterSetupPage from './pages/TesterSetupPage';
import MaintenancePage from './pages/MaintenancePage';
import BetaRegistrationPage from './pages/BetaRegistrationPage';
import {
  hasMaintenanceBypass,
  isGateAccount,
  normalizeEmail,
} from './lib/maintenanceAccess';
import {
  handleSocialLinkRedirect,
  signInWithGatePassword,
} from './lib/trophyBaseAuth';
import {
  getGameIdFromPath,
  getViewFromPath,
  navigateToGame,
  navigateToHome,
  canRenderAppContent,
  resolveAppViewForSession,
} from './lib/routeUtils';
import { searchGames } from './lib/gameSearch';
import ProfilePage from './pages/ProfilePage';
import QaAdminPage from './pages/QaAdminPage';
import { TABLES } from './lib/gameSchema';
import { fetchGameGuideBundle, resolveGameId } from './lib/guideQueries';
import { fetchGameByRouteRef } from './lib/gameQueries';
import { useLocale } from './context/LocaleContext';
import {
  countEarnedInList,
  earnedIdsToUnlockedMap,
  fetchGameTrophiesWithEarned,
} from './lib/earnedTrophyQueries';
import { getTrophyIdKey } from './lib/trophyQueries';
import {
  loadCompletedGuideItems,
  saveCompletedGuideItems,
} from './lib/guideProgressStorage';
import { ErrorReportProvider } from './context/ErrorReportContext';
import { WatchlistProvider } from './context/WatchlistContext';

function App() {
  const { globalLocale, t } = useLocale();
  // 1. Wir schauen beim Start direkt in die URL des Browsers!
  const [currentView, setCurrentView] = useState(() => {
    const pathView = getViewFromPath(window.location.pathname);
    if (pathView) return pathView;
    return 'home';
  });

  // Wartungs-Konfiguration
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(true);

  // 🔐 Einzigartiger State für den User
  const [sessionUser, setSessionUser] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dbOk, setDbOk] = useState(null);

  const [selectedGame, setSelectedGame] = useState(null);
  const [activeTrophies, setActiveTrophies] = useState([]);
  const [guideItems, setGuideItems] = useState([]);
  const [chapterItems, setChapterItems] = useState([]);
  const [bossItems, setBossItems] = useState([]);
  const [loadingGuide, setLoadingGuide] = useState(false);
  const [unlockedTrophies, setUnlockedTrophies] = useState({});
  const [earnedTrophyIds, setEarnedTrophyIds] = useState(() => new Set());
  const [hideCompleted, setHideCompleted] = useState(false);
  const [completedGuideItems, setCompletedGuideItems] = useState(loadCompletedGuideItems);
  const [activeTab, setActiveTab] = useState('reiter0');

  // Session + OAuth-Redirect nach linkIdentity (Schritt 4: maintenance_bypass setzen)
  useEffect(() => {
    let cancelled = false;

    async function initAuth() {
      const redirectResult = await handleSocialLinkRedirect(supabase);
      if (cancelled) return;

      if (redirectResult.handled && redirectResult.ok) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!cancelled && session?.user) {
          setSessionUser(session.user);
          const path = window.location.pathname;
          setCurrentView(resolveAppViewForSession(session.user, path));
        }
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled) {
        setSessionUser(session?.user ?? null);
        const path = window.location.pathname;
        const onBetaRoute = path === '/beta' || path.startsWith('/beta/');
        if (session?.user && isMaintenanceMode && !onBetaRoute) {
          setCurrentView(resolveAppViewForSession(session.user, path));
        }
      }
    }

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSessionUser(session?.user ?? null);

        if (
          isMaintenanceMode &&
          session?.user &&
          (event === 'USER_UPDATED' || event === 'SIGNED_IN')
        ) {
          const path = window.location.pathname;
          const onBetaRoute = path === '/beta' || path.startsWith('/beta/');
          if (onBetaRoute) return;

          // Deep Links bei Session-Restore nicht überschreiben (F5 auf /guide/…)
          if (getViewFromPath(path)) return;

          const redirectResult = await handleSocialLinkRedirect(supabase);
          if (redirectResult.handled && redirectResult.ok) {
            setCurrentView(resolveAppViewForSession(session.user, path));
            return;
          }
          setCurrentView(resolveAppViewForSession(session.user, path));
        }
      },
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [isMaintenanceMode]);

  // Deep Link / F5: Spieldaten aus URL laden
  const loadGameFromUrl = useCallback(async (pathname = window.location.pathname) => {
    const gameIdFromUrl = getGameIdFromPath(pathname);
    if (!gameIdFromUrl) return;

    if (!pathname.startsWith('/guide/')) {
      navigateToGame(gameIdFromUrl, { replace: true });
    }

    setCurrentView('game_info');
    setLoadingGuide(true);

    const { data: gameData, error: gameError } = await fetchGameByRouteRef(
      supabase,
      gameIdFromUrl,
      globalLocale,
    );

    if (gameError) {
      console.error('Guide Deep-Link:', gameError.message, { gameId: gameIdFromUrl });
    }

    if (gameData) {
      setSelectedGame(gameData);
      setUnlockedTrophies({});
      setEarnedTrophyIds(new Set());

      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? null;

      const { trophies, earnedIds } = await fetchGameTrophiesWithEarned(
        supabase,
        userId,
        gameData,
        globalLocale,
      );
      setActiveTrophies(trophies);
      setEarnedTrophyIds(earnedIds);
      if (earnedIds.size > 0) {
        setUnlockedTrophies(earnedIdsToUnlockedMap(earnedIds));
      }

      const { chapters, guides, bosses } = await fetchGameGuideBundle(
        supabase,
        gameData,
        globalLocale,
      );
      setChapterItems(chapters);
      setGuideItems(guides);
      setBossItems(bosses);
    } else {
      setSelectedGame(null);
      setActiveTrophies([]);
    }

    setLoadingGuide(false);
  }, [globalLocale]);

  useEffect(() => {
    loadGameFromUrl();
  }, [loadGameFromUrl]);

  // Trophäen-Texte + Verdienst-Status bei Login oder globaler Sprachänderung
  useEffect(() => {
    if (currentView !== 'game_info' || !selectedGame) return;

    let cancelled = false;
    const gameId = resolveGameId(selectedGame);
    if (!gameId) return;

    async function reloadTrophies() {
      const userId = sessionUser?.id ?? null;
      const { trophies, earnedIds } = await fetchGameTrophiesWithEarned(
        supabase,
        userId,
        selectedGame,
        globalLocale,
      );
      if (cancelled) return;

      setActiveTrophies(trophies);
      setEarnedTrophyIds(earnedIds);
      setUnlockedTrophies((prev) => {
        const next = { ...prev };
        for (const id of earnedIds) next[id] = true;
        return next;
      });
    }

    reloadTrophies();
    return () => {
      cancelled = true;
    };
  }, [sessionUser?.id, currentView, selectedGame, globalLocale]);

  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname;
      const pathView = getViewFromPath(path);

      if (pathView === 'game_info') {
        setCurrentView('game_info');
        loadGameFromUrl(path);
        return;
      }

      if (pathView) {
        setCurrentView(pathView);
        setSelectedGame(null);
        return;
      }

      setCurrentView('home');
      setSelectedGame(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [loadGameFromUrl]);

  const exitQaAdmin = () => {
    window.history.pushState({}, '', '/');
    setCurrentView('home');
  };

  // Testet die DB-Verbindung beim Laden
  useEffect(() => {
    async function initDb() {
      const { error } = await supabase.from(TABLES.games).select('id').limit(1);
      setDbOk(!error);
    }
    initDb();
  }, []);

  // 🛠️ FUNKTION 1: Der normale Login
  const handleLogin = async (email, password) => {
    const result = await signInWithGatePassword(supabase, email, password);

    if (!result.ok) {
      const hint = result.hint ? `\n\nHinweis: ${result.hint}` : '';
      alert(`Login fehlgeschlagen: ${result.error.message}${hint}`);
      return;
    }

    if (result.user) setSessionUser(result.user);
    setCurrentView(result.nextView);
  };

  // 🛠️ FUNKTION 2: Der Klon-Prozess (Korrektur: console.log statt print!)
  const handleCreateOwnAccount = async (newEmail, newPassword) => {
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: newEmail,
        password: newPassword,
      });

      if (signUpError) throw new Error(`Registrierung fehlgeschlagen: ${signUpError.message}`);
      console.log("🚀 Neuer Benutzer-Account erfolgreich angelegt!");

      const randomCryptoPassword = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2) + Date.now();
      
      const { error: passwordError } = await supabase.auth.updateUser({
        password: randomCryptoPassword
      });

      if (passwordError) console.log("⚠️ Warnung beim Tor-Verriegeln: " + passwordError.message);
      else console.log("🔐 Das Tester-Tor wurde erfolgreich verriegelt!");

      await supabase.auth.signOut();

      const { error: autoLoginError } = await supabase.auth.signInWithPassword({
        email: newEmail,
        password: newPassword
      });

      if (autoLoginError) {
        alert("Account erstellt! Bitte melde dich jetzt mit deinen Daten an.");
        setCurrentView('login');
      } else {
        alert("🎉 Willkommen an Bord! Dein persönlicher Account ist aktiv.");
        setCurrentView('home');
      }

    } catch (err) {
      alert(err.message);
    }
  };

  // 🛠️ FUNKTION 3: Ausloggen
  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.history.pushState({}, '', '/');
    setCurrentView(isMaintenanceMode ? 'login' : 'home');
  };

  const runSearch = async (queryOverride) => {
    const q = (typeof queryOverride === 'string' ? queryOverride : searchQuery).trim();
    if (!q) return;
    if (typeof queryOverride === 'string') setSearchQuery(queryOverride);
    setLoading(true);
    setCurrentView('search-results');
    const { data, error } = await searchGames(supabase, q);
    if (error) {
      console.error('Suche:', error.message);
    }
    setSearchResults(data || []);
    setLoading(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    await runSearch();
  };

  const openGuide = async (game) => {
    setSelectedGame(game);
    setCurrentView('game_info');
    setLoadingGuide(true);
    setActiveTrophies([]);
    setGuideItems([]);
    setChapterItems([]);
    setBossItems([]);
    setUnlockedTrophies({});
    setEarnedTrophyIds(new Set());

    const gameId = resolveGameId(game);
    if (gameId) {
      navigateToGame(game);

      const userId = sessionUser?.id ?? null;
      const { trophies, earnedIds } = await fetchGameTrophiesWithEarned(
        supabase,
        userId,
        game,
        globalLocale,
      );
      setActiveTrophies(trophies);
      setEarnedTrophyIds(earnedIds);
      if (earnedIds.size > 0) {
        setUnlockedTrophies(earnedIdsToUnlockedMap(earnedIds));
      }

      const { chapters, guides, bosses } = await fetchGameGuideBundle(
        supabase,
        game,
        globalLocale,
      );
      setChapterItems(chapters);
      setGuideItems(guides);
      setBossItems(bosses);
    }
    setLoadingGuide(false);
  };

  const toggleTrophy = (id) => {
    if (earnedTrophyIds.has(id)) return;
    setUnlockedTrophies(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleGuideItemCompleted = (id) => {
    setCompletedGuideItems((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next[id]) delete next[id];
      saveCompletedGuideItems(next);
      return next;
    });
  };

  const completedCount = useMemo(() => {
    const earned = countEarnedInList(activeTrophies, earnedTrophyIds);
    const manual = activeTrophies.filter((t) => {
      const key = getTrophyIdKey(t);
      return !earnedTrophyIds.has(key) && unlockedTrophies[key];
    }).length;
    return earned + manual;
  }, [activeTrophies, earnedTrophyIds, unlockedTrophies]);
  const progressPercent = activeTrophies.length > 0 ? Math.round((completedCount / activeTrophies.length) * 100) : 0;

  const handleBetaComplete = () => {
    window.history.pushState({}, '', '/');
    setCurrentView('home');
  };

  const goHome = useCallback(() => {
    setCurrentView('home');
    setSelectedGame(null);
    navigateToHome();
  }, []);

  const maintenanceBypass = hasMaintenanceBypass(sessionUser);
  const isQaAdminView = currentView === 'qa_admin';

  const renderMaintenanceAllowedView = () => {
    if (currentView === 'beta') {
      return (
        <BetaRegistrationPage
          sessionUser={sessionUser}
          onSessionEstablished={setSessionUser}
          onComplete={handleBetaComplete}
        />
      );
    }
    if (currentView === 'login') {
      return <LoginPage onLogin={handleLogin} />;
    }
    if (currentView === 'social-link') {
      return <SocialLinkPage sessionUser={sessionUser} onLogout={handleLogout} />;
    }
    if (currentView === 'tester-setup') {
      return <TesterSetupPage onCreateAccount={handleCreateOwnAccount} />;
    }
    return <MaintenancePage setCurrentView={setCurrentView} />;
  };

  if (isQaAdminView) {
    return (
      <QaAdminPage
        sessionUser={sessionUser}
        onExit={exitQaAdmin}
      />
    );
  }

  if (currentView === 'beta') {
    return (
      <BetaRegistrationPage
        sessionUser={sessionUser}
        onSessionEstablished={setSessionUser}
        onComplete={handleBetaComplete}
      />
    );
  }

  return (
    <ErrorReportProvider
      sessionUser={sessionUser}
      onRequestLogin={() => setCurrentView('login')}
    >
    <WatchlistProvider sessionUser={sessionUser}>
    <div className="min-h-screen w-full max-w-full min-w-0 overflow-x-hidden flex flex-col bg-[#121314] text-gray-200 font-sans antialiased">
      
      <Header 
        setCurrentView={setCurrentView} 
        sessionUser={sessionUser} 
        onLogout={handleLogout} 
      />

      <main className="pb-24 flex-1 flex flex-col justify-center w-full max-w-full min-w-0 overflow-x-hidden">
        
        {/* ─── WARTUNGSMODUS: login + social-link nie blockieren ─── */}
        {canRenderAppContent({
          isMaintenanceMode,
          maintenanceBypass,
          sessionUser,
          currentView,
        }) ? (
          <>
            {currentView === 'home' && (
              <HomePage 
                openGame={openGuide} 
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                handleSearchSubmit={handleSearchSubmit}
                onCategorySearch={runSearch}
                sessionUser={sessionUser}
                setCurrentView={setCurrentView}
                onRequestLogin={() => setCurrentView('login')}
              />
            )}

            {currentView === 'profile' && (
              <ProfilePage
                sessionUser={sessionUser}
                setCurrentView={setCurrentView}
                onRequestLogin={() => setCurrentView('login')}
                openGame={openGuide}
              />
            )}

            {currentView === 'search-results' && (
              <SearchResultsPage
                searchResults={searchResults}
                openGame={openGuide}
                loading={loading}
                onRequestLogin={() => setCurrentView('login')}
              />
            )}

            {currentView === 'game_info' && !selectedGame && loadingGuide && (
              <p className="text-center text-sm text-zinc-500 font-mono py-16 animate-pulse">
                Guide wird geladen…
              </p>
            )}

            {currentView === 'game_info' && selectedGame && (
              <GameDetailPage 
                currentView={currentView}
                setCurrentView={setCurrentView}
                selectedGame={selectedGame}
                activeTrophies={activeTrophies}
                unlockedTrophies={unlockedTrophies}
                earnedTrophyIds={earnedTrophyIds}
                toggleTrophy={toggleTrophy}
                completedCount={completedCount}
                progressPercent={progressPercent}
                hideCompleted={hideCompleted}
                setHideCompleted={setHideCompleted}
                completedGuideItems={completedGuideItems}
                toggleGuideItemCompleted={toggleGuideItemCompleted}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                loadingGuide={loadingGuide}
                guideItems={guideItems}
                chapterItems={chapterItems}
                bossItems={bossItems}
                onRequestLogin={() => setCurrentView('login')}
                onNavigateHome={goHome}
              />
            )}

            {currentView === 'login' && <LoginPage onLogin={handleLogin} />}
            {currentView === 'tester-setup' && <TesterSetupPage onCreateAccount={handleCreateOwnAccount} />}
          </>
        ) : (
          renderMaintenanceAllowedView()
        )}

      </main>

      <footer className="w-full max-w-full min-w-0 overflow-x-hidden bg-[#1a1b1c] border-t border-t-zinc-800/80 px-4 sm:px-6 md:px-8 py-4 flex flex-col sm:flex-row flex-wrap justify-between items-center gap-4 text-xs text-zinc-500">
        <div className="flex flex-wrap gap-4 sm:gap-6 min-w-0">
          <a href="/impressum" className="hover:text-zinc-300 transition">{t('impressum')}</a>
          <a href="/datenschutz" className="hover:text-zinc-300 transition">{t('privacy')}</a>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] min-w-0 max-w-full">
          <span className={`w-2 h-2 flex-shrink-0 rounded-full ${dbOk === true ? 'bg-[#00ff66] shadow-[0_0_8px_#00ff66]' : dbOk === false ? 'bg-red-500' : 'bg-zinc-600'}`}></span>
          <span className="truncate">
            {t('dbLabel')}: {dbOk === null ? '…' : dbOk ? t('dbConnected') : t('dbFailed')}
          </span>
        </div>
      </footer>

    </div>
    </WatchlistProvider>
    </ErrorReportProvider>
  );
}

export default App;