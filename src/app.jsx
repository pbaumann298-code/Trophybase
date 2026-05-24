import React, { useState, useEffect } from 'react';
import { supabase } from './pages/supabaseClient';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import SearchResultsPage from './pages/SearchResultsPage';
import GameDetailPage from "./pages/GameDetailPage";
import { CollectibleKacheln } from './pages/CollectibleKacheln';
import LoginPage from './pages/LoginPage';
import TesterSetupPage from './pages/TesterSetupPage';
import MaintenancePage from './pages/MaintenancePage';

function App() {
  // 1. Wir schauen beim Start direkt in die URL des Browsers!
  const [currentView, setCurrentView] = useState(() => {
    if (window.location.pathname.startsWith('/guide/')) {
      return 'game_info'; 
    }
    return 'home';
  });

  // Wartungs-Konfiguration
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(true);
  const ALLOWED_ADMINS = ['creator@trophybase.app', 'master@trophybase.app', 'tester@trophybase.app'];

  // 🔐 Einzigartiger State für den User
  const [sessionUser, setSessionUser] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState('Testen...');

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

  // 🔐 Überprüft den Login-Status beim Starten der App
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Testet die DB-Verbindung beim Laden
  useEffect(() => {
    async function initDb() {
      const { error } = await supabase.from('Playstation_Games').select('*').limit(1);
      setDbStatus(error ? 'Fehlgeschlagen' : 'Erfolgreich verbunden!');
    }
    initDb();
  }, []);

  // Holt die Spieldaten live aus der URL bei F5
  useEffect(() => {
    async function handleUrlRouting() {
      const path = window.location.pathname; 
      if (path.startsWith('/guide/')) {
        const gameIdFromUrl = path.split('/')[2]; 

        if (gameIdFromUrl) {
          setLoadingGuide(true);
          const { data: gameData } = await supabase
            .from('Playstation_Games')
            .select('*')
            .or(`NPWR_ID.eq.${gameIdFromUrl},npwr_id.eq.${gameIdFromUrl},Npwr_Id.eq.${gameIdFromUrl}`)
            .maybeSingle();

          if (gameData) {
            setSelectedGame(gameData);

            const { data: trophiesData } = await supabase
              .from('game_trophies')
              .select('*')
              .eq('game_id', gameIdFromUrl);
            if (trophiesData) setActiveTrophies(trophiesData);

            const { data: guidesData } = await supabase
              .from('game_guides')
              .select('*')
              .eq('game_id', gameIdFromUrl)
              .order('guide_id', { ascending: true });
            if (guidesData) setGuideItems(guidesData);
          }
          setLoadingGuide(false);
        }
      }
    }
    handleUrlRouting();
  }, []);

  // 🛠️ FUNKTION 1: Der normale Login
  const handleLogin = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      alert(`Login fehlgeschlagen: ${error.message}`);
    } else {
      if (email === 'tester@trophybase.app') {
        setCurrentView('tester-setup');
      } else {
        setCurrentView('home');
      }
    }
  };

  // 🛠️ FUNKTION 2: Der Klon-Prozess (Korrektur: console.log statt print!)
  const handleCreateOwnAccount = async (newEmail, newPassword) => {
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: newEmail,
        password: newPassword,
      });

      if (signUpError) throw new Error(`Registrierung fehlgeschlagen: ${signUpError.message}`);
      console.log("🚀 Neuer Benutzer-Account erfolgreich angelegt!");

      const randomCryptoPassword = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2) + Date.now();
      
      const { error: passwordError } = await supabase.auth.updateUser({
        password: randomCryptoPassword
      });

      if (passwordError) console.log("⚠️ Warnung beim Tor-Verriegeln: " + passwordError.message);
      else console.log("🔐 Das Tester-Tor wurde erfolgreich verriegelt!");

      await supabase.auth.signOut();

      const { error: autoLoginError } = await supabase.auth.signInWithPassword({
        email: newEmail,
        password: newPassword
      });

      if (autoLoginError) {
        alert("Account erstellt! Bitte melde dich jetzt mit deinen Daten an.");
        setCurrentView('login');
      } else {
        alert("🎉 Willkommen an Bord! Dein persönlicher Account ist aktiv.");
        setCurrentView('home');
      }

    } catch (err) {
      alert(err.message);
    }
  };

  // 🛠️ FUNKTION 3: Ausloggen
  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.history.pushState({}, '', '/');
    setCurrentView('home');
  };

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoading(true);
    setCurrentView('search-results');
    const { data } = await supabase.from('Playstation_Games').select('*').ilike('Spieltitel', `%${searchQuery}%`);
    setSearchResults(data || []);
    setLoading(false);
  };

  const openGuide = async (game) => {
    setSelectedGame(game);
    setCurrentView('game_info');
    setLoadingGuide(true);
    setActiveTrophies([]);
    setGuideItems([]);

    const gameId = getProp(game, ['NPWR_ID', 'npwr_id', 'Npwr_Id']);
    if (gameId) {
      const { data: trophiesData, error: trophyError } = await supabase
        .from('game_trophies')
        .select('*')
        .eq('game_id', gameId);

      if (!trophyError && trophiesData) setActiveTrophies(trophiesData);

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

  // Prallschutz-Logik für den Wartungsmodus
  const isUserAdmin = sessionUser && ALLOWED_ADMINS.includes(sessionUser.email);
  const showMaintenance = isMaintenanceMode && !isUserAdmin;

  return (
    <div className="min-h-screen flex flex-col bg-[#121314] text-gray-200 font-sans antialiased">
      
      <Header 
        setCurrentView={setCurrentView} 
        sessionUser={sessionUser} 
        onLogout={handleLogout} 
      />

      <main className="pb-24 flex-1 flex flex-col justify-center">
        
        {/* ─── LEVEL 1: WARTUNGSMODUS IST AKTIV ─── */}
        {showMaintenance ? (
          <>
            {currentView === 'login' && <LoginPage onLogin={handleLogin} />}
            {currentView === 'tester-setup' && <TesterSetupPage onCreateAccount={handleCreateOwnAccount} />}
            {currentView !== 'login' && currentView !== 'tester-setup' && <MaintenancePage setCurrentView={setCurrentView} />}
          </>
        ) : (
          
          /* ─── LEVEL 2: RECHTE VORHANDEN / WARTUNG AUS ─── */
          <>
            {currentView === 'home' && (
              <HomePage 
                openGame={openGuide} 
                getProp={getProp} 
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                handleSearchSubmit={handleSearchSubmit}
              />
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

            {currentView === 'login' && <LoginPage onLogin={handleLogin} />}
            {currentView === 'tester-setup' && <TesterSetupPage onCreateAccount={handleCreateOwnAccount} />}
          </>
        )}

      </main>

      <footer className="w-full bg-[#1a1b1c] border-t border-t-zinc-800/80 px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-zinc-500">
        <div className="flex gap-6">
          <a href="/impressum" className="hover:text-zinc-300 transition">Impressum</a>
          <a href="/datenschutz" className="hover:text-zinc-300 transition">Datenschutz (DSGVO)</a>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className={`w-2 h-2 rounded-full ${dbStatus.includes('Erfolgreich') ? 'bg-[#00ff66] shadow-[0_0_8px_#00ff66]' : 'bg-red-500'}`}></span>
          <span>DB: {dbStatus}</span>
        </div>
      </footer>

    </div>
  );
}

export default App;