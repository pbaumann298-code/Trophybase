import React from 'react';

function Header({ setCurrentView, sessionUser, onLogout }) {
  
  const handleHomeClick = () => {
    setCurrentView('home');
    window.history.pushState({}, '', '/');
  };

  return (
    <header className="w-full px-8 py-4 flex justify-between items-center bg-[#1a1b1c] border-b border-b-zinc-800/80 sticky top-0 z-50">
      
      {/* LOGO */}
      <div className="flex items-center gap-8">
        <div className="text-xl font-bold cursor-pointer" onClick={handleHomeClick}>
          <span className="text-white">TrophyBase</span>
          <span className="text-[#00ff66]">.app</span>
        </div>
      </div>

      {/* LOGIN / PROFILE-STEUERUNG */}
      <div>
        {sessionUser ? (
          /* Wenn eingeloggt: Mail & Logout zeigen */
          <div className="flex items-center gap-4">
            <span className="text-xs text-zinc-500 font-mono hidden sm:inline">
              {sessionUser.email}
            </span>
            <button 
              onClick={onLogout} 
              className="text-xs font-medium text-red-400 bg-red-500/5 hover:bg-red-500/10 border border-red-900/30 px-4 py-1.5 rounded-lg transition"
            >
              Abmelden
            </button>
          </div>
        ) : (
          /* Wenn NICHT eingeloggt: Echter Umschalter zur Login-Ansicht! */
          <button 
            onClick={() => setCurrentView('login')} 
            className="text-xs font-medium text-zinc-300 bg-[#121314] hover:bg-[#202122] border border-zinc-800 px-4 py-1.5 rounded-lg transition"
          >
            Anmelden
          </button>
        )}
      </div>

    </header>
  );
}

export default Header;