import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './pages/supabaseClient';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import SearchResultsPage from './pages/SearchResultsPage';
import AdvancedSearchPage from './pages/AdvancedSearchPage';
import GameDetailPage from "./pages/GameDetailPage";
import LoginPage from './pages/LoginPage';
import SocialLinkPage from './pages/SocialLinkPage';
import TesterSetupPage from './pages/TesterSetupPage';
import MaintenancePage from './pages/MaintenancePage';
import BetaRegistrationPage from './pages/BetaRegistrationPage';
import { hasMaintenanceBypass } from './lib/maintenanceAccess';
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
  writeAppPath,
  gameGuidePath,
  parsePrettyGamePath,
  navigateToImpressum,
  navigateToPrivacy,
  navigateToAdvancedSearch,
} from './lib/routeUtils';
import { searchGames } from './lib/gameSearch';
import ProfilePage from './pages/ProfilePage';
import QaAdminPage from './pages/QaAdminPage';
import { TABLES } from './lib/gameSchema';
import { fetchGameGuideBundle, resolveGameId } from './lib/guideQueries';
import { fetchGameByRouteRef, fetchGameBySlug } from './lib/gameQueries';
import { useLocale } from './context/LocaleContext';
import {
  countEarnedInList,
  fetchGameTrophiesWithEarned,
} from './lib/earnedTrophyQueries';
import { getTrophyIdKey } from './lib/trophyQueries';
import { getGameUuid } from './lib/gameModel';
import { applyGameSeoLinks, applyPathCanonical, clearGameSeoLinks } from './lib/seoHead';
import {
  loadCompletedGuideItems,
  saveCompletedGuideItems,
} from './lib/guideProgressStorage';
import {
  mergeUnlockedTrophies,
  saveUnlockedTrophies,
} from './lib/trophyProgressStorage';
import { ErrorReportProvider } from './context/ErrorReportContext';
import { WatchlistProvider } from './context/WatchlistContext';
import { useMediaConsent } from './context/MediaConsentContext';
import SiteFooter from './components/SiteFooter';
import MediaConsentBanner from './components/MediaConsentBanner';
import { LegalNoticePage, PrivacyPage } from './pages/LegalPages';

function App() {
  const { globalLocale } = useLocale();
  const { youtube, revokeYoutube } = useMediaConsent();
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
    const pretty = parsePrettyGamePath(pathname);
    const legacyRef = getGameIdFromPath(pathname);
    if (!pretty && !legacyRef) return;

    setCurrentView('game_info');
    setLoadingGuide(true);

    const localeForPage = pretty?.locale || globalLocale;
    let gameData;
    let gameError;

    if (pretty) {
      const result = await fetchGameBySlug(supabase, pretty.hardware, pretty.slug, localeForPage);
      gameData = result.data;
      gameError = result.error;
    } else {
      const result = await fetchGameByRouteRef(supabase, legacyRef, localeForPage);
      gameData = result.data;
      gameError = result.error;
    }

    if (gameError) {
      console.error('Guide Deep-Link:', gameError.message, {
        path: pathname,
        ref: pretty ? `${pretty.hardware}/${pretty.slug}` : legacyRef,
      });
    }

    if (gameData) {
      writeAppPath(gameGuidePath(gameData, localeForPage), { replace: true });

      setSelectedGame(gameData);
      const gameUuid = getGameUuid(gameData);
      setUnlockedTrophies(mergeUnlockedTrophies(gameUuid));
      setEarnedTrophyIds(new Set());

      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? null;

      const { trophies, earnedIds } = await fetchGameTrophiesWithEarned(
        supabase,
        userId,
        gameData,
        localeForPage,
      );
      setActiveTrophies(trophies);
      setEarnedTrophyIds(earnedIds);
      setUnlockedTrophies(mergeUnlockedTrophies(gameUuid, earnedIds));

      const { chapters, guides, bosses } = await fetchGameGuideBundle(
        supabase,
        gameData,
        localeForPage,
      );
      setChapterItems(chapters);
      setGuideItems(guides);
      setBossItems(bosses);
    } else {
      setSelectedGame(null);
      setActiveTrophies([]);
      setUnlockedTrophies({});
      setEarnedTrophyIds(new Set());
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
    const gameUuid = getGameUuid(selectedGame);

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
      setUnlockedTrophies(mergeUnlockedTrophies(gameUuid, earnedIds));
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
    const gameUuid = getGameUuid(game);
    setUnlockedTrophies(mergeUnlockedTrophies(gameUuid));
    setEarnedTrophyIds(new Set());

    const gameId = resolveGameId(game);
    if (gameId) {
      navigateToGame(game, { locale: globalLocale });

      const userId = sessionUser?.id ?? null;
      const { trophies, earnedIds } = await fetchGameTrophiesWithEarned(
        supabase,
        userId,
        game,
        globalLocale,
      );
      setActiveTrophies(trophies);
      setEarnedTrophyIds(earnedIds);
      setUnlockedTrophies(mergeUnlockedTrophies(gameUuid, earnedIds));

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
    const gameUuid = getGameUuid(selectedGame);
    setUnlockedTrophies((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next[id]) delete next[id];
      saveUnlockedTrophies(gameUuid, next, earnedTrophyIds);
      return next;
    });
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

  useEffect(() => {
    if (currentView === 'impressum') {
      applyPathCanonical('/impressum');
      return () => clearGameSeoLinks();
    }
    if (currentView === 'datenschutz') {
      applyPathCanonical('/datenschutz');
      return () => clearGameSeoLinks();
    }
    if (currentView === 'advanced-search') {
      applyPathCanonical('/suche');
      return () => clearGameSeoLinks();
    }
    if (currentView !== 'game_info' || !selectedGame) {
      clearGameSeoLinks();
      return undefined;
    }
    applyGameSeoLinks({ locale: globalLocale, game: selectedGame });
    return () => clearGameSeoLinks();
  }, [currentView, selectedGame, globalLocale]);

  const goHome = useCallback(() => {
    setCurrentView('home');
    setSelectedGame(null);
    navigateToHome();
  }, []);

  const openImpressum = useCallback(() => {
    setCurrentView('impressum');
    setSelectedGame(null);
    navigateToImpressum();
    window.scrollTo(0, 0);
  }, []);

  const openPrivacy = useCallback(() => {
    setCurrentView('datenschutz');
    setSelectedGame(null);
    navigateToPrivacy();
    window.scrollTo(0, 0);
  }, []);

  const openAdvancedSearch = useCallback(() => {
    setCurrentView('advanced-search');
    setSelectedGame(null);
    navigateToAdvancedSearch();
    window.scrollTo(0, 0);
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
    if (currentView === 'impressum') {
      return <LegalNoticePage onBack={goHome} />;
    }
    if (currentView === 'datenschutz') {
      return (
        <PrivacyPage
          onBack={goHome}
          youtubeConsent={youtube}
          onRevokeYoutube={revokeYoutube}
        />
      );
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

      <main
        className={`flex-1 flex flex-col w-full max-w-full min-w-0 overflow-x-hidden ${
          currentView === 'impressum' ||
          currentView === 'datenschutz' ||
          currentView === 'advanced-search'
            ? 'justify-start'
            : 'justify-center'
        }`}
      >
        
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
                onRequestLogin={() => setCurrentView('login')}
                onOpenAdvancedSearch={openAdvancedSearch}
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

            {currentView === 'advanced-search' && (
              <AdvancedSearchPage
                openGame={openGuide}
                onRequestLogin={() => setCurrentView('login')}
                onBack={goHome}
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
            {currentView === 'impressum' && <LegalNoticePage onBack={goHome} />}
            {currentView === 'datenschutz' && (
              <PrivacyPage
                onBack={goHome}
                youtubeConsent={youtube}
                onRevokeYoutube={revokeYoutube}
              />
            )}
          </>
        ) : (
          renderMaintenanceAllowedView()
        )}

      </main>

      <MediaConsentBanner onOpenPrivacy={openPrivacy} />
      <SiteFooter
        dbOk={dbOk}
        onOpenImpressum={openImpressum}
        onOpenPrivacy={openPrivacy}
      />

    </div>
    </WatchlistProvider>
    </ErrorReportProvider>
  );
}

export default App;