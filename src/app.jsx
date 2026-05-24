import React, { useState, useEffect } from 'react';
import { supabase } from './pages/supabaseClient';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import SearchResultsPage from './pages/SearchResultsPage';
import GameDetailPage from "./pages/GameDetailPage";
import { CollectibleKacheln } from './pages/CollectibleKacheln';
import LoginPage from './pages/LoginPage';
import TesterSetupPage from './pages/TesterSetupPage';

function App() {
  // 1. Wir schauen beim Start direkt in die URL des Browsers!
  const [currentView, setCurrentView] = useState(() => {
    if (window.location.pathname.startsWith('/guide/')) {
      return 'game_info'; // Falls "/guide/..." in der URL steht, direkt den Guide laden!
    }
    return 'home';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState('Testen...');

  const [sessionUser, setSessionUser] = useState(null);
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

  // 🔐 NEU: Überprüft den Login-Status beim Starten der App
  useEffect(() => {
    // 1. Aktuelle Session abrufen
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionUser(session?.user ?? null);
    });

    // 2. Auf Änderungen lauschen (Login / Logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ERSTER HOOK: Testet die DB-Verbindung beim Laden
  useEffect(() => {
    async function initDb() {
      const { error } = await supabase.from('Playstation_Games').select('*').limit(1);
      setDbStatus(error ? 'Fehlgeschlagen' : 'Erfolgreich verbunden!');
    }
    initDb();
  }, []);

  // 🔥 ZWEITER HOOK (NEU): Holt die Spieldaten live aus der URL, wenn man F5 drückt!
  useEffect(() => {
    async function handleUrlRouting() {
      const path = window.location.pathname; // z.B. "/guide/NPWR23171_00"
      if (path.startsWith('/guide/')) {
        const gameIdFromUrl = path.split('/')[2]; // Schneidet das "NPWR23171_00" heraus

        if (gameIdFromUrl) {
          setLoadingGuide(true);

          // Spieldaten holen
          const { data: gameData } = await supabase
            .from('Playstation_Games')
            .select('*')
            .or(`NPWR_ID.eq.${gameIdFromUrl},npwr_id.eq.${gameIdFromUrl},Npwr_Id.eq.${gameIdFromUrl}`)
            .maybeSingle();

          if (gameData) {
            setSelectedGame(gameData);

            // 1. Trophäen für Reiter 1 laden
            const { data: trophiesData } = await supabase
              .from('game_trophies')
              .select('*')
              .eq('game_id', gameIdFromUrl);
            if (trophiesData) setActiveTrophies(trophiesData);

            // 2. Collectibles für Reiter 2 laden
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
      // Wenn es der Tester-Account ist, leiten wir direkt aufs Setup um
      if (data.user?.email === 'tester@trophybase.app') {
        setCurrentView('tester-setup');
      } else {
        setCurrentView('home');
      }
    }
  };

  // 🛠️ FUNKTION 2: Der Klon-Prozess (Neuen Account aus dem Tester-Tor erstellen)
  const handleCreateOwnAccount = async (newEmail, newPassword) => {
    try {
      // 1. Erstelle den brandneuen User in Supabase
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: newEmail,
        password: newPassword,
      });

      if (signUpError) throw new Error(`Registrierung fehlgeschlagen: ${signUpError.message}`);

      print("🚀 Neuer Benutzer-Account erfolgreich angelegt!");

      // 2. Jetzt sperren wir das Tor! Wir ändern das Passwort von tester@trophybase.app 
      // auf einen völlig unlesbaren, 50-stelligen Zufalls-String.
      const randomCryptoPassword = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2) + Date.now();
      
      // ACHTUNG: Da wir aktuell noch als "tester" eingeloggt sind, 
      // ändert dieser Befehl genau das Passwort des aktuell angemeldeten Users!
      const { error: passwordError } = await supabase.auth.updateUser({
        password: randomCryptoPassword
      });

      if (passwordError) print("⚠️ Warnung beim Tor-Verriegeln: " + passwordError.message);
      else print("🔐 Das Tester-Tor wurde erfolgreich für weitere Logins verriegelt!");

      // 3. Ausloggen aus dem Tester-Account
      await supabase.auth.signOut();

      // 4. Direkt automatisch in den brandneuen eigenen Account einloggen!
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

  // 🛠️ FUNKTION 3: Einfaches Ausloggen
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

  // Lädt Trophäen & Guides aus den Supabase-Tabellen via NPWR_ID (für Klicks innerhalb der App)
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
return (
    <div className="min-h-screen flex flex-col bg-[#121314] text-gray-200 font-sans antialiased">
      
      {/* 1. HEADER */}
      <Header 
        setCurrentView={setCurrentView} 
        sessionUser={sessionUser} 
        onLogout={handleLogout} 
      />

      {/* MAIN-INHALT */}
      <main className="pb-24 flex-1 flex flex-col">
        
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

        {/* 🔐 AUSGELAGERT: LOGIN SEITE */}
        {currentView === 'login' && (
          <LoginPage onLogin={handleLogin} />
        )}

        {/* 🔐 AUSGELAGERT: TESTER SETUP SEITE */}
        {currentView === 'tester-setup' && (
          <TesterSetupPage onCreateAccount={handleCreateOwnAccount} />
        )}

      </main>

      {/* FOOTER */}
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