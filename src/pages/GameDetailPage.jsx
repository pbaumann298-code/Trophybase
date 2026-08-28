import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { CollectibleKacheln, BossKacheln } from './CollectibleKacheln';
import GameSeoInfobox from '../components/GameSeoInfobox';
import GuideLanguageSelector from '../components/GuideLanguageSelector';
import GameStatusBanners from '../components/GameStatusBanners';
import CollapsibleSectionCard from '../components/CollapsibleSectionCard';
import TrophyGroupedChecklist from '../components/TrophyGroupedChecklist';
import WatchlistButton from '../components/WatchlistButton';
import PortraitGuideHint from '../components/PortraitGuideHint';
import { GuideVideoProvider, useGuideVideo } from '../context/GuideVideoContext';
import { GAME_FIELDS } from '../lib/gameSchema';
import {
  buildBossOverviewData,
  buildByTypeGuideData,
  buildChronologicalGuideData,
} from '../lib/guideData';
import { fetchGameGuideBundle, resolveGameId } from '../lib/guideQueries';
import { fetchContentCreatorsForGame } from '../lib/contentCreators';
import {
  getGameCover,
  getGameDescription,
  getGameTitle,
  getGameUuid,
} from '../lib/gameModel';
import { useLocale } from '../context/LocaleContext';
import {
  fetchOnlineTrophyIdsForGame,
  getTrophyIdKey,
} from '../lib/trophyQueries';
import {
  fetchTrophyStatusMessages,
  fetchTrophyStatusMessagesByIds,
  hasOnlineTrophiesFlag,
  isComingSoonStatus,
  isServerDead,
  isServerOffline,
  STATUS_MESSAGE_IDS,
  STATUS_MESSAGE_KEYS,
} from '../lib/trophyStatusMessages';

const TAB_BTN =
  'px-4 sm:px-5 py-3 text-xs uppercase tracking-wider font-bold transition-all border-b-2 cursor-pointer whitespace-nowrap';

function GamePageContent({
  currentView,
  setCurrentView,
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
  onRequestLogin,
  onNavigateHome,
}) {
  const [guideRows, setGuideRows] = useState([]);
  const [chapterRows, setChapterRows] = useState([]);
  const [bossRows, setBossRows] = useState([]);
  const [guidesLoading, setGuidesLoading] = useState(false);
  const { globalLocale, t } = useLocale();
  const [guideLanguageOverride, setGuideLanguageOverride] = useState(null);
  const [statusMessages, setStatusMessages] = useState({
    [STATUS_MESSAGE_KEYS.SERVER_SHUTDOWN]: '',
    [STATUS_MESSAGE_KEYS.COMING_SOON_BANNER]: '',
  });
  const [coverStatusMessages, setCoverStatusMessages] = useState({
    serverDead: '',
    onlineTrophies: '',
  });
  const [onlineTrophyIds, setOnlineTrophyIds] = useState(() => new Set());
  const [contentCreators, setContentCreators] = useState([]);
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
  }, [selectedGame?.id, selectedGame?.platform_game_id]);

  useEffect(() => {
    let cancelled = false;

    async function loadCreator() {
      if (!selectedGame) {
        setContentCreators([]);
        return;
      }
      const { data } = await fetchContentCreatorsForGame(supabase, selectedGame);
      if (!cancelled) setContentCreators(data);
    }

    loadCreator();
    return () => {
      cancelled = true;
    };
  }, [selectedGame]);

  useEffect(() => {
    let cancelled = false;

    async function loadStatusMessages() {
      const { messages } = await fetchTrophyStatusMessages(
        supabase,
        [STATUS_MESSAGE_KEYS.SERVER_SHUTDOWN, STATUS_MESSAGE_KEYS.COMING_SOON_BANNER],
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
      const { chapters, guides, bosses, chaptersError, guidesError, bossesError } =
        await fetchGameGuideBundle(supabase, gameId, globalLocale, guideLanguageOverride);

      if (cancelled) return;

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
  }, [selectedGame, globalLocale, guideLanguageOverride]);

  const chronologicalGuideData = useMemo(
    () => buildChronologicalGuideData(chapterRows),
    [chapterRows],
  );

  const byTypeGuideData = useMemo(() => buildByTypeGuideData(guideRows), [guideRows]);

  const bossOverviewData = useMemo(() => buildBossOverviewData(bossRows), [bossRows]);

  const watchlistGameId = useMemo(
    () => getGameUuid(selectedGame) || resolveGameId(selectedGame),
    [selectedGame],
  );

  const gameId = watchlistGameId;

  const isGuideLoading = guidesLoading || loadingGuide;

  const gameTitle = getGameTitle(selectedGame, globalLocale);
  const gameCover = getGameCover(selectedGame, globalLocale);
  const gameDescription = getGameDescription(selectedGame, globalLocale);

  const showServerShutdown = isServerOffline(selectedGame);
  const showComingSoon = isComingSoonStatus(selectedGame);
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
      reiter1: isGuideLoading || tabCounts.reiter1 > 0,
      reiter2: isGuideLoading || tabCounts.reiter2 > 0,
      reiter3: isGuideLoading || tabCounts.reiter3 > 0,
    }),
    [isGuideLoading, tabCounts.reiter1, tabCounts.reiter2, tabCounts.reiter3],
  );

  const visibleTabs = useMemo(
    () => ['reiter0', 'reiter1', 'reiter2', 'reiter3'].filter((tab) => tabVisibility[tab]),
    [tabVisibility],
  );

  useEffect(() => {
    if (!visibleTabs.includes(activeTab) && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0]);
    }
  }, [activeTab, visibleTabs, setActiveTab]);

  const tabBtnClass = (tab) =>
    `${TAB_BTN} ${
      activeTab === tab
        ? 'border-[#00ff66] text-white bg-zinc-800/30'
        : 'border-transparent text-zinc-500 hover:text-zinc-300'
    }`;

  const renderTabContent = () => (
    <div className="w-full flex flex-col gap-4">
      {activeTab === 'reiter0' && (
        <div className="animate-fadeIn">
          <div className="flex justify-between items-center mb-4 px-1">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">
              100% Trophäen-Checkliste
            </h3>
            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideCompleted}
                onChange={(e) => setHideCompleted(e.target.checked)}
                className="rounded border-zinc-700 bg-[#121314] text-[#00ff66] focus:ring-0 w-4 h-4 cursor-pointer"
              />
              {t('hideCompleted')}
            </label>
          </div>

          <TrophyGroupedChecklist
            gameId={gameId}
            trophies={activeTrophies}
            unlockedTrophies={unlockedTrophies}
            earnedTrophyIds={earnedTrophyIds}
            onlineTrophyIds={onlineTrophyIds}
            hideCompleted={hideCompleted}
            onToggle={toggleTrophy}
            mainGameTitle={`Hauptspiel · ${gameTitle}`}
          />
        </div>
      )}

      {activeTab === 'reiter1' && (
        <div className="w-full animate-fadeIn" key="tab-walkthrough">
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
                progressPercent={progressPercent}
                completedCount={completedCount}
                totalCount={activeTrophies.length}
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
        <div className="w-full animate-fadeIn" key="tab-collectibles">
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
                progressPercent={progressPercent}
                completedCount={completedCount}
                totalCount={activeTrophies.length}
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
        <div className="w-full animate-fadeIn" key="tab-bosses">
          {bossOverviewData.length === 0 && !isGuideLoading ? (
            <p className="text-xs text-zinc-500 italic text-center py-8 bg-[#1a1b1c] rounded-xl border border-zinc-800">
              Keine Bosse für dieses Spiel (sheet_type 3 / category_group).
            </p>
          ) : (
            <CollapsibleSectionCard
              sectionId="guide-bosses"
              title="Bosse"
              subtitle="Nach Kategorien"
              badge={`${bossOverviewData.length} Bosse`}
              defaultOpen
              accent="purple"
            >
              <BossKacheln
                gameId={gameId}
                bossesData={bossOverviewData}
                progressPercent={progressPercent}
                completedCount={completedCount}
                totalCount={activeTrophies.length}
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
    <div className="w-full max-w-[1400px] min-w-0 overflow-x-hidden mx-auto px-4 md:px-8 pt-6 pb-12 animate-fadeIn box-border">
      <PortraitGuideHint isGuideView isVideoGuideTab={activeTab !== 'reiter0'} />
      <GameStatusBanners
        showServerShutdown={showServerShutdown}
        showComingSoon={showComingSoon}
        serverMessage={statusMessages[STATUS_MESSAGE_KEYS.SERVER_SHUTDOWN]}
        comingSoonMessage={statusMessages[STATUS_MESSAGE_KEYS.COMING_SOON_BANNER]}
      />

      <button
        type="button"
        onClick={onNavigateHome}
        className="text-[#00ff66] mb-6 flex items-center gap-1 text-xs uppercase tracking-wider font-bold hover:underline bg-none border-none cursor-pointer"
      >
        {t('backDashboard')}
      </button>

      <div className="w-full min-w-0 bg-[#1a1b1c] rounded-2xl border border-zinc-800 p-6 flex flex-col md:flex-row flex-wrap md:flex-nowrap gap-8 items-start mb-8 shadow-xl">
        <div className="w-full md:w-64 aspect-[3/4] rounded-xl overflow-hidden shadow-2xl border border-zinc-800 bg-[#121314] flex-shrink-0">
          <img
            src={gameCover}
            className="w-full h-full object-cover"
            alt="Game Cover"
          />
        </div>

        <div className="flex-grow w-full min-w-0 flex flex-col justify-between h-full pt-2">
          <div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <span className="text-[10px] bg-[#00ff66]/10 text-[#00ff66] border border-[#00ff66]/20 px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider">
                  Spiele Hub
                </span>
                <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight break-words mt-2 mb-6">
                  {gameTitle}
                </h2>
              </div>
              <WatchlistButton
                gameId={watchlistGameId}
                variant="detail"
                className="sm:flex-shrink-0 sm:mt-1"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-4 sm:gap-x-8 w-full max-w-xl min-w-0 text-sm border-t border-zinc-800/60 pt-4">
              <div className="flex justify-between border-b border-zinc-800/40 pb-2 sm:col-span-2">
                <span className="text-zinc-500 font-mono text-xs uppercase">Konsole</span>
                <span className="text-sky-300 font-semibold text-right">
                  {selectedGame[GAME_FIELDS.console] || '—'}
                </span>
              </div>
              <div className="flex justify-between border-b border-zinc-800/40 pb-2">
                <span className="text-zinc-500 font-mono text-xs uppercase">Release Jahr</span>
                <span className="text-zinc-200 font-medium">
                  {selectedGame[GAME_FIELDS.year] || '—'}
                </span>
              </div>
              <div className="flex justify-between border-b border-zinc-800/40 pb-2 col-span-2 sm:col-span-1">
                <span className="text-zinc-500 font-mono text-xs uppercase">Genre</span>
                <span className="text-zinc-200 font-medium">
                  {selectedGame[GAME_FIELDS.genre] || '—'}
                </span>
              </div>
              <div className="flex justify-between border-b border-zinc-800/40 pb-2 col-span-2">
                <span className="text-zinc-500 font-mono text-xs uppercase">Entwickler</span>
                <span className="text-zinc-200 font-medium">
                  {selectedGame[GAME_FIELDS.developer] || '—'}
                </span>
              </div>

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

          <div className="mt-8 bg-[#121314] p-4 rounded-xl border border-zinc-800/80 max-w-xl">
            <div className="flex justify-between items-center mb-2 text-xs font-mono">
              <span className="text-zinc-400 uppercase tracking-wider">Gesamtfortschritt Trophäen</span>
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
        </div>
      </div>

      <GameSeoInfobox
        title={gameTitle}
        description={gameDescription}
        creators={contentCreators}
      />

      <section className="mt-8 w-full min-w-0">
        <GuideLanguageSelector
          guideLanguageOverride={guideLanguageOverride}
          onGuideLanguageOverride={setGuideLanguageOverride}
        />

        <div className="flex flex-wrap border-b border-zinc-800 mb-6 gap-2 min-w-0">
          {tabVisibility.reiter0 && (
            <button type="button" onClick={() => setActiveTab('reiter0')} className={tabBtnClass('reiter0')}>
              🏆 {t('trophies')} ({tabCounts.reiter0})
            </button>
          )}
          {tabVisibility.reiter1 && (
            <button type="button" onClick={() => setActiveTab('reiter1')} className={tabBtnClass('reiter1')}>
              📖 {t('fullGameplay')} ({tabCounts.reiter1})
            </button>
          )}
          {tabVisibility.reiter2 && (
            <button type="button" onClick={() => setActiveTab('reiter2')} className={tabBtnClass('reiter2')}>
              📦 {t('completion')} ({tabCounts.reiter2})
            </button>
          )}
          {tabVisibility.reiter3 && (
            <button type="button" onClick={() => setActiveTab('reiter3')} className={tabBtnClass('reiter3')}>
              ⚔️ {t('bosses')} ({tabCounts.reiter3})
            </button>
          )}
        </div>

        {isGuideLoading && activeTab !== 'reiter0' && (
          <p className="text-xs text-zinc-500 font-mono mb-4 animate-pulse">{t('guideLoading')}</p>
        )}

        {renderTabContent()}
      </section>
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
