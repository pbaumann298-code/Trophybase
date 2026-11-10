import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { supabase } from './pages/supabaseClient';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import CustomizeTrophyBaseModal from './components/CustomizeTrophyBaseModal';
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
import { isAdminUser, isLabModeActive, staffAppHtmlForPath } from './lib/adminAccess';
import { useHideAdminOverlays, useShowAdminChrome } from './lib/useAdminChrome';
import AdminSessionPill from './components/AdminSessionPill';

const GamingRoomDrawer = lazy(() => import('./v2/GamingRoomDrawer'));
import {
  handleSocialLinkRedirect,
  signInWithGatePassword,
} from './lib/trophyBaseAuth';
import {
  getGameIdFromPath,
  appRouteKey,
  buildAdvancedSearchPath,
  buildSimpleSearchPath,
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
  navigateToProfile,
  navigateToPlatformTrophies,
  SERVERTOT_PATH,
  EASY_PLATINS_PATH,
  WATCHLIST_PATH,
  PROFILE_PATH,
  PLATFORM_TROPHIES_PATH,
  parseSimpleSearchParams,
  parseExcludeQuickwins,
  parseIncludeTrophiesOnly,
  parseGuideTabParam,
  navigateToGuideTab,
  withGuideTabParam,
  DEFAULT_GUIDE_TAB,
} from './lib/routeUtils';
import { searchGames } from './lib/gameSearch';
import { GAME_TYPE, TABLES } from './lib/gameSchema';
import { isGuidePublished, isGameDraftMode, hasPublishedGuide } from './lib/guidePublication';
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
import {
  parseQuickwinsPath,
  quickwinsPageCopy,
  quickwinsPublicPath,
} from './lib/quickwinsPage';
import { guideHelpPublicPath } from './lib/guideHelpPage';

const QUICKWINS_CATALOG = {
  viewName: 'quickwins',
  pageCopy: quickwinsPageCopy,
  publicPath: quickwinsPublicPath,
  parsePath: parseQuickwinsPath,
};

const SERVERTOT_CATALOG = {
  viewName: 'servertot',
  pageCopy: servertotPageCopy,
  publicPath: servertotPublicPath,
  parsePath: parseServertotPath,
};

/** Eingeloggte Nicht-Admins: unveröffentlichte Spiele nur als Trophäenliste. */
function resolveTrophiesOnlyView(game, locale, user) {
  if (!user || isAdminUser(user)) return false;
  if (hasPublishedGuide(game)) return false;
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
import PlatformTrophiesPage from './pages/PlatformTrophiesPage';
import { fetchGameGuideBundle, resolveGameId } from './lib/guideQueries';
import { fetchGameByRouteRef, fetchGameBySlug } from './lib/gameQueries';
import { useLocale } from './context/LocaleContext';
import { fetchGameTrophiesWithEarned } from './lib/earnedTrophyQueries';
import { getGameViewPolicy } from './lib/gameViewPolicy';
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
import { PlatinumStatusProvider } from './context/PlatinumStatusContext';
import { useMediaConsent } from './context/MediaConsentContext';
import SiteFooter from './components/SiteFooter';
import MediaConsentBanner from './components/MediaConsentBanner';
import GuideNotFound from './components/GuideNotFound';
import { LegalNoticePage, PrivacyPage } from './pages/LegalPages';
import HowToPage from './pages/HowToPage';

function backLabelForView(view, t) {
  switch (view) {
    case 'servertot':
      return t('servertotBack');
    case 'easyplatins':
      return t('easyPlatinsBack');
    case 'quickwins':
      return t('quickwinsBack');
    case 'watchlist':
      return t('watchlistBack');
    case 'search-results':
    case 'advanced-search':
      return t('backToSearch');
    case 'profile':
      return '← Zurück zum Cockpit';
    case 'game_info':
      return '← Zurück zum vorherigen Guide';
    default:
      return t('backDashboard');
  }
}

function restoreWindowScroll(scrollY) {
  const top = Number(scrollY) || 0;
  const apply = () => window.scrollTo({ top, behavior: 'instant' });
  window.requestAnimationFrame(() => {
    window.setTimeout(apply, 40);
  });
  window.setTimeout(apply, 320);
}

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
  const historyStackRef = useRef([]);
  const currentRouteRef = useRef({
    href: window.location.pathname + window.location.search,
    view: currentView,
  });
  const [historyVersion, setHistoryVersion] = useState(0);
  const [prevHistoryView, setPrevHistoryView] = useState(null);
  const backInProgressRef = useRef(null);
  const applyHistoryEntryRef = useRef(async () => {});
  const bumpHistory = useCallback(() => {
    setPrevHistoryView(historyStackRef.current[historyStackRef.current.length - 1]?.view ?? null);
    setHistoryVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    currentRouteRef.current = {
      href: `${window.location.pathname}${window.location.search}`,
      view: currentView,
    };
  }, [currentView]);

  // Öffentliche Website: keine Baustelle. Admin loggt sich über /admin oder /intranet ein.
  const isMaintenanceMode = false;

  // 🔐 Einzigartiger State für den User + Auth-Hydration-Status
  const [sessionUser, setSessionUser] = useState(null);
  const hideAdminOverlays = useHideAdminOverlays();
  const showAdminChrome = useShowAdminChrome(sessionUser);
  const realAdmin = isAdminUser(sessionUser, { allowPublic: true, ignoreGuestSimulation: true });
  const viewUser = hideAdminOverlays && realAdmin ? null : sessionUser;
  const [authLoading, setAuthLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState(() => parseSimpleSearchParams().q);
  const [excludeQuickwins, setExcludeQuickwins] = useState(() => parseExcludeQuickwins());
  const [includeTrophiesOnly, setIncludeTrophiesOnly] = useState(() => parseIncludeTrophiesOnly());
  const [trophiesOnlyView, setTrophiesOnlyView] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchPage, setSearchPage] = useState(() => parseSimpleSearchParams().page);
  const [loading, setLoading] = useState(false);
  const [guideLoadError, setGuideLoadError] = useState(null);
  const lastSearchQueryRef = useRef('');
  const trophyLoadRef = useRef(0);
  const startTrophyLoad = () => {
    trophyLoadRef.current += 1;
    return trophyLoadRef.current;
  };
  const [dbOk, setDbOk] = useState(null);

  const [customizeOpen, setCustomizeOpen] = useState(false);
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
    let initialResolved = false;

    async function initAuth() {
      try {
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
      } catch (err) {
        console.error('Auth-Initialisierung fehlgeschlagen:', err);
      } finally {
        initialResolved = true;
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    }

    initAuth();

    // KEINE await supabase...-Calls direkt in onAuthStateChange (verhindert Lock-Deadlock in supabase-js v2)!
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Während supabase.auth.getSession() noch lädt (authLoading === true),
        // niemals den User-State löschen oder Redirects auslösen!
        if (!initialResolved && event === 'INITIAL_SESSION' && !session?.user) {
          return;
        }

        if (event === 'SIGNED_OUT') {
          if (!cancelled) setSessionUser(null);
          return;
        }

        if (session?.user && !cancelled) {
          setSessionUser(session.user);
        }

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

          const currentUser = session.user;
          window.setTimeout(() => {
            if (cancelled) return;
            handleSocialLinkRedirect(supabase).then((redirectResult) => {
              if (cancelled) return;
              if (redirectResult.handled && redirectResult.ok) {
                setCurrentView(resolveAppViewForSession(currentUser, path));
                return;
              }
              setCurrentView(resolveAppViewForSession(currentUser, path));
            });
          }, 0);
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
        null,
        { textFallback: getGameViewPolicy(gameData, { variant: 'page' }).useTextFallback },
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
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) loadGameFromUrl();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loadGameFromUrl]);

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

  const pushCurrentRouteToStack = useCallback((nextHref) => {
    const here = `${window.location.pathname}${window.location.search}`;
    if (nextHref && appRouteKey(nextHref) === appRouteKey(here)) return;
    const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    const entry = {
      href: here,
      view: currentRouteRef.current.view || 'home',
      scrollY,
    };
    const stack = historyStackRef.current;
    const top = stack[stack.length - 1];
    if (top && appRouteKey(top.href) === appRouteKey(entry.href) && top.view === entry.view) {
      top.scrollY = scrollY;
      return;
    }
    stack.push(entry);
    bumpHistory();
  }, [bumpHistory]);

  useEffect(() => {
    const onPopState = () => {
      const landed = `${window.location.pathname}${window.location.search}`;
      const pending = backInProgressRef.current;
      if (pending) {
        backInProgressRef.current = null;
        if (appRouteKey(pending.href) === appRouteKey(landed)) {
          void applyHistoryEntryRef.current(pending);
          return;
        }
        historyStackRef.current.push(pending);
        bumpHistory();
      }

      const stack = historyStackRef.current;
      const top = stack[stack.length - 1];
      if (top && appRouteKey(top.href) === appRouteKey(landed)) {
        stack.pop();
        bumpHistory();
        void applyHistoryEntryRef.current(top);
        return;
      }

      const prev = currentRouteRef.current;
      if (prev?.href && appRouteKey(prev.href) !== appRouteKey(landed)) {
        stack.push({
          href: prev.href,
          view: prev.view || 'home',
          scrollY: window.scrollY || 0,
        });
        bumpHistory();
      }

      const pathView = getViewFromPath(window.location.pathname, window.location.search) || 'home';
      currentRouteRef.current = { href: landed, view: pathView };
      if (pathView === 'game_info') {
        setCurrentView('game_info');
        loadGameFromUrl(window.location.pathname);
        return;
      }
      if (pathView === 'search-results') {
        void applyHistoryEntryRef.current({ href: landed, view: 'search-results', scrollY: 0 });
        return;
      }
      setCurrentView(pathView);
      setSelectedGame(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [bumpHistory, loadGameFromUrl]);

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
      keepScroll = false,
    } = {},
  ) => {
    const q = (typeof queryOverride === 'string' ? queryOverride : searchQuery).trim();
    if (!q) return;
    const allowTrophies = Boolean(viewUser) && trophiesOnly;
    if (updateUrl) {
      pushCurrentRouteToStack(buildSimpleSearchPath(q, page, exclude, allowTrophies));
    }
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
    if (!keepScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    applyHistoryEntryRef.current = async (entry) => {
    const href = entry?.href || `${window.location.pathname}${window.location.search}`;
    const view = entry?.view || getViewFromPath(href.split('?')[0], href.includes('?') ? href.slice(href.indexOf('?')) : '') || 'home';
    const path = href.split('?')[0];
    const search = href.includes('?') ? href.slice(href.indexOf('?')) : '';
    currentRouteRef.current = { href, view };

    if (view === 'game_info') {
      setCurrentView('game_info');
      await loadGameFromUrl(path);
      restoreWindowScroll(entry?.scrollY);
      return;
    }

    if (view === 'search-results') {
      const parsed = parseSimpleSearchParams(search);
      const allowTrophies = Boolean(viewUser) && parsed.includeTrophiesOnly;
      const signature = `${parsed.q}\n${parsed.excludeQuickwins ? '1' : '0'}\n${allowTrophies ? '1' : '0'}`;
      setSelectedGame(null);
      setCurrentView('search-results');
      setSearchQuery(parsed.q);
      setSearchPage(parsed.page);
      setExcludeQuickwins(parsed.excludeQuickwins);
      setIncludeTrophiesOnly(allowTrophies);
      if (parsed.q && lastSearchQueryRef.current !== signature) {
        await runSearch(parsed.q, {
          updateUrl: false,
          page: parsed.page,
          exclude: parsed.excludeQuickwins,
          trophiesOnly: parsed.includeTrophiesOnly,
          keepScroll: true,
        });
      }
      restoreWindowScroll(entry?.scrollY);
      return;
    }

    setCurrentView(view);
    setSelectedGame(null);
    restoreWindowScroll(entry?.scrollY);
    };
  });

  useEffect(() => {
    if (authLoading || viewUser) return undefined;
    const timer = window.setTimeout(() => setIncludeTrophiesOnly(false), 0);
    return () => window.clearTimeout(timer);
  }, [authLoading, viewUser]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const {
        q,
        page,
        excludeQuickwins: exclude,
        includeTrophiesOnly: trophiesOnly,
      } = parseSimpleSearchParams();
      if (getViewFromPath(window.location.pathname, window.location.search) !== 'search-results') {
        return;
      }
      if (!q) return;
      runSearch(q, { updateUrl: false, page, exclude, trophiesOnly });
    }, 0);
    return () => window.clearTimeout(timer);
    // Deep-Link / F5: Suche nur beim ersten Öffnen anstoßen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    await runSearch();
  };

  const openedGameRef = useRef('');

  const openGuide = async (game, options = {}) => {
    const gameUuid = getGameUuid(game);
    const gameId = resolveGameId(game);
    const token = gameUuid || gameId || '';
    openedGameRef.current = token;
    const isAdmin = showAdminChrome;
    const initialPreferGuideTab = Boolean(
      options?.preferGuideTab || (isAdmin && isGameDraftMode(game)),
    );

    pushCurrentRouteToStack(gameGuidePath(game, globalLocale));
    setSelectedGame(game);
    setCurrentView('game_info');
    window.scrollTo(0, 0);
    setLoadingGuide(true);
    setActiveTab(initialPreferGuideTab ? 'reiter1' : DEFAULT_GUIDE_TAB);
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

    const userId = viewUser?.id ?? null;
    const loadId = startTrophyLoad();
    const [trophyResult, fullGame] = await Promise.all([
      fetchGameTrophiesWithEarned(
        supabase,
        userId,
        game,
        globalLocale,
        null,
        { textFallback: getGameViewPolicy(game, { variant: 'page' }).useTextFallback },
      ),
      gameUuid
        ? fetchGameByRouteRef(supabase, gameUuid, globalLocale)
        : Promise.resolve({ data: null }),
    ]);

    if (openedGameRef.current !== token) return;

    const resolvedGame = fullGame?.data || game;
    if (fullGame?.data) {
      setSelectedGame(fullGame.data);
    }

    const trophiesOnly = resolveTrophiesOnlyView(resolvedGame, globalLocale, viewUser);
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
    if (initialPreferGuideTab || (isAdmin && isGameDraftMode(resolvedGame))) {
      if (chapters.length > 0) setActiveTab('reiter1');
      else if (guides.length > 0) setActiveTab('reiter2');
      else if (bosses.length > 0) setActiveTab('reiter3');
      else setActiveTab(DEFAULT_GUIDE_TAB);
    }
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

  const toggleGuideItemCompleted = (idOrIds, forceState) => {
    const gameUuid = getGameUuid(selectedGame);
    setCompletedGuideItems((prev) => {
      const next = { ...prev };
      const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
      for (const id of ids) {
        if (!id) continue;
        const targetState = typeof forceState === 'boolean' ? forceState : !prev[id];
        if (targetState) {
          next[id] = true;
        } else {
          delete next[id];
        }
      }
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
      applyPathCanonical(guideHelpPublicPath(globalLocale));
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
      applyPathCanonical(quickwinsPublicPath(globalLocale), { noIndex: false });
      return () => clearGameSeoLinks();
    }
    if (currentView === 'servertot') {
      applyPathCanonical(servertotPublicPath(globalLocale), { noIndex: false });
      return () => clearGameSeoLinks();
    }
    if (currentView === 'easyplatins') {
      applyPathCanonical(easyPlatinsPublicPath(globalLocale), { noIndex: false });
      return () => clearGameSeoLinks();
    }
    if (currentView === 'watchlist') {
      applyPathCanonical(WATCHLIST_PATH, { noIndex: true });
      return () => clearGameSeoLinks();
    }
    if (currentView === 'profile') {
      applyPathCanonical(PROFILE_PATH, { noIndex: true });
      return () => clearGameSeoLinks();
    }
    if (currentView === 'platform-trophies') {
      applyPathCanonical('/platinliste', { noIndex: false });
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
    historyStackRef.current = [];
    bumpHistory();
    currentRouteRef.current = { href: '/', view: 'home' };
    setCurrentView('home');
    setSelectedGame(null);
    navigateToHome();
    window.scrollTo(0, 0);
  }, [bumpHistory]);

  const goBack = useCallback(() => {
    const stack = historyStackRef.current;
    const lastEntry = stack.length > 0 ? stack.pop() : null;
    if (lastEntry) {
      bumpHistory();
      backInProgressRef.current = lastEntry;
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      writeAppPath(lastEntry.href, { replace: false });
      void applyHistoryEntryRef.current(lastEntry);
      return;
    }
    if (window.history.length > 1 && String(document.referrer || '').includes(window.location.host)) {
      window.history.back();
      return;
    }
    goHome();
  }, [bumpHistory, goHome]);

  const openImpressum = useCallback(() => {
    pushCurrentRouteToStack('/impressum');
    setCurrentView('impressum');
    setSelectedGame(null);
    navigateToImpressum();
    window.scrollTo(0, 0);
  }, [pushCurrentRouteToStack]);

  const openPrivacy = useCallback(() => {
    pushCurrentRouteToStack('/datenschutz');
    setCurrentView('datenschutz');
    setSelectedGame(null);
    navigateToPrivacy();
    window.scrollTo(0, 0);
  }, [pushCurrentRouteToStack]);

  const openGuideHelp = useCallback((section = '') => {
    const path = guideHelpPublicPath(globalLocale);
    pushCurrentRouteToStack(section ? `${path}#${section}` : path);
    setCurrentView('guide-help');
    navigateToGuideHelp(section, globalLocale);
    window.scrollTo(0, 0);
  }, [globalLocale, pushCurrentRouteToStack]);

  const openAdvancedSearch = useCallback(() => {
    const trophiesOnly = Boolean(viewUser) && includeTrophiesOnly;
    pushCurrentRouteToStack(buildAdvancedSearchPath({}, 1, excludeQuickwins, trophiesOnly));
    setCurrentView('advanced-search');
    setSelectedGame(null);
    navigateToAdvancedSearch({}, {
      excludeQuickwins,
      includeTrophiesOnly: trophiesOnly,
    });
    window.scrollTo(0, 0);
  }, [excludeQuickwins, includeTrophiesOnly, pushCurrentRouteToStack, viewUser]);

  const openQuickwins = useCallback(() => {
    pushCurrentRouteToStack(quickwinsPublicPath(globalLocale));
    setCurrentView('quickwins');
    setSelectedGame(null);
    navigateToQuickwins({}, { path: quickwinsPublicPath(globalLocale) });
    window.scrollTo(0, 0);
  }, [globalLocale, pushCurrentRouteToStack]);

  const openServertot = useCallback(() => {
    pushCurrentRouteToStack(servertotPublicPath(globalLocale));
    setCurrentView('servertot');
    setSelectedGame(null);
    navigateToQuickwins({}, { path: servertotPublicPath(globalLocale) });
    window.scrollTo(0, 0);
  }, [globalLocale, pushCurrentRouteToStack]);

  const openEasyPlatins = useCallback(() => {
    pushCurrentRouteToStack(easyPlatinsPublicPath(globalLocale));
    setCurrentView('easyplatins');
    setSelectedGame(null);
    navigateToQuickwins({}, { path: easyPlatinsPublicPath(globalLocale) });
    window.scrollTo(0, 0);
  }, [globalLocale, pushCurrentRouteToStack]);

  const openWatchlist = useCallback(() => {
    pushCurrentRouteToStack(WATCHLIST_PATH);
    setCurrentView('watchlist');
    setSelectedGame(null);
    navigateToWatchlist();
    window.scrollTo(0, 0);
  }, [pushCurrentRouteToStack]);

  const openProfile = useCallback(() => {
    pushCurrentRouteToStack(PROFILE_PATH);
    setCurrentView('profile');
    setSelectedGame(null);
    navigateToProfile();
    window.scrollTo(0, 0);
  }, [pushCurrentRouteToStack]);

  const openPlatformTrophies = useCallback(() => {
    pushCurrentRouteToStack(PLATFORM_TROPHIES_PATH);
    setCurrentView('platform-trophies');
    setSelectedGame(null);
    navigateToPlatformTrophies();
    window.scrollTo(0, 0);
  }, [pushCurrentRouteToStack]);

  const maintenanceBypass = hasMaintenanceBypass(sessionUser);
  const isQaAdminView = currentView === 'qa_admin';

  if (staffAppHtml) {
    return (
      <div className="tb-fill-screen flex items-center justify-center text-zinc-500 text-sm font-mono px-4 text-center">
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
      return <LegalNoticePage onBack={goBack} />;
    }
    if (currentView === 'datenschutz') {
      return (
        <PrivacyPage
          onBack={goBack}
          youtubeConsent={youtube}
          onRevokeYoutube={revokeYoutube}
        />
      );
    }
    return <MaintenancePage setCurrentView={setCurrentView} />;
  };

  if (isQaAdminView) {
    if (authLoading) {
      return (
        <div className="tb-fill-screen flex items-center justify-center bg-[#121314] text-zinc-500 text-sm font-mono">
          Sitzung wird geprüft…
        </div>
      );
    }
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
    <ErrorReportProvider sessionUser={viewUser}>
    <WatchlistProvider sessionUser={viewUser}>
    <ProgressSyncProvider sessionUser={viewUser} authLoading={authLoading}>
    <PlatinumStatusProvider sessionUser={viewUser}>
    <div className="tb-fill-screen w-full max-w-full min-w-0 flex flex-col bg-[#121314] text-gray-200 font-sans antialiased">
      <AdminSessionPill sessionUser={sessionUser} />
      <Header
        setCurrentView={setCurrentView}
        sessionUser={viewUser}
        onLogout={handleLogout}
        onOpenWatchlist={openWatchlist}
        onOpenProfile={openProfile}
        onOpenPlatformTrophies={openPlatformTrophies}
        onGoHome={goHome}
        onCustomizeHome={() => {
          if (currentView !== 'home') {
            setCurrentView('home');
            navigateToHome();
          }
          setCustomizeOpen(true);
        }}
      />

      {isLabModeActive(sessionUser) && (currentView === 'home' || currentView === 'profile') ? (
        <Suspense fallback={null}>
          <GamingRoomDrawer
            sessionUser={viewUser}
            currentView={currentView}
            onGoHome={goHome}
            onOpenCockpit={openProfile}
            onOpenPlatformTrophies={openPlatformTrophies}
            onRequestLogin={() => setCurrentView('login')}
          />
        </Suspense>
      ) : null}

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
          currentView === 'watchlist' ||
          currentView === 'profile' ||
          currentView === 'platform-trophies'
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
                sessionUser={viewUser}
                onOpenAdvancedSearch={openAdvancedSearch}
                onOpenWatchlist={openWatchlist}
                onOpenGuideHelp={openGuideHelp}
                onCustomizeHome={() => setCustomizeOpen(true)}
                excludeQuickwins={excludeQuickwins}
                onExcludeQuickwinsChange={setExcludeQuickwins}
                includeTrophiesOnly={includeTrophiesOnly}
                onIncludeTrophiesOnlyChange={setIncludeTrophiesOnly}
              />
            )}

            {currentView === 'watchlist' && (
              <WatchlistPage
                openGame={openGuide}
                onBack={goBack}
                onRequestLogin={() => setCurrentView('login')}
                isAdmin={showAdminChrome}
              />
            )}

            {currentView === 'profile' && (
              authLoading ? (
                <div className="max-w-4xl mx-auto px-4 py-16 text-center text-sm font-mono text-zinc-500 animate-pulse">
                  Sitzung wird geladen…
                </div>
              ) : (
                <ProfilePage
                  sessionUser={viewUser}
                  setCurrentView={setCurrentView}
                  onRequestLogin={() => setCurrentView('login')}
                  openGame={openGuide}
                  onBack={goBack}
                />
              )
            )}

            {currentView === 'search-results' && (
              <SearchResultsPage
                searchResults={searchResults}
                openGame={openGuide}
                loading={loading}
                page={searchPage}
                onBack={goBack}
                isAdmin={showAdminChrome}
                onPageChange={(nextPage) => {
                  setSearchPage(nextPage);
                  navigateToSimpleSearch(searchQuery, {
                    page: nextPage,
                    replace: true,
                    excludeQuickwins,
                    includeTrophiesOnly: Boolean(viewUser) && includeTrophiesOnly,
                  });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            )}

            {currentView === 'advanced-search' && (
              <AdvancedSearchPage
                openGame={openGuide}
                onBack={goBack}
                onOpenQuickwins={openQuickwins}
                onOpenEasyPlatins={openEasyPlatins}
                onOpenServertot={openServertot}
                sessionUser={viewUser}
                quickwinsPath={quickwinsPublicPath(globalLocale)}
                servertotPath={servertotPublicPath(globalLocale)}
                easyPlatinsPath={easyPlatinsPublicPath(globalLocale)}
              />
            )}

            {currentView === 'quickwins' && (
              <QuickwinsPage
                openGame={openGuide}
                onBack={goBack}
                onRequestLogin={() => setCurrentView('login')}
                isAdmin={showAdminChrome}
                sessionUser={viewUser}
                localizedCatalog={QUICKWINS_CATALOG}
              />
            )}

            {currentView === 'servertot' && (
              <QuickwinsPage
                openGame={openGuide}
                onBack={goBack}
                onRequestLogin={() => setCurrentView('login')}
                isAdmin={showAdminChrome}
                sessionUser={viewUser}
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
                onBack={goBack}
                onRequestLogin={() => setCurrentView('login')}
                isAdmin={showAdminChrome}
                sessionUser={viewUser}
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
              <GuideNotFound error={guideLoadError} onBack={goBack} />
            )}

            {currentView === 'game_info' && selectedGame && (
              <GameDetailPage
                currentView={currentView}
                sessionUser={viewUser}
                selectedGame={selectedGame}
                activeTrophies={activeTrophies}
                unlockedTrophies={unlockedTrophies}
                earnedTrophyIds={earnedTrophyIds}
                toggleTrophy={toggleTrophy}
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
                onNavigateHome={goBack}
                onGoHome={goHome}
                openGame={openGuide}
                onOpenHelp={openGuideHelp}
                onActiveTrophies={handleActiveTrophies}
                onReplaceTrophies={replaceActiveTrophies}
                onGameChange={patchSelectedGame}
                startTrophyLoad={startTrophyLoad}
                fromSearch={
                  prevHistoryView === 'search-results' || prevHistoryView === 'advanced-search'
                }
                trophiesOnly={trophiesOnlyView && !isAdminUser(viewUser)}
                backLabel={historyVersion >= 0 ? backLabelForView(prevHistoryView, t) : t('backDashboard')}
              />
            )}

            {currentView === 'platform-trophies' && (
              <PlatformTrophiesPage
                onBack={goBack}
                sessionUser={viewUser}
              />
            )}

            {currentView === 'login' && <LoginPage onLogin={handleLogin} />}
            {currentView === 'tester-setup' && <TesterSetupPage onCreateAccount={handleCreateOwnAccount} />}
            {currentView === 'impressum' && <LegalNoticePage onBack={goBack} />}
            {currentView === 'guide-help' && <HowToPage onBack={goBack} />}
            {currentView === 'datenschutz' && (
              <PrivacyPage
                onBack={goBack}
                youtubeConsent={youtube}
                onRevokeYoutube={revokeYoutube}
              />
            )}
          </>
        ) : (
          renderMaintenanceAllowedView()
        )}

      </main>

      <CustomizeTrophyBaseModal
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
      />
      <MediaConsentBanner onOpenPrivacy={openPrivacy} />
      <SiteFooter
        dbOk={dbOk}
        onOpenImpressum={openImpressum}
        onOpenPrivacy={openPrivacy}
        onOpenHelp={openGuideHelp}
        onOpenPlatformTrophies={openPlatformTrophies}
      />

    </div>
    </PlatinumStatusProvider>
    </ProgressSyncProvider>
    </WatchlistProvider>
    </ErrorReportProvider>
  );
}

export default App;