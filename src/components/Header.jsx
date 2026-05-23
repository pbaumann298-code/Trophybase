import React from 'react';

function Header({ setCurrentView, searchQuery, setSearchQuery, handleSearchSubmit, dbStatus }) {
  return (
    <header className="w-full px-8 py-4 flex justify-between items-center bg-[#1a1b1c] border-b border-b-zinc-800/80 sticky top-0 z-50">
      <div className="flex items-center gap-8 flex-1 max-w-2xl">
        <div className="text-xl font-bold cursor-pointer" onClick={() => setCurrentView('home')}>
          <span className="text-white">TrophyBase</span>
          <span className="text-[#00ff66]">.app</span>
        </div>
        <form onSubmit={handleSearchSubmit} className="hidden md:flex flex-1 max-w-md relative">
          <input 
            type="text" 
            placeholder="Suche..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            className="w-full bg-[#121314] text-zinc-200 pl-4 py-1.5 rounded-lg border border-zinc-800 focus:outline-none text-sm" 
          />
        </form>
      </div>
      <div className="text-[10px] font-mono px-2.5 py-1 rounded bg-[#121314] border border-zinc-800">
        DB: {dbStatus}
      </div>
    </header>
  );
}

export default Header;