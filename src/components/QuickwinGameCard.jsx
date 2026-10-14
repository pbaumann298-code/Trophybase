import { useEffect, useMemo, useState } from 'react';
import WatchlistButton from './WatchlistButton';
import GuideOnlineBadge from './GuideOnlineBadge';
import GuideTabBar from './GuideTabBar';
import CollapsibleSectionCard from './CollapsibleSectionCard';
import TrophyGroupedChecklist, { ClearGuideTipsButton } from './TrophyGroupedChecklist';
import GameSeoInfobox from './GameSeoInfobox';
import { BossKacheln, CollectibleKacheln } from '../pages/CollectibleKacheln';
import { GuideVideoProvider } from '../context/GuideVideoContext';
import { useLocale } from '../context/LocaleContext';
import { GAME_FIELDS } from '../lib/gameSchema';
import { getGameCover, getGameDescription, getGameTitle, getGameUuid } from '../lib/gameModel';
import { publicStudioCredits } from '../lib/studioCredits';
import { gameGuidePath } from '../lib/routeUtils';
import { fetchGameGuideBundle } from '../lib/guideQueries';
import { fetchContentCreatorsForGame } from '../lib/contentCreators';
import { clearGameGuideTips, saveTrophyGuideTip } from '../lib/intranetGameEdits';
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
import {
  claimCompletedGuideItems,
  collectGuideProgressIds,
  saveCompletedGuideItems,
} from '../lib/guideProgressStorage';
import {
  HIDDEN_TROPHY_MODE,
  hiddenTrophiesRevealed,
  loadHiddenTrophyMode,
  saveHiddenTrophyMode,
} from '../lib/hiddenTrophyPreference';
import { supabase } from '../pages/supabaseClient';
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
}) {
  const { t, globalLocale } = useLocale();
  const gameUuid = getGameUuid(game);
  const title = getGameTitle(game, globalLocale);
  const cover = getGameCover(game, globalLocale);
  const credits = publicStudioCredits(game);
  const href = gameGuidePath(game, globalLocale);

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNewer({ mode: '', heading: '', games: [] });
    Promise.all([
      fetchGameTrophiesWithEarned(supabase, sessionUser?.id ?? null, game, globalLocale),
      fetchGameGuideBundle(supabase, game, globalLocale),
      fetchContentCreatorsForGame(supabase, game),
      newerVersions
        ? fetchNewerVersions(supabase, game, globalLocale, { includeReady })
        : Promise.resolve({ mode: '', heading: '', games: [] }),
    ]).then(([trophyResult, guideBundle, creatorResult, newerResult]) => {
      if (cancelled) return;
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

  const saveGuideTip = async (achievementId, text) => {
    const { error } = await saveTrophyGuideTip(supabase, gameUuid, achievementId, globalLocale, text);
    if (error) return error;
    const next = text.trim();
    setTrophies((prev) => prev.map((trophy) => (
      getTrophyIdKey(trophy) === achievementId
        ? { ...trophy, guide_tip: next, guide_tip_long: next ? trophy.guide_tip_long : '' }
        : trophy
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

  const toggleTrophy = (id) => {
    if (earnedIds.has(id)) return;
    setUnlocked((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next[id]) delete next[id];
      saveUnlockedTrophies(gameUuid, next, earnedIds);
      return next;
    });
  };

  const toggleGuideItem = (id) => {
    setCompletedItems((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next[id]) delete next[id];
      saveCompletedGuideItems(gameUuid, next);
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
  const description = getGameDescription(game, globalLocale);

  return (
    <div className="quickwin-detail">
      <article className="quickwin-card">
        <div className="quickwin-card-main">
          {cover ? (
            <img src={cover} className="quickwin-card-cover" alt="" />
          ) : (
            <div className="quickwin-card-cover quickwin-card-cover--empty" aria-hidden />
          )}
          <div className="quickwin-card-body">
            <div className="quickwin-card-title-row">
              <a
                href={href}
                className="quickwin-card-title"
                onClick={(event) => {
                  event.preventDefault();
                  openGame(game);
                }}
              >
                {title}
                {isAdmin ? (
                  <span className="quickwin-type">
                    {String(game.spiel_typ ?? '').trim() || '—'}
                  </span>
                ) : null}
              </a>
              <div className="quickwin-card-actions">
                <GuideOnlineBadge game={game} visible={isAdmin} size="md" />
                <WatchlistButton gameId={gameUuid} onRequestLogin={onRequestLogin} size="md" />
              </div>
            </div>
            <div className="quickwin-card-meta">
              <div>
                <span>Plattform</span>
                <strong>{game[GAME_FIELDS.console] || '—'}</strong>
              </div>
              <div>
                <span>Jahr</span>
                <strong>{game[GAME_FIELDS.year] || '—'}</strong>
              </div>
              <div>
                <span>Genre</span>
                <strong>{game[GAME_FIELDS.genre] || '—'}</strong>
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
              ) : (
                <>
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
                </>
              )}
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
                  <ClearGuideTipsButton onClear={clearAllGuideTips} locale={globalLocale} />
                </div>
              ) : null}
              <TrophyGroupedChecklist
                gameId={gameUuid}
                trophies={trophies}
                unlockedTrophies={unlocked}
                earnedTrophyIds={earnedIds}
                hideCompleted={hideCompleted}
                revealHidden={hiddenTrophiesRevealed(hiddenMode)}
                onToggle={toggleTrophy}
                mainGameTitle={title || 'Hauptspiel'}
                guideTipEditor={isAdmin ? saveGuideTip : null}
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
                  gameId={gameUuid}
                  reportEntityType="guide_step"
                  collectiblesData={walkthrough}
                  trophyById={trophyById}
                  groupByField="chronological_group"
                  listTitle={t('fullGameplay')}
                  hideCompleted={hideCompleted}
                  setHideCompleted={serverNotice ? undefined : setHideCompleted}
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
                  gameId={gameUuid}
                  reportEntityType="guide_item"
                  collectiblesData={collectibles}
                  trophyById={trophyById}
                  groupByField="category_group"
                  listTitle={newerVersions || serverNotice ? t('collectGuide') : t('completion')}
                  hideCompleted={hideCompleted}
                  setHideCompleted={serverNotice ? undefined : setHideCompleted}
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
                  gameId={gameUuid}
                  bossesData={bosses}
                  trophyById={trophyById}
                  listTitle={t('bosses')}
                  hideCompleted={hideCompleted}
                  setHideCompleted={serverNotice ? undefined : setHideCompleted}
                  completedItems={completedItems}
                  toggleCompleted={toggleGuideItem}
                  embedInAccordion
                />
              </CollapsibleSectionCard>
            </GuideVideoProvider>
          )}
        </>
      )}
    </div>
  );
}

export default QuickwinGameCard;
