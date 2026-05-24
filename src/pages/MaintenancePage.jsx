import React from 'react';

function MaintenancePage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 text-center bg-[#121314]">
      <div className="w-16 h-16 rounded-full bg-zinc-800/50 flex items-center justify-center text-2xl mb-6 border border-zinc-700 animate-pulse">
        🛠️
      </div>
      <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">
        TrophyBase bekommt ein Update
      </h1>
      <p className="text-sm text-zinc-400 max-w-sm mx-auto mb-6">
        Wir schrauben gerade am Live-System, um die Trophäen-Guides noch besser zu machen. Schau in ein paar Minuten wieder vorbei!
      </p>
      <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
        Maintenance Mode Active
      </div>
    </div>
  );
}

export default MaintenancePage;