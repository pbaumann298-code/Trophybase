import React, { useState, useEffect } from 'react';
import { supabase } from './pages/supabaseClient';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import SearchResultsPage from './pages/SearchResultsPage';
import GameDetailPage from "./pages/GameDetailPage";
import { CollectibleKacheln } from './pages/CollectibleKacheln';

function App() {
  const [currentView, setCurrentView] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState('Testen...');

  // Zustände für den Trophäen- & Sammel-Leitfaden (Seite 3 & 4)
  const [selectedGame, setSelectedGame] = useState(null);
  const [activeTrophies, setActiveTrophies] = useState([]);
  const [guideItems, setGuideItems] = useState([]); 
  const [loadingGuide, setLoadingGuide] = useState(false);
  const [unlockedTrophies, setUnlockedTrophies] = useState({});
  const [hideCompleted, setHideCompleted] = useState(false);
  const [activeTab, setActiveTab] = useState('reiter1');

  const getProp = (obj, keys) => {
    if (!obj) return '';
    for (let key of keys) {
      if (obj[key] !== undefined && obj[key] !== null) return obj[key];
    }
    return '';
  };

  useEffect(() => {
    async function initDb() {
      const { error } = await supabase.from('Playstation_Games').select('*').limit(1);
      setDbStatus(error ? 'Fehlgeschlagen' : 'Erfolgreich verbunden!');
    }
    initDb();
  }, []);

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoading(true);
    setCurrentView('search-results');
    const { data } = await supabase.from('Playstation_Games').select('*').ilike('Spieltitel', `%${searchQuery}%`);
    setSearchResults(data || []);
    setLoading(false);
  };

  // Lädt Trophäen & Guides aus den Supabase-Tabellen via NPWR_ID
  const openGuide = async (game) => {
    setSelectedGame(game);
    setCurrentView('game_info');
    setLoadingGuide(true);
    setActiveTrophies([]);
    setGuideItems([]); 

    const gameId = getProp(game, ['NPWR_ID', 'npwr_id', 'Npwr_Id']);

    if (gameId) {
      // 1. Trophäen laden (Reiter 1)
      const { data: trophiesData, error: trophyError } = await supabase
        .from('game_trophies')
        .select('*')
        .eq('game_id', gameId);
      
      if (!trophyError && trophiesData) setActiveTrophies(trophiesData);

      // 2. Collectibles laden (Reiter 2)
      const { data: guidesData, error: guidesError } = await supabase
        .from('game_guides')
        .select('*')
        .eq('game_id', gameId)
        .order('guide_id', { ascending: true });
      
      if (!guidesError && guidesData) setGuideItems(guidesData);
    }
    setLoadingGuide(false);
  };

  const toggleTrophy = (id) => {
    setUnlockedTrophies(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const completedCount = activeTrophies.filter(t => unlockedTrophies[t.id || t.trophy_id || t.trophy_name]).length;
  const progressPercent = activeTrophies.length > 0 ? Math.round((completedCount / activeTrophies.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#121314] text-gray-200 font-sans antialiased">
      <Header 
        setCurrentView={setCurrentView} 
        searchQuery={searchQuery} 
        setSearchQuery={setSearchQuery} 
        handleSearchSubmit={handleSearchSubmit} 
        dbStatus={dbStatus} 
      />

      <main className="pb-24">
        {currentView === 'home' && (
          <HomePage openGame={openGuide} getProp={getProp} />
        )}

        {currentView === 'search-results' && (
          <SearchResultsPage searchResults={searchResults} openGame={openGuide} getProp={getProp} loading={loading} />
        )}

        {(currentView === 'game_info' || currentView === 'guide') && selectedGame && (
          <GameDetailPage 
            currentView={currentView}
            setCurrentView={setCurrentView}
            selectedGame={selectedGame}
            activeTrophies={activeTrophies}
            unlockedTrophies={unlockedTrophies}
            toggleTrophy={toggleTrophy}
            completedCount={completedCount}
            progressPercent={progressPercent}
            hideCompleted={hideCompleted}
            setHideCompleted={setHideCompleted}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            loadingGuide={loadingGuide}
            guideItems={guideItems}
            getProp={getProp}
          />
        )}
      </main>
    </div>
  );
}

export default App;