import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { CollectibleKacheln, BossKacheln } from './CollectibleKacheln';
import GameSeoInfobox from '../components/GameSeoInfobox';
import AdminGameOverview from '../components/AdminGameOverview';
import AdminQuickGuideModal from '../components/AdminQuickGuideModal';
import AdminRohmaterialTinderBar from '../components/AdminRohmaterialTinderBar';
import GuideLanguageSelector from '../components/GuideLanguageSelector';
import GuideBreadcrumb from '../components/GuideBreadcrumb';
import RelatedGuides from '../components/RelatedGuides';
import CollapsibleSectionCard from '../components/CollapsibleSectionCard';
import TrophyGroupedChecklist, { ClearGuideTipsButton, MarkOnlineBulkButton } from '../components/TrophyGroupedChecklist';
import WatchlistButton from '../components/WatchlistButton';
import ShareButton from '../components/ShareButton';
import GuidePublishButton from '../components/GuidePublishButton';
import AdminFollowupButton from '../components/AdminFollowupButton';
import AdminGameTypeSelect from '../components/AdminGameTypeSelect';
import AdminHardwareSelect from '../components/AdminHardwareSelect';
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
import { GAME_FIELDS, GAME_STRUCT, GUIDE_SHEET_TYPE } from '../lib/gameSchema';
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
import {
  HIDDEN_TROPHY_MODE,
  hiddenTrophiesRevealed,
  loadHiddenTrophyMode,
  saveHiddenTrophyMode,
} from '../lib/hiddenTrophyPreference';
import { isAdminUser } from '../lib/adminAccess';
import { isGuidePublished, isGameDraftMode } from '../lib/guidePublication';
import {
  clearGameGuideTips,
  clearIntranetCover,
  deleteSingleGuideStep,
  saveTrophyGuideTip,
  saveTrophyGuideTipLong,
  saveTrophyVideo,
  setAchievementFlags,
  setAchievementsOnline,
  setIntranetIgdbCover,
} from '../lib/intranetGameEdits';
import {
  discardRohmaterialBatch,
  fetchRohmaterialBatchesForGame,
  matchRohmaterialBatchForPc,
  promoteRohmaterialBatchToGuide,
} from '../lib/rohmaterialQueries';
import { gameGuidePath, withGuideTabParam, writeAppPath } from '../lib/routeUtils';
import { getTrophyIdKey } from '../lib/trophyQueries';
import { isPlatinumUnlocked } from '../lib/trophyTypes';
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
  onReplaceTrophies,
  onGameChange,
  startTrophyLoad,
  fromSearch = false,
  backLabel = '',
  sessionUser = null,
  /** Login-User: unveröffentlichte Spiele nur als Trophäenliste (ohne Tipps/Reiter). */
  trophiesOnly = false,
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
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState('');
  const [igdbPrompt, setIgdbPrompt] = useState(false);
  const [igdbLink, setIgdbLink] = useState('');
  const [playtime, setPlaytime] = useState(null);
  const [radarProfileData, setRadarProfileData] = useState(null);
  const [descriptionOverrides, setDescriptionOverrides] = useState({});
  const [quickGuideOpen, setQuickGuideOpen] = useState(false);
  const [guideReloadToken, setGuideReloadToken] = useState(0);
  const [rohBatches, setRohBatches] = useState([]);
  /** 'auto' | 'productive' | 'rohmaterial' */
  const [rohMode, setRohMode] = useState('auto');
  const [rohIndex, setRohIndex] = useState(0);
  const [rohBusy, setRohBusy] = useState(false);
  const [rohReloadToken, setRohReloadToken] = useState(0);
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
  /** Außen sichtbare Spiel-Referenz für Fehlermeldungen (NPWR, kein UUID). */
  const reportSource = useMemo(() => reportSourceForGame(selectedGame), [selectedGame]);
  /** Sprache des angezeigten Guides. Freigabe und Tipp-Änderungen gelten nur für diese Sprache. */
  const effectiveGuideLang = resolveGuideLanguage(globalLocale, guideLanguageOverride);
  const [hiddenTrophyMode, setHiddenTrophyMode] = useState(() => loadHiddenTrophyMode(gameId));
  const [tipOverrides, setTipOverrides] = useState({ locale: '', values: {} });
  const [tipHint, setTipHint] = useState('');
  const [onlinePickMode, setOnlinePickMode] = useState(false);
  const [onlinePickIds, setOnlinePickIds] = useState(() => new Set());
  const [onlinePickBusy, setOnlinePickBusy] = useState(false);

  useEffect(() => {
    setHiddenTrophyMode(loadHiddenTrophyMode(gameId));
    setTipOverrides({ locale: '', values: {} });
    setTipHint('');
  }, [gameId]);

  const trophiesWithTips = useMemo(() => (
    activeTrophies.map((trophy) => {
      if (tipOverrides.locale !== effectiveGuideLang) return trophy;
      const id = getTrophyIdKey(trophy);
      if (!Object.prototype.hasOwnProperty.call(tipOverrides.values, id)) return trophy;
      const guide_tip = tipOverrides.values[id];
      return { ...trophy, guide_tip };
    })
  ), [activeTrophies, tipOverrides, effectiveGuideLang]);

  const saveGuideTip = async (achievementId, text) => {
    const { error } = await saveTrophyGuideTip(supabase, gameId, achievementId, effectiveGuideLang, text);
    if (error) return error;
    const next = text.trim();
    setTipOverrides((prev) => ({
      locale: effectiveGuideLang,
      values: {
        ...(prev.locale === effectiveGuideLang ? prev.values : {}),
        [achievementId]: next,
      },
    }));
    return null;
  };

  const saveGuideTipLong = async (achievementId, text) => {
    const { error } = await saveTrophyGuideTipLong(
      supabase,
      gameId,
      achievementId,
      effectiveGuideLang,
      text,
    );
    if (error) return error;
    const next = text.trim();
    onReplaceTrophies?.((rows) => rows.map((row) => (
      getTrophyIdKey(row) === achievementId ? { ...row, guide_tip_long: next } : row
    )));
    return null;
  };

  const saveGuideVideo = async (achievementId, video) => {
    const { error, video: saved } = await saveTrophyVideo(supabase, gameId, achievementId, video);
    if (error) return error;
    onReplaceTrophies?.((rows) => rows.map((row) => (
      getTrophyIdKey(row) === achievementId
        ? {
          ...row,
          video_url: saved?.video_url ?? '',
          timestamp: saved?.timestamp ?? '',
        }
        : row
    )));
    return null;
  };

  const saveTrophyFlags = async (trophy, patch) => {
    const achievementId = getTrophyIdKey(trophy);
    const { totals, error } = await setAchievementFlags(supabase, gameId, achievementId, patch);
    if (error) return error;
    onReplaceTrophies?.((rows) => rows.map((row) => (
      getTrophyIdKey(row) === achievementId ? { ...row, ...patch } : row
    )));
    if (totals) onGameChange?.(totals);
    return null;
  };

  const clearAllGuideTips = async () => {
    const { error } = await clearGameGuideTips(supabase, gameId, effectiveGuideLang);
    if (error) {
      setTipHint(error.message || t('trophyTipFailed'));
      return;
    }
    const values = {};
    for (const trophy of activeTrophies) values[getTrophyIdKey(trophy)] = '';
    setTipOverrides({ locale: effectiveGuideLang, values });
    setTipHint(t('trophyTipSaved'));
  };

  const toggleOnlinePick = (trophyKey) => {
    const key = String(trophyKey ?? '').trim();
    if (!key) return;
    setOnlinePickIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const cancelOnlinePick = () => {
    setOnlinePickMode(false);
    setOnlinePickIds(new Set());
    setOnlinePickBusy(false);
  };

  const confirmOnlinePick = async () => {
    const ids = [...onlinePickIds];
    if (!ids.length || onlinePickBusy) return;
    const message = t('markOnlineBulkConfirm').replaceAll('{count}', String(ids.length));
    if (!window.confirm(message)) return;
    setOnlinePickBusy(true);
    setTipHint('');
    const { totals, error } = await setAchievementsOnline(supabase, gameId, ids, true);
    setOnlinePickBusy(false);
    if (error) {
      setTipHint(error.message || t('markOnlineBulkFailed'));
      return;
    }
    const marked = new Set(ids);
    onReplaceTrophies?.((rows) => rows.map((row) => (
      marked.has(getTrophyIdKey(row)) ? { ...row, is_online: true } : row
    )));
    if (totals) onGameChange?.(totals);
    cancelOnlinePick();
    setTipHint(t('markOnlineBulkSaved'));
  };

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

  const isAdmin = isAdminUser(sessionUser);
  const isDraftRoadmap = isGameDraftMode(gameForPublication);
  /** Sichtbarkeit der Guide-Reiter hängt an der gerade gezeigten Sprache. */
  const guidePublished = isGuidePublished(gameForPublication, effectiveGuideLang);
  /** Admins sehen den Guide als Vorschau (auch bei DRAFT / production_roadmap === 'ACTIVE'), Besucher erst nach der Freigabe. */
  const canSeeGuides =
    (!trophiesOnly || isAdmin) &&
    (guidePublished || isAdmin || isDraftRoadmap || inRohmaterialPreview);
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
  }, [gameUuid]);

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
  const gameDescription = Object.prototype.hasOwnProperty.call(
    descriptionOverrides,
    effectiveGuideLang,
  )
    ? descriptionOverrides[effectiveGuideLang]
    : getGameDescription(selectedGame, effectiveGuideLang);

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

          <fieldset className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
            <legend className="text-xs text-zinc-400">{t('hiddenTrophies')}</legend>
            {[
              [HIDDEN_TROPHY_MODE.SHOW, 'hiddenTrophiesShow'],
              [HIDDEN_TROPHY_MODE.HIDE, 'hiddenTrophiesHide'],
              [HIDDEN_TROPHY_MODE.ALWAYS, 'hiddenTrophiesAlways'],
            ].map(([mode, labelKey]) => (
              <label
                key={mode}
                className="flex cursor-pointer select-none items-center gap-2 text-xs text-zinc-400"
              >
                <input
                  type="radio"
                  name="hidden-trophy-mode"
                  value={mode}
                  checked={hiddenTrophyMode === mode}
                  onChange={() => {
                    saveHiddenTrophyMode(gameId, mode);
                    setHiddenTrophyMode(loadHiddenTrophyMode(gameId));
                  }}
                  className="h-4 w-4 cursor-pointer border-zinc-700 bg-[#121314] text-[#00ff66] focus:ring-0"
                />
                {t(labelKey)}
              </label>
            ))}
          </fieldset>

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

          {isAdmin && !trophiesOnly ? (
            <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
              {tipHint ? <span className="text-[10px] text-zinc-500">{tipHint}</span> : null}
              <MarkOnlineBulkButton
                active={onlinePickMode}
                selectedCount={onlinePickIds.size}
                busy={onlinePickBusy}
                onStart={() => {
                  setOnlinePickMode(true);
                  setOnlinePickIds(new Set());
                  setTipHint('');
                }}
                onCancel={cancelOnlinePick}
                onConfirm={confirmOnlinePick}
              />
              <ClearGuideTipsButton onClear={clearAllGuideTips} locale={effectiveGuideLang} />
            </div>
          ) : null}
          <TrophyGroupedChecklist
            gameId={reportSource}
            trophies={trophiesOnly || !isAdmin ? activeTrophies : trophiesWithTips}
            unlockedTrophies={unlockedTrophies}
            earnedTrophyIds={earnedTrophyIds}
            hideCompleted={hideCompleted}
            revealHidden={hiddenTrophiesRevealed(hiddenTrophyMode)}
            onToggle={toggleTrophy}
            mainGameTitle={gameTitle || t('mainGame')}
            guideTipEditor={isAdmin && !trophiesOnly ? saveGuideTip : null}
            guideTipLongEditor={isAdmin && !trophiesOnly ? saveGuideTipLong : null}
            onTrophyVideo={isAdmin && !trophiesOnly ? saveGuideVideo : null}
            onTrophyFlags={isAdmin && !trophiesOnly ? saveTrophyFlags : null}
            onlinePickMode={onlinePickMode}
            onlinePickIds={onlinePickIds}
            onOnlinePickToggle={toggleOnlinePick}
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
              {t('walkthroughEmpty')}
            </p>
          ) : (
            <CollapsibleSectionCard
              sectionId="guide-walkthrough"
              title={t('fullGameplay')}
              subtitle={t('walkthroughByAreas')}
              badge={t('entriesCount').replaceAll('{count}', String(chronologicalGuideData.length))}
              defaultOpen
              accent="green"
            >
              <CollectibleKacheln
                gameId={reportSource}
                reportEntityType="guide_step"
                collectiblesData={chronologicalGuideData}
                trophyById={trophyById}
                groupByField="chronological_group"
                groupHeaderIcon="📍"
                listTitle={t('fullGameplay')}
                hideCompleted={hideCompleted}
                setHideCompleted={setHideCompleted}
                completedItems={completedGuideItems}
                toggleCompleted={toggleGuideItemCompleted}
                emptyVideoMessage={t('walkthroughNoVideo')}
                embedInAccordion
                isAdmin={isAdmin && !trophiesOnly}
                isDraftMode={isDraftRoadmap}
                onProductionMetaSaved={handleProductionMetaSaved}
                onDeleteStep={
                  isAdmin && !trophiesOnly && !inRohmaterialPreview
                    ? handleDeleteGuideStep
                    : null
                }
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
              {t('collectiblesEmpty')}
            </p>
          ) : (
            <CollapsibleSectionCard
              sectionId="guide-collectibles"
              title={t('completion')}
              subtitle={t('collectiblesByCategory')}
              badge={t('entriesCount').replaceAll('{count}', String(byTypeGuideData.length))}
              defaultOpen
              accent="amber"
            >
              <CollectibleKacheln
                gameId={reportSource}
                reportEntityType="guide_item"
                collectiblesData={byTypeGuideData}
                trophyById={trophyById}
                groupByField="category_group"
                groupHeaderIcon="📦"
                listTitle={t('completion')}
                hideCompleted={hideCompleted}
                setHideCompleted={setHideCompleted}
                completedItems={completedGuideItems}
                toggleCompleted={toggleGuideItemCompleted}
                emptyVideoMessage={t('collectiblesNoVideo')}
                embedInAccordion
                isAdmin={isAdmin && !trophiesOnly}
                isDraftMode={isDraftRoadmap}
                onProductionMetaSaved={handleProductionMetaSaved}
                onDeleteStep={
                  isAdmin && !trophiesOnly && !inRohmaterialPreview
                    ? handleDeleteGuideStep
                    : null
                }
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
              {t('bossesEmpty')}
            </p>
          ) : (
            <CollapsibleSectionCard
              sectionId="guide-bosses"
              title={t('bosses')}
              subtitle={t('bossesByAreas')}
              badge={t('bossesCount').replaceAll('{count}', String(bossOverviewData.length))}
              defaultOpen
              accent="purple"
            >
              <BossKacheln
                gameId={reportSource}
                bossesData={bossOverviewData}
                trophyById={trophyById}
                listTitle={t('bosses')}
                hideCompleted={hideCompleted}
                setHideCompleted={setHideCompleted}
                completedItems={completedGuideItems}
                toggleCompleted={toggleGuideItemCompleted}
                embedInAccordion
                isAdmin={isAdmin && !trophiesOnly}
                isDraftMode={isDraftRoadmap}
                onProductionMetaSaved={handleProductionMetaSaved}
                onDeleteStep={
                  isAdmin && !trophiesOnly && !inRohmaterialPreview
                    ? handleDeleteGuideStep
                    : null
                }
              />
            </CollapsibleSectionCard>
          )}
        </div>
      )}
    </div>
  );

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
          <PlatinumUnlockedBadge visible={platinumDone} />
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
                <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight break-words mt-2 mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
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
                <AdminFollowupButton user={sessionUser} gameId={gameUuid} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-4 sm:gap-x-8 w-full max-w-xl min-w-0 text-sm border-t border-zinc-800/60 pt-4">
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
            </div>
          </div>
        </div>
      </div>

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

      <GameSeoInfobox
        title={gameTitle}
        description={gameDescription}
        creators={contentCreators}
        isAdmin={isAdmin && !trophiesOnly}
        gameUuid={gameUuid}
        locale={effectiveGuideLang}
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

        {isAdmin && isDraftRoadmap && !trophiesOnly && (
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
