import React from 'react';

function Header({ setCurrentView }) { // Braucht nur noch das View-Signal

  const handleHomeClick = () => {
    // 1. Schaltet intern auf die Startseite um
    setCurrentView('home');
    // 2. Setzt die URL im Browser wieder sauber auf die Hauptdomain zurück
    window.history.pushState({}, '', '/');
  };

  return (
    <header className="w-full px-8 py-4 flex justify-between items-center bg-[#1a1b1c] border-b border-b-zinc-800/80 sticky top-0 z-50">

      {/* LINKER TEIL: LOGO */}
      <div className="flex items-center gap-8">
        <div className="text-xl font-bold cursor-pointer" onClick={handleHomeClick}>
          <span className="text-white">TrophyBase</span>
          <span className="text-[#00ff66]">.app</span>
        </div>
      </div>

      {/* RECHTER TEIL: LOGIN (Ersetzt den DB-Status) */}
      <div>
        <button
          onClick={() => setCurrentView('login')}
          className="..."
        >
          Anmelden
        </button>
      </div>

    </header>
  );
}

export default Header;