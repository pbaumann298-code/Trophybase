import React, { useEffect } from 'react';
import { supabase } from './supabaseClient';
import { CollectibleKacheln as Reiter2CollectibleKacheln } from './CollectibleKacheln';

function GamePage({
  currentView,
  setCurrentView,
  selectedGame,
  activeTrophies,
  setActiveTrophies,     // Aus dem useEffect befeuert
  unlockedTrophies,
  toggleTrophy,
  completedCount,
  progressPercent,
  hideCompleted,
  setHideCompleted,
  activeTab,
  setActiveTab,
  loadingGuide,          // Falls von außen gesteuert, sonst lokal nutzbar
  setGuideItems,         // Aus dem useEffect befeuert
  guideItems,
  getProp
}) {

  // AUTOMATISCHER DATEN-FETCH: Zieht sich Trophäen & Guides, sobald ein Spiel aktiv ist
  useEffect(() => {
    async function fetchGameData() {
      if (!selectedGame) return;

      const gameId = getProp(selectedGame, ['NPWR_ID', 'npwr_id', 'Npwr_Id']);

      if (gameId) {
        // 1. Trophäen für Reiter 1 laden
        const { data: trophiesData, error: tError } = await supabase
          .from('game_trophies')
          .select('*')
          .eq('game_id', gameId);

        if (!tError && trophiesData) setActiveTrophies(trophiesData);

        // 2. Sammelobjekte/Guides für Reiter 2 laden
        const { data: guidesData, error: gError } = await supabase
          .from('game_guides')
          .select('*')
          .eq('game_id', gameId)
          .order('guide_id', { ascending: true });

        if (!gError && guidesData) setGuideItems(guidesData);
      }
    }
    fetchGameData();
  }, [selectedGame, setActiveTrophies, setGuideItems]);

  return (
    <>
      {/* ========================================================= */}
      {/* SEITE 3: SPIELE-INFO-HUB (Dein Laptop-Design!)            */}
      {/* ========================================================= */}
      {currentView === 'game_info' && selectedGame && (
        <div className="max-w-[1400px] mx-auto px-4 md:px-8 pt-6 animate-fadeIn">

          {/* ZURÜCK-BUTTON */}
          <button
            onClick={() => setCurrentView('home')}
            className="text-[#00ff66] mb-6 flex items-center gap-1 text-xs uppercase tracking-wider font-bold hover:underline bg-none border-none cursor-pointer"
          >
            ← Zurück zum Dashboard
          </button>

          {/* SPIEL-INFO-CARD */}
          <div className="w-full bg-[#1a1b1c] rounded-2xl border border-zinc-800 p-6 flex flex-col md:flex-row gap-8 items-start mb-8 shadow-xl">

            {/* Linke Spalte: Großes Cover */}
            <div className="w-full md:w-64 aspect-[3/4] rounded-xl overflow-hidden shadow-2xl border border-zinc-800 bg-[#121314] flex-shrink-0">
              <img
                src={getProp(selectedGame, ['Cover_URL', 'cover_url'])}
                className="w-full h-full object-cover"
                alt="Game Cover"
              />
            </div>

            {/* Rechte Spalte: Die edle Daten-Tabelle */}
            <div className="flex-grow w-full flex flex-col justify-between h-full pt-2">
              <div>
                <span className="text-[10px] bg-[#00ff66]/10 text-[#00ff66] border border-[#00ff66]/20 px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider">
                  Spiele Hub
                </span>
                <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mb-6 mt-2">
                  {getProp(selectedGame, ['Spieltitel', 'spieltitel'])}
                </h2>

                {/* Datenmatrix im Git-Style */}
                <div className="grid grid-cols-2 gap-y-4 gap-x-8 max-w-xl text-sm border-t border-zinc-800/60 pt-4">
                  <div className="flex justify-between border-b border-zinc-800/40 pb-2">
                    <span className="text-zinc-500 font-mono text-xs uppercase">Release Jahr</span>
                    <span className="text-zinc-200 font-medium">{getProp(selectedGame, ['Release_Jahr', 'release_jahr', 'Releasejahr']) || '—'}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800/40 pb-2">
                    <span className="text-zinc-500 font-mono text-xs uppercase">Konsole</span>
                    <span className="text-zinc-200 font-medium">{getProp(selectedGame, ['Konsole', 'konsole']) || '—'}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800/40 pb-2 col-span-2">
                    <span className="text-zinc-500 font-mono text-xs uppercase">Genre</span>
                    <span className="text-zinc-200 font-medium">{getProp(selectedGame, ['Genre', 'genre']) || '—'}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800/40 pb-2 col-span-2">
                    <span className="text-zinc-500 font-mono text-xs uppercase">Entwickler</span>
                    <span className="text-zinc-200 font-medium">{getProp(selectedGame, ['Entwickler', 'entwickler']) || '—'}</span>
                  </div>
                </div>
              </div>

              {/* FORTSCHRITTSBAR */}
              <div className="mt-8 bg-[#121314] p-4 rounded-xl border border-zinc-800/80 max-w-xl">
                <div className="flex justify-between items-center mb-2 text-xs font-mono">
                  <span className="text-zinc-400 uppercase tracking-wider">Gesamtfortschritt</span>
                  <span className="text-[#00ff66] font-bold text-sm">{progressPercent}% ({completedCount}/{activeTrophies.length})</span>
                </div>
                <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-[#00ff66] h-full rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(0,255,102,0.5)]"
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* AKTION-BUTTON ZU SEITE 4 */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center shadow-xl">
            <h3 className="text-xl font-black text-white mb-2">Bereit für die 100% Platin-Trophäe?</h3>
            <p className="text-zinc-400 text-xs mb-6 max-w-md mx-auto">Nutze den interaktiven Leitfaden inklusive Fundorte aller versteckten Gegenstände.</p>
            <button
              onClick={() => { setCurrentView('guide'); setActiveTab('reiter1'); }}
              className="bg-[#00ff66] hover:bg-[#00ee55] text-zinc-950 font-black text-sm uppercase tracking-wider px-8 py-4 rounded-xl shadow-lg transition-all cursor-pointer border-none"
            >
              ➔ Öffne interaktiven Guide
            </button>
          </div>
        </div>
      )}


      {/* ========================================================= */}
      {/* SEITE 4: INTERAKTIVER LEITFADEN (Deine Reiter-Struktur!)  */}
      {/* ========================================================= */}
      {currentView === 'guide' && selectedGame && (
        <div className="max-w-[1400px] mx-auto px-4 md:px-8 pt-6 animate-fadeIn">

          {/* ZURÜCK ZU SEITE 3 */}
          <button
            onClick={() => setCurrentView('game_info')}
            className="text-zinc-400 mb-6 flex items-center gap-1 text-xs uppercase tracking-wider font-bold hover:text-white bg-none border-none cursor-pointer"
          >
            ← Zurück zur Info-Übersicht
          </button>

          {/* REITER TABS NAVIGATION */}
          <div className="flex border-b border-zinc-800 mb-6 gap-2">
            <button
              onClick={() => setActiveTab('reiter1')}
              className={`px-6 py-3 text-xs uppercase tracking-wider font-bold transition-all border-b-2 cursor-pointer ${activeTab === 'reiter1'
                ? 'border-[#00ff66] text-white bg-zinc-800/30'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
            >
              🏆 Trophäen ({activeTrophies.length})
            </button>
            <button
              onClick={() => setActiveTab('reiter2')}
              className={`px-6 py-3 text-xs uppercase tracking-wider font-bold transition-all border-b-2 cursor-pointer ${activeTab === 'reiter2'
                ? 'border-[#00ff66] text-white bg-zinc-800/30'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
            >
              📍 Sammelobjekte & Guides ({guideItems.length})
            </button>
          </div>

          {/* DYNAMISCHER INHALT NACH REITER */}
          <div className="w-full">

            {/* REITER 1: TROPHÄEN CHECKLISTE */}
            {activeTab === 'reiter1' && (
              <div className="bg-[#1a1b1c] rounded-2xl border border-zinc-800 p-6 shadow-xl">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Trophäen-Checkliste</h3>
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
                  <p className="text-xs text-zinc-500 italic text-center py-6">Keine Trophäen für dieses Spiel in der Datenbank.</p>
                ) : (
                  <div className="flex flex-col gap-3 max-h-[650px] overflow-y-auto pr-2 scrollbar-thin">
                    {activeTrophies
                      .filter(t => !hideCompleted || !unlockedTrophies[t.trophy_id || t.id])
                      .map((t, idx) => {
                        const trophyKey = t.trophy_id || t.id;
                        const isUnlocked = !!unlockedTrophies[trophyKey];

                        return (
                          <div
                            key={idx}
                            className={`flex flex-col gap-3 p-4 rounded-xl border transition-all ${isUnlocked
                              ? 'bg-[#121314]/40 border-zinc-800/40 opacity-60'
                              : 'bg-[#121314] border-zinc-800 hover:border-zinc-700'
                              }`}
                          >
                            <div className="flex items-start gap-4">
                              {/* Checkbox */}
                              <input
                                type="checkbox"
                                checked={isUnlocked}
                                onChange={() => toggleTrophy(trophyKey)}
                                className="rounded border-zinc-700 bg-[#1a1b1c] text-[#00ff66] focus:ring-0 w-4 h-4 cursor-pointer mt-1 flex-shrink-0"
                              />

                              {/* Trophäen Icon */}
                              {t.icon_url && (
                                <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800 flex-shrink-0">
                                  <img src={t.icon_url} alt="" className="w-full h-full object-cover" />
                                </div>
                              )}

                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className={`text-sm font-bold ${isUnlocked ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                                    {t.trophy_name}
                                  </p>
                                  {t.ist_versteckt && (
                                    <span className="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono uppercase">
                                      Versteckt
                                    </span>
                                  )}
                                  {t.category_group && t.category_group !== 'Hauptspiel' && (
                                    <span className="text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded font-mono uppercase">
                                      {t.category_group}
                                    </span>
                                  )}
                                </div>

                                {/* Beschreibung */}
                                {t.trophy_description && (
                                  <p className={`text-xs mt-1 leading-relaxed ${isUnlocked ? 'text-zinc-600' : 'text-zinc-400'}`}>
                                    {t.trophy_description}
                                  </p>
                                )}

                                <span className="inline-block text-[10px] text-zinc-500 font-mono uppercase mt-2 bg-zinc-800/50 px-2 py-0.5 rounded border border-zinc-800">
                                  {t.trophy_type || 'Bronze'}
                                </span>
                              </div>
                            </div>

                            {/* GUIDE TIPP & VIDEO */}
                            {!isUnlocked && (t.guide_tip || t.video_url) && (
                              <div className="mt-1 pl-4 border-l-2 border-[#00ff66]/30 flex flex-col gap-2 bg-zinc-950/40 p-2 rounded-r-xl">
                                {t.guide_tip && (
                                  <p className="text-xs text-zinc-400 font-sans italic">
                                    <span className="text-[#00ff66] font-mono font-bold not-italic mr-1">Tipp:</span>{t.guide_tip}
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

            {/* REITER 2: SAMMELOBJEKTE KACHELN */}
            {activeTab === 'reiter2' && (
              <div className="w-full animate-fadeIn">
                {/* Wir übergeben die Daten UND die Fortschritts-Werte an die Kacheln */}
                <Reiter2CollectibleKacheln
                  collectiblesData={guideItems}
                  progressPercent={progressPercent}
                  completedCount={completedCount}
                  totalCount={activeTrophies.length}
                />
              </div>
            )}

          </div>
        </div>
      )}
    </>
  );
}

export default GamePage;