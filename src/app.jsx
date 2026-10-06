import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { isAdminUser, staffAppHtmlForPath } from './lib/adminAccess';
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
  navigateToGuideHelp,
  navigateToPrivacy,
  navigateToAdvancedSearch,
  navigateToSimpleSearch,
  parseSimpleSearchParams,
  parseGuideTabParam,
  navigateToGuideTab,
  withGuideTabParam,
  DEFAULT_GUIDE_TAB,
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
import { applyGameSeoLinks, applyHomeSeo, applyPathCanonical, clearGameSeoLinks } from './lib/seoHead';
import { isGameIndexable } from './lib/guidePublication';
import {
  claimCompletedGuideItems,
  collectGuideProgressIds,
  guideProgressStorageKey,
  loadHideCompleted,
  readCompletedGuideItems,
  saveCompletedGuideItems,
  saveHideCompleted,
} from './lib/guideProgressStorage';
import {
  mergeUnlockedTrophies,
  saveUnlockedTrophies,
  unlockedTrophyStorageKey,
} from './lib/trophyProgressStorage';
import { ErrorReportProvider } from './context/ErrorReportContext';
import { WatchlistProvider } from './context/WatchlistContext';
import { useMediaConsent } from './context/MediaConsentContext';
import SiteFooter from './components/SiteFooter';
import MediaConsentBanner from './components/MediaConsentBanner';
import GuideNotFound from './components/GuideNotFound';
import { LegalNoticePage, PrivacyPage } from './pages/LegalPages';
import HowToPage from './pages/HowToPage';

function App() {
  const { globalLocale } = useLocale();
  const { youtube, revokeYoutube } = useMediaConsent();
  const staffAppHtml = staffAppHtmlForPath(window.location.pathname);

  useEffect(() => {
    if (staffAppHtml) window.location.replace(staffAppHtml);
  }, [staffAppHtml]);

  // 1. Wir schauen beim Start direkt in die URL des Browsers!
  const [currentView, setCurrentView] = useState(() => {
    const pathView = getViewFromPath(window.location.pathname);
    if (pathView) return pathView;
    return 'home';
  });

  // Öffentliche Website: keine Baustelle. Admin loggt sich über /admin oder /intranet ein.
  const isMaintenanceMode = false;

  // 🔐 Einzigartiger State für den User
  const [sessionUser, setSessionUser] = useState(null);

  const [searchQuery, setSearchQuery] = useState(() => parseSimpleSearchParams().q);
  const [searchResults, setSearchResults] = useState([]);
  const [searchPage, setSearchPage] = useState(() => parseSimpleSearchParams().page);
  const [loading, setLoading] = useState(false);
  const [guideReturnView, setGuideReturnView] = useState(null);
  const [guideLoadError, setGuideLoadError] = useState(null);
  const lastSearchQueryRef = useRef('');
  const [dbOk, setDbOk] = useState(null);

  const [selectedGame, setSelectedGame] = useState(null);
  const [activeTrophies, setActiveTrophies] = useState([]);
  const [guideItems, setGuideItems] = useState([]);
  const [chapterItems, setChapterItems] = useState([]);
  const [bossItems, setBossItems] = useState([]);
  const [loadingGuide, setLoadingGuide] = useState(false);
  const [unlockedTrophies, setUnlockedTrophies] = useState({});
  const [earnedTrophyIds, setEarnedTrophyIds] = useState(() => new Set());
  const [hideCompleted, setHideCompleted] = useState(loadHideCompleted);
  const [completedGuideItems, setCompletedGuideItems] = useState({});
  const [activeTab, setActiveTab] = useState(
    () => parseGuideTabParam(window.location.search) ?? DEFAULT_GUIDE_TAB,
  );

  useEffect(() => {
    saveHideCompleted(hideCompleted);
  }, [hideCompleted]);

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
    setGuideLoadError(null);
    setActiveTab(parseGuideTabParam(window.location.search) ?? DEFAULT_GUIDE_TAB);

    const localeForPage = globalLocale;
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
      writeAppPath(
        withGuideTabParam(
          gameGuidePath(gameData, localeForPage),
          parseGuideTabParam(window.location.search),
        ),
        { replace: true },
      );

      setSelectedGame(gameData);
      const gameUuid = getGameUuid(gameData);
      setUnlockedTrophies(mergeUnlockedTrophies(gameUuid));
      setEarnedTrophyIds(new Set());

      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? null;

      const loadId = startTrophyLoad();
      const { trophies, earnedIds } = await fetchGameTrophiesWithEarned(
        supabase,
        userId,
        gameData,
        localeForPage,
      );
      if (loadId === trophyLoadRef.current) {
        setActiveTrophies(trophies);
        setEarnedTrophyIds(earnedIds);
        setUnlockedTrophies(mergeUnlockedTrophies(gameUuid, earnedIds));
      }

      const { chapters, guides, bosses } = await fetchGameGuideBundle(
        supabase,
        gameData,
        localeForPage,
      );
      setChapterItems(chapters);
      setGuideItems(guides);
      setBossItems(bosses);
      setCompletedGuideItems(
        claimCompletedGuideItems(
          gameUuid,
          collectGuideProgressIds(chapters, guides, bosses),
        ),
      );
    } else {
      setCompletedGuideItems({});
      setGuideLoadError({
        ref: pretty ? `${pretty.hardware}/${pretty.slug}` : legacyRef,
        detail: gameError?.message ?? null,
      });
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

  const trophyLoadRef = useRef(0);
  const startTrophyLoad = useCallback(() => {
    trophyLoadRef.current += 1;
    return trophyLoadRef.current;
  }, []);
  const handleActiveTrophies = useCallback((trophies, earnedIds, loadId) => {
    if (loadId !== trophyLoadRef.current) return;
    setActiveTrophies(trophies ?? []);
    if (!earnedIds) return;
    const gameUuid = getGameUuid(selectedGame);
    setEarnedTrophyIds(earnedIds);
    setUnlockedTrophies(mergeUnlockedTrophies(gameUuid, earnedIds));
  }, [selectedGame]);

  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname;
      const pathView = getViewFromPath(path, window.location.search);
      setGuideReturnView(null);

      if (pathView === 'game_info') {
        setCurrentView('game_info');
        loadGameFromUrl(path);
        return;
      }

      if (pathView === 'search-results') {
        const { q, page } = parseSimpleSearchParams(window.location.search);
        setSelectedGame(null);
        setCurrentView('search-results');
        setSearchQuery(q);
        setSearchPage(page);
        if (q && lastSearchQueryRef.current !== q) {
          setLoading(true);
          searchGames(supabase, q).then(({ data, error }) => {
            if (error) console.error('Suche:', error.message);
            lastSearchQueryRef.current = q;
            setSearchResults(data || []);
            setLoading(false);
          });
        }
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

  // Aktiver Guide-Reiter in der URL, damit Reload und geteilte Links ihn behalten.
  useEffect(() => {
    if (currentView !== 'game_info' || !selectedGame) return;
    navigateToGuideTab(activeTab);
  }, [activeTab, currentView, selectedGame]);

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
      const { error: signUpError } = await supabase.auth.signUp({
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

  const runSearch = async (queryOverride, { updateUrl = true, page = 1, replace = false } = {}) => {
    const q = (typeof queryOverride === 'string' ? queryOverride : searchQuery).trim();
    if (!q) return;
    if (typeof queryOverride === 'string') setSearchQuery(queryOverride);
    setSearchPage(page > 1 ? page : 1);
    setLoading(true);
    setCurrentView('search-results');
    if (updateUrl) navigateToSimpleSearch(q, { page, replace });
    const { data, error } = await searchGames(supabase, q, {
      includeReady: isAdminUser(sessionUser),
      locale: globalLocale,
    });
    if (error) {
      console.error('Suche:', error.message);
    }
    setSearchResults(data || []);
    lastSearchQueryRef.current = q;
    setLoading(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const { q, page } = parseSimpleSearchParams();
    if (getViewFromPath(window.location.pathname, window.location.search) !== 'search-results') {
      return undefined;
    }
    if (!q) return undefined;
    runSearch(q, { updateUrl: false, page });
    return undefined;
    // Deep-Link / F5: Suche nur beim ersten Öffnen anstoßen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    await runSearch();
  };

  const openedGameRef = useRef('');

  const openGuide = async (game) => {
    const gameUuid = getGameUuid(game);
    const gameId = resolveGameId(game);
    const token = gameUuid || gameId || '';
    openedGameRef.current = token;

    setGuideReturnView(currentView);
    setSelectedGame(game);
    setCurrentView('game_info');
    window.scrollTo(0, 0);
    setLoadingGuide(true);
    setActiveTab(DEFAULT_GUIDE_TAB);
    setActiveTrophies([]);
    setGuideItems([]);
    setChapterItems([]);
    setBossItems([]);
    setUnlockedTrophies(mergeUnlockedTrophies(gameUuid));
    setEarnedTrophyIds(new Set());

    if (!gameId) {
      setLoadingGuide(false);
      return;
    }

    navigateToGame(game, { locale: globalLocale });

    const userId = sessionUser?.id ?? null;
    const loadId = startTrophyLoad();
    const [trophyResult, guideBundle, fullGame] = await Promise.all([
      fetchGameTrophiesWithEarned(supabase, userId, game, globalLocale),
      fetchGameGuideBundle(supabase, game, globalLocale),
      gameUuid
        ? fetchGameByRouteRef(supabase, gameUuid, globalLocale)
        : Promise.resolve({ data: null }),
    ]);

    if (openedGameRef.current !== token) return;

    if (fullGame?.data) setSelectedGame(fullGame.data);

    if (loadId === trophyLoadRef.current) {
      const { trophies, earnedIds } = trophyResult;
      setActiveTrophies(trophies);
      setEarnedTrophyIds(earnedIds);
      setUnlockedTrophies(mergeUnlockedTrophies(gameUuid, earnedIds));
    }

    const { chapters, guides, bosses } = guideBundle;
    setChapterItems(chapters);
    setGuideItems(guides);
    setBossItems(bosses);
    setCompletedGuideItems(
      claimCompletedGuideItems(
        gameUuid,
        collectGuideProgressIds(chapters, guides, bosses),
      ),
    );
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
    const gameUuid = getGameUuid(selectedGame);
    setCompletedGuideItems((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next[id]) delete next[id];
      saveCompletedGuideItems(gameUuid, next);
      return next;
    });
  };

  useEffect(() => {
    const gameUuid = getGameUuid(selectedGame);
    if (!gameUuid) return undefined;

    const onStorage = (event) => {
      if (event.key === guideProgressStorageKey(gameUuid)) {
        setCompletedGuideItems(readCompletedGuideItems(gameUuid));
        return;
      }
      if (event.key === unlockedTrophyStorageKey(gameUuid)) {
        setUnlockedTrophies(mergeUnlockedTrophies(gameUuid, earnedTrophyIds));
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [selectedGame, earnedTrophyIds]);

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
    if (currentView === 'home') {
      applyHomeSeo();
      return () => clearGameSeoLinks();
    }
    if (currentView === 'impressum') {
      applyPathCanonical('/impressum');
      return () => clearGameSeoLinks();
    }
    if (currentView === 'datenschutz') {
      applyPathCanonical('/datenschutz');
      return () => clearGameSeoLinks();
    }
    if (currentView === 'guide-help') {
      applyPathCanonical('/kurz-erklaert');
      return () => clearGameSeoLinks();
    }
    if (currentView === 'search-results') {
      applyPathCanonical(window.location.pathname + window.location.search, { noIndex: true });
      return () => clearGameSeoLinks();
    }
    if (currentView === 'advanced-search') {
      applyPathCanonical('/suche', { noIndex: true });
      return () => clearGameSeoLinks();
    }
    if (currentView !== 'game_info' || !selectedGame) {
      clearGameSeoLinks();
      return undefined;
    }
    applyGameSeoLinks({
      locale: globalLocale,
      game: selectedGame,
      noIndex: !isGameIndexable(selectedGame),
    });
    return () => clearGameSeoLinks();
  }, [currentView, selectedGame, globalLocale]);

  const goHome = useCallback(() => {
    setCurrentView('home');
    setSelectedGame(null);
    setGuideReturnView(null);
    navigateToHome();
  }, []);

  const goBackFromGuide = useCallback(() => {
    if (guideReturnView) {
      setGuideReturnView(null);
      window.history.back();
      return;
    }
    goHome();
  }, [guideReturnView, goHome]);

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

  const openGuideHelp = useCallback((section = '') => {
    setCurrentView('guide-help');
    navigateToGuideHelp(section);
    window.scrollTo(0, 0);
  }, []);

  const backFromHelp = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    goHome();
  }, [goHome]);

  const openAdvancedSearch = useCallback(() => {
    setCurrentView('advanced-search');
    setSelectedGame(null);
    navigateToAdvancedSearch();
    window.scrollTo(0, 0);
  }, []);

  const maintenanceBypass = hasMaintenanceBypass(sessionUser);
  const isQaAdminView = currentView === 'qa_admin';

  if (staffAppHtml) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500 text-sm font-mono px-4 text-center">
        Weiterleitung zur Anmeldung…
      </div>
    );
  }

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
    <ErrorReportProvider sessionUser={sessionUser}>
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
          currentView === 'guide-help' ||
          currentView === 'advanced-search' ||
          currentView === 'search-results'
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
                sessionUser={sessionUser}
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
                page={searchPage}
                onBack={goHome}
                isAdmin={isAdminUser(sessionUser)}
                onPageChange={(nextPage) => {
                  setSearchPage(nextPage);
                  navigateToSimpleSearch(searchQuery, { page: nextPage, replace: true });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            )}

            {currentView === 'advanced-search' && (
              <AdvancedSearchPage
                openGame={openGuide}
                onBack={goHome}
                includeReady={isAdminUser(sessionUser)}
              />
            )}

            {currentView === 'game_info' && !selectedGame && loadingGuide && (
              <p className="text-center text-sm text-zinc-500 font-mono py-16 animate-pulse">
                Guide wird geladen…
              </p>
            )}

            {currentView === 'game_info' && !selectedGame && !loadingGuide && (
              <GuideNotFound error={guideLoadError} onBack={goHome} />
            )}

            {currentView === 'game_info' && selectedGame && (
              <GameDetailPage
                currentView={currentView}
                sessionUser={sessionUser}
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
                onNavigateHome={goBackFromGuide}
                onGoHome={goHome}
                openGame={openGuide}
                onOpenHelp={openGuideHelp}
                onActiveTrophies={handleActiveTrophies}
                startTrophyLoad={startTrophyLoad}
                fromSearch={
                  guideReturnView === 'search-results' || guideReturnView === 'advanced-search'
                }
              />
            )}

            {currentView === 'login' && <LoginPage onLogin={handleLogin} />}
            {currentView === 'tester-setup' && <TesterSetupPage onCreateAccount={handleCreateOwnAccount} />}
            {currentView === 'impressum' && <LegalNoticePage onBack={goHome} />}
            {currentView === 'guide-help' && <HowToPage onBack={backFromHelp} />}
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
        onOpenHelp={openGuideHelp}
      />

    </div>
    </WatchlistProvider>
    </ErrorReportProvider>
  );
}

export default App;