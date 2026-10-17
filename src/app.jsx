import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from './pages/supabaseClient';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import SearchResultsPage from './pages/SearchResultsPage';
import AdvancedSearchPage from './pages/AdvancedSearchPage';
import QuickwinsPage from './pages/QuickwinsPage';
import WatchlistPage from './pages/WatchlistPage';
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
  navigateToQuickwins,
  navigateToSimpleSearch,
  navigateToWatchlist,
  QUICKWINS_PATH,
  SERVERTOT_PATH,
  EASY_PLATINS_PATH,
  WATCHLIST_PATH,
  parseSimpleSearchParams,
  parseExcludeQuickwins,
  parseIncludeTrophiesOnly,
  parseGuideTabParam,
  navigateToGuideTab,
  withGuideTabParam,
  DEFAULT_GUIDE_TAB,
} from './lib/routeUtils';
import { searchGames } from './lib/gameSearch';
import { GAME_STRUCT, GAME_TYPE, TABLES, isServerDeadType } from './lib/gameSchema';
import { isGuidePublished } from './lib/guidePublication';
import {
  parseServertotPath,
  servertotPageCopy,
  servertotPublicPath,
} from './lib/servertotPage';
import {
  parseEasyPlatinsPath,
  easyPlatinsPageCopy,
  easyPlatinsPublicPath,
} from './lib/easyPlatinsPage';

const SERVERTOT_CATALOG = {
  viewName: 'servertot',
  pageCopy: servertotPageCopy,
  publicPath: servertotPublicPath,
  parsePath: parseServertotPath,
};

/** Eingeloggte Nicht-Admins: unveröffentlichte Spiele nur als Trophäenliste. */
function resolveTrophiesOnlyView(game, locale, user) {
  if (!user || isAdminUser(user)) return false;
  return !isGuidePublished(game, locale);
}

function stripTrophyGuideExtras(trophies) {
  return (trophies ?? []).map((trophy) => ({
    ...trophy,
    guide_tip: '',
    guide_tip_long: '',
    video_url: '',
  }));
}

const EASY_PLATINS_CATALOG = {
  viewName: 'easyplatins',
  pageCopy: easyPlatinsPageCopy,
  publicPath: easyPlatinsPublicPath,
  parsePath: parseEasyPlatinsPath,
};
import ProfilePage from './pages/ProfilePage';
import QaAdminPage from './pages/QaAdminPage';
import { fetchGameGuideBundle, resolveGameId } from './lib/guideQueries';
import { fetchGameByRouteRef, fetchGameBySlug } from './lib/gameQueries';
import { useLocale } from './context/LocaleContext';
import {
  countEarnedInList,
  fetchGameTrophiesWithEarned,
} from './lib/earnedTrophyQueries';
import { getTrophyIdKey } from './lib/trophyQueries';
import { applyTrophyUnlockToggle, isPlatinumUnlocked } from './lib/trophyTypes';
import { saveLocalPlatinumFlag, PROGRESS_SYNCED_EVENT } from './lib/localUserProgress';
import { pushLocalGameProgressToCloud } from './lib/progressCloudBridge';
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
import { ProgressSyncProvider } from './context/ProgressSyncContext';
import { useMediaConsent } from './context/MediaConsentContext';
import SiteFooter from './components/SiteFooter';
import MediaConsentBanner from './components/MediaConsentBanner';
import GuideNotFound from './components/GuideNotFound';
import { LegalNoticePage, PrivacyPage } from './pages/LegalPages';
import HowToPage from './pages/HowToPage';

function App() {
  const { globalLocale, t } = useLocale();
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
  const [excludeQuickwins, setExcludeQuickwins] = useState(() => parseExcludeQuickwins());
  const [includeTrophiesOnly, setIncludeTrophiesOnly] = useState(() => parseIncludeTrophiesOnly());
  const [trophiesOnlyView, setTrophiesOnlyView] = useState(false);
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
      if (isServerDeadType(gameData[GAME_STRUCT.gameType])) {
        setSelectedGame(null);
        setActiveTrophies([]);
        setGuideItems([]);
        setChapterItems([]);
        setBossItems([]);
        setGuideLoadError(null);
        setLoadingGuide(false);
        setCurrentView('servertot');
        navigateToQuickwins({}, { path: servertotPublicPath(localeForPage), replace: true });
        return;
      }

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
      const user = session?.user ?? null;
      const userId = user?.id ?? null;
      const trophiesOnly = resolveTrophiesOnlyView(gameData, localeForPage, user);
      setTrophiesOnlyView(trophiesOnly);

      const loadId = startTrophyLoad();
      const { trophies, earnedIds } = await fetchGameTrophiesWithEarned(
        supabase,
        userId,
        gameData,
        localeForPage,
      );
      if (loadId === trophyLoadRef.current) {
        setActiveTrophies(trophiesOnly ? stripTrophyGuideExtras(trophies) : trophies);
        setEarnedTrophyIds(earnedIds);
        setUnlockedTrophies(mergeUnlockedTrophies(gameUuid, earnedIds));
      }

      if (trophiesOnly) {
        setChapterItems([]);
        setGuideItems([]);
        setBossItems([]);
        setCompletedGuideItems({});
      } else {
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
      }
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
      setTrophiesOnlyView(false);
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
  const replaceActiveTrophies = useCallback((updater) => {
    setActiveTrophies((prev) => updater(prev ?? []));
  }, []);
  const patchSelectedGame = useCallback((partial) => {
    setSelectedGame((prev) => (prev ? { ...prev, ...partial } : prev));
  }, []);

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
        const {
          q,
          page,
          excludeQuickwins: exclude,
          includeTrophiesOnly: trophiesOnly,
        } = parseSimpleSearchParams(window.location.search);
        const allowTrophies = Boolean(sessionUser) && trophiesOnly;
        const signature = `${q}\n${exclude ? '1' : '0'}\n${allowTrophies ? '1' : '0'}`;
        setSelectedGame(null);
        setCurrentView('search-results');
        setSearchQuery(q);
        setSearchPage(page);
        setExcludeQuickwins(exclude);
        setIncludeTrophiesOnly(allowTrophies);
        if (q && lastSearchQueryRef.current !== signature) {
          setLoading(true);
          searchGames(supabase, q, {
            excludeQuickwins: exclude,
            includeTrophiesOnly: allowTrophies,
          }).then(({ data, error }) => {
            if (error) console.error('Suche:', error.message);
            lastSearchQueryRef.current = signature;
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
  }, [loadGameFromUrl, sessionUser]);

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

  const runSearch = async (
    queryOverride,
    {
      updateUrl = true,
      page = 1,
      replace = false,
      exclude = excludeQuickwins,
      trophiesOnly = includeTrophiesOnly,
    } = {},
  ) => {
    const q = (typeof queryOverride === 'string' ? queryOverride : searchQuery).trim();
    if (!q) return;
    const allowTrophies = Boolean(sessionUser) && trophiesOnly;
    if (typeof queryOverride === 'string') setSearchQuery(queryOverride);
    setSearchPage(page > 1 ? page : 1);
    setLoading(true);
    setCurrentView('search-results');
    if (updateUrl) {
      navigateToSimpleSearch(q, {
        page,
        replace,
        excludeQuickwins: exclude,
        includeTrophiesOnly: allowTrophies,
      });
    }
    const { data, error } = await searchGames(supabase, q, {
      locale: globalLocale,
      excludeQuickwins: exclude,
      includeTrophiesOnly: allowTrophies,
    });
    if (error) {
      console.error('Suche:', error.message);
    }
    setSearchResults(data || []);
    lastSearchQueryRef.current = `${q}\n${exclude ? '1' : '0'}\n${allowTrophies ? '1' : '0'}`;
    setLoading(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!sessionUser) setIncludeTrophiesOnly(false);
  }, [sessionUser]);

  useEffect(() => {
    const {
      q,
      page,
      excludeQuickwins: exclude,
      includeTrophiesOnly: trophiesOnly,
    } = parseSimpleSearchParams();
    if (getViewFromPath(window.location.pathname, window.location.search) !== 'search-results') {
      return undefined;
    }
    if (!q) return undefined;
    runSearch(q, { updateUrl: false, page, exclude, trophiesOnly });
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

    if (isServerDeadType(game?.[GAME_STRUCT.gameType])) {
      setSelectedGame(null);
      setCurrentView('servertot');
      navigateToQuickwins({}, { path: servertotPublicPath(globalLocale) });
      return;
    }

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
    setTrophiesOnlyView(false);
    setUnlockedTrophies(mergeUnlockedTrophies(gameUuid));
    setEarnedTrophyIds(new Set());

    if (!gameId) {
      setLoadingGuide(false);
      return;
    }

    navigateToGame(game, { locale: globalLocale });

    const userId = sessionUser?.id ?? null;
    const loadId = startTrophyLoad();
    const [trophyResult, fullGame] = await Promise.all([
      fetchGameTrophiesWithEarned(supabase, userId, game, globalLocale),
      gameUuid
        ? fetchGameByRouteRef(supabase, gameUuid, globalLocale)
        : Promise.resolve({ data: null }),
    ]);

    if (openedGameRef.current !== token) return;

    const resolvedGame = fullGame?.data || game;
    if (fullGame?.data) {
      if (isServerDeadType(fullGame.data[GAME_STRUCT.gameType])) {
        setSelectedGame(null);
        setLoadingGuide(false);
        setCurrentView('servertot');
        navigateToQuickwins({}, { path: servertotPublicPath(globalLocale), replace: true });
        return;
      }
      setSelectedGame(fullGame.data);
    }

    const trophiesOnly = resolveTrophiesOnlyView(resolvedGame, globalLocale, sessionUser);
    setTrophiesOnlyView(trophiesOnly);

    if (loadId === trophyLoadRef.current) {
      const { trophies, earnedIds } = trophyResult;
      setActiveTrophies(trophiesOnly ? stripTrophyGuideExtras(trophies) : trophies);
      setEarnedTrophyIds(earnedIds);
      setUnlockedTrophies(mergeUnlockedTrophies(gameUuid, earnedIds));
    }

    if (trophiesOnly) {
      setChapterItems([]);
      setGuideItems([]);
      setBossItems([]);
      setCompletedGuideItems({});
      setLoadingGuide(false);
      return;
    }

    const guideBundle = await fetchGameGuideBundle(supabase, resolvedGame, globalLocale);
    if (openedGameRef.current !== token) return;

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
      const next = applyTrophyUnlockToggle(prev, id, activeTrophies, earnedTrophyIds);
      saveUnlockedTrophies(gameUuid, next, earnedTrophyIds);
      saveLocalPlatinumFlag(
        gameUuid,
        isPlatinumUnlocked(activeTrophies, next, earnedTrophyIds),
      );
      pushLocalGameProgressToCloud(gameUuid);
      return next;
    });
  };

  const toggleGuideItemCompleted = (id) => {
    const gameUuid = getGameUuid(selectedGame);
    setCompletedGuideItems((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next[id]) delete next[id];
      saveCompletedGuideItems(gameUuid, next);
      pushLocalGameProgressToCloud(gameUuid);
      return next;
    });
  };

  useEffect(() => {
    const gameUuid = getGameUuid(selectedGame);
    if (!gameUuid) return undefined;

    const reloadLocalProgress = () => {
      setCompletedGuideItems(readCompletedGuideItems(gameUuid));
      setUnlockedTrophies(mergeUnlockedTrophies(gameUuid, earnedTrophyIds));
    };

    const onStorage = (event) => {
      if (event.key === guideProgressStorageKey(gameUuid)) {
        setCompletedGuideItems(readCompletedGuideItems(gameUuid));
        return;
      }
      if (event.key === unlockedTrophyStorageKey(gameUuid)) {
        setUnlockedTrophies(mergeUnlockedTrophies(gameUuid, earnedTrophyIds));
      }
    };

    const onProgressSynced = () => reloadLocalProgress();

    window.addEventListener('storage', onStorage);
    window.addEventListener(PROGRESS_SYNCED_EVENT, onProgressSynced);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(PROGRESS_SYNCED_EVENT, onProgressSynced);
    };
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
    if (currentView === 'quickwins') {
      applyPathCanonical(QUICKWINS_PATH, { noIndex: true });
      return () => clearGameSeoLinks();
    }
    if (currentView === 'servertot') {
      applyPathCanonical(servertotPublicPath(globalLocale), { noIndex: true });
      return () => clearGameSeoLinks();
    }
      if (currentView === 'easyplatins') {
      applyPathCanonical(easyPlatinsPublicPath(globalLocale), { noIndex: true });
      return () => clearGameSeoLinks();
    }
    if (currentView === 'watchlist') {
      applyPathCanonical(WATCHLIST_PATH, { noIndex: true });
      return () => clearGameSeoLinks();
    }
    if (currentView !== 'game_info' || !selectedGame) {
      clearGameSeoLinks();
      return undefined;
    }
    applyGameSeoLinks({
      locale: globalLocale,
      game: selectedGame,
      noIndex: trophiesOnlyView || !isGameIndexable(selectedGame),
    });
    return () => clearGameSeoLinks();
  }, [currentView, selectedGame, globalLocale, trophiesOnlyView]);

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
    navigateToAdvancedSearch({}, {
      excludeQuickwins,
      includeTrophiesOnly: Boolean(sessionUser) && includeTrophiesOnly,
    });
    window.scrollTo(0, 0);
  }, [excludeQuickwins, includeTrophiesOnly, sessionUser]);

  const openQuickwins = useCallback(() => {
    setCurrentView('quickwins');
    setSelectedGame(null);
    navigateToQuickwins();
    window.scrollTo(0, 0);
  }, []);

  const openServertot = useCallback(() => {
    setCurrentView('servertot');
    setSelectedGame(null);
    navigateToQuickwins({}, { path: servertotPublicPath(globalLocale) });
    window.scrollTo(0, 0);
  }, [globalLocale]);

  const openEasyPlatins = useCallback(() => {
    setCurrentView('easyplatins');
    setSelectedGame(null);
    navigateToQuickwins({}, { path: easyPlatinsPublicPath(globalLocale) });
    window.scrollTo(0, 0);
  }, [globalLocale]);

  const openWatchlist = useCallback(() => {
    setCurrentView('watchlist');
    setSelectedGame(null);
    navigateToWatchlist();
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
    <ProgressSyncProvider sessionUser={sessionUser}>
    <div className="min-h-screen w-full max-w-full min-w-0 overflow-x-hidden flex flex-col bg-[#121314] text-gray-200 font-sans antialiased">
      
      <Header 
        setCurrentView={setCurrentView} 
        sessionUser={sessionUser} 
        onLogout={handleLogout}
        onOpenWatchlist={openWatchlist}
      />

      <main
        className={`flex-1 flex flex-col w-full max-w-full min-w-0 overflow-x-hidden ${
          currentView === 'impressum' ||
          currentView === 'datenschutz' ||
          currentView === 'guide-help' ||
          currentView === 'advanced-search' ||
          currentView === 'search-results' ||
          currentView === 'quickwins' ||
          currentView === 'servertot' ||
          currentView === 'easyplatins' ||
          currentView === 'watchlist'
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
                onOpenWatchlist={openWatchlist}
                excludeQuickwins={excludeQuickwins}
                onExcludeQuickwinsChange={setExcludeQuickwins}
                includeTrophiesOnly={includeTrophiesOnly}
                onIncludeTrophiesOnlyChange={setIncludeTrophiesOnly}
              />
            )}

            {currentView === 'watchlist' && (
              <WatchlistPage
                openGame={openGuide}
                onBack={goHome}
                onRequestLogin={() => setCurrentView('login')}
                isAdmin={isAdminUser(sessionUser)}
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
                  navigateToSimpleSearch(searchQuery, {
                    page: nextPage,
                    replace: true,
                    excludeQuickwins,
                    includeTrophiesOnly: Boolean(sessionUser) && includeTrophiesOnly,
                  });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            )}

            {currentView === 'advanced-search' && (
              <AdvancedSearchPage
                openGame={openGuide}
                onBack={goHome}
                onOpenQuickwins={openQuickwins}
                onOpenEasyPlatins={openEasyPlatins}
                onOpenServertot={openServertot}
                sessionUser={sessionUser}
                servertotPath={servertotPublicPath(globalLocale)}
                easyPlatinsPath={easyPlatinsPublicPath(globalLocale)}
              />
            )}

            {currentView === 'quickwins' && (
              <QuickwinsPage
                openGame={openGuide}
                onBack={goHome}
                onRequestLogin={() => setCurrentView('login')}
                isAdmin={isAdminUser(sessionUser)}
                sessionUser={sessionUser}
              />
            )}

            {currentView === 'servertot' && (
              <QuickwinsPage
                openGame={openGuide}
                onBack={goHome}
                onRequestLogin={() => setCurrentView('login')}
                isAdmin={isAdminUser(sessionUser)}
                sessionUser={sessionUser}
                gameType={GAME_TYPE.SERVER_DEAD}
                basePath={SERVERTOT_PATH}
                titleKey="servertotTitle"
                newerVersions
                serverNotice
                alphabetCatalog
                localizedCatalog={SERVERTOT_CATALOG}
                publisherMin={1}
              />
            )}

            {currentView === 'easyplatins' && (
              <QuickwinsPage
                openGame={openGuide}
                onBack={goHome}
                onRequestLogin={() => setCurrentView('login')}
                isAdmin={isAdminUser(sessionUser)}
                sessionUser={sessionUser}
                gameType={GAME_TYPE.EASY_PLATIN}
                basePath={EASY_PLATINS_PATH}
                titleKey="easyPlatinsTitle"
                alphabetCatalog
                localizedCatalog={EASY_PLATINS_CATALOG}
                publisherMin={1}
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
                onReplaceTrophies={replaceActiveTrophies}
                onGameChange={patchSelectedGame}
                startTrophyLoad={startTrophyLoad}
                fromSearch={
                  guideReturnView === 'search-results' || guideReturnView === 'advanced-search'
                }
                trophiesOnly={trophiesOnlyView}
                backLabel={
                  guideReturnView === 'quickwins'
                    ? t('quickwinsBack')
                    : guideReturnView === 'servertot'
                      ? t('servertotBack')
                      : guideReturnView === 'easyplatins'
                        ? t('easyPlatinsBack')
                        : guideReturnView === 'watchlist'
                          ? t('watchlistBack')
                      : ''
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
    </ProgressSyncProvider>
    </WatchlistProvider>
    </ErrorReportProvider>
  );
}

export default App;