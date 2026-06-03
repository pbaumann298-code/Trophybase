import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { CollectibleKacheln, BossKacheln } from './CollectibleKacheln';
import GameSeoInfobox from '../components/GameSeoInfobox';
import { TABLES, GAME_PK, GAME_FK } from '../lib/gameSchema';
import {
  buildBossGuideData,
  buildChapterGuideData,
  buildCollectibleCategoryData,
} from '../lib/guideData';

function GamePage({
  currentView,
  setCurrentView,
  selectedGame,
  activeTrophies,
  completedCount,
  progressPercent,
  activeTab,
  setActiveTab,
  loadingGuide,
  guideItems,
  getProp,
}) {
  const [guideRows, setGuideRows] = useState([]);
  const [guidesLoading, setGuidesLoading] = useState(false);

  useEffect(() => {
    setGuideRows(guideItems?.length ? guideItems : []);
  }, [guideItems]);

  useEffect(() => {
    let cancelled = false;

    async function fetchGuideRows() {
      if (!selectedGame) {
        setGuideRows([]);
        return;
      }

      const gameId = selectedGame[GAME_PK] ?? getProp(selectedGame, [GAME_PK]);
      if (!gameId) return;

      setGuidesLoading(true);
      const { data, error } = await supabase
        .from(TABLES.guides)
        .select('*')
        .eq(GAME_FK, gameId)
        .order('guide_id', { ascending: true });

      if (cancelled) return;

      if (!error && data) setGuideRows(data);
      else if (error) console.error('Guide-Daten:', error.message);

      setGuidesLoading(false);
    }

    fetchGuideRows();
    return () => {
      cancelled = true;
    };
  }, [selectedGame, getProp]);

  const chapterGuideData = useMemo(
    () => buildChapterGuideData(guideRows),
    [guideRows],
  );

  const collectibleCategoryData = useMemo(
    () => buildCollectibleCategoryData(guideRows),
    [guideRows],
  );

  const bossGuideData = useMemo(() => buildBossGuideData(guideRows), [guideRows]);

  const isGuideLoading = guidesLoading || loadingGuide;

  const tabCounts = {
    reiter1: chapterGuideData.length,
    reiter2: collectibleCategoryData.length,
    reiter3: bossGuideData.length,
  };

  return (
    <>
      {currentView === 'game_info' && selectedGame && (
        <div className="w-full max-w-[1400px] min-w-0 overflow-x-hidden mx-auto px-4 md:px-8 pt-6 animate-fadeIn box-border">
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

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center shadow-xl">
            <h3 className="text-xl font-black text-white mb-2">Bereit für die 100% Platin-Trophäe?</h3>
            <p className="text-zinc-400 text-xs mb-6 max-w-md mx-auto">
              Nutze den interaktiven Leitfaden: Kapitel-Run, Sammelgegenstände und Bossgegner.
            </p>
            <button
              type="button"
              onClick={() => {
                setCurrentView('guide');
                setActiveTab('reiter1');
              }}
              className="bg-[#00ff66] hover:bg-[#00ee55] text-zinc-950 font-black text-sm uppercase tracking-wider px-8 py-4 rounded-xl shadow-lg transition-all cursor-pointer border-none"
            >
              ➔ Öffne interaktiven Guide
            </button>
          </div>
        </div>
      )}

      {currentView === 'guide' && selectedGame && (
        <div className="w-full max-w-[1400px] min-w-0 overflow-x-hidden mx-auto px-4 md:px-8 pt-6 animate-fadeIn box-border">
          <button
            type="button"
            onClick={() => setCurrentView('game_info')}
            className="text-zinc-400 mb-6 flex items-center gap-1 text-xs uppercase tracking-wider font-bold hover:text-white bg-none border-none cursor-pointer"
          >
            ← Zurück zur Info-Übersicht
          </button>

          <div className="flex flex-wrap border-b border-zinc-800 mb-6 gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setActiveTab('reiter1')}
              className={`px-4 sm:px-6 py-3 text-xs uppercase tracking-wider font-bold transition-all border-b-2 cursor-pointer whitespace-nowrap ${
                activeTab === 'reiter1'
                  ? 'border-[#00ff66] text-white bg-zinc-800/30'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              📖 Kapitel-Guide ({tabCounts.reiter1})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('reiter2')}
              className={`px-4 sm:px-6 py-3 text-xs uppercase tracking-wider font-bold transition-all border-b-2 cursor-pointer whitespace-nowrap ${
                activeTab === 'reiter2'
                  ? 'border-[#00ff66] text-white bg-zinc-800/30'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              📦 Sammelgegenstände ({tabCounts.reiter2})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('reiter3')}
              className={`px-4 sm:px-6 py-3 text-xs uppercase tracking-wider font-bold transition-all border-b-2 cursor-pointer whitespace-nowrap ${
                activeTab === 'reiter3'
                  ? 'border-[#00ff66] text-white bg-zinc-800/30'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              ⚔️ Bossgegner ({tabCounts.reiter3})
            </button>
          </div>

          {isGuideLoading && (
            <p className="text-xs text-zinc-500 font-mono mb-4 animate-pulse">Guide-Daten werden geladen …</p>
          )}

          <div className="w-full">
            {activeTab === 'reiter1' && (
              <div className="w-full animate-fadeIn" key="tab-chapter">
                {chapterGuideData.length === 0 && !isGuideLoading ? (
                  <p className="text-xs text-zinc-500 italic text-center py-8 bg-[#1a1b1c] rounded-xl border border-zinc-800">
                    Keine Kapitel-Einträge (sheet_name=1) für dieses Spiel.
                  </p>
                ) : (
                  <CollectibleKacheln
                    collectiblesData={chapterGuideData}
                    progressPercent={progressPercent}
                    completedCount={completedCount}
                    totalCount={activeTrophies.length}
                  />
                )}
              </div>
            )}

            {activeTab === 'reiter2' && (
              <div className="w-full animate-fadeIn" key="tab-collectibles">
                {collectibleCategoryData.length === 0 && !isGuideLoading ? (
                  <p className="text-xs text-zinc-500 italic text-center py-8 bg-[#1a1b1c] rounded-xl border border-zinc-800">
                    Keine Sammelgegenstände (sheet_name=2) für dieses Spiel.
                  </p>
                ) : (
                  <CollectibleKacheln
                    collectiblesData={collectibleCategoryData}
                    progressPercent={progressPercent}
                    completedCount={completedCount}
                    totalCount={activeTrophies.length}
                  />
                )}
              </div>
            )}

            {activeTab === 'reiter3' && (
              <div className="w-full animate-fadeIn" key="tab-bosses">
                {bossGuideData.length === 0 && !isGuideLoading ? (
                  <p className="text-xs text-zinc-500 italic text-center py-8 bg-[#1a1b1c] rounded-xl border border-zinc-800">
                    Keine Boss-Einträge (sheet_name=3) für dieses Spiel.
                  </p>
                ) : (
                  <BossKacheln
                    bossesData={bossGuideData}
                    progressPercent={progressPercent}
                    completedCount={completedCount}
                    totalCount={activeTrophies.length}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default GamePage;
