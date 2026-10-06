import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { CollectibleKacheln, BossKacheln } from './CollectibleKacheln';
import GameSeoInfobox from '../components/GameSeoInfobox';
import AdminGameOverview from '../components/AdminGameOverview';
import GuideLanguageSelector from '../components/GuideLanguageSelector';
import GuideBreadcrumb from '../components/GuideBreadcrumb';
import RelatedGuides from '../components/RelatedGuides';
import GameStatusBanners from '../components/GameStatusBanners';
import CollapsibleSectionCard from '../components/CollapsibleSectionCard';
import TrophyGroupedChecklist from '../components/TrophyGroupedChecklist';
import WatchlistButton from '../components/WatchlistButton';
import ShareButton from '../components/ShareButton';
import GuidePublishButton from '../components/GuidePublishButton';
import AdminFollowupButton from '../components/AdminFollowupButton';
import GuideOnlineBadge from '../components/GuideOnlineBadge';
import PortraitGuideHint from '../components/PortraitGuideHint';
import FeatureHint from '../components/FeatureHint';
import { useFeatureHintSlots } from '../hooks/useFeatureHintSlots';
import { markHintSeen } from '../lib/featureHints';
import GuideTabBar from '../components/GuideTabBar';
import { guideTabId, guideTabPanelId } from '../lib/guideTabs';
import { useTabNavigation } from '../hooks/useTabNavigation';
import { useTabScrollMemory } from '../hooks/useTabScrollMemory';
import { GuideVideoProvider, useGuideVideo } from '../context/GuideVideoContext';
import { GAME_FIELDS, GAME_STRUCT } from '../lib/gameSchema';
import { publicStudioCredits } from '../lib/studioCredits';
import {
  buildBossOverviewData,
  buildByTypeGuideData,
  buildChronologicalGuideData,
} from '../lib/guideData';
import { incrementGameViews } from '../lib/gameQueries';
import { loadRelatedGuides } from '../lib/relatedGames';
import { fetchGameGuideBundle, resolveGameId, resolveGuideLanguage } from '../lib/guideQueries';
import { fetchGameTrophiesWithEarned } from '../lib/earnedTrophyQueries';
import { isAdminUser } from '../lib/adminAccess';
import { isGuidePublished } from '../lib/guidePublication';
import { clearIntranetCover, setIntranetIgdbCover } from '../lib/intranetGameEdits';
import { fetchContentCreatorsForGame } from '../lib/contentCreators';
import {
  getGameCover,
  getGameDescription,
  getGameTitle,
  getGameUuid,
} from '../lib/gameModel';
import { useLocale } from '../context/LocaleContext';
import { contentLocalesForGame, DEFAULT_AVAILABLE_LOCALES } from '../lib/contentLocales';
import { fetchOnlineTrophyIdsForGame } from '../lib/trophyQueries';
import {
  fetchTrophyStatusMessages,
  fetchTrophyStatusMessagesByIds,
  hasOnlineTrophiesFlag,
  isServerDead,
  isServerOffline,
  STATUS_MESSAGE_IDS,
  STATUS_MESSAGE_KEYS,
} from '../lib/trophyStatusMessages';

const TAB_META = {
  reiter0: { icon: '🏆', labelKey: 'trophies' },
  reiter1: { icon: '📖', labelKey: 'fullGameplay' },
  reiter2: { icon: '📦', labelKey: 'completion' },
  reiter3: { icon: '⚔️', labelKey: 'bosses' },
};

function GamePageContent({
  currentView,
  selectedGame,
  activeTrophies,
  unlockedTrophies,
  earnedTrophyIds,
  toggleTrophy,
  completedCount,
  progressPercent,
  hideCompleted,
  setHideCompleted,
  completedGuideItems,
  toggleGuideItemCompleted,
  activeTab,
  setActiveTab,
  loadingGuide,
  guideItems,
  chapterItems,
  bossItems,
  onNavigateHome,
  onGoHome,
  openGame,
  onOpenHelp,
  onActiveTrophies,
  startTrophyLoad,
  fromSearch = false,
  sessionUser = null,
}) {
  const [guideRows, setGuideRows] = useState([]);
  const [chapterRows, setChapterRows] = useState([]);
  const [bossRows, setBossRows] = useState([]);
  const [guidesLoading, setGuidesLoading] = useState(false);
  const { globalLocale, t, setAvailableLocales } = useLocale();
  const [guideLanguageOverride, setGuideLanguageOverride] = useState(null);
  const [statusMessages, setStatusMessages] = useState({
    [STATUS_MESSAGE_KEYS.SERVER_SHUTDOWN]: '',
  });
  const [coverStatusMessages, setCoverStatusMessages] = useState({
    serverDead: '',
    onlineTrophies: '',
  });
  const [onlineTrophyIds, setOnlineTrophyIds] = useState(() => new Set());
  const [contentCreators, setContentCreators] = useState([]);
  const [relatedGuides, setRelatedGuides] = useState({ creatorGames: [], similarGames: [] });
  // Nach dem Freigeben sofort umschalten, ohne das Spiel neu zu laden. Die UUID
  // hängt mit dran, damit der Wert beim Spielwechsel nicht fälschlich greift.
  const [publicationOverride, setPublicationOverride] = useState(null);
  const [coverOverride, setCoverOverride] = useState(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState('');
  const [igdbPrompt, setIgdbPrompt] = useState(false);
  const [igdbLink, setIgdbLink] = useState('');
  const [playtime, setPlaytime] = useState(null);
  const { notifyVideoCleared } = useGuideVideo();

  useEffect(() => {
    if (activeTab === 'reiter0') {
      notifyVideoCleared();
    }
  }, [activeTab, notifyVideoCleared]);

  useEffect(() => {
    notifyVideoCleared();
  }, [selectedGame?.id, selectedGame?.platform_game_id, notifyVideoCleared]);

  useEffect(() => {
    if (Array.isArray(guideItems)) setGuideRows(guideItems);
  }, [guideItems]);

  useEffect(() => {
    if (Array.isArray(chapterItems)) setChapterRows(chapterItems);
  }, [chapterItems]);

  useEffect(() => {
    if (Array.isArray(bossItems)) setBossRows(bossItems);
  }, [bossItems]);

  useEffect(() => {
    setGuideLanguageOverride(null);
    setCoverOverride(null);
    setCoverError('');
    setIgdbPrompt(false);
    setIgdbLink('');
  }, [selectedGame?.id, selectedGame?.platform_game_id]);

  useEffect(() => {
    const uuid = getGameUuid(selectedGame);
    if (!uuid) return;
    incrementGameViews(supabase, uuid);
  }, [selectedGame?.id]);

  const creatorGameId = getGameUuid(selectedGame);

  useEffect(() => {
    let cancelled = false;
    setContentCreators([]);

    async function loadCreator() {
      if (!creatorGameId) return;
      const { data } = await fetchContentCreatorsForGame(supabase, creatorGameId);
      if (!cancelled) setContentCreators(data ?? []);
    }

    loadCreator();
    return () => {
      cancelled = true;
    };
  }, [creatorGameId]);

  useEffect(() => {
    let cancelled = false;

    async function loadStatusMessages() {
      const { messages } = await fetchTrophyStatusMessages(
        supabase,
        [STATUS_MESSAGE_KEYS.SERVER_SHUTDOWN],
        globalLocale,
      );
      if (!cancelled) setStatusMessages(messages);
    }

    loadStatusMessages();
    return () => {
      cancelled = true;
    };
  }, [globalLocale]);

  useEffect(() => {
    let cancelled = false;

    async function loadCoverAndOnlineData() {
      if (!selectedGame) {
        setCoverStatusMessages({ serverDead: '', onlineTrophies: '' });
        setOnlineTrophyIds(new Set());
        return;
      }

      const gameId = resolveGameId(selectedGame);
      const showServerDead = isServerDead(selectedGame);
      const showOnlineNote = hasOnlineTrophiesFlag(selectedGame);

      const idsToLoad = [];
      if (showServerDead) idsToLoad.push(STATUS_MESSAGE_IDS.SERVER_DEAD);
      if (showOnlineNote) idsToLoad.push(STATUS_MESSAGE_IDS.HAS_ONLINE_TROPHIES);

      const [messagesById, onlineRes] = await Promise.all([
        idsToLoad.length > 0
          ? fetchTrophyStatusMessagesByIds(supabase, idsToLoad, globalLocale)
          : Promise.resolve({ messages: {} }),
        gameId ? fetchOnlineTrophyIdsForGame(supabase, gameId) : Promise.resolve({ ids: new Set() }),
      ]);

      if (cancelled) return;

      setCoverStatusMessages({
        serverDead: showServerDead
          ? messagesById.messages[STATUS_MESSAGE_IDS.SERVER_DEAD] ?? ''
          : '',
        onlineTrophies: showOnlineNote
          ? messagesById.messages[STATUS_MESSAGE_IDS.HAS_ONLINE_TROPHIES] ?? ''
          : '',
      });
      setOnlineTrophyIds(onlineRes.ids ?? new Set());
    }

    loadCoverAndOnlineData();
    return () => {
      cancelled = true;
    };
  }, [selectedGame, globalLocale]);

  useEffect(() => {
    let cancelled = false;

    async function loadGuideBundle() {
      if (!selectedGame) {
        setGuideRows([]);
        setChapterRows([]);
        setBossRows([]);
        return;
      }

      const gameId = resolveGameId(selectedGame);
      if (!gameId) return;

      setGuidesLoading(true);
      const loadId = startTrophyLoad?.();
      const [bundle, trophyResult] = await Promise.all([
        fetchGameGuideBundle(supabase, gameId, globalLocale, guideLanguageOverride),
        fetchGameTrophiesWithEarned(
          supabase,
          sessionUser?.id ?? null,
          selectedGame,
          globalLocale,
          guideLanguageOverride,
        ),
      ]);
      const { chapters, guides, bosses, chaptersError, guidesError, bossesError } = bundle;

      if (cancelled) return;

      if (!trophyResult.trophiesError) {
        onActiveTrophies?.(trophyResult.trophies, trophyResult.earnedIds, loadId);
      }

      if (chaptersError || guidesError || bossesError) {
        console.error('game_guides:', (chaptersError || guidesError || bossesError).message, {
          gameId,
        });
      }

      if (!chaptersError) setChapterRows(chapters);
      if (!guidesError) setGuideRows(guides);
      if (!bossesError) setBossRows(bosses);

      setGuidesLoading(false);
    }

    loadGuideBundle();
    return () => {
      cancelled = true;
    };
  }, [selectedGame, globalLocale, guideLanguageOverride, sessionUser?.id, onActiveTrophies, startTrophyLoad]);

  const chronologicalGuideData = useMemo(
    () => buildChronologicalGuideData(chapterRows),
    [chapterRows],
  );

  const byTypeGuideData = useMemo(() => buildByTypeGuideData(guideRows), [guideRows]);

  const bossOverviewData = useMemo(() => buildBossOverviewData(bossRows), [bossRows]);

  /**
   * Nachschlagewerk für game_guides.trophy_id → Trophäe. Die Trophäen sind für
   * Reiter 0 sowieso schon geladen, es braucht also keine zweite Abfrage.
   */
  const trophyById = useMemo(() => {
    const map = new Map();
    for (const trophy of activeTrophies ?? []) {
      const key = String(trophy?.platform_achievement_id ?? trophy?.trophy_id ?? '').trim();
      if (key) map.set(key, trophy);
    }
    return map;
  }, [activeTrophies]);

  const watchlistGameId = useMemo(() => getGameUuid(selectedGame), [selectedGame]);

  const gameId = watchlistGameId;

  const gameUuid = useMemo(() => getGameUuid(selectedGame), [selectedGame]);
  const studioCredits = useMemo(() => publicStudioCredits(selectedGame), [selectedGame]);

  /** Sprache des angezeigten Guides – entscheidet, ob der Freigabe-Button erscheint. */
  const effectiveGuideLang = resolveGuideLanguage(globalLocale, guideLanguageOverride);

  const gameForPublication = useMemo(() => {
    if (!publicationOverride || publicationOverride.uuid !== gameUuid) return selectedGame;
    return {
      ...selectedGame,
      ...(publicationOverride.status != null
        ? { [GAME_STRUCT.status]: publicationOverride.status }
        : {}),
      slug: publicationOverride.slug || selectedGame.slug,
      ...(publicationOverride.gameType
        ? { [GAME_STRUCT.gameType]: publicationOverride.gameType }
        : {}),
      ...(Array.isArray(publicationOverride.homeTags)
        ? { [GAME_STRUCT.homeTags]: publicationOverride.homeTags }
        : {}),
    };
  }, [selectedGame, publicationOverride, gameUuid]);

  const isAdmin = isAdminUser(sessionUser);
  /** Sichtbarkeit der Guide-Reiter hängt an der gerade gezeigten Sprache. */
  const guidePublished = isGuidePublished(gameForPublication, effectiveGuideLang);
  /** Admins sehen den Guide als Vorschau, Besucher erst nach der Freigabe. */
  const canSeeGuides = guidePublished || isAdmin;
  const contentLocales = useMemo(
    () => contentLocalesForGame(gameForPublication, { includeReady: isAdmin }),
    [gameForPublication, isAdmin],
  );

  useEffect(() => {
    setAvailableLocales(contentLocales);
  }, [contentLocales, setAvailableLocales]);

  useEffect(() => {
    return () => setAvailableLocales(DEFAULT_AVAILABLE_LOCALES);
  }, [setAvailableLocales]);

  useEffect(() => {
    if (!isAdmin || !gameUuid) {
      setPlaytime(null);
      return undefined;
    }
    let cancelled = false;
    supabase
      .from('games')
      .select('spielzeit_hauptstory, spielzeit_komplettierer')
      .eq('id', gameUuid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) {
          if (!cancelled) setPlaytime(null);
          return;
        }
        setPlaytime({
          hauptstory: data?.spielzeit_hauptstory ?? null,
          komplett: data?.spielzeit_komplettierer ?? null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, gameUuid]);

  useEffect(() => {
    let cancelled = false;

    async function loadRelated() {
      if (!selectedGame) {
        setRelatedGuides({ creatorGames: [], similarGames: [] });
        return;
      }
      const result = await loadRelatedGuides(supabase, selectedGame, {
        locale: globalLocale,
        includeReady: isAdmin,
      });
      if (!cancelled) {
        setRelatedGuides({
          creatorGames: result.creatorGames,
          similarGames: result.similarGames,
        });
      }
    }

    loadRelated();
    return () => {
      cancelled = true;
    };
  }, [selectedGame, globalLocale, isAdmin]);

  const isGuideLoading = guidesLoading || loadingGuide;

  const gameTitle = getGameTitle(selectedGame, globalLocale);
  const gameCover = coverOverride === null ? getGameCover(selectedGame, globalLocale) : coverOverride;

  const rememberCoverStatus = (status) => {
    setPublicationOverride((prev) => ({
      uuid: gameUuid,
      status,
      slug: prev?.uuid === gameUuid ? prev.slug : null,
      gameType: prev?.uuid === gameUuid ? prev.gameType : null,
      homeTags: prev?.uuid === gameUuid ? prev.homeTags : undefined,
    }));
  };

  const handleClearCover = async () => {
    if (!gameUuid || coverBusy) return;
    const confirmed = window.confirm('Cover wirklich löschen? Der IGDB-Status wird dabei mit entfernt.');
    if (!confirmed) return;

    setCoverBusy(true);
    setCoverError('');
    const { status, error } = await clearIntranetCover(supabase, gameUuid);
    setCoverBusy(false);
    if (error) {
      setCoverError(error.message || 'Cover konnte nicht gelöscht werden.');
      return;
    }
    setCoverOverride('');
    rememberCoverStatus(status);
  };

  const handleSaveIgdbLink = async (event) => {
    event.preventDefault();
    if (!gameUuid || coverBusy) return;

    setCoverBusy(true);
    setCoverError('');
    const { coverUrl, status, error } = await setIntranetIgdbCover(supabase, gameUuid, igdbLink);
    setCoverBusy(false);
    if (error) {
      setCoverError(error.message || 'IGDB-Link konnte nicht gespeichert werden.');
      return;
    }
    setCoverOverride(coverUrl);
    setIgdbPrompt(false);
    setIgdbLink('');
    rememberCoverStatus(status);
  };
  const gameDescription = getGameDescription(selectedGame, globalLocale);

  const showServerShutdown = isServerOffline(selectedGame);
  const showCoverServerDead = isServerDead(selectedGame);
  const showCoverOnlineNote = hasOnlineTrophiesFlag(selectedGame);

  const tabCounts = {
    reiter0: activeTrophies.length,
    reiter1: chronologicalGuideData.length,
    reiter2: byTypeGuideData.length,
    reiter3: bossOverviewData.length,
  };

  const tabVisibility = useMemo(
    () => ({
      reiter0: true,
      reiter1: canSeeGuides && (isGuideLoading || tabCounts.reiter1 > 0),
      reiter2: canSeeGuides && (isGuideLoading || tabCounts.reiter2 > 0),
      reiter3: canSeeGuides && (isGuideLoading || tabCounts.reiter3 > 0),
    }),
    [canSeeGuides, isGuideLoading, tabCounts.reiter1, tabCounts.reiter2, tabCounts.reiter3],
  );

  const hasGuideContent =
    tabCounts.reiter1 > 0 || tabCounts.reiter2 > 0 || tabCounts.reiter3 > 0;

  const visibleTabs = useMemo(
    () => ['reiter0', 'reiter1', 'reiter2', 'reiter3'].filter((tab) => tabVisibility[tab]),
    [tabVisibility],
  );

  useEffect(() => {
    if (!visibleTabs.includes(activeTab) && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0]);
    }
  }, [activeTab, visibleTabs, setActiveTab]);

  const tabItems = useMemo(
    () =>
      visibleTabs.map((id) => ({
        id,
        icon: TAB_META[id].icon,
        label: t(TAB_META[id].labelKey),
        count: tabCounts[id],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleTabs, t, tabCounts.reiter0, tabCounts.reiter1, tabCounts.reiter2, tabCounts.reiter3],
  );

  const guideSectionRef = useRef(null);
  const tabBarRef = useRef(null);
  const isGuideVisible = currentView === 'game_info' && Boolean(selectedGame);

  const rememberScroll = useTabScrollMemory({
    activeTab,
    anchorRef: tabBarRef,
    resetKey: gameId,
    enabled: isGuideVisible,
  });

  const handleTabChange = useCallback(
    (nextTab) => {
      if (nextTab === activeTab) return;
      rememberScroll();
      setActiveTab(nextTab);
    },
    [activeTab, rememberScroll, setActiveTab],
  );

  const { goToPrevTab, goToNextTab, canGoPrev, canGoNext } = useTabNavigation({
    tabs: visibleTabs,
    activeTab,
    onTabChange: handleTabChange,
    containerRef: guideSectionRef,
    enabled: isGuideVisible,
  });

  const featureHints = useFeatureHintSlots({
    isVideoGuideTab: activeTab !== 'reiter0',
    tabCount: visibleTabs.length,
  });

  const renderTabContent = () => (
    <div className="w-full flex flex-col gap-4">
      {activeTab === 'reiter0' && (
        <div
          role="tabpanel"
          id={guideTabPanelId('reiter0')}
          aria-labelledby={guideTabId('reiter0')}
        >
          <div className="flex justify-between items-center mb-4 px-1">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">
              {t('trophyChecklist')}
            </h3>
            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideCompleted}
                onChange={(e) => setHideCompleted(e.target.checked)}
                className="rounded-sm border-zinc-700 bg-[#121314] text-[#00ff66] focus:ring-0 w-4 h-4 cursor-pointer"
              />
              {t('hideCompleted')}
            </label>
          </div>

          <div className="mb-4 px-1">
            <div className="flex justify-between items-center mb-2 text-xs font-mono">
              <span className="text-zinc-400 uppercase tracking-wider">{t('overallProgress')}</span>
              <span className="text-[#00ff66] font-bold text-sm">
                {progressPercent}% ({completedCount}/{activeTrophies.length})
              </span>
            </div>
            <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-[#00ff66] h-full rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(0,255,102,0.5)]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <TrophyGroupedChecklist
            gameId={gameId}
            trophies={activeTrophies}
            unlockedTrophies={unlockedTrophies}
            earnedTrophyIds={earnedTrophyIds}
            onlineTrophyIds={onlineTrophyIds}
            hideCompleted={hideCompleted}
            onToggle={toggleTrophy}
            mainGameTitle={gameTitle || 'Hauptspiel'}
          />
        </div>
      )}

      {activeTab === 'reiter1' && (
        <div
          key="tab-walkthrough"
          role="tabpanel"
          id={guideTabPanelId('reiter1')}
          aria-labelledby={guideTabId('reiter1')}
          className="w-full"
        >
          {chronologicalGuideData.length === 0 && !isGuideLoading ? (
            <p className="text-xs text-zinc-500 italic text-center py-8 bg-[#1a1b1c] rounded-xl border border-zinc-800">
              Kein Walkthrough für dieses Spiel (sheet_type 1 / chronological_group).
            </p>
          ) : (
            <CollapsibleSectionCard
              sectionId="guide-walkthrough"
              title="Walkthrough"
              subtitle="Chronologisch nach Gebieten"
              badge={`${chronologicalGuideData.length} Einträge`}
              defaultOpen
              accent="green"
            >
              <CollectibleKacheln
                gameId={gameId}
                reportEntityType="guide_step"
                collectiblesData={chronologicalGuideData}
                trophyById={trophyById}
                groupByField="chronological_group"
                groupHeaderIcon="📍"
                listTitle="Walkthrough"
                hideCompleted={hideCompleted}
                setHideCompleted={setHideCompleted}
                completedItems={completedGuideItems}
                toggleCompleted={toggleGuideItemCompleted}
                emptyVideoMessage="Kein Video für dieses Gebiet oder alle Einträge ausgeblendet."
                embedInAccordion
              />
            </CollapsibleSectionCard>
          )}
        </div>
      )}

      {activeTab === 'reiter2' && (
        <div
          key="tab-collectibles"
          role="tabpanel"
          id={guideTabPanelId('reiter2')}
          aria-labelledby={guideTabId('reiter2')}
          className="w-full"
        >
          {byTypeGuideData.length === 0 && !isGuideLoading ? (
            <p className="text-xs text-zinc-500 italic text-center py-8 bg-[#1a1b1c] rounded-xl border border-zinc-800">
              Keine Sammelobjekte für dieses Spiel (sheet_type 2 / category_group).
            </p>
          ) : (
            <CollapsibleSectionCard
              sectionId="guide-collectibles"
              title="Sammelobjekte"
              subtitle="Nach Kategorien"
              badge={`${byTypeGuideData.length} Einträge`}
              defaultOpen
              accent="amber"
            >
              <CollectibleKacheln
                gameId={gameId}
                reportEntityType="guide_item"
                collectiblesData={byTypeGuideData}
                trophyById={trophyById}
                groupByField="category_group"
                groupHeaderIcon="📦"
                listTitle="Sammelobjekte"
                hideCompleted={hideCompleted}
                setHideCompleted={setHideCompleted}
                completedItems={completedGuideItems}
                toggleCompleted={toggleGuideItemCompleted}
                emptyVideoMessage="Kein Video für diese Kategorie oder alle Gegenstände ausgeblendet."
                embedInAccordion
              />
            </CollapsibleSectionCard>
          )}
        </div>
      )}

      {activeTab === 'reiter3' && (
        <div
          key="tab-bosses"
          role="tabpanel"
          id={guideTabPanelId('reiter3')}
          aria-labelledby={guideTabId('reiter3')}
          className="w-full"
        >
          {bossOverviewData.length === 0 && !isGuideLoading ? (
            <p className="text-xs text-zinc-500 italic text-center py-8 bg-[#1a1b1c] rounded-xl border border-zinc-800">
              Keine Bosse für dieses Spiel (sheet_type 3 / chronological_group).
            </p>
          ) : (
            <CollapsibleSectionCard
              sectionId="guide-bosses"
              title="Bosse"
              subtitle="Nach Gebieten"
              badge={`${bossOverviewData.length} Bosse`}
              defaultOpen
              accent="purple"
            >
              <BossKacheln
                gameId={gameId}
                bossesData={bossOverviewData}
                trophyById={trophyById}
                listTitle="Bosse"
                hideCompleted={hideCompleted}
                setHideCompleted={setHideCompleted}
                completedItems={completedGuideItems}
                toggleCompleted={toggleGuideItemCompleted}
                embedInAccordion
              />
            </CollapsibleSectionCard>
          )}
        </div>
      )}
    </div>
  );

  if (currentView !== 'game_info' || !selectedGame) return null;

  return (
    <div className="w-full max-w-[1400px] min-w-0 overflow-x-hidden mx-auto px-4 md:px-8 pt-6 pb-12 box-border">
      <GuideBreadcrumb game={selectedGame} title={gameTitle} onHome={onGoHome || onNavigateHome} />
      <PortraitGuideHint
        isGuideView
        isVideoGuideTab={activeTab !== 'reiter0'}
        onOpenHelp={onOpenHelp}
      />
      {featureHints.swipe && onOpenHelp ? (
        <FeatureHint
          id="swipe"
          text={t('hintSwipe')}
          moreLabel={t('hintMore')}
          okLabel={t('hintOk')}
          onMore={() => onOpenHelp('wischen')}
        />
      ) : null}
      <GameStatusBanners
        showServerShutdown={showServerShutdown}
        serverMessage={statusMessages[STATUS_MESSAGE_KEYS.SERVER_SHUTDOWN]}
      />

      <button
        type="button"
        onClick={onNavigateHome}
        className="text-[#00ff66] mb-6 flex items-center gap-1 text-xs uppercase tracking-wider font-bold hover:underline bg-none border-none cursor-pointer"
      >
        {fromSearch ? t('backToSearch') : t('backDashboard')}
      </button>

      <div className="w-full min-w-0 bg-[#1a1b1c] rounded-2xl border border-zinc-800 p-6 flex flex-col md:flex-row flex-wrap md:flex-nowrap gap-8 items-start mb-8 shadow-xl">
        <div className="relative w-full md:w-64 aspect-[3/4] rounded-xl overflow-hidden shadow-2xl border border-zinc-800 bg-[#121314] flex-shrink-0">
          {gameCover ? (
            <img
              src={gameCover}
              className="w-full h-full object-cover"
              alt="Game Cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center px-4 text-center text-[11px] font-mono uppercase tracking-wider text-zinc-600">
              kein Cover
            </div>
          )}
          <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none">
            <GuideOnlineBadge game={gameForPublication} visible={isAdmin} size="md" />
          </div>
          {isAdmin ? (
            <div className="absolute top-2.5 right-2.5 z-10 flex flex-col items-end gap-1">
              {gameCover ? (
                <button
                  type="button"
                  onClick={handleClearCover}
                  disabled={coverBusy}
                  title="Cover löschen und status.igdb entfernen"
                  className="rounded-lg border border-red-500/40 bg-black/75 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                >
                  {coverBusy ? '…' : 'Löschen'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setCoverError('');
                  setIgdbPrompt(true);
                }}
                disabled={coverBusy}
                title="Neuen IGDB-Bildlink als Cover setzen"
                className="rounded-lg border border-[#00ff66]/40 bg-black/75 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-[#00ff66] hover:bg-[#00ff66]/15 disabled:opacity-50"
              >
                IGDB-Link
              </button>
            </div>
          ) : null}
          {coverError && !igdbPrompt ? (
            <p className="absolute inset-x-2 bottom-2 z-10 rounded-lg bg-black/80 px-2 py-1 text-[10px] font-mono text-red-300">
              {coverError}
            </p>
          ) : null}
        </div>
        {igdbPrompt ? (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="igdb-link-title"
          >
            <form
              onSubmit={handleSaveIgdbLink}
              className="w-full max-w-md rounded-2xl border border-zinc-700 bg-[#1a1b1c] p-5 shadow-2xl"
            >
              <h2 id="igdb-link-title" className="text-sm font-bold text-white">
                Neuer IGDB-Link
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Bildlink von images.igdb.com einfügen. Der ersetzt das Cover und hält den IGDB-Status auf erledigt, damit der nächste Lauf ihn nicht wieder überschreibt.
              </p>
              <input
                type="text"
                inputMode="url"
                value={igdbLink}
                onChange={(event) => setIgdbLink(event.target.value)}
                placeholder="https://images.igdb.com/igdb/image/upload/…"
                autoFocus
                className="mt-4 w-full rounded-xl border border-zinc-700 bg-[#121314] px-3 py-2 text-sm text-zinc-200 focus:border-[#00ff66]/40 focus:outline-hidden"
              />
              {coverError ? (
                <p className="mt-2 text-[11px] font-mono text-red-300">{coverError}</p>
              ) : null}
              <div className="mt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={coverBusy}
                  onClick={() => {
                    setIgdbPrompt(false);
                    setCoverError('');
                  }}
                  className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={coverBusy || !igdbLink.trim()}
                  className="rounded-xl bg-[#00ff66] px-4 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-[#121314] disabled:opacity-50"
                >
                  {coverBusy ? 'Speichert…' : 'Setzen'}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        <div className="flex-grow w-full min-w-0 flex flex-col justify-between h-full pt-2">
          <div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <span className="inline-flex items-center rounded-md border border-[#00ff66]/20 bg-[#00ff66]/10 px-2.5 py-1 font-mono text-sm font-bold uppercase tracking-wider text-[#00ff66]">
                  {t('platinGuide')}
                </span>
                <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight break-words mt-2 mb-6">
                  {gameTitle}
                </h2>
              </div>
              <div className="flex flex-col items-stretch sm:items-end gap-2 sm:flex-shrink-0 sm:mt-1">
                <WatchlistButton gameId={watchlistGameId} variant="detail" />
                <ShareButton title={gameTitle} />
                {featureHints.watchlist && onOpenHelp ? (
                  <p className="max-w-[16rem] text-right text-[10px] leading-snug text-zinc-500">
                    {t('hintWatchlist')}{' '}
                    <button
                      type="button"
                      className="border-none bg-transparent p-0 text-[#00ff66] underline cursor-pointer"
                      onClick={() => {
                        markHintSeen('watchlist');
                        onOpenHelp('watchlist');
                      }}
                    >
                      {t('hintMore')}
                    </button>
                    {' · '}
                    <button
                      type="button"
                      className="border-none bg-transparent p-0 font-mono uppercase text-zinc-400 cursor-pointer"
                      onClick={() => markHintSeen('watchlist')}
                    >
                      {t('hintOk')}
                    </button>
                  </p>
                ) : null}
                <GuidePublishButton
                  user={sessionUser}
                  game={gameForPublication}
                  gameUuid={gameUuid}
                  guideLang={effectiveGuideLang}
                  onGameTypeChange={(gameType) =>
                    setPublicationOverride((prev) => ({
                      uuid: gameUuid,
                      status: prev?.uuid === gameUuid ? prev.status : undefined,
                      slug: prev?.uuid === gameUuid ? prev.slug : null,
                      gameType,
                      homeTags: prev?.uuid === gameUuid ? prev.homeTags : undefined,
                    }))
                  }
                  onPublishedChange={(status, extra) =>
                    setPublicationOverride((prev) => ({
                      uuid: gameUuid,
                      status,
                      slug: extra?.slug ?? null,
                      gameType: extra?.gameType || (prev?.uuid === gameUuid ? prev.gameType : null),
                      homeTags: Array.isArray(extra?.homeTags)
                        ? extra.homeTags
                        : (prev?.uuid === gameUuid ? prev.homeTags : undefined),
                    }))
                  }
                />
                <AdminFollowupButton user={sessionUser} gameId={gameUuid} title={gameTitle} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-4 sm:gap-x-8 w-full max-w-xl min-w-0 text-sm border-t border-zinc-800/60 pt-4">
              <div className="flex justify-between border-b border-zinc-800/40 pb-2 sm:col-span-2">
                <span className="text-zinc-500 font-mono text-xs uppercase">{t('searchConsole')}</span>
                <span className="text-sky-300 font-semibold text-right">
                  {selectedGame[GAME_FIELDS.console] || '—'}
                </span>
              </div>
              <div className="flex justify-between border-b border-zinc-800/40 pb-2">
                <span className="text-zinc-500 font-mono text-xs uppercase">{t('releaseYear')}</span>
                <span className="text-zinc-200 font-medium">
                  {selectedGame[GAME_FIELDS.year] || '—'}
                </span>
              </div>
              <div className="flex justify-between border-b border-zinc-800/40 pb-2 col-span-2 sm:col-span-1">
                <span className="text-zinc-500 font-mono text-xs uppercase">{t('searchGenre')}</span>
                <span className="text-zinc-200 font-medium">
                  {selectedGame[GAME_FIELDS.genre] || '—'}
                </span>
              </div>
              <div className="flex justify-between border-b border-zinc-800/40 pb-2 col-span-2">
                <span className="text-zinc-500 font-mono text-xs uppercase">{t('studioLabel')}</span>
                <span className="text-zinc-200 font-medium">
                  {studioCredits.studio || '—'}
                </span>
              </div>
              {studioCredits.publisher ? (
                <div className="flex justify-between border-b border-zinc-800/40 pb-2 col-span-2">
                  <span className="text-zinc-500 font-mono text-xs uppercase">{t('publisherLabel')}</span>
                  <span className="text-zinc-200 font-medium">
                    {studioCredits.publisher}
                  </span>
                </div>
              ) : null}

              {showCoverServerDead && coverStatusMessages.serverDead && (
                <div className="col-span-2 pt-2">
                  <p className="text-xs leading-relaxed text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
                    {coverStatusMessages.serverDead}
                  </p>
                </div>
              )}

              {showCoverOnlineNote && coverStatusMessages.onlineTrophies && (
                <div className="col-span-2 pt-2">
                  <p className="text-xs leading-relaxed text-sky-300 bg-sky-950/40 border border-sky-800/50 rounded-lg px-3 py-2">
                    {coverStatusMessages.onlineTrophies}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {isAdmin ? (
        <AdminGameOverview className="mb-8" game={gameForPublication} title={gameTitle} playtime={playtime} />
      ) : null}

      <GameSeoInfobox
        title={gameTitle}
        description={gameDescription}
        creators={contentCreators}
      />

      <section ref={guideSectionRef} className="mt-8 w-full min-w-0">
        <GuideLanguageSelector
          guideLanguageOverride={guideLanguageOverride}
          onGuideLanguageOverride={setGuideLanguageOverride}
          locales={contentLocales}
        />

        {isAdmin && !guidePublished && hasGuideContent && (
          <p className="text-xs text-amber-400 font-mono mb-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
            Vorschau: Dieser Guide ist noch nicht freigegeben ({effectiveGuideLang.toUpperCase()}) und
            für Besucher unsichtbar.
          </p>
        )}

        {!canSeeGuides && hasGuideContent && (
          <p className="text-xs text-zinc-500 italic text-center py-8 bg-[#1a1b1c] rounded-xl border border-zinc-800">
            Der Guide zu diesem Spiel wird derzeit redaktionell geprüft und ist noch nicht
            freigegeben.
          </p>
        )}

        <GuideTabBar
          tabs={tabItems}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onPrev={goToPrevTab}
          onNext={goToNextTab}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          anchorRef={tabBarRef}
        />

        {isGuideLoading && activeTab !== 'reiter0' && (
          <p className="text-xs text-zinc-500 font-mono mb-4 animate-pulse">{t('guideLoading')}</p>
        )}

        {renderTabContent()}
      </section>

      <RelatedGuides
        creatorName={contentCreators[0]?.channelName || ''}
        creatorGames={relatedGuides.creatorGames}
        similarGames={relatedGuides.similarGames}
        openGame={openGame}
      />
    </div>
  );
}

function GamePage(props) {
  return (
    <GuideVideoProvider>
      <GamePageContent {...props} />
    </GuideVideoProvider>
  );
}

export default GamePage;
