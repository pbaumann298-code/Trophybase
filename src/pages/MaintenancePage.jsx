import React from 'react';

function MaintenancePage({ setCurrentView }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 text-center bg-[#121314]">
      <div className="w-16 h-16 rounded-full bg-zinc-800/50 flex items-center justify-center text-2xl mb-6 border border-zinc-700 animate-pulse">
        🛠️
      </div>
      <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">
        TrophyBase bekommt ein Update
      </h1>
      <p className="text-sm text-zinc-400 max-w-sm mx-auto mb-6">
        Wir schrauben gerade am Live-System, um die Trophäen-Guides noch besser zu machen. Schau in
        ein paar Minuten wieder vorbei!
      </p>
      <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-6">
        Maintenance Mode Active
      </div>
      {setCurrentView && (
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => {
              window.history.pushState({}, '', '/beta');
              setCurrentView('beta');
            }}
            className="text-xs font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/25 px-4 py-2 rounded-xl hover:bg-sky-500/15 transition cursor-pointer"
          >
            Beta-Zugang beantragen
          </button>
          <button
            type="button"
            onClick={() => setCurrentView('login')}
            className="text-xs font-semibold text-[#00ff66] bg-[#00ff66]/10 border border-[#00ff66]/25 px-4 py-2 rounded-xl hover:bg-[#00ff66]/15 transition cursor-pointer"
          >
            Tester / Creator Login
          </button>
        </div>
      )}
    </div>
  );
}

export default MaintenancePage;
