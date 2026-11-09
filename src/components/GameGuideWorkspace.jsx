import { useMemo, useState } from 'react';
import { BossKacheln, CollectibleKacheln } from '../pages/CollectibleKacheln';
import { GuideVideoProvider } from '../context/GuideVideoContext';
import { useLocale } from '../context/LocaleContext';
import { supabase } from '../pages/supabaseClient';
import CollapsibleSectionCard from './CollapsibleSectionCard';
import GuideTabBar from './GuideTabBar';
import { RelatedBlock } from './RelatedGuides';
import TrophyGroupedChecklist, { ClearGuideTipsButton, MarkOnlineBulkButton } from './TrophyGroupedChecklist';
import { guideTabId, guideTabPanelId } from '../lib/guideTabs';
import { buildGuideWorkspaceTabs, getGameViewPolicy } from '../lib/gameViewPolicy';
import {
  HIDDEN_TROPHY_MODE,
  hiddenTrophiesRevealed,
  loadHiddenTrophyMode,
  saveHiddenTrophyMode,
} from '../lib/hiddenTrophyPreference';
import {
  clearGameGuideTips,
  saveTrophyGuideTip,
  saveTrophyGuideTipLong,
  saveTrophyVideo,
  setAchievementFlags,
  setAchievementsOnline,
} from '../lib/intranetGameEdits';
import { getTrophyIdKey } from '../lib/trophyQueries';

const HIDDEN_CHOICES = [
  [HIDDEN_TROPHY_MODE.SHOW, 'hiddenTrophiesShow'],
  [HIDDEN_TROPHY_MODE.HIDE, 'hiddenTrophiesHide'],
  [HIDDEN_TROPHY_MODE.ALWAYS, 'hiddenTrophiesAlways'],
];

function distinctGroupCount(rows, field) {
  const names = new Set(
    (rows ?? []).map((row) => String(row?.[field] ?? '').trim()).filter(Boolean),
  );
  return names.size;
}

function overallProgress(trophies, unlocked, earnedIds) {
  const list = trophies ?? [];
  const done = list.filter((trophy) => {
    const key = getTrophyIdKey(trophy);
    return Boolean(earnedIds?.has?.(key) || unlocked?.[key]);
  }).length;
  const percent = list.length > 0 ? Math.round((done / list.length) * 100) : 0;
  return { done, total: list.length, percent };
}

/**
 * Gemeinsame Guide- und Trophäen-Ansicht für die Vollseite und die Hub-Kachel.
 * Admin-Tipps, Online-Markierung und die Versteckt-Trophäen-Wahl leben hier.
 */
function GameGuideWorkspace({
  variant = 'page',
  policy: policyProp = null,
  game = null,
  gameUuid = '',
  reportSource = '',
  locale = '',
  isAdmin = false,
  trophiesOnly = false,
  trophies = [],
  onReplaceTrophies = null,
  onGameChange = null,
  unlockedTrophies = {},
  earnedTrophyIds = null,
  onToggleTrophy = null,
  hideCompleted = false,
  setHideCompleted = null,
  completedItems = {},
  toggleCompleted = null,
  walkthrough = [],
  collectibles = [],
  bosses = [],
  trophyById = null,
  loading = false,
  canSeeGuides = true,
  mainGameTitle = '',
  isCreator = false,
  isDraftMode = false,
  onProductionMetaSaved = null,
  onDeleteStep = null,
  inRohmaterialPreview = false,
  videoLayoutFlexClass = '',
  usingPlatformStack = false,
  platformTrophies = [],
  platformTrophiesLoading = false,
  platformTrophiesError = '',
  activePlatform = 'psn',
  platformStacks = null,
  newer = null,
  openGame = null,
  serverNoticeText = '',
  tabs: tabsProp = null,
  activeTab = null,
  onTabChange = null,
  onPrev = null,
  onNext = null,
  canGoPrev = null,
  canGoNext = null,
  tabBarAnchorRef = null,
}) {
  const { t } = useLocale();
  const policy = policyProp ?? getGameViewPolicy(game, { variant, isAdmin });
  const inline = variant === 'inline';
  const newerGames = newer?.games ?? [];
  const controlled = activeTab != null && typeof onTabChange === 'function';
  const [uncontrolledTab, setUncontrolledTab] = useState('reiter0');
  const [hiddenTrophyMode, setHiddenTrophyMode] = useState(() => loadHiddenTrophyMode(gameUuid));
  const [tipOverrides, setTipOverrides] = useState({ locale: '', values: {} });
  const [tipHint, setTipHint] = useState('');
  const [onlinePickMode, setOnlinePickMode] = useState(false);
  const [onlinePickIds, setOnlinePickIds] = useState(() => new Set());
  const [onlinePickBusy, setOnlinePickBusy] = useState(false);

  const [trackedGameId, setTrackedGameId] = useState(gameUuid);
  if (trackedGameId !== gameUuid) {
    setTrackedGameId(gameUuid);
    setHiddenTrophyMode(loadHiddenTrophyMode(gameUuid));
    setTipOverrides({ locale: '', values: {} });
    setTipHint('');
    setOnlinePickMode(false);
    setOnlinePickIds(new Set());
    setOnlinePickBusy(false);
  }

  const selectTab = (next) => {
    if (controlled) onTabChange(next);
    else setUncontrolledTab(next);
  };

  const trophiesWithTips = useMemo(() => (
    (trophies ?? []).map((trophy) => {
      if (tipOverrides.locale !== locale) return trophy;
      const id = getTrophyIdKey(trophy);
      if (!Object.prototype.hasOwnProperty.call(tipOverrides.values, id)) return trophy;
      return { ...trophy, guide_tip: tipOverrides.values[id] };
    })
  ), [trophies, tipOverrides, locale]);

  const checklistTrophies = usingPlatformStack ? platformTrophies : trophiesWithTips;
  const progress = overallProgress(trophies, unlockedTrophies, earnedTrophyIds);
  const hasHidden = (checklistTrophies ?? []).some((trophy) => trophy.is_hidden);
  const canEditTips = Boolean(isAdmin && !trophiesOnly && !usingPlatformStack);
  const collectiblesLabel = t(policy.collectiblesTabLabelKey || 'completion');
  const noticeText = serverNoticeText || t('serverDeadPlatinum');

  const counts = useMemo(() => ({
    reiter0: usingPlatformStack ? platformTrophies.length : (trophies ?? []).length,
    reiter1: walkthrough.length,
    reiter2: collectibles.length,
    reiter3: bosses.length,
    reiter4: newerGames.length,
  }), [
    usingPlatformStack,
    platformTrophies.length,
    trophies,
    walkthrough.length,
    collectibles.length,
    bosses.length,
    newerGames.length,
  ]);

  const tabs = useMemo(() => {
    if (Array.isArray(tabsProp) && tabsProp.length > 0) return tabsProp;
    return buildGuideWorkspaceTabs({
      variant,
      policy,
      t,
      counts,
      loading,
      canSeeGuides,
    });
  }, [tabsProp, variant, policy, t, counts, loading, canSeeGuides]);

  const fallbackTab = tabs[0]?.id ?? 'reiter0';
  const currentTab = controlled
    ? activeTab
    : (tabs.some((tab) => tab.id === uncontrolledTab) ? uncontrolledTab : fallbackTab);

  const tabIndex = tabs.findIndex((tab) => tab.id === currentTab);
  const goPrev = onPrev || (() => {
    if (tabIndex > 0) selectTab(tabs[tabIndex - 1].id);
  });
  const goNext = onNext || (() => {
    if (tabIndex >= 0 && tabIndex < tabs.length - 1) selectTab(tabs[tabIndex + 1].id);
  });
  const prevOk = canGoPrev != null ? canGoPrev : tabIndex > 0;
  const nextOk = canGoNext != null ? canGoNext : tabIndex >= 0 && tabIndex < tabs.length - 1;

  const saveGuideTip = async (achievementId, text) => {
    const { error } = await saveTrophyGuideTip(supabase, gameUuid, achievementId, locale, text);
    if (error) return error;
    const next = text.trim();
    setTipOverrides((prev) => ({
      locale,
      values: {
        ...(prev.locale === locale ? prev.values : {}),
        [achievementId]: next,
      },
    }));
    return null;
  };

  const saveGuideTipLong = async (achievementId, text) => {
    const { error } = await saveTrophyGuideTipLong(
      supabase,
      gameUuid,
      achievementId,
      locale,
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
    const { error, video: saved } = await saveTrophyVideo(supabase, gameUuid, achievementId, video);
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
    const { totals, error } = await setAchievementFlags(supabase, gameUuid, achievementId, patch);
    if (error) return error;
    onReplaceTrophies?.((rows) => rows.map((row) => (
      getTrophyIdKey(row) === achievementId ? { ...row, ...patch } : row
    )));
    if (totals) onGameChange?.(totals);
    return null;
  };

  const clearAllGuideTips = async () => {
    const { error } = await clearGameGuideTips(supabase, gameUuid, locale);
    if (error) {
      setTipHint(error.message || t('trophyTipFailed'));
      return;
    }
    const values = {};
    for (const trophy of trophies ?? []) values[getTrophyIdKey(trophy)] = '';
    setTipOverrides({ locale, values });
    onReplaceTrophies?.((rows) => rows.map((row) => ({
      ...row,
      guide_tip: '',
      guide_tip_long: '',
    })));
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
    const { totals, error } = await setAchievementsOnline(supabase, gameUuid, ids, true);
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

  const guideEdit = inline
    ? {}
    : {
      isAdmin: Boolean(isAdmin && !trophiesOnly),
      isCreator: Boolean(isCreator),
      isDraftMode: Boolean(isDraftMode),
      onProductionMetaSaved,
      videoLayoutFlexClass,
      onDeleteStep: isAdmin && !trophiesOnly && !inRohmaterialPreview ? onDeleteStep : null,
    };

  const checklist = (
    <TrophyGroupedChecklist
      gameId={reportSource}
      trophies={checklistTrophies}
      unlockedTrophies={unlockedTrophies}
      earnedTrophyIds={earnedTrophyIds}
      hideCompleted={hideCompleted}
      revealHidden={hiddenTrophiesRevealed(hiddenTrophyMode)}
      onToggle={usingPlatformStack ? () => {} : onToggleTrophy}
      mainGameTitle={mainGameTitle || t('mainGame')}
      guideTipEditor={canEditTips ? saveGuideTip : null}
      guideTipLongEditor={canEditTips ? saveGuideTipLong : null}
      onTrophyVideo={canEditTips ? saveGuideVideo : null}
      onTrophyFlags={canEditTips ? saveTrophyFlags : null}
      onlinePickMode={usingPlatformStack ? false : onlinePickMode}
      onlinePickIds={onlinePickIds}
      onOnlinePickToggle={toggleOnlinePick}
    />
  );

  const adminBulk = canEditTips ? (
    <div className="tb-admin-bar mb-3 w-full justify-end">
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
      <ClearGuideTipsButton onClear={clearAllGuideTips} locale={locale} />
    </div>
  ) : null;

  const hiddenField = (inline && !hasHidden) ? null : (
    <fieldset className={inline ? 'quickwin-hidden' : 'mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-1'}>
      <legend className={inline ? undefined : 'text-xs text-zinc-400'}>{t('hiddenTrophies')}</legend>
      {HIDDEN_CHOICES.map(([mode, labelKey]) => (
        <label
          key={mode}
          className={inline ? undefined : 'flex cursor-pointer select-none items-center gap-2 text-xs text-zinc-400'}
        >
          <input
            type="radio"
            name={inline ? `hidden-trophy-${gameUuid}` : 'hidden-trophy-mode'}
            value={mode}
            checked={hiddenTrophyMode === mode}
            onChange={() => {
              saveHiddenTrophyMode(gameUuid, mode);
              setHiddenTrophyMode(loadHiddenTrophyMode(gameUuid));
            }}
            className={inline ? undefined : 'h-4 w-4 cursor-pointer border-zinc-700 bg-[#121314] text-[#00ff66] focus:ring-0'}
          />
          {t(labelKey)}
        </label>
      ))}
    </fieldset>
  );

  const wrapVideo = (node) => (
    inline ? <GuideVideoProvider>{node}</GuideVideoProvider> : node
  );

  const walkthroughPanel = walkthrough.length === 0 && !loading && !inline ? (
    <p className="text-xs text-zinc-500 italic text-center py-8 bg-[#1a1b1c] rounded-xl border border-zinc-800">
      {t('walkthroughEmpty')}
    </p>
  ) : (
    <CollapsibleSectionCard
      sectionId={inline ? `qw-walk-${gameUuid}` : 'guide-walkthrough'}
      title={t('fullGameplay')}
      subtitle={!inline && walkthrough.length !== 1 ? t('walkthroughByAreas') : null}
      badge={
        inline
          ? `${walkthrough.length}`
          : walkthrough.length === 1
            ? null
            : t('entriesCount').replaceAll('{count}', String(walkthrough.length))
      }
      defaultOpen
      accent="green"
    >
      <CollectibleKacheln
        gameId={reportSource}
        reportEntityType="guide_step"
        collectiblesData={walkthrough}
        trophyById={trophyById}
        groupByField="chronological_group"
        groupHeaderIcon="📍"
        listTitle={t('fullGameplay')}
        hideCompleted={hideCompleted}
        setHideCompleted={setHideCompleted}
        completedItems={completedItems}
        toggleCompleted={toggleCompleted}
        emptyVideoMessage={inline ? undefined : t('walkthroughNoVideo')}
        embedInAccordion
        hideGroupHeader={inline && distinctGroupCount(walkthrough, 'chronological_group') <= 1}
        {...guideEdit}
      />
    </CollapsibleSectionCard>
  );

  const collectiblesPanel = collectibles.length === 0 && !loading && !inline ? (
    <p className="text-xs text-zinc-500 italic text-center py-8 bg-[#1a1b1c] rounded-xl border border-zinc-800">
      {t('collectiblesEmpty')}
    </p>
  ) : (
    <CollapsibleSectionCard
      sectionId={inline ? `qw-collect-${gameUuid}` : 'guide-collectibles'}
      title={collectiblesLabel}
      subtitle={!inline && collectibles.length !== 1 ? t('collectiblesByCategory') : null}
      badge={
        inline
          ? `${collectibles.length}`
          : collectibles.length === 1
            ? null
            : t('entriesCount').replaceAll('{count}', String(collectibles.length))
      }
      defaultOpen
      accent="amber"
    >
      <CollectibleKacheln
        gameId={reportSource}
        reportEntityType="guide_item"
        collectiblesData={collectibles}
        trophyById={trophyById}
        groupByField="category_group"
        groupHeaderIcon={inline ? undefined : '📦'}
        listTitle={collectiblesLabel}
        hideCompleted={hideCompleted}
        setHideCompleted={setHideCompleted}
        completedItems={completedItems}
        toggleCompleted={toggleCompleted}
        emptyVideoMessage={inline ? undefined : t('collectiblesNoVideo')}
        embedInAccordion
        hideGroupHeader={inline && distinctGroupCount(collectibles, 'category_group') <= 1}
        {...guideEdit}
      />
    </CollapsibleSectionCard>
  );

  const bossesPanel = bosses.length === 0 && !loading && !inline ? (
    <p className="text-xs text-zinc-500 italic text-center py-8 bg-[#1a1b1c] rounded-xl border border-zinc-800">
      {t('bossesEmpty')}
    </p>
  ) : (
    <CollapsibleSectionCard
      sectionId={inline ? `qw-boss-${gameUuid}` : 'guide-bosses'}
      title={t('bosses')}
      subtitle={!inline && bosses.length !== 1 ? t('bossesByAreas') : null}
      badge={
        inline
          ? `${bosses.length}`
          : bosses.length === 1
            ? null
            : t('bossesCount').replaceAll('{count}', String(bosses.length))
      }
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
        toggleCompleted={toggleCompleted}
        embedInAccordion
        {...guideEdit}
      />
    </CollapsibleSectionCard>
  );

  const panels = (
    <>
      {currentTab === 'reiter0' && (
        inline ? (
          <div className="quickwin-tab">
            {policy.showServerDeadNotice ? (
              <p className="quickwin-server-notice">{noticeText}</p>
            ) : null}
            <div className="quickwin-progress">
              <div className="quickwin-progress-label">
                <span>{t('overallProgress')}</span>
                <strong>
                  {progress.percent}% ({progress.done}/{progress.total})
                </strong>
              </div>
              <div className="quickwin-progress-track relative">
                <div className="absolute inset-y-0 start-0" style={{ width: `${progress.percent}%` }} />
              </div>
            </div>
            <label className="quickwin-hide-done">
              <input
                type="checkbox"
                checked={hideCompleted}
                onChange={(event) => setHideCompleted?.(event.target.checked)}
              />
              {t('hideCompleted')}
            </label>
            {hiddenField}
            {adminBulk}
            {checklist}
          </div>
        ) : (
          <div
            role="tabpanel"
            id={guideTabPanelId('reiter0')}
            aria-labelledby={guideTabId('reiter0')}
          >
            {policy.showServerDeadNotice ? (
              <p className="mb-3 text-sm font-semibold leading-relaxed text-red-500">{noticeText}</p>
            ) : null}
            <div className="flex justify-between items-center mb-4 px-1">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">
                {t('trophyChecklist')}
              </h3>
              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideCompleted}
                  onChange={(event) => setHideCompleted?.(event.target.checked)}
                  className="rounded-sm border-zinc-700 bg-[#121314] text-[#00ff66] focus:ring-0 w-4 h-4 cursor-pointer"
                />
                {t('hideCompleted')}
              </label>
            </div>
            {hiddenField}
            <div className="mb-4 px-1">
              <div className="flex justify-between items-center mb-2 text-xs font-mono">
                <span className="text-zinc-400 uppercase tracking-wider">{t('overallProgress')}</span>
                <span className="text-[#00ff66] font-bold text-sm">
                  {usingPlatformStack
                    ? `${checklistTrophies.length} Achievements`
                    : `${progress.percent}% (${progress.done}/${progress.total})`}
                </span>
              </div>
              <div className="relative w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 start-0 bg-[#00ff66] h-full rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(0,255,102,0.5)]"
                  style={{ width: `${usingPlatformStack ? 0 : progress.percent}%` }}
                />
              </div>
            </div>
            {usingPlatformStack ? (
              <p className="mb-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs leading-relaxed text-sky-100">
                {activePlatform === 'steam'
                  ? `🖥️ Steam-Stack aktiv (AppID: ${platformStacks?.steam?.app_id} · ${platformStacks?.steam?.match_status ?? ''} · ${platformStacks?.steam?.match_notes || ''}) – Walkthrough & Sammelobjekte nutzen weiterhin den Master-Guide.`
                  : `💚 Xbox-Stack aktiv (TitleID: ${platformStacks?.xbox?.title_id} · ${platformStacks?.xbox?.match_status ?? ''} · ${platformStacks?.xbox?.match_notes || ''}) – Walkthrough & Sammelobjekte nutzen weiterhin den Master-Guide.`}
              </p>
            ) : null}
            {usingPlatformStack && platformTrophiesLoading ? (
              <p className="mb-3 font-mono text-xs text-zinc-500">Achievements werden geladen…</p>
            ) : null}
            {usingPlatformStack && platformTrophiesError ? (
              <p className="mb-3 text-xs text-red-300">{platformTrophiesError}</p>
            ) : null}
            {adminBulk}
            {checklist}
          </div>
        )
      )}

      {currentTab === 'reiter1' && (
        <div
          key="tab-walkthrough"
          role={inline ? undefined : 'tabpanel'}
          id={inline ? undefined : guideTabPanelId('reiter1')}
          aria-labelledby={inline ? undefined : guideTabId('reiter1')}
          className={inline ? undefined : 'w-full'}
        >
          {wrapVideo(walkthroughPanel)}
        </div>
      )}

      {currentTab === 'reiter2' && (
        <div
          key="tab-collectibles"
          role={inline ? undefined : 'tabpanel'}
          id={inline ? undefined : guideTabPanelId('reiter2')}
          aria-labelledby={inline ? undefined : guideTabId('reiter2')}
          className={inline ? undefined : 'w-full'}
        >
          {wrapVideo(collectiblesPanel)}
        </div>
      )}

      {currentTab === 'reiter3' && (
        <div
          key="tab-bosses"
          role={inline ? undefined : 'tabpanel'}
          id={inline ? undefined : guideTabPanelId('reiter3')}
          aria-labelledby={inline ? undefined : guideTabId('reiter3')}
          className={inline ? undefined : 'w-full'}
        >
          {wrapVideo(bossesPanel)}
        </div>
      )}

      {currentTab === 'reiter4' && newerGames.length > 0 && (
        <RelatedBlock
          compact
          title={newer?.mode === 'publisher'
            ? t('publisherGames').replaceAll('{name}', newer?.heading ?? '')
            : (newer?.heading ?? '')}
          games={newerGames}
          openGame={openGame}
        />
      )}
    </>
  );

  const guideRowCount = (walkthrough?.length ?? 0) + (collectibles?.length ?? 0) + (bosses?.length ?? 0);
  const showInitialGuideLoading = loading && guideRowCount === 0;

  if (inline && showInitialGuideLoading) {
    return <p className="quickwin-card-note">{t('guideLoading')}</p>;
  }

  return (
    <>
      <GuideTabBar
        tabs={tabs}
        activeTab={currentTab}
        onTabChange={selectTab}
        onPrev={goPrev}
        onNext={goNext}
        canGoPrev={prevOk}
        canGoNext={nextOk}
        anchorRef={tabBarAnchorRef}
      />
      {variant === 'page' && showInitialGuideLoading && currentTab !== 'reiter0' ? (
        <p className="text-xs text-zinc-500 font-mono mb-4 animate-pulse">{t('guideLoading')}</p>
      ) : null}
      {variant === 'page' ? (
        <div className="w-full flex flex-col gap-4">{panels}</div>
      ) : panels}
    </>
  );
}

export default GameGuideWorkspace;
