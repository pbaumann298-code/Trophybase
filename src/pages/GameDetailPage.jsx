import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { CollectibleKacheln, BossKacheln } from './CollectibleKacheln';
import GameSeoInfobox from '../components/GameSeoInfobox';
import GameStatusBanners from '../components/GameStatusBanners';
import {
  buildBossOverviewData,
  buildByTypeGuideData,
  buildChronologicalGuideData,
} from '../lib/guideData';
import { fetchGameGuideBundle, resolveGameId } from '../lib/guideQueries';
import {
  fetchOnlineTrophyIdsForGame,
  getTrophyDescription,
  getTrophyIdKey,
} from '../lib/trophyQueries';
import { getLocale, LOCALE_STORAGE_KEY } from '../lib/locale';
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

function GamePage({
  currentView,
  setCurrentView,
  selectedGame,
  activeTrophies,
  unlockedTrophies,
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
  getProp,
}) {
  const [guideRows, setGuideRows] = useState([]);
  const [chapterRows, setChapterRows] = useState([]);
  const [bossRows, setBossRows] = useState([]);
  const [guidesLoading, setGuidesLoading] = useState(false);
  const [locale, setLocale] = useState(getLocale);
  const [statusMessages, setStatusMessages] = useState({
    [STATUS_MESSAGE_KEYS.SERVER_SHUTDOWN]: '',
    [STATUS_MESSAGE_KEYS.COMING_SOON_BANNER]: '',
  });
  const [coverStatusMessages, setCoverStatusMessages] = useState({
    serverDead: '',
    onlineTrophies: '',
  });
  const [onlineTrophyIds, setOnlineTrophyIds] = useState(() => new Set());

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
    const onStorage = (event) => {
      if (event.key === LOCALE_STORAGE_KEY) setLocale(getLocale());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadStatusMessages() {
      const { messages } = await fetchTrophyStatusMessages(
        supabase,
        [STATUS_MESSAGE_KEYS.SERVER_SHUTDOWN, STATUS_MESSAGE_KEYS.COMING_SOON_BANNER],
        locale,
      );
      if (!cancelled) setStatusMessages(messages);
    }

    loadStatusMessages();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  useEffect(() => {
    let cancelled = false;

    async function loadCoverAndOnlineData() {
      if (!selectedGame) {
        setCoverStatusMessages({ serverDead: '', onlineTrophies: '' });
        setOnlineTrophyIds(new Set());
        return;
      }

      const gameId = resolveGameId(selectedGame, getProp);
      const showServerDead = isServerDead(selectedGame, getProp);
      const showOnlineNote = hasOnlineTrophiesFlag(selectedGame, getProp);

      const idsToLoad = [];
      if (showServerDead) idsToLoad.push(STATUS_MESSAGE_IDS.SERVER_DEAD);
      if (showOnlineNote) idsToLoad.push(STATUS_MESSAGE_IDS.HAS_ONLINE_TROPHIES);

      const [messagesById, onlineRes] = await Promise.all([
        idsToLoad.length > 0
          ? fetchTrophyStatusMessagesByIds(supabase, idsToLoad, locale)
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
  }, [selectedGame, getProp, locale]);

  useEffect(() => {
    let cancelled = false;

    async function loadGuideBundle() {
      if (!selectedGame) {
        setGuideRows([]);
        setChapterRows([]);
        setBossRows([]);
        return;
      }

      const gameId = resolveGameId(selectedGame, getProp);
      if (!gameId) return;

      setGuidesLoading(true);
      const { chapters, guides, bosses, chaptersError, guidesError, bossesError } =
        await fetchGameGuideBundle(supabase, gameId);

      if (cancelled) return;

      if (chaptersError) {
        console.error('game_chapters:', chaptersError.message, { gameId });
      } else {
        setChapterRows(chapters);
      }

      if (guidesError) {
        console.error('game_guides:', guidesError.message, { gameId });
      } else {
        setGuideRows(guides);
      }

      if (bossesError) {
        console.error('game_bosses:', bossesError.message, { gameId });
      } else {
        setBossRows(bosses);
      }

      setGuidesLoading(false);
    }

    loadGuideBundle();
    return () => {
      cancelled = true;
    };
  }, [selectedGame, getProp]);

  const chronologicalGuideData = useMemo(
    () => buildChronologicalGuideData(chapterRows),
    [chapterRows],
  );

  const byTypeGuideData = useMemo(() => buildByTypeGuideData(guideRows), [guideRows]);

  const bossOverviewData = useMemo(() => buildBossOverviewData(bossRows), [bossRows]);

  const isGuideLoading = guidesLoading || loadingGuide;

  const showServerShutdown = isServerOffline(selectedGame, getProp);
  const showComingSoon = isComingSoonStatus(selectedGame, getProp);
  const showCoverServerDead = isServerDead(selectedGame, getProp);
  const showCoverOnlineNote = hasOnlineTrophiesFlag(selectedGame, getProp);

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
    <div className="w-full">
      {activeTab === 'reiter0' && (
        <div className="bg-[#1a1b1c] rounded-2xl border border-zinc-800 p-6 shadow-xl animate-fadeIn">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">
              Trophäen-Checkliste
            </h3>
            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideCompleted}
                onChange={(e) => setHideCompleted(e.target.checked)}
                className="rounded border-zinc-700 bg-[#121314] text-[#00ff66] focus:ring-0 w-4 h-4 cursor-pointer"
              />
              Erledigte ausblenden
            </label>
          </div>

          {activeTrophies.length === 0 ? (
            <p className="text-xs text-zinc-500 italic text-center py-6">
              Keine Trophäen für dieses Spiel in der Datenbank.
            </p>
          ) : (
            <div className="flex flex-col gap-3 max-h-[650px] overflow-y-auto pr-2">
              {activeTrophies
                .filter((t) => !hideCompleted || !unlockedTrophies[getTrophyIdKey(t)])
                .map((t, idx) => {
                  const trophyKey = getTrophyIdKey(t) || idx;
                  const isUnlocked = !!unlockedTrophies[trophyKey];
                  const trophyDesc = getTrophyDescription(t);
                  const isOnlineTrophy = onlineTrophyIds.has(getTrophyIdKey(t));

                  return (
                    <div
                      key={trophyKey || idx}
                      className={`flex flex-col gap-3 p-4 rounded-xl border transition-all ${
                        isUnlocked
                          ? 'bg-[#121314]/40 border-zinc-800/40 opacity-60'
                          : 'bg-[#121314] border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <input
                          type="checkbox"
                          checked={isUnlocked}
                          onChange={() => toggleTrophy(trophyKey)}
                          className="rounded border-zinc-700 bg-[#1a1b1c] text-[#00ff66] focus:ring-0 w-4 h-4 cursor-pointer mt-1 flex-shrink-0"
                        />
                        {t.icon_url && (
                          <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800 flex-shrink-0">
                            <img src={t.icon_url} alt="" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p
                              className={`text-sm font-bold ${
                                isUnlocked ? 'text-zinc-500 line-through' : 'text-zinc-200'
                              }`}
                            >
                              {t.trophy_name}
                            </p>
                            {t.ist_versteckt && (
                              <span className="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono uppercase">
                                Versteckt
                              </span>
                            )}
                            {isOnlineTrophy && (
                              <span className="text-[9px] bg-sky-500/10 text-sky-400 border border-sky-500/25 px-1.5 py-0.5 rounded font-mono uppercase">
                                Online Trophäe
                              </span>
                            )}
                          </div>
                          {trophyDesc && (
                            <p
                              className={`text-xs mt-1 leading-relaxed ${
                                isUnlocked ? 'text-zinc-600' : 'text-zinc-400'
                              }`}
                            >
                              {trophyDesc}
                            </p>
                          )}
                          <span className="inline-block text-[10px] text-zinc-500 font-mono uppercase mt-2 bg-zinc-800/50 px-2 py-0.5 rounded border border-zinc-800">
                            {t.trophy_type || 'Bronze'}
                          </span>
                        </div>
                      </div>
                      {!isUnlocked && (t.guide_tip || t.video_url) && (
                        <div className="mt-1 pl-4 border-l-2 border-[#00ff66]/30 flex flex-col gap-2 bg-zinc-950/40 p-2 rounded-r-xl">
                          {t.guide_tip && (
                            <p className="text-xs text-zinc-400 font-sans italic">
                              <span className="text-[#00ff66] font-mono font-bold not-italic mr-1">
                                Tipp:
                              </span>
                              {t.guide_tip}
                            </p>
                          )}
                          {t.video_url && (
                            <a
                              href={t.video_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-[#00ff66] hover:underline flex items-center gap-1 font-mono font-bold"
                            >
                              🎬 Video-Guide auf YouTube ansehen
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'reiter1' && (
        <div className="w-full animate-fadeIn" key="tab-chronological">
          {chronologicalGuideData.length === 0 && !isGuideLoading ? (
            <p className="text-xs text-zinc-500 italic text-center py-8 bg-[#1a1b1c] rounded-xl border border-zinc-800">
              Kein chronologischer Guide (game_chapters / chronological_group).
            </p>
          ) : (
            <CollectibleKacheln
              collectiblesData={chronologicalGuideData}
              progressPercent={progressPercent}
              completedCount={completedCount}
              totalCount={activeTrophies.length}
              groupByField="chronological_group"
              groupHeaderIcon="📍"
              listTitle="Full-Gameplay Guide"
              hideCompleted={hideCompleted}
              setHideCompleted={setHideCompleted}
              completedItems={completedGuideItems}
              toggleCompleted={toggleGuideItemCompleted}
              emptyVideoMessage="Kein Video für dieses Gebiet oder alle Einträge ausgeblendet."
            />
          )}
        </div>
      )}

      {activeTab === 'reiter2' && (
        <div className="w-full animate-fadeIn" key="tab-by-type">
          {byTypeGuideData.length === 0 && !isGuideLoading ? (
            <p className="text-xs text-zinc-500 italic text-center py-8 bg-[#1a1b1c] rounded-xl border border-zinc-800">
              Keine Komplettierungs-Einträge (game_guides / category_group).
            </p>
          ) : (
            <CollectibleKacheln
              collectiblesData={byTypeGuideData}
              progressPercent={progressPercent}
              completedCount={completedCount}
              totalCount={activeTrophies.length}
              groupByField="category_group"
              groupHeaderIcon="📦"
              listTitle="Komplettierungs-Guide"
              hideCompleted={hideCompleted}
              setHideCompleted={setHideCompleted}
              completedItems={completedGuideItems}
              toggleCompleted={toggleGuideItemCompleted}
              emptyVideoMessage="Kein Video für diese Kategorie oder alle Gegenstände ausgeblendet."
            />
          )}
        </div>
      )}

      {activeTab === 'reiter3' && (
        <div className="w-full animate-fadeIn" key="tab-bosses">
          {bossOverviewData.length === 0 && !isGuideLoading ? (
            <p className="text-xs text-zinc-500 italic text-center py-8 bg-[#1a1b1c] rounded-xl border border-zinc-800">
              Keine Boss-Einträge in game_bosses für dieses Spiel.
            </p>
          ) : (
            <BossKacheln
              bossesData={bossOverviewData}
              progressPercent={progressPercent}
              completedCount={completedCount}
              totalCount={activeTrophies.length}
              listTitle="Boss-Checkliste"
              hideCompleted={hideCompleted}
              setHideCompleted={setHideCompleted}
              completedItems={completedGuideItems}
              toggleCompleted={toggleGuideItemCompleted}
            />
          )}
        </div>
      )}
    </div>
  );

  if (currentView !== 'game_info' || !selectedGame) return null;

  return (
    <div className="w-full max-w-[1400px] min-w-0 overflow-x-hidden mx-auto px-4 md:px-8 pt-6 pb-12 animate-fadeIn box-border">
      <GameStatusBanners
        showServerShutdown={showServerShutdown}
        showComingSoon={showComingSoon}
        serverMessage={statusMessages[STATUS_MESSAGE_KEYS.SERVER_SHUTDOWN]}
        comingSoonMessage={statusMessages[STATUS_MESSAGE_KEYS.COMING_SOON_BANNER]}
      />

      <button
        type="button"
        onClick={() => setCurrentView('home')}
        className="text-[#00ff66] mb-6 flex items-center gap-1 text-xs uppercase tracking-wider font-bold hover:underline bg-none border-none cursor-pointer"
      >
        ← Zurück zum Dashboard
      </button>

      <div className="w-full min-w-0 bg-[#1a1b1c] rounded-2xl border border-zinc-800 p-6 flex flex-col md:flex-row flex-wrap md:flex-nowrap gap-8 items-start mb-8 shadow-xl">
        <div className="w-full md:w-64 aspect-[3/4] rounded-xl overflow-hidden shadow-2xl border border-zinc-800 bg-[#121314] flex-shrink-0">
          <img
            src={getProp(selectedGame, ['Cover_URL', 'cover_url'])}
            className="w-full h-full object-cover"
            alt="Game Cover"
          />
        </div>

        <div className="flex-grow w-full min-w-0 flex flex-col justify-between h-full pt-2">
          <div>
            <span className="text-[10px] bg-[#00ff66]/10 text-[#00ff66] border border-[#00ff66]/20 px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider">
              Spiele Hub
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mb-6 mt-2 break-words">
              {getProp(selectedGame, ['Spieltitel', 'spieltitel'])}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-4 sm:gap-x-8 w-full max-w-xl min-w-0 text-sm border-t border-zinc-800/60 pt-4">
              <div className="flex justify-between border-b border-zinc-800/40 pb-2">
                <span className="text-zinc-500 font-mono text-xs uppercase">Release Jahr</span>
                <span className="text-zinc-200 font-medium">
                  {getProp(selectedGame, ['Release_Jahr', 'release_jahr', 'Releasejahr']) || '—'}
                </span>
              </div>
              <div className="flex justify-between border-b border-zinc-800/40 pb-2">
                <span className="text-zinc-500 font-mono text-xs uppercase">Konsole</span>
                <span className="text-zinc-200 font-medium">
                  {getProp(selectedGame, ['Konsole', 'konsole']) || '—'}
                </span>
              </div>
              <div className="flex justify-between border-b border-zinc-800/40 pb-2 col-span-2">
                <span className="text-zinc-500 font-mono text-xs uppercase">Genre</span>
                <span className="text-zinc-200 font-medium">
                  {getProp(selectedGame, ['Genre', 'genre']) || '—'}
                </span>
              </div>
              <div className="flex justify-between border-b border-zinc-800/40 pb-2 col-span-2">
                <span className="text-zinc-500 font-mono text-xs uppercase">Entwickler</span>
                <span className="text-zinc-200 font-medium">
                  {getProp(selectedGame, ['Entwickler', 'entwickler']) || '—'}
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
        title={getProp(selectedGame, ['Spieltitel', 'spieltitel'])}
        description={getProp(selectedGame, ['beschreibung_de', 'Beschreibung_de'])}
      />

      <section className="mt-8 w-full min-w-0">
        <div className="flex flex-wrap border-b border-zinc-800 mb-6 gap-2 min-w-0">
          {tabVisibility.reiter0 && (
            <button type="button" onClick={() => setActiveTab('reiter0')} className={tabBtnClass('reiter0')}>
              🏆 Trophäen ({tabCounts.reiter0})
            </button>
          )}
          {tabVisibility.reiter1 && (
            <button type="button" onClick={() => setActiveTab('reiter1')} className={tabBtnClass('reiter1')}>
              📖 Full-Gameplay ({tabCounts.reiter1})
            </button>
          )}
          {tabVisibility.reiter2 && (
            <button type="button" onClick={() => setActiveTab('reiter2')} className={tabBtnClass('reiter2')}>
              📦 Komplettierung ({tabCounts.reiter2})
            </button>
          )}
          {tabVisibility.reiter3 && (
            <button type="button" onClick={() => setActiveTab('reiter3')} className={tabBtnClass('reiter3')}>
              ⚔️ Bosse ({tabCounts.reiter3})
            </button>
          )}
        </div>

        {isGuideLoading && activeTab !== 'reiter0' && (
          <p className="text-xs text-zinc-500 font-mono mb-4 animate-pulse">Guide-Daten werden geladen …</p>
        )}

        {renderTabContent()}
      </section>
    </div>
  );
}

export default GamePage;
