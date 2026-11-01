import { useEffect, useMemo, useState } from 'react';
import WatchlistButton from './WatchlistButton';
import GuideOnlineBadge from './GuideOnlineBadge';
import GuideTabBar from './GuideTabBar';
import CollapsibleSectionCard from './CollapsibleSectionCard';
import TrophyGroupedChecklist, { ClearGuideTipsButton, MarkOnlineBulkButton } from './TrophyGroupedChecklist';
import GameSeoInfobox from './GameSeoInfobox';
import { BossKacheln, CollectibleKacheln } from '../pages/CollectibleKacheln';
import { GuideVideoProvider } from '../context/GuideVideoContext';
import { useLocale } from '../context/LocaleContext';
import { GAME_FIELDS } from '../lib/gameSchema';
import {
  getGameCover,
  getGameDescription,
  getGameTitle,
  getGameUuid,
  getPlatformGameId,
} from '../lib/gameModel';
import { publicStudioCredits } from '../lib/studioCredits';
import { gameGuidePath } from '../lib/routeUtils';
import { fetchGameGuideBundle } from '../lib/guideQueries';
import { fetchContentCreatorsForGame } from '../lib/contentCreators';
import {
  clearGameGuideTips,
  clearIntranetCover,
  markGameCoverValid,
  saveTrophyGuideTip,
  saveTrophyGuideTipLong,
  saveTrophyVideo,
  setAchievementFlags,
  setAchievementsOnline,
  setIntranetIgdbCover,
} from '../lib/intranetGameEdits';
import { fetchGameTrophiesWithEarned } from '../lib/earnedTrophyQueries';
import {
  buildBossOverviewData,
  buildByTypeGuideData,
  buildChronologicalGuideData,
} from '../lib/guideData';
import { getTrophyIdKey } from '../lib/trophyQueries';
import {
  loadUnlockedTrophies,
  mergeUnlockedTrophies,
  saveUnlockedTrophies,
} from '../lib/trophyProgressStorage';
import { applyTrophyUnlockToggle, isPlatinumUnlocked } from '../lib/trophyTypes';
import { saveLocalPlatinumFlag, PROGRESS_SYNCED_EVENT } from '../lib/localUserProgress';
import { pushLocalGameProgressToCloud } from '../lib/progressCloudBridge';
import PlatinumUnlockedBadge from './PlatinumUnlockedBadge';
import {
  claimCompletedGuideItems,
  collectGuideProgressIds,
  readCompletedGuideItems,
  saveCompletedGuideItems,
} from '../lib/guideProgressStorage';
import {
  HIDDEN_TROPHY_MODE,
  hiddenTrophiesRevealed,
  loadHiddenTrophyMode,
  saveHiddenTrophyMode,
} from '../lib/hiddenTrophyPreference';
import { supabase } from '../pages/supabaseClient';
import { fetchGameByRouteRef } from '../lib/gameQueries';
import { fetchNewerVersions } from '../lib/newerVersions';
import { RelatedBlock } from './RelatedGuides';

const TAB_META = {
  reiter0: { icon: '🏆', labelKey: 'trophies' },
  reiter1: { icon: '📖', labelKey: 'fullGameplay' },
  reiter2: { icon: '📦', labelKey: 'completion' },
  reiter3: { icon: '⚔️', labelKey: 'bosses' },
  reiter4: { icon: '↗', labelKey: 'newerVersions' },
};

export function formatQuickwinCount(count, oneLabel, manyTemplate) {
  if (Number(count) === 1) return oneLabel;
  return String(manyTemplate ?? '').replace('{count}', String(count));
}

function distinctGroupCount(rows, field) {
  const names = new Set(
    (rows ?? []).map((row) => String(row?.[field] ?? '').trim()).filter(Boolean),
  );
  return names.size;
}

/**
 * Spielansicht, die erst beim Aufklappen eines Titels mountet und lädt.
 * Kopfzeile bleibt die kompakte Kachel; darunter die Guide-Reiter.
 */
function QuickwinGameCard({
  game,
  openGame,
  onRequestLogin,
  isAdmin = false,
  sessionUser = null,
  newerVersions = false,
  includeReady = false,
  serverNotice = false,
  serverNoticeText = '',
  /** false = nur komprimierte Guide-Ansicht, kein Sprung zur Vollseite */
  allowFullGameNav = true,
}) {
  const { t, globalLocale } = useLocale();
  const [detailGame, setDetailGame] = useState(game);
  const gameUuid = getGameUuid(detailGame) || getGameUuid(game);
  const reportSource =
    getPlatformGameId(detailGame) ||
    getPlatformGameId(game) ||
    String(detailGame?.slug || game?.slug || '').trim() ||
    gameUuid;
  const title = getGameTitle(detailGame, globalLocale);
  const cover = getGameCover(detailGame, globalLocale);
  const credits = publicStudioCredits(detailGame);
  const href = gameGuidePath(detailGame, globalLocale);

  const [loading, setLoading] = useState(true);
  const [trophies, setTrophies] = useState([]);
  const [earnedIds, setEarnedIds] = useState(() => new Set());
  const [unlocked, setUnlocked] = useState(() => loadUnlockedTrophies(gameUuid));
  const [walkthrough, setWalkthrough] = useState([]);
  const [collectibles, setCollectibles] = useState([]);
  const [bosses, setBosses] = useState([]);
  const [creators, setCreators] = useState([]);
  const [completedItems, setCompletedItems] = useState({});
  const [hideCompleted, setHideCompleted] = useState(false);
  const [hiddenMode, setHiddenMode] = useState(() => loadHiddenTrophyMode(gameUuid));
  const [activeTab, setActiveTab] = useState('reiter0');
  const [newer, setNewer] = useState({ mode: '', heading: '', games: [] });
  const [tipHint, setTipHint] = useState('');
  const [onlinePickMode, setOnlinePickMode] = useState(false);
  const [onlinePickIds, setOnlinePickIds] = useState(() => new Set());
  const [onlinePickBusy, setOnlinePickBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState('');
  const [igdbPrompt, setIgdbPrompt] = useState(false);
  const [igdbLink, setIgdbLink] = useState('');

  const handleClearCover = async () => {
    if (!gameUuid || coverBusy) return;
    if (!window.confirm('Cover wirklich löschen? Der IGDB-Status wird dabei mit entfernt.')) return;
    setCoverBusy(true);
    setCoverError('');
    const { status, error } = await clearIntranetCover(supabase, gameUuid);
    setCoverBusy(false);
    if (error) {
      setCoverError(error.message || 'Cover konnte nicht gelöscht werden.');
      return;
    }
    setDetailGame((prev) => ({
      ...prev,
      cover_url: {},
      cover_status: null,
      ...(status ? { status } : {}),
    }));
  };

  const handleSaveIgdbLink = async (event) => {
    event.preventDefault();
    if (!gameUuid || coverBusy) return;
    setCoverBusy(true);
    setCoverError('');
    const { coverUrl, coverMap, status, error } = await setIntranetIgdbCover(
      supabase,
      gameUuid,
      igdbLink,
    );
    setCoverBusy(false);
    if (error) {
      setCoverError(error.message || 'IGDB-Link konnte nicht gespeichert werden.');
      return;
    }
    setIgdbPrompt(false);
    setIgdbLink('');
    setDetailGame((prev) => ({
      ...prev,
      cover_url: coverMap || { ...(prev?.cover_url || {}), de: coverUrl, en: coverUrl },
      cover_status: 'valid',
      ...(status ? { status } : {}),
    }));
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
    setDetailGame((prev) => ({ ...prev, cover_status: 'valid', cover_notes: null }));
  };

  useEffect(() => {
    setDetailGame(game);
  }, [game]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNewer({ mode: '', heading: '', games: [] });
    const uuid = getGameUuid(game);
    Promise.all([
      // Listenzeile ohne Cover/Genre → volle games-Zeile parallel nachladen
      uuid
        ? fetchGameByRouteRef(supabase, uuid, globalLocale)
        : Promise.resolve({ data: null }),
      // Hubs: guide_tip fällt auf de/en zurück, wenn die Locale noch nicht übersetzt ist.
      fetchGameTrophiesWithEarned(supabase, sessionUser?.id ?? null, game, globalLocale, null, {
        textFallback: true,
      }),
      fetchGameGuideBundle(supabase, game, globalLocale),
      fetchContentCreatorsForGame(supabase, game),
      newerVersions
        ? fetchNewerVersions(supabase, game, globalLocale, { includeReady })
        : Promise.resolve({ mode: '', heading: '', games: [] }),
    ]).then(([fullGameResult, trophyResult, guideBundle, creatorResult, newerResult]) => {
      if (cancelled) return;
      if (fullGameResult?.data) setDetailGame(fullGameResult.data);
      const nextTrophies = trophyResult.trophies ?? [];
      const nextEarned = trophyResult.earnedIds ?? new Set();
      const chapters = guideBundle.chapters ?? [];
      const guides = guideBundle.guides ?? [];
      const bossRows = guideBundle.bosses ?? [];
      setTrophies(nextTrophies);
      setEarnedIds(nextEarned);
      setUnlocked(mergeUnlockedTrophies(gameUuid, nextEarned));
      setWalkthrough(buildChronologicalGuideData(chapters));
      setCollectibles(buildByTypeGuideData(guides));
      setBosses(buildBossOverviewData(bossRows));
      setCreators(creatorResult.data ?? []);
      setNewer(newerResult || { mode: '', heading: '', games: [] });
      setCompletedItems(
        claimCompletedGuideItems(gameUuid, collectGuideProgressIds(chapters, guides, bossRows)),
      );
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [game, gameUuid, globalLocale, sessionUser?.id, newerVersions, includeReady]);

  useEffect(() => {
    if (!gameUuid) return undefined;
    const onSynced = () => {
      setUnlocked(mergeUnlockedTrophies(gameUuid, earnedIds));
      setCompletedItems(readCompletedGuideItems(gameUuid));
    };
    window.addEventListener(PROGRESS_SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(PROGRESS_SYNCED_EVENT, onSynced);
  }, [gameUuid, earnedIds]);

  const saveGuideTip = async (achievementId, text) => {
    const { error } = await saveTrophyGuideTip(supabase, gameUuid, achievementId, globalLocale, text);
    if (error) return error;
    const next = text.trim();
    setTrophies((prev) => prev.map((trophy) => (
      getTrophyIdKey(trophy) === achievementId
        ? { ...trophy, guide_tip: next }
        : trophy
    )));
    return null;
  };

  const saveGuideTipLong = async (achievementId, text) => {
    const { error } = await saveTrophyGuideTipLong(
      supabase,
      gameUuid,
      achievementId,
      globalLocale,
      text,
    );
    if (error) return error;
    const next = text.trim();
    setTrophies((prev) => prev.map((trophy) => (
      getTrophyIdKey(trophy) === achievementId
        ? { ...trophy, guide_tip_long: next }
        : trophy
    )));
    return null;
  };

  const saveGuideVideo = async (achievementId, video) => {
    const { error, video: saved } = await saveTrophyVideo(supabase, gameUuid, achievementId, video);
    if (error) return error;
    setTrophies((prev) => prev.map((trophy) => (
      getTrophyIdKey(trophy) === achievementId
        ? {
          ...trophy,
          video_url: saved?.video_url ?? '',
          timestamp: saved?.timestamp ?? '',
        }
        : trophy
    )));
    return null;
  };

  const saveTrophyFlags = async (trophy, patch) => {
    const achievementId = getTrophyIdKey(trophy);
    const { error } = await setAchievementFlags(supabase, gameUuid, achievementId, patch);
    if (error) return error;
    setTrophies((prev) => prev.map((row) => (
      getTrophyIdKey(row) === achievementId ? { ...row, ...patch } : row
    )));
    return null;
  };

  const clearAllGuideTips = async () => {
    const { error } = await clearGameGuideTips(supabase, gameUuid, globalLocale);
    if (error) {
      setTipHint(error.message || t('trophyTipFailed'));
      return;
    }
    setTrophies((prev) => prev.map((trophy) => ({ ...trophy, guide_tip: '', guide_tip_long: '' })));
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
    const { error } = await setAchievementsOnline(supabase, gameUuid, ids, true);
    setOnlinePickBusy(false);
    if (error) {
      setTipHint(error.message || t('markOnlineBulkFailed'));
      return;
    }
    const marked = new Set(ids);
    setTrophies((prev) => prev.map((row) => (
      marked.has(getTrophyIdKey(row)) ? { ...row, is_online: true } : row
    )));
    cancelOnlinePick();
    setTipHint(t('markOnlineBulkSaved'));
  };

  const toggleTrophy = (id) => {
    if (earnedIds.has(id)) return;
    setUnlocked((prev) => {
      const next = applyTrophyUnlockToggle(prev, id, trophies, earnedIds);
      saveUnlockedTrophies(gameUuid, next, earnedIds);
      saveLocalPlatinumFlag(gameUuid, isPlatinumUnlocked(trophies, next, earnedIds));
      pushLocalGameProgressToCloud(gameUuid);
      return next;
    });
  };

  const toggleGuideItem = (idOrIds, forceState) => {
    setCompletedItems((prev) => {
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

  const trophyById = useMemo(() => {
    const map = new Map();
    for (const trophy of trophies) {
      const key = String(trophy?.platform_achievement_id ?? trophy?.trophy_id ?? '').trim();
      if (key) map.set(key, trophy);
    }
    return map;
  }, [trophies]);

  const doneCount = trophies.filter((trophy) => {
    const key = getTrophyIdKey(trophy);
    return earnedIds.has(key) || unlocked[key];
  }).length;
  const progressPercent = trophies.length > 0 ? Math.round((doneCount / trophies.length) * 100) : 0;
  const hasHidden = trophies.some((trophy) => trophy.is_hidden);

  const tabs = useMemo(() => {
    const visible = ['reiter0'];
    if (loading || walkthrough.length > 0) visible.push('reiter1');
    if (!loading && collectibles.length > 0) visible.push('reiter2');
    if (!loading && newer.games.length > 0) visible.push('reiter4');
    if (!loading && bosses.length > 0) visible.push('reiter3');
    return visible.map((id) => ({
      id,
      icon: TAB_META[id].icon,
      label: id === 'reiter2' && (newerVersions || serverNotice)
        ? t('collectGuide')
        : t(TAB_META[id].labelKey),
      count: id === 'reiter0'
        ? trophies.length
        : id === 'reiter1'
          ? walkthrough.length
          : id === 'reiter2'
            ? collectibles.length
            : id === 'reiter4'
              ? newer.games.length
              : bosses.length,
    }));
  }, [loading, walkthrough.length, collectibles.length, bosses.length, trophies.length, newer.games.length, t]);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) setActiveTab(tabs[0]?.id ?? 'reiter0');
  }, [tabs, activeTab]);

  const tabIndex = tabs.findIndex((tab) => tab.id === activeTab);
  // Hub-Karte: Beschreibung mit de/en-Fallback statt leer.
  const description = getGameDescription(detailGame, globalLocale, { exact: false });

  const platinumDone = isPlatinumUnlocked(trophies, unlocked, earnedIds);

  return (
    <div className="quickwin-detail">
      <article className="quickwin-card">
        <div className="quickwin-card-main">
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <div className="quickwin-card-cover-wrap relative">
              {cover ? (
                <img
                  src={cover}
                  onClick={
                    isAdmin
                      ? () => {
                          setCoverError('');
                          setIgdbPrompt(true);
                        }
                      : undefined
                  }
                  title={isAdmin ? 'Klicken, um Cover-Link zu ändern' : undefined}
                  className={`quickwin-card-cover ${isAdmin ? 'cursor-pointer transition hover:opacity-90' : ''}`}
                  alt=""
                />
              ) : (
                <div
                  onClick={
                    isAdmin
                      ? () => {
                          setCoverError('');
                          setIgdbPrompt(true);
                        }
                      : undefined
                  }
                  className={`quickwin-card-cover quickwin-card-cover--empty ${isAdmin ? 'cursor-pointer' : ''}`}
                  aria-hidden
                />
              )}
              <div className="absolute top-1.5 left-1.5 z-10 pointer-events-none">
                <GuideOnlineBadge game={detailGame} visible={isAdmin} size="sm" />
              </div>
              <PlatinumUnlockedBadge active={platinumDone} size="sm" />
              {isAdmin && detailGame?.cover_status !== 'valid' ? (
                <div className="absolute top-1.5 right-1.5 z-10 flex flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={handleClearCover}
                    disabled={coverBusy || !cover}
                    title="Falsches Cover löschen und status.igdb entfernen"
                    className="rounded border border-red-500/40 bg-black/80 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider text-red-300 hover:bg-red-500/20 disabled:opacity-40 cursor-pointer"
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
                    className="rounded border border-[#00ff66]/40 bg-black/80 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider text-[#00ff66] hover:bg-[#00ff66]/15 disabled:opacity-50 cursor-pointer"
                  >
                    IGDB Link
                  </button>
                </div>
              ) : null}
            </div>
            {isAdmin && detailGame?.cover_status !== 'valid' ? (
              <button
                type="button"
                onClick={handleVerifyCover}
                disabled={coverBusy}
                title="Klick darauf verifiziert das Cover (setzt cover_status = 'valid')"
                className={`rounded-md border px-2 py-1 text-center font-mono text-[10px] font-bold transition cursor-pointer disabled:opacity-50 ${
                  detailGame?.cover_status === 'invalid'
                    ? 'border-red-500/40 bg-red-500/15 text-red-300 hover:bg-red-500/25'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:border-[#00ff66]/50 hover:bg-[#00ff66]/15 hover:text-[#00ff66]'
                }`}
              >
                {`cover_status: ${detailGame?.cover_status === 'invalid' ? 'invalid' : 'ungeprüft'}`}
              </button>
            ) : null}
            {coverError && !igdbPrompt ? (
              <p className="max-w-[9rem] rounded bg-black/80 px-1.5 py-1 text-[9px] font-mono text-red-300">
                {coverError}
              </p>
            ) : null}
          </div>
          <div className="quickwin-card-body">
            <div className="quickwin-card-title-row">
              {allowFullGameNav ? (
                <a
                  href={href}
                  className="quickwin-card-title"
                  onClick={(event) => {
                    event.preventDefault();
                    openGame?.(detailGame);
                  }}
                >
                  {title}
                  {isAdmin ? (
                    <span className="quickwin-type">
                      {String(detailGame.spiel_typ ?? '').trim() || '—'}
                    </span>
                  ) : null}
                </a>
              ) : (
                <p className="quickwin-card-title">
                  {title}
                  {isAdmin ? (
                    <span className="quickwin-type">
                      {String(detailGame.spiel_typ ?? '').trim() || '—'}
                    </span>
                  ) : null}
                </p>
              )}
              <div className="quickwin-card-actions">
                <GuideOnlineBadge game={detailGame} visible={isAdmin} size="md" />
                <WatchlistButton gameId={gameUuid} onRequestLogin={onRequestLogin} size="md" />
              </div>
            </div>
            <div className="quickwin-card-meta">
              <div>
                <span>{t('searchConsole')}</span>
                <strong>{detailGame[GAME_FIELDS.console] || '—'}</strong>
              </div>
              <div>
                <span>{t('yearLabel')}</span>
                <strong>{detailGame[GAME_FIELDS.year] || '—'}</strong>
              </div>
              <div>
                <span>{t('searchGenre')}</span>
                <strong>{detailGame[GAME_FIELDS.genre] || '—'}</strong>
              </div>
              <div>
                <span>{t('studioLabel')}</span>
                <strong>{credits.studio || '—'}</strong>
              </div>
            </div>
          </div>
        </div>
      </article>

      {loading ? (
        <p className="quickwin-card-note">{t('guideLoading')}</p>
      ) : (
        <>
          <GuideTabBar
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onPrev={() => tabIndex > 0 && setActiveTab(tabs[tabIndex - 1].id)}
            onNext={() => tabIndex < tabs.length - 1 && setActiveTab(tabs[tabIndex + 1].id)}
            canGoPrev={tabIndex > 0}
            canGoNext={tabIndex >= 0 && tabIndex < tabs.length - 1}
          />

          <GameSeoInfobox title={title} description={description} creators={creators} />

          {activeTab === 'reiter0' && (
            <div className="quickwin-tab">
              {serverNotice ? (
                <p className="quickwin-server-notice">{serverNoticeText}</p>
              ) : null}
              <div className="quickwin-progress">
                <div className="quickwin-progress-label">
                  <span>{t('overallProgress')}</span>
                  <strong>
                    {progressPercent}% ({doneCount}/{trophies.length})
                  </strong>
                </div>
                <div className="quickwin-progress-track">
                  <div style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
              <label className="quickwin-hide-done">
                <input
                  type="checkbox"
                  checked={hideCompleted}
                  onChange={(event) => setHideCompleted(event.target.checked)}
                />
                {t('hideCompleted')}
              </label>
              {hasHidden && (
                <fieldset className="quickwin-hidden">
                  <legend>{t('hiddenTrophies')}</legend>
                  {[
                    [HIDDEN_TROPHY_MODE.SHOW, 'hiddenTrophiesShow'],
                    [HIDDEN_TROPHY_MODE.HIDE, 'hiddenTrophiesHide'],
                    [HIDDEN_TROPHY_MODE.ALWAYS, 'hiddenTrophiesAlways'],
                  ].map(([mode, labelKey]) => (
                    <label key={mode}>
                      <input
                        type="radio"
                        name={`hidden-trophy-${gameUuid}`}
                        value={mode}
                        checked={hiddenMode === mode}
                        onChange={() => {
                          saveHiddenTrophyMode(gameUuid, mode);
                          setHiddenMode(loadHiddenTrophyMode(gameUuid));
                        }}
                      />
                      {t(labelKey)}
                    </label>
                  ))}
                </fieldset>
              )}
              {isAdmin ? (
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
                  <ClearGuideTipsButton onClear={clearAllGuideTips} locale={globalLocale} />
                </div>
              ) : null}
              <TrophyGroupedChecklist
                gameId={reportSource}
                trophies={trophies}
                unlockedTrophies={unlocked}
                earnedTrophyIds={earnedIds}
                hideCompleted={hideCompleted}
                revealHidden={hiddenTrophiesRevealed(hiddenMode)}
                onToggle={toggleTrophy}
                mainGameTitle={title || t('mainGame')}
                guideTipEditor={isAdmin ? saveGuideTip : null}
                guideTipLongEditor={isAdmin ? saveGuideTipLong : null}
                onTrophyVideo={isAdmin ? saveGuideVideo : null}
                onTrophyFlags={isAdmin ? saveTrophyFlags : null}
                onlinePickMode={onlinePickMode}
                onlinePickIds={onlinePickIds}
                onOnlinePickToggle={toggleOnlinePick}
              />
            </div>
          )}

          {activeTab === 'reiter1' && (
            <GuideVideoProvider>
              <CollapsibleSectionCard
                sectionId={`qw-walk-${gameUuid}`}
                title={t('fullGameplay')}
                badge={`${walkthrough.length}`}
                defaultOpen
                accent="green"
              >
                <CollectibleKacheln
                  gameId={reportSource}
                  reportEntityType="guide_step"
                  collectiblesData={walkthrough}
                  trophyById={trophyById}
                  groupByField="chronological_group"
                  listTitle={t('fullGameplay')}
                  hideCompleted={hideCompleted}
                  setHideCompleted={setHideCompleted}
                  completedItems={completedItems}
                  toggleCompleted={toggleGuideItem}
                  embedInAccordion
                  hideGroupHeader={distinctGroupCount(walkthrough, 'chronological_group') <= 1}
                />
              </CollapsibleSectionCard>
            </GuideVideoProvider>
          )}

          {activeTab === 'reiter2' && (
            <GuideVideoProvider>
              <CollapsibleSectionCard
                sectionId={`qw-collect-${gameUuid}`}
                title={newerVersions || serverNotice ? t('collectGuide') : t('completion')}
                badge={`${collectibles.length}`}
                defaultOpen
                accent="amber"
              >
                <CollectibleKacheln
                  gameId={reportSource}
                  reportEntityType="guide_item"
                  collectiblesData={collectibles}
                  trophyById={trophyById}
                  groupByField="category_group"
                  listTitle={newerVersions || serverNotice ? t('collectGuide') : t('completion')}
                  hideCompleted={hideCompleted}
                  setHideCompleted={setHideCompleted}
                  completedItems={completedItems}
                  toggleCompleted={toggleGuideItem}
                  embedInAccordion
                  hideGroupHeader={distinctGroupCount(collectibles, 'category_group') <= 1}
                />
              </CollapsibleSectionCard>
            </GuideVideoProvider>
          )}

          {activeTab === 'reiter4' && (
            <RelatedBlock
              compact
              title={newer.mode === 'publisher'
                ? t('publisherGames').replaceAll('{name}', newer.heading)
                : newer.heading}
              games={newer.games}
              openGame={openGame}
            />
          )}

          {activeTab === 'reiter3' && (
            <GuideVideoProvider>
              <CollapsibleSectionCard
                sectionId={`qw-boss-${gameUuid}`}
                title={t('bosses')}
                badge={`${bosses.length}`}
                defaultOpen
                accent="purple"
              >
                <BossKacheln
                  gameId={reportSource}
                  bossesData={bosses}
                  trophyById={trophyById}
                  listTitle={t('bosses')}
                  hideCompleted={hideCompleted}
                  setHideCompleted={setHideCompleted}
                  completedItems={completedItems}
                  toggleCompleted={toggleGuideItem}
                  embedInAccordion
                />
              </CollapsibleSectionCard>
            </GuideVideoProvider>
          )}
        </>
      )}

      {isAdmin && igdbPrompt ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!coverBusy) setIgdbPrompt(false);
          }}
        >
          <form
            onSubmit={handleSaveIgdbLink}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-zinc-700 bg-[#1a1b1c] p-5 shadow-2xl"
          >
            <h2 className="text-sm font-bold text-white">Neuer IGDB-Link</h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              Bildlink von images.igdb.com einfügen. Der ersetzt das Cover und hält den IGDB-Status auf erledigt.
            </p>
            <input
              type="text"
              inputMode="url"
              value={igdbLink}
              onChange={(event) => setIgdbLink(event.target.value)}
              placeholder="https://images.igdb.com/igdb/image/upload/…"
              autoFocus
              className="mt-3 w-full rounded-xl border border-zinc-700 bg-[#121314] px-3 py-2 text-sm text-zinc-200 focus:border-[#00ff66]/40 focus:outline-hidden"
            />
            {coverError ? (
              <p className="mt-2 font-mono text-[11px] text-red-300">{coverError}</p>
            ) : null}
            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={coverBusy}
                onClick={() => setIgdbPrompt(false)}
                className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={coverBusy || !igdbLink.trim()}
                className="rounded-xl bg-[#00ff66] px-3.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#121314] disabled:opacity-50 cursor-pointer"
              >
                {coverBusy ? 'Speichere…' : 'Cover speichern'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export default QuickwinGameCard;
