import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import GameSeoInfobox from '../components/GameSeoInfobox';
import GameGuideWorkspace from '../components/GameGuideWorkspace';
import AdminGameOverview from '../components/AdminGameOverview';
import AdminQuickGuideModal from '../components/AdminQuickGuideModal';
import AdminRohmaterialTinderBar from '../components/AdminRohmaterialTinderBar';
import GuideLanguageSelector from '../components/GuideLanguageSelector';
import GuideBreadcrumb from '../components/GuideBreadcrumb';
import RelatedGuides from '../components/RelatedGuides';
import WatchlistButton from '../components/WatchlistButton';
import ShareButton from '../components/ShareButton';
import GuidePublishButton from '../components/GuidePublishButton';
import AdminFollowupButton from '../components/AdminFollowupButton';
import AdminMoveToMultiTabButton from '../components/AdminMoveToMultiTabButton';
import AdminGameTypeSelect from '../components/AdminGameTypeSelect';
import AdminHardwareSelect from '../components/AdminHardwareSelect';
import GuideOnlineBadge from '../components/GuideOnlineBadge';
import PortraitGuideHint from '../components/PortraitGuideHint';
import FeatureHint from '../components/FeatureHint';
import { useFeatureHintSlots } from '../hooks/useFeatureHintSlots';
import { markHintSeen } from '../lib/featureHints';
import { useTabNavigation } from '../hooks/useTabNavigation';
import { useTabScrollMemory } from '../hooks/useTabScrollMemory';
import { GuideVideoProvider, useGuideVideo } from '../context/GuideVideoContext';
import { GAME_FIELDS, GAME_STRUCT, GUIDE_SHEET_TYPE } from '../lib/gameSchema';
import { buildGuideWorkspaceTabs, getGameViewPolicy } from '../lib/gameViewPolicy';
import { publicStudioCredits } from '../lib/studioCredits';
import { DeveloperSearchLink, HomeTagSearchLinks } from '../components/SearchFacetLink';
import {
  buildBossOverviewData,
  buildByTypeGuideData,
  buildChronologicalGuideData,
} from '../lib/guideData';
import { incrementGameViews, updateGameLocalizedFields } from '../lib/gameQueries';
import { loadRelatedGuides } from '../lib/relatedGames';
import { fetchGameGuideBundle, resolveGameId, resolveGuideLanguage } from '../lib/guideQueries';
import { fetchGameTrophiesWithEarned } from '../lib/earnedTrophyQueries';
import { VIDEO_TIMESTAMP_LAYOUT, useUserPreferences } from '../lib/userPreferences';
import { fetchMyCreatorProfile, isAdminUser, isStaffDeviceOrSession } from '../lib/adminAccess';
import { isGuidePublished, isGameDraftMode, hasPublishedGuide } from '../lib/guidePublication';
import {
  clearIntranetCover,
  deleteSingleGuideStep,
  markGameCoverValid,
  setIntranetIgdbCover,
} from '../lib/intranetGameEdits';
import {
  discardRohmaterialBatch,
  fetchRohmaterialBatchesForGame,
  matchRohmaterialBatchForPc,
  promoteRohmaterialBatchToGuide,
} from '../lib/rohmaterialQueries';
import { gameGuidePath, withGuideTabParam, writeAppPath } from '../lib/routeUtils';
import { isPlatinumUnlocked } from '../lib/trophyTypes';
import {
  fetchLinkedPlatformStacks,
  fetchSteamAchievementsAsTrophies,
  fetchXboxAchievementsAsTrophies,
} from '../lib/platformCatalogAdapter';
import { fetchContentCreatorsForGame } from '../lib/contentCreators';
import {
  getGameCover,
  getGameDescription,
  getGameTitle,
  getGameUuid,
  getPlatformGameId,
} from '../lib/gameModel';
import { useLocale } from '../context/LocaleContext';
import { contentLocalesForGame } from '../lib/contentLocales';
import PlatinumUnlockedBadge from '../components/PlatinumUnlockedBadge';

function reportSourceForGame(game) {
  return (
    getPlatformGameId(game) ||
    String(game?.slug ?? '').trim() ||
    getGameUuid(game)
  );
}

function matchStatusDotClass(status) {
  if (status === 'VERIFIED') return 'bg-[#00ff66]';
  if (status === 'AUTO_CANDIDATE') return 'bg-amber-400';
  if (status === 'SEPARATE_STACK') return 'bg-red-400';
  return 'bg-zinc-500';
}

function AdminPlatformSwitcher({
  activePlatform,
  onChange,
  psnCount,
  steamStack,
  xboxStack,
}) {
  const chips = [
    {
      id: 'psn',
      label: `💙 PlayStation (${psnCount})`,
      enabled: true,
      status: null,
    },
    {
      id: 'steam',
      label: `🖥️ Steam (${steamStack ? (steamStack.achievement_count ?? 0) : '—'})`,
      enabled: Boolean(steamStack),
      status: steamStack?.match_status ?? null,
    },
    {
      id: 'xbox',
      label: `💚 Xbox (${xboxStack ? (xboxStack.achievement_count ?? 0) : '—'})`,
      enabled: Boolean(xboxStack),
      status: xboxStack?.match_status ?? null,
    },
  ];

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Plattform">
      {chips.map((chip) => {
        const active = activePlatform === chip.id;
        return (
          <button
            key={chip.id}
            type="button"
            disabled={!chip.enabled}
            onClick={() => {
              if (chip.enabled) onChange(chip.id);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold tracking-wide transition ${
              active
                ? 'border-[#00ff66]/50 bg-[#00ff66]/10 text-[#00ff66]'
                : chip.enabled
                  ? 'border-zinc-700 bg-[#121314] text-zinc-300 hover:border-zinc-500 cursor-pointer'
                  : 'cursor-not-allowed border-zinc-800 bg-transparent text-zinc-600'
            }`}
          >
            {chip.status ? (
              <span
                className={`h-1.5 w-1.5 rounded-full ${matchStatusDotClass(chip.status)}`}
                title={chip.status}
                aria-hidden
              />
            ) : null}
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}

function GamePageContent({
  currentView,
  selectedGame,
  activeTrophies,
  unlockedTrophies,
  earnedTrophyIds,
  toggleTrophy,
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
  onReplaceTrophies,
  onGameChange,
  startTrophyLoad,
  fromSearch = false,
  backLabel = '',
  sessionUser = null,
  /** Login-User: unveröffentlichte Spiele nur als Trophäenliste (ohne Tipps/Reiter). */
  trophiesOnly = false,
  onPatchGame = null,
}) {
  const [guideRows, setGuideRows] = useState([]);
  const [chapterRows, setChapterRows] = useState([]);
  const [bossRows, setBossRows] = useState([]);
  const [guidesLoading, setGuidesLoading] = useState(false);
  const { globalLocale, t } = useLocale();
  const [guideLanguageOverride, setGuideLanguageOverride] = useState(null);
  const [contentCreators, setContentCreators] = useState([]);
  const [relatedGuides, setRelatedGuides] = useState({ creatorGames: [], similarGames: [] });
  // Nach dem Freigeben sofort umschalten, ohne das Spiel neu zu laden. Die UUID
  // hängt mit dran, damit der Wert beim Spielwechsel nicht fälschlich greift.
  const [publicationOverride, setPublicationOverride] = useState(null);
  const [coverOverride, setCoverOverride] = useState(null);
  const [coverStatusOverride, setCoverStatusOverride] = useState(undefined);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState('');
  const [igdbPrompt, setIgdbPrompt] = useState(false);
  const [igdbLink, setIgdbLink] = useState('');
  const [playtime, setPlaytime] = useState(() =>
    selectedGame && selectedGame.spielzeit_hauptstory !== undefined
      ? {
          hauptstory: selectedGame.spielzeit_hauptstory ?? null,
          komplett: selectedGame.spielzeit_komplettierer ?? null,
        }
      : null,
  );
  const [radarProfileData, setRadarProfileData] = useState(
    () => selectedGame?.radar_profile ?? null,
  );
  const [descriptionOverrides, setDescriptionOverrides] = useState({});
  const [detailsExpanded, setDetailsExpanded] = useState(true);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);
  const [descriptionError, setDescriptionError] = useState('');
  const { videoTimestampLayout } = useUserPreferences();
  const videoLayoutFlexClass =
    videoTimestampLayout === VIDEO_TIMESTAMP_LAYOUT.VIDEO_LEFT
      ? 'lg:flex-row-reverse'
      : 'lg:flex-row';
  const [quickGuideOpen, setQuickGuideOpen] = useState(false);
  const [guideReloadToken, setGuideReloadToken] = useState(0);
  const [rohBatches, setRohBatches] = useState([]);
  /** 'auto' | 'productive' | 'rohmaterial' */
  const [rohMode, setRohMode] = useState('auto');
  const [rohIndex, setRohIndex] = useState(0);
  const [rohBusy, setRohBusy] = useState(false);
  const [rohReloadToken, setRohReloadToken] = useState(0);
  const [creatorProfile, setCreatorProfile] = useState(null);
  const [creatorHasGameAccess, setCreatorHasGameAccess] = useState(false);
  const [activePlatform, setActivePlatform] = useState('psn');
  const [platformStacks, setPlatformStacks] = useState({ steam: null, xbox: null, ready: false });
  const [platformTrophies, setPlatformTrophies] = useState([]);
  const [platformTrophiesLoading, setPlatformTrophiesLoading] = useState(false);
  const [platformTrophiesError, setPlatformTrophiesError] = useState('');
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

  const hadLanguageOverrideRef = useRef(false);

  useEffect(() => {
    hadLanguageOverrideRef.current = false;
    setGuideLanguageOverride(null);
    setCoverOverride(null);
    setCoverStatusOverride(undefined);
    setCoverError('');
    setIgdbPrompt(false);
    setIgdbLink('');
    setDescriptionOverrides({});
    setQuickGuideOpen(false);
    setRohBatches([]);
    setRohMode(
      typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).get('rohmaterial') === '1'
        ? 'rohmaterial'
        : 'auto',
    );
    setRohIndex(0);
    setRohBusy(false);
    setActivePlatform((prev) => (prev === 'psn' ? prev : 'psn'));
    setPlatformStacks((prev) => (
      prev.steam == null && prev.xbox == null && !prev.ready
        ? prev
        : { steam: null, xbox: null, ready: false }
    ));
    setPlatformTrophies((prev) => (prev.length === 0 ? prev : []));
    setPlatformTrophiesError((prev) => (prev ? '' : prev));
    setPlatformTrophiesLoading((prev) => (prev ? false : prev));
  }, [selectedGame?.id, selectedGame?.platform_game_id]);

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
    // App.jsx lädt guideItems, chapterItems, bossItems und activeTrophies bereits beim Öffnen.
    // Hier nur nachladen, wenn der Admin/User die Guide-Sprache explizit überschreibt
    // (oder danach wieder auf Standard zurücksetzt) oder ein Reload nach dem Speichern angefordert wurde.
    if (guideLanguageOverride !== null) {
      hadLanguageOverrideRef.current = true;
    } else if (!hadLanguageOverrideRef.current && guideReloadToken === 0) {
      return undefined;
    }

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
          {
            textFallback: getGameViewPolicy(selectedGame, {
              variant: 'page',
              isAdmin: isAdminUser(sessionUser),
            }).useTextFallback && guideLanguageOverride == null,
          },
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
  }, [
    selectedGame,
    globalLocale,
    guideLanguageOverride,
    sessionUser?.id,
    onActiveTrophies,
    startTrophyLoad,
    guideReloadToken,
  ]);

  const hasProductiveGuide =
    chapterRows.length > 0 || guideRows.length > 0 || bossRows.length > 0;

  const resolvedRohMode = useMemo(() => {
    if (rohBatches.length === 0) return 'productive';
    if (rohMode === 'productive' || rohMode === 'rohmaterial') return rohMode;
    if (guidesLoading) return 'productive';
    return hasProductiveGuide ? 'productive' : 'rohmaterial';
  }, [rohBatches.length, rohMode, hasProductiveGuide, guidesLoading]);

  const activeRohBatch = useMemo(() => {
    if (resolvedRohMode !== 'rohmaterial' || rohBatches.length === 0) return null;
    const index = Math.min(Math.max(rohIndex, 0), rohBatches.length - 1);
    return rohBatches[index] ?? null;
  }, [resolvedRohMode, rohBatches, rohIndex]);

  const displayChapterRows = activeRohBatch?.chapters ?? chapterRows;
  const displayGuideRows = activeRohBatch?.guides ?? guideRows;
  const displayBossRows = activeRohBatch?.bosses ?? bossRows;
  const inRohmaterialPreview = Boolean(activeRohBatch);

  const chronologicalGuideData = useMemo(
    () => buildChronologicalGuideData(displayChapterRows),
    [displayChapterRows],
  );

  const byTypeGuideData = useMemo(
    () => buildByTypeGuideData(displayGuideRows),
    [displayGuideRows],
  );

  const bossOverviewData = useMemo(
    () => buildBossOverviewData(displayBossRows),
    [displayBossRows],
  );

  /** Plattform-Umschalter nur für den eingeloggten Admin, nie für Gäste. */
  const showPlatformSwitcher = isAdminUser(sessionUser, { allowPublic: true });
  const usingPlatformStack = showPlatformSwitcher && activePlatform !== 'psn';

  /**
   * Nachschlagewerk für game_guides.trophy_id → Trophäe. Die Trophäen sind für
   * Reiter 0 sowieso schon geladen, es braucht also keine zweite Abfrage.
   * Auf Steam/Xbox zeigen api_name und matched_psn_trophy_id auf dasselbe Achievement,
   * damit Walkthrough und Sammelobjekte das Plattform-Icon erben.
   */
  const trophyById = useMemo(() => {
    const map = new Map();
    for (const trophy of activeTrophies ?? []) {
      const key = String(trophy?.platform_achievement_id ?? trophy?.trophy_id ?? '').trim();
      if (key) map.set(key, trophy);
    }
    if (!usingPlatformStack) return map;
    for (const trophy of platformTrophies) {
      const keys = [
        trophy?.platform_achievement_id,
        trophy?.id,
        trophy?.trophy_id,
        trophy?._matchedPsnId,
      ];
      for (const raw of keys) {
        const key = String(raw ?? '').trim();
        if (key) map.set(key, trophy);
      }
    }
    return map;
  }, [activeTrophies, platformTrophies, usingPlatformStack]);

  const watchlistGameId = useMemo(() => getGameUuid(selectedGame), [selectedGame]);

  const gameId = watchlistGameId;
  /** Außen sichtbare Spiel-Referenz für Fehlermeldungen (NPWR, kein UUID). */
  const reportSource = useMemo(() => reportSourceForGame(selectedGame), [selectedGame]);
  /** Sprache des angezeigten Guides. Freigabe und Tipp-Änderungen gelten nur für diese Sprache. */
  const effectiveGuideLang = resolveGuideLanguage(globalLocale, guideLanguageOverride);
  const gameUuid = useMemo(() => getGameUuid(selectedGame), [selectedGame]);
  const studioCredits = useMemo(() => publicStudioCredits(selectedGame), [selectedGame]);

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

  const selectPlatform = (next) => {
    setPlatformTrophies([]);
    setPlatformTrophiesError('');
    setPlatformTrophiesLoading(next !== 'psn');
    setActivePlatform(next);
  };

  const isAdmin = isAdminUser(sessionUser);
  const policy = getGameViewPolicy(gameForPublication, { variant: 'page', isAdmin });

  useEffect(() => {
    if (!showPlatformSwitcher || !gameUuid) return undefined;
    let cancelled = false;
    fetchLinkedPlatformStacks(supabase, gameUuid, selectedGame?.steam_app_id)
      .then((stacks) => {
        if (cancelled) return;
        const steam = stacks?.steam ?? null;
        const xbox = stacks?.xbox ?? null;
        setPlatformStacks({ steam, xbox, ready: true });
        setActivePlatform((prev) => {
          if (prev === 'steam' && !steam) return 'psn';
          if (prev === 'xbox' && !xbox) return 'psn';
          return prev;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setPlatformStacks({ steam: null, xbox: null, ready: true });
        setActivePlatform('psn');
      });
    return () => {
      cancelled = true;
    };
  }, [showPlatformSwitcher, gameUuid, selectedGame?.steam_app_id]);

  useEffect(() => {
    if (!showPlatformSwitcher || activePlatform === 'psn') return undefined;
    const steamId = platformStacks.steam?.app_id;
    const xboxId = platformStacks.xbox?.title_id;
    if (activePlatform === 'steam' && (steamId == null || steamId === '')) return undefined;
    if (activePlatform === 'xbox' && !xboxId) return undefined;

    let cancelled = false;
    const request = activePlatform === 'steam'
      ? fetchSteamAchievementsAsTrophies(supabase, steamId, effectiveGuideLang, activeTrophies)
      : fetchXboxAchievementsAsTrophies(supabase, xboxId, effectiveGuideLang, activeTrophies);

    request
      .then((rows) => {
        if (cancelled) return;
        setPlatformTrophies(Array.isArray(rows) ? rows : []);
        setPlatformTrophiesError('');
        setPlatformTrophiesLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setPlatformTrophies([]);
        setPlatformTrophiesError(err?.message || 'Achievements konnten nicht geladen werden.');
        setPlatformTrophiesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    showPlatformSwitcher,
    activePlatform,
    platformStacks.steam,
    platformStacks.xbox,
    effectiveGuideLang,
    activeTrophies,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (!sessionUser?.id) {
      setCreatorProfile(null);
      return undefined;
    }
    fetchMyCreatorProfile(supabase).then((profile) => {
      if (!cancelled) setCreatorProfile(profile);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionUser?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!creatorProfile?.id || !gameUuid) {
      setCreatorHasGameAccess(false);
      return undefined;
    }
    supabase
      .rpc('tb_creator_has_game_access', { p_game_id: gameUuid })
      .then(({ data, error }) => {
        if (cancelled) return;
        const hasAccess = !error && Boolean(data);
        setCreatorHasGameAccess(hasAccess);
        if (hasAccess && guideRows.length === 0 && chapterRows.length === 0 && bossRows.length === 0) {
          setGuideReloadToken((n) => n + 1);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorProfile?.id, gameUuid]);

  const isCreatorForGame = useMemo(() => {
    if (!creatorProfile?.id) return false;
    if (creatorHasGameAccess) return true;
    const cid = String(creatorProfile.id);
    const uid = sessionUser?.id ? String(sessionUser.id) : '';
    const matchCreator = (c) =>
      String(c?.id ?? c?.creator_id ?? '') === cid ||
      (uid && String(c?.user_id ?? '') === uid);
    if (contentCreators.some(matchCreator)) return true;
    const allLoadedRows = [...chapterRows, ...guideRows, ...bossRows];
    return allLoadedRows.some(
      (r) =>
        String(r?.creator_id ?? '') === cid ||
        (uid && String(r?.creator_user_id ?? r?.user_id ?? '') === uid),
    );
  }, [
    creatorProfile?.id,
    creatorHasGameAccess,
    sessionUser?.id,
    contentCreators,
    chapterRows,
    guideRows,
    bossRows,
  ]);

  const isDraftRoadmap = isGameDraftMode(gameForPublication);

  useEffect(() => {
    const uuid = getGameUuid(selectedGame);
    if (!uuid) return;
    if (!isAdmin && !isCreatorForGame && !trophiesOnly && !isStaffDeviceOrSession(sessionUser)) {
      incrementGameViews(supabase, uuid, sessionUser);
    }
  }, [selectedGame?.id, isAdmin, isCreatorForGame, trophiesOnly, sessionUser]);
  /** Sichtbarkeit der Guide-Reiter hängt an der gerade gezeigten Sprache (oder ob das Spiel veröffentlicht ist). */
  const guidePublished = isGuidePublished(gameForPublication, effectiveGuideLang);
  const anyGuidePublished = hasPublishedGuide(gameForPublication);
  /** Admins und der zugeordnete Creator sehen den Guide als Vorschau (auch bei DRAFT / staging), Besucher erst nach der Freigabe. */
  const canSeeGuides =
    (!trophiesOnly || isAdmin || isCreatorForGame) &&
    (guidePublished || anyGuidePublished || isAdmin || isCreatorForGame || isDraftRoadmap || inRohmaterialPreview);
  const contentLocales = useMemo(
    () => contentLocalesForGame(gameForPublication, { includeReady: isAdmin }),
    [gameForPublication, isAdmin],
  );

  const handleProductionMetaSaved = useCallback((rowId, patch) => {
    if (!rowId || !patch) return;
    const applyPatch = (rows) =>
      (rows ?? []).map((row) => {
        const id = String(row?.guide_id ?? row?.id ?? '').trim();
        if (id !== rowId) return row;
        return {
          ...row,
          ...(patch.prod_note !== undefined ? { prod_note: patch.prod_note } : {}),
          ...(patch.video_url !== undefined ? { video_url: patch.video_url } : {}),
        };
      });
    setChapterRows(applyPatch);
    setGuideRows(applyPatch);
    setBossRows(applyPatch);
  }, []);

  useEffect(() => {
    if (!isAdmin || trophiesOnly || !selectedGame) {
      setRohBatches([]);
      return undefined;
    }

    let cancelled = false;
    async function loadRohmaterial() {
      const { data, error } = await fetchRohmaterialBatchesForGame(
        supabase,
        selectedGame,
        effectiveGuideLang,
      );
      if (cancelled) return;
      if (error) {
        console.error('game_guides_rohmaterial:', error.message);
        setRohBatches([]);
        return;
      }
      setRohBatches(data ?? []);
      setRohIndex((index) => {
        const max = Math.max((data ?? []).length - 1, 0);
        return Math.min(index, max);
      });
    }

    loadRohmaterial();
    return () => {
      cancelled = true;
    };
  }, [
    isAdmin,
    trophiesOnly,
    selectedGame,
    effectiveGuideLang,
    rohReloadToken,
  ]);

  useEffect(() => {
    if (!gameUuid) {
      setPlaytime(null);
      setRadarProfileData(null);
      return undefined;
    }
    if (selectedGame?.spielzeit_hauptstory !== undefined) {
      setPlaytime({
        hauptstory: selectedGame.spielzeit_hauptstory ?? null,
        komplett: selectedGame.spielzeit_komplettierer ?? null,
      });
      setRadarProfileData(selectedGame.radar_profile ?? null);
      return undefined;
    }
    let cancelled = false;
    supabase
      .from('games')
      .select('spielzeit_hauptstory, spielzeit_komplettierer, radar_profile')
      .eq('id', gameUuid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          supabase
            .from('games')
            .select('spielzeit_hauptstory, spielzeit_komplettierer')
            .eq('id', gameUuid)
            .maybeSingle()
            .then(({ data: fallbackData }) => {
              if (cancelled) return;
              setPlaytime({
                hauptstory: fallbackData?.spielzeit_hauptstory ?? null,
                komplett: fallbackData?.spielzeit_komplettierer ?? null,
              });
              setRadarProfileData(null);
            });
          return;
        }
        setPlaytime({
          hauptstory: data?.spielzeit_hauptstory ?? null,
          komplett: data?.spielzeit_komplettierer ?? null,
        });
        setRadarProfileData(data?.radar_profile || null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    gameUuid,
    selectedGame?.spielzeit_hauptstory,
    selectedGame?.spielzeit_komplettierer,
    selectedGame?.radar_profile,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadRelated() {
      if (!selectedGame || trophiesOnly) {
        setRelatedGuides({ creatorGames: [], similarGames: [] });
        return;
      }
      const result = await loadRelatedGuides(supabase, selectedGame, {
        locale: globalLocale,
        includeReady: false,
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
  }, [selectedGame, globalLocale, trophiesOnly]);

  const isGuideLoading = guidesLoading || loadingGuide;

  const gameTitle = getGameTitle(selectedGame, globalLocale);
  const gameCover = coverOverride === null ? getGameCover(selectedGame, globalLocale) : coverOverride;
  const effectiveCoverStatus =
    coverStatusOverride !== undefined
      ? coverStatusOverride
      : (selectedGame?.cover_status ?? null);

  useEffect(() => {
    if (!isAdmin || !gameUuid || selectedGame?.cover_status !== undefined || coverStatusOverride !== undefined) {
      return undefined;
    }
    let cancelled = false;
    supabase
      .from('games')
      .select('cover_status')
      .eq('id', gameUuid)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) {
          setCoverStatusOverride(data.cover_status ?? null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, gameUuid, selectedGame?.cover_status, coverStatusOverride]);

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
    setCoverStatusOverride(null);
    rememberCoverStatus(status);
    onPatchGame?.({ cover_url: {}, cover_status: null });
  };

  const handleSaveIgdbLink = async (event) => {
    event.preventDefault();
    if (!gameUuid || coverBusy) return;

    setCoverBusy(true);
    setCoverError('');
    const { coverUrl, coverMap, status, error } = await setIntranetIgdbCover(supabase, gameUuid, igdbLink);
    setCoverBusy(false);
    if (error) {
      setCoverError(error.message || 'IGDB-Link konnte nicht gespeichert werden.');
      return;
    }
    setCoverOverride(coverUrl);
    setCoverStatusOverride('valid');
    setIgdbPrompt(false);
    setIgdbLink('');
    rememberCoverStatus(status);
    onPatchGame?.({
      ...(coverMap ? { cover_url: coverMap } : {}),
      cover_status: 'valid',
    });
  };

  const handleVerifyCover = async () => {
    if (!gameUuid || coverBusy) return;
    setCoverBusy(true);
    setCoverError('');
    const { error } = await markGameCoverValid(supabase, gameUuid);
    setCoverBusy(false);
    if (error) {
      setCoverError(error.message || 'Cover-Status konnte nicht verifiziert werden.');
      return;
    }
    setCoverStatusOverride('valid');
    onPatchGame?.({ cover_status: 'valid', cover_notes: null });
  };
  const gameDescription = Object.prototype.hasOwnProperty.call(
    descriptionOverrides,
    effectiveGuideLang,
  )
    ? descriptionOverrides[effectiveGuideLang]
    : getGameDescription(selectedGame, effectiveGuideLang, {
        exact: guideLanguageOverride != null || !policy.useTextFallback,
      });
  const trimmedDescription = typeof gameDescription === 'string' ? gameDescription.trim() : '';
  const descriptionParagraphs = trimmedDescription
    ? trimmedDescription.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    : [];

  useEffect(() => {
    setEditingDescription(false);
    setDescriptionError('');
  }, [gameUuid, effectiveGuideLang]);

  const handleStartEditDescription = () => {
    setDescriptionDraft(typeof gameDescription === 'string' ? gameDescription : '');
    setDescriptionError('');
    setEditingDescription(true);
  };

  const handleSaveDescription = async () => {
    if (!gameUuid || !effectiveGuideLang || savingDescription) return;
    setSavingDescription(true);
    setDescriptionError('');
    const { error: saveErr } = await updateGameLocalizedFields(
      supabase,
      gameUuid,
      effectiveGuideLang,
      { description: descriptionDraft },
    );
    setSavingDescription(false);
    if (saveErr) {
      setDescriptionError(saveErr.message || 'Beschreibung konnte nicht gespeichert werden.');
      return;
    }
    setDescriptionOverrides((prev) => ({ ...prev, [effectiveGuideLang]: descriptionDraft }));
    setEditingDescription(false);
  };

  const handleDeleteGuideStep = useCallback(
    async (item) => {
      const rowId = String(item?.guide_id ?? item?.id ?? '').trim();
      if (!gameUuid || !rowId) return;
      // Synthetische Anzeige-IDs (walkthrough-<uuid>) auf UUID zurückführen
      const uuidMatch = rowId.match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
      );
      const guideRowId = uuidMatch?.[0] || rowId;
      if (!window.confirm('Diesen Guide-Schritt wirklich löschen?')) return;

      const { error } = await deleteSingleGuideStep(supabase, gameUuid, guideRowId);
      if (error) {
        window.alert(error.message || 'Schritt konnte nicht gelöscht werden.');
        return;
      }

      const keep = (rows) =>
        (rows ?? []).filter((row) => {
          const id = String(row?.id ?? '');
          const gid = String(row?.guide_id ?? '');
          return id !== guideRowId && gid !== guideRowId;
        });
      setChapterRows(keep);
      setGuideRows(keep);
      setBossRows(keep);
    },
    [gameUuid],
  );

  const handleQuickGuideSaved = useCallback(
    async ({ sheetType, status }) => {
      if (status && gameUuid) {
        setPublicationOverride((prev) => ({
          uuid: gameUuid,
          status,
          slug: prev?.uuid === gameUuid ? prev.slug : undefined,
          gameType: prev?.uuid === gameUuid ? prev.gameType : undefined,
          homeTags: prev?.uuid === gameUuid ? prev.homeTags : undefined,
        }));
      }

      const { data: creators } = await fetchContentCreatorsForGame(supabase, gameUuid);
      setContentCreators(creators ?? []);

      const tab =
        Number(sheetType) === GUIDE_SHEET_TYPE.COLLECTIBLES
          ? 'reiter2'
          : Number(sheetType) === GUIDE_SHEET_TYPE.BOSSES
            ? 'reiter3'
            : 'reiter1';
      // Loading sofort setzen, damit der Ziel-Reiter sichtbar bleibt, bevor Daten nachladen.
      setGuidesLoading(true);
      setActiveTab(tab);
      setGuideReloadToken((n) => n + 1);
    },
    [gameUuid, setActiveTab],
  );

  const handleRohDiscard = useCallback(async (batch) => {
    const key = batch?.batchKey;
    if (!key || rohBusy) return;
    if (!window.confirm(`Kandidat „${key}" verwerfen?`)) return;

    setRohBusy(true);
    const { error } = await discardRohmaterialBatch(supabase, key);
    setRohBusy(false);
    if (error) {
      window.alert(error.message || 'Batch konnte nicht gelöscht werden.');
      return;
    }

    setRohBatches((prev) => {
      const idx = prev.findIndex((item) => item.batchKey === key);
      const next = prev.filter((item) => item.batchKey !== key);
      if (next.length === 0) {
        setRohMode('productive');
        setRohIndex(0);
      } else {
        setRohIndex(Math.min(Math.max(idx, 0), next.length - 1));
      }
      return next;
    });
  }, [rohBusy]);

  const handleRohMatch = useCallback(async (batch) => {
    const key = batch?.batchKey;
    if (!key || rohBusy) return;

    const others = rohBatches
      .map((item) => item.batchKey)
      .filter((item) => item && item !== key);
    const clearOthers =
      others.length > 0
      && window.confirm('Übrige Rohmaterial-Kandidaten dieses Spiels auch löschen?');

    setRohBusy(true);
    const { error } = await matchRohmaterialBatchForPc(
      supabase,
      key,
      clearOthers ? others : [],
    );
    setRohBusy(false);
    if (error) {
      window.alert(error.message || 'Match konnte nicht gesetzt werden.');
      return;
    }

    setRohBatches((prev) => {
      let next = prev.map((item) => (
        item.batchKey === key ? { ...item, batchStatus: 'MATCHED' } : item
      ));
      if (clearOthers) next = next.filter((item) => item.batchKey === key);
      setRohIndex(0);
      return next;
    });
  }, [rohBusy, rohBatches]);

  const handleRohPromote = useCallback(async (batch) => {
    const key = batch?.batchKey;
    if (!key || !gameUuid || rohBusy) return;
    if (!window.confirm(`Kandidat „${key}" direkt als produktiven Guide übernehmen?`)) return;

    setRohBusy(true);
    const { status, error } = await promoteRohmaterialBatchToGuide(supabase, {
      gameId: gameUuid,
      batchKey: key,
      locale: effectiveGuideLang,
      clearOtherBatches: true,
    });
    setRohBusy(false);
    if (error) {
      window.alert(error.message || 'Übernahme fehlgeschlagen.');
      return;
    }

    if (status) {
      setPublicationOverride((prev) => ({
        uuid: gameUuid,
        status,
        slug: prev?.uuid === gameUuid ? prev.slug : undefined,
        gameType: prev?.uuid === gameUuid ? prev.gameType : undefined,
        homeTags: prev?.uuid === gameUuid ? prev.homeTags : undefined,
      }));
    }

    setRohBatches([]);
    setRohMode('productive');
    setRohIndex(0);
    setGuidesLoading(true);
    setGuideReloadToken((n) => n + 1);
    setRohReloadToken((n) => n + 1);

    const { data: creators } = await fetchContentCreatorsForGame(supabase, gameUuid);
    setContentCreators(creators ?? []);
  }, [gameUuid, rohBusy, effectiveGuideLang]);

  const checklistCount = usingPlatformStack ? platformTrophies.length : activeTrophies.length;

  const tabItems = useMemo(
    () => buildGuideWorkspaceTabs({
      variant: 'page',
      policy,
      t,
      counts: {
        reiter0: checklistCount,
        reiter1: chronologicalGuideData.length,
        reiter2: byTypeGuideData.length,
        reiter3: bossOverviewData.length,
        reiter4: 0,
      },
      loading: isGuideLoading,
      canSeeGuides,
    }),
    [
      policy,
      t,
      checklistCount,
      chronologicalGuideData.length,
      byTypeGuideData.length,
      bossOverviewData.length,
      isGuideLoading,
      canSeeGuides,
    ],
  );

  const hasGuideContent =
    chronologicalGuideData.length > 0
    || byTypeGuideData.length > 0
    || bossOverviewData.length > 0;

  const visibleTabs = useMemo(
    () => tabItems.map((tab) => tab.id),
    [tabItems],
  );

  useEffect(() => {
    if (!visibleTabs.includes(activeTab) && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0]);
    }
  }, [activeTab, visibleTabs, setActiveTab]);

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

  if (currentView !== 'game_info' || !selectedGame) return null;

  const platinumDone = isPlatinumUnlocked(activeTrophies, unlockedTrophies, earnedTrophyIds);

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
      <button
        type="button"
        onClick={onNavigateHome}
        className="text-[#00ff66] mb-6 flex items-center gap-1 text-xs uppercase tracking-wider font-bold hover:underline bg-none border-none cursor-pointer"
      >
        {backLabel || (fromSearch ? t('backToSearch') : t('backDashboard'))}
      </button>

      <div className="w-full min-w-0 bg-[#1a1b1c] rounded-2xl border border-zinc-800 p-6 mb-8 shadow-xl">
        {!detailsExpanded ? (
          <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-xl md:text-2xl font-extrabold text-white tracking-tight break-words m-0 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span>{gameTitle}</span>
              {isAdmin ? (
                <AdminGameTypeSelect
                  gameId={gameUuid}
                  gameType={String(gameForPublication?.[GAME_STRUCT.gameType] ?? '').trim()}
                  onSaved={(gameType) =>
                    setPublicationOverride((prev) => ({
                      uuid: gameUuid,
                      status: prev?.uuid === gameUuid ? prev.status : undefined,
                      slug: prev?.uuid === gameUuid ? prev.slug : null,
                      gameType,
                      homeTags: prev?.uuid === gameUuid ? prev.homeTags : undefined,
                    }))
                  }
                />
              ) : null}
            </h2>
            <button
              type="button"
              onClick={() => setDetailsExpanded(true)}
              aria-expanded={false}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-[#121314] px-3 py-1.5 font-mono text-xs font-semibold text-zinc-300 hover:border-[#00ff66]/40 hover:text-[#00ff66] transition cursor-pointer"
            >
              Details ausklappen ▾
            </button>
          </div>
          {showPlatformSwitcher ? (
            <AdminPlatformSwitcher
              activePlatform={activePlatform}
              onChange={selectPlatform}
              psnCount={activeTrophies.length}
              steamStack={platformStacks.steam}
              xboxStack={platformStacks.xbox}
            />
          ) : null}
          </div>
        ) : (
          <>
            <div className="flex flex-col md:flex-row flex-wrap md:flex-nowrap gap-8 items-start">
              <div className="w-full md:w-64 flex-shrink-0 flex flex-col gap-2">
                <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden shadow-2xl border border-zinc-800 bg-[#121314]">
                  {gameCover ? (
                    <img
                      src={gameCover}
                      onClick={
                        isAdmin
                          ? () => {
                              setCoverError('');
                              setIgdbPrompt(true);
                            }
                          : undefined
                      }
                      title={isAdmin ? 'Klicken, um Cover-Link zu ändern' : undefined}
                      className={`w-full h-full object-cover ${isAdmin ? 'cursor-pointer transition hover:opacity-90' : ''}`}
                      alt="Game Cover"
                    />
                  ) : isAdmin ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCoverError('');
                        setIgdbPrompt(true);
                      }}
                      className="flex h-full w-full cursor-pointer items-center justify-center px-4 text-center text-[11px] font-mono uppercase tracking-wider text-zinc-400 transition hover:bg-zinc-900/80 hover:text-[#00ff66]"
                    >
                      Kein Cover – Klicken
                    </button>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center px-4 text-center text-[11px] font-mono uppercase tracking-wider text-zinc-600">
                      kein Cover
                    </div>
                  )}
                  <PlatinumUnlockedBadge active={platinumDone} />
                  <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none">
                    <GuideOnlineBadge game={gameForPublication} visible={isAdmin} size="md" />
                  </div>
                  {isAdmin ? (
                    <div className="absolute top-2.5 right-2.5 z-10 flex flex-col items-end gap-1">
                      <button
                        type="button"
                        onClick={handleClearCover}
                        disabled={coverBusy || !gameCover}
                        title="Falsches Cover löschen und status.igdb entfernen"
                        className="rounded-lg border border-red-500/40 bg-black/80 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-red-300 hover:bg-red-500/20 disabled:opacity-40 cursor-pointer"
                      >
                        {coverBusy ? '…' : 'Cover löschen'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCoverError('');
                          setIgdbPrompt(true);
                        }}
                        disabled={coverBusy}
                        title="Neuen IGDB-Bildlink als Cover hinterlegen"
                        className="rounded-lg border border-[#00ff66]/40 bg-black/80 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-[#00ff66] hover:bg-[#00ff66]/15 disabled:opacity-50 cursor-pointer"
                      >
                        IGDB Link
                      </button>
                    </div>
                  ) : null}
                  {coverError && !igdbPrompt ? (
                    <p className="absolute inset-x-2 bottom-2 z-10 rounded-lg bg-black/80 px-2 py-1 text-[10px] font-mono text-red-300">
                      {coverError}
                    </p>
                  ) : null}
                </div>

                {isAdmin && effectiveCoverStatus !== 'valid' ? (
                  <button
                    type="button"
                    onClick={handleVerifyCover}
                    disabled={coverBusy}
                    title="Klick darauf verifiziert das Cover (setzt cover_status = 'valid')"
                    className={`w-full rounded-lg border px-2.5 py-1.5 text-center font-mono text-[11px] font-bold transition cursor-pointer disabled:opacity-50 ${
                      effectiveCoverStatus === 'invalid'
                        ? 'border-red-500/40 bg-red-500/15 text-red-300 hover:bg-red-500/25'
                        : 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:border-[#00ff66]/50 hover:bg-[#00ff66]/15 hover:text-[#00ff66]'
                    }`}
                  >
                    {`cover_status: ${effectiveCoverStatus === 'invalid' ? 'invalid' : 'ungeprüft'} (Klick = Verifizieren)`}
                  </button>
                ) : null}
              </div>

              <div className="flex-grow w-full min-w-0 flex flex-col justify-between h-full">
                <div>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight break-words mt-0 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span>{gameTitle}</span>
                        {isAdmin ? (
                          <AdminGameTypeSelect
                            gameId={gameUuid}
                            gameType={String(gameForPublication?.[GAME_STRUCT.gameType] ?? '').trim()}
                            onSaved={(gameType) =>
                              setPublicationOverride((prev) => ({
                                uuid: gameUuid,
                                status: prev?.uuid === gameUuid ? prev.status : undefined,
                                slug: prev?.uuid === gameUuid ? prev.slug : null,
                                gameType,
                                homeTags: prev?.uuid === gameUuid ? prev.homeTags : undefined,
                              }))
                            }
                          />
                        ) : null}
                      </h2>
                    </div>
                    <div className="flex flex-col items-stretch sm:items-end gap-2 sm:flex-shrink-0">
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
                      <AdminFollowupButton user={sessionUser} gameId={gameUuid} />
                      <AdminMoveToMultiTabButton user={sessionUser} gameId={gameUuid} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-4 sm:gap-x-8 w-full max-w-xl min-w-0 text-sm border-t border-zinc-800/60 pt-3">
                    <div className="flex justify-between border-b border-zinc-800/40 pb-2 sm:col-span-2">
                      <span className="text-zinc-500 font-mono text-xs uppercase">{t('searchConsole')}</span>
                      {isAdmin ? (
                        <AdminHardwareSelect
                          gameId={gameUuid}
                          hardware={selectedGame[GAME_FIELDS.console]}
                          onSaved={(hardware, urlChanged) => {
                            const nextGame = { ...selectedGame, [GAME_STRUCT.hardware]: hardware };
                            onGameChange?.({ [GAME_STRUCT.hardware]: hardware });
                            if (!urlChanged) return;
                            const nextPath = gameGuidePath(nextGame, globalLocale);
                            if (!nextPath || nextPath === '/') return;
                            writeAppPath(withGuideTabParam(nextPath, activeTab), { replace: true });
                          }}
                        />
                      ) : (
                        <span className="text-sky-300 font-semibold text-right">
                          {selectedGame[GAME_FIELDS.console] || '—'}
                        </span>
                      )}
                    </div>
                    {showPlatformSwitcher ? (
                      <div className="sm:col-span-2 border-b border-zinc-800/40 pb-2">
                        <AdminPlatformSwitcher
                          activePlatform={activePlatform}
                          onChange={selectPlatform}
                          psnCount={activeTrophies.length}
                          steamStack={platformStacks.steam}
                          xboxStack={platformStacks.xbox}
                        />
                      </div>
                    ) : null}
                    <div className="flex justify-between border-b border-zinc-800/40 pb-2">
                      <span className="text-zinc-500 font-mono text-xs uppercase">{t('releaseYear')}</span>
                      <span className="text-zinc-200 font-medium">
                        {selectedGame[GAME_FIELDS.year] || '—'}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-zinc-800/40 pb-2 col-span-2 sm:col-span-1">
                      <span className="text-zinc-500 font-mono text-xs uppercase">{t('searchGenre')}</span>
                      <span className="text-zinc-200 font-medium text-right">
                        <HomeTagSearchLinks
                          tags={gameForPublication?.[GAME_STRUCT.homeTags]}
                          locale={globalLocale}
                          fallback={selectedGame[GAME_FIELDS.genre] || '—'}
                        />
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-zinc-800/40 pb-2 col-span-2">
                      <span className="text-zinc-500 font-mono text-xs uppercase">{t('studioLabel')}</span>
                      <span className="text-zinc-200 font-medium text-right">
                        {studioCredits.studio ? (
                          <DeveloperSearchLink name={studioCredits.studio} />
                        ) : '—'}
                      </span>
                    </div>
                    {studioCredits.publisher ? (
                      <div className="flex justify-between border-b border-zinc-800/40 pb-2 col-span-2">
                        <span className="text-zinc-500 font-mono text-xs uppercase">{t('publisherLabel')}</span>
                        <span className="text-zinc-200 font-medium text-right">
                          <DeveloperSearchLink name={studioCredits.publisher} />
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {(descriptionParagraphs.length > 0 || (isAdmin && !trophiesOnly)) ? (
                    <div className="mt-4 border-t border-zinc-800/60 pt-4">
                      {isAdmin && !trophiesOnly && !editingDescription ? (
                        <div className="mb-2 flex justify-end">
                          <button
                            type="button"
                            onClick={handleStartEditDescription}
                            className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-300 hover:border-[#00ff66]/40 hover:text-[#00ff66]"
                          >
                            {trimmedDescription ? 'Beschreibung bearbeiten' : '+ Beschreibung hinzufügen'}
                          </button>
                        </div>
                      ) : null}

                      {editingDescription ? (
                        <div className="space-y-3">
                          <textarea
                            value={descriptionDraft}
                            onChange={(e) => setDescriptionDraft(e.target.value)}
                            rows={6}
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm leading-relaxed text-zinc-200"
                            placeholder="Spielbeschreibung…"
                          />
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingDescription(false)}
                              disabled={savingDescription}
                              className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider text-zinc-400"
                            >
                              Abbrechen
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveDescription}
                              disabled={savingDescription}
                              className="rounded-lg border border-[#00ff66]/40 bg-[#00ff66]/10 px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wider text-[#00ff66]"
                            >
                              {savingDescription ? '…' : 'Speichern'}
                            </button>
                          </div>
                          {descriptionError ? (
                            <p className="text-xs text-red-400">{descriptionError}</p>
                          ) : null}
                        </div>
                      ) : (
                        <>
                          {descriptionParagraphs.length > 0 ? (
                            <div className="space-y-2.5 text-sm leading-relaxed text-zinc-300">
                              {descriptionParagraphs.map((paragraph, index) => (
                                <p key={index}>{paragraph}</p>
                              ))}
                            </div>
                          ) : isAdmin && !trophiesOnly ? (
                            <p className="text-sm italic text-zinc-500">
                              Noch keine Beschreibung für diese Sprache.
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end border-t border-zinc-800/60 pt-3">
              <button
                type="button"
                onClick={() => setDetailsExpanded(false)}
                aria-expanded={true}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-[#121314] px-3 py-1.5 font-mono text-xs font-semibold text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 transition cursor-pointer"
              >
                Details einklappen ▴
              </button>
            </div>
          </>
        )}

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
              <div className="flex items-start justify-between gap-3">
                <h2 id="igdb-link-title" className="text-sm font-bold text-white">
                  Neuer IGDB-Link
                </h2>
                <a
                  href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${gameTitle} ${selectedGame?.[GAME_FIELDS.console] || ''} cover igdb`.trim())}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-sky-300 hover:bg-sky-500/20 no-underline"
                >
                  🔍 Bild suchen
                </a>
              </div>
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
      </div>

      {policy.showOverview ? (
      <AdminGameOverview
        className="mb-8"
        game={gameForPublication}
        trophies={activeTrophies}
        title={gameTitle}
        playtime={playtime}
        radarProfile={
          radarProfileData ||
          selectedGame?.radar_profile ||
          selectedGame?.radarProfile ||
          gameForPublication?.radar_profile ||
          gameForPublication?.radarProfile
        }
        isAdmin={isAdmin && !trophiesOnly}
        gameId={gameUuid}
        locale={effectiveGuideLang}
        onPlaytimeSaved={(next) => setPlaytime(next)}
      />
      ) : null}

      <GameSeoInfobox
        title={gameTitle}
        description={gameDescription}
        creators={contentCreators}
        isAdmin={isAdmin && !trophiesOnly}
        gameUuid={gameUuid}
        locale={effectiveGuideLang}
        showDescription={false}
        onDescriptionSaved={(next) =>
          setDescriptionOverrides((prev) => ({ ...prev, [effectiveGuideLang]: next }))
        }
      />

      <section ref={guideSectionRef} className="mt-8 w-full min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <GuideLanguageSelector
            className="!mb-0 min-w-0 flex-1"
            guideLanguageOverride={guideLanguageOverride}
            onGuideLanguageOverride={setGuideLanguageOverride}
            locales={contentLocales}
          />
          {isAdmin && !trophiesOnly ? (
            <button
              type="button"
              onClick={() => setQuickGuideOpen(true)}
              className="shrink-0 rounded-xl border border-[#00ff66]/35 bg-[#00ff66]/10 px-3 py-2 text-[11px] font-mono font-bold uppercase tracking-wider text-[#00ff66] hover:bg-[#00ff66]/15"
            >
              + Guide-Schritte
            </button>
          ) : null}
        </div>

        {isAdmin && !trophiesOnly && rohBatches.length > 0 ? (
          <AdminRohmaterialTinderBar
            batches={rohBatches}
            mode={resolvedRohMode}
            activeIndex={rohIndex}
            hasProductiveGuide={hasProductiveGuide}
            busy={rohBusy}
            onModeChange={(next) => setRohMode(next)}
            onIndexChange={setRohIndex}
            onDiscard={handleRohDiscard}
            onMatch={handleRohMatch}
            onPromote={handleRohPromote}
          />
        ) : null}

        {(isAdmin || isCreatorForGame) && (isDraftRoadmap || (isCreatorForGame && !guidePublished)) && (!trophiesOnly || isCreatorForGame) && (
          <p className="text-xs text-amber-300 font-mono mb-4 px-4 py-3 rounded-xl bg-amber-500/15 border border-amber-400/40 flex flex-wrap items-center justify-between gap-2">
            <span>
              🎬 Video-Roadmap (Entwurf) aktiv – Produktions-Modus für Takes &amp; YouTube-Links ist in den Guide-Reitern eingeschaltet.
            </span>
          </p>
        )}

        {isAdmin && !guidePublished && hasGuideContent && !trophiesOnly && !inRohmaterialPreview && !isDraftRoadmap && (
          <p className="text-xs text-amber-400 font-mono mb-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
            Vorschau: Dieser Guide ist noch nicht freigegeben ({effectiveGuideLang.toUpperCase()}) und
            für Besucher unsichtbar.
          </p>
        )}

        {inRohmaterialPreview ? (
          <p className="text-xs text-amber-300 font-mono mb-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
            Rohmaterial-Vorschau – noch nicht in game_guides. Videos und Reiter 1:1 wie im fertigen Guide.
          </p>
        ) : null}

        {!canSeeGuides && hasGuideContent && !trophiesOnly && (
          <p className="text-xs text-zinc-500 italic text-center py-8 bg-[#1a1b1c] rounded-xl border border-zinc-800">
            Der Guide zu diesem Spiel wird derzeit redaktionell geprüft und ist noch nicht
            freigegeben.
          </p>
        )}

        <GameGuideWorkspace
          variant="page"
          policy={policy}
          game={gameForPublication}
          gameUuid={gameUuid}
          reportSource={reportSource}
          locale={effectiveGuideLang}
          isAdmin={isAdmin}
          trophiesOnly={trophiesOnly}
          trophies={activeTrophies}
          onReplaceTrophies={onReplaceTrophies}
          onGameChange={onGameChange}
          unlockedTrophies={unlockedTrophies}
          earnedTrophyIds={earnedTrophyIds}
          onToggleTrophy={toggleTrophy}
          hideCompleted={hideCompleted}
          setHideCompleted={setHideCompleted}
          completedItems={completedGuideItems}
          toggleCompleted={toggleGuideItemCompleted}
          walkthrough={chronologicalGuideData}
          collectibles={byTypeGuideData}
          bosses={bossOverviewData}
          trophyById={trophyById}
          loading={isGuideLoading}
          canSeeGuides={canSeeGuides}
          mainGameTitle={gameTitle}
          isCreator={isCreatorForGame}
          isDraftMode={isDraftRoadmap || (isCreatorForGame && !guidePublished)}
          onProductionMetaSaved={handleProductionMetaSaved}
          onDeleteStep={handleDeleteGuideStep}
          inRohmaterialPreview={inRohmaterialPreview}
          videoLayoutFlexClass={videoLayoutFlexClass}
          usingPlatformStack={usingPlatformStack}
          platformTrophies={platformTrophies}
          platformTrophiesLoading={platformTrophiesLoading}
          platformTrophiesError={platformTrophiesError}
          activePlatform={activePlatform}
          platformStacks={platformStacks}
          openGame={openGame}
          tabs={tabItems}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onPrev={goToPrevTab}
          onNext={goToNextTab}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          tabBarAnchorRef={tabBarRef}
        />
      </section>

      {!trophiesOnly ? (
        <RelatedGuides
          creatorName={contentCreators[0]?.channelName || ''}
          creatorGames={relatedGuides.creatorGames}
          similarGames={relatedGuides.similarGames}
          openGame={openGame}
        />
      ) : null}

      {isAdmin && !trophiesOnly ? (
        <AdminQuickGuideModal
          open={quickGuideOpen}
          onClose={() => setQuickGuideOpen(false)}
          gameId={gameUuid}
          platformGameId={getPlatformGameId(selectedGame)}
          locale={effectiveGuideLang}
          trophies={activeTrophies}
          onSaved={handleQuickGuideSaved}
        />
      ) : null}
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
