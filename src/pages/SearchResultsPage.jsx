import React from 'react';

function SearchResultsPage({ searchResults, openGame, getProp, loading }) {
  if (loading) return <div className="text-center pt-12 text-zinc-400 text-sm">Suche läuft...</div>;

  return (
    <div className="max-w-4xl mx-auto px-6 pt-8">
      <h3 className="text-sm font-bold text-zinc-400 mb-6 uppercase tracking-wider">
        Suchergebnisse ({searchResults.length})
      </h3>
      
      {searchResults.length === 0 ? (
        <p className="text-sm text-zinc-500 bg-[#1a1b1c] p-6 rounded-xl border border-zinc-800 text-center">
          Keine passenden Einträge in der Datenbank gefunden.
        </p>
      ) : (
        // flex-col sorgt dafür, dass alle Kästen sauber untereinander stehen
        <div className="flex flex-col gap-4">
          {searchResults.map((g, i) => (
            <div 
              key={i} 
              onClick={() => openGame(g)} 
              className="bg-[#1a1b1c] p-4 rounded-xl border border-zinc-800 flex gap-5 cursor-pointer hover:border-zinc-700 hover:bg-[#202122] transition items-start"
            >
              {/* Größeres Cover-Bild, damit es nicht mehr winzig wirkt */}
              <img 
                src={getProp(g, ['Cover_URL', 'cover_url'])} 
                className="w-24 h-32 object-cover rounded-lg shadow-lg flex-shrink-0 border border-zinc-800" 
                alt="" 
              />
              
              {/* Rechter Datenbereich: Nutzt den gesamten restlichen Platz */}
              <div className="flex-1 flex flex-col h-full justify-between pt-1">
                <div>
                  <h4 className="font-bold text-white text-base md:text-lg hover:text-[#00ff66] transition">
                    {getProp(g, ['Spieltitel', 'spieltitel'])}
                  </h4>
                </div>

                {/* Das neue Metadaten-Grid für die zusätzlichen Supabase-Infos */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-zinc-800/60 text-xs">
                  <div>
                    <span className="block text-zinc-500 text-[10px] uppercase tracking-wider font-mono mb-0.5">Konsole</span>
                    <span className="text-zinc-300 font-medium">{getProp(g, ['Konsole', 'konsole']) || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-zinc-500 text-[10px] uppercase tracking-wider font-mono mb-0.5">Jahr</span>
                    <span className="text-zinc-300 font-medium">{getProp(g, ['Release_Jahr', 'release_jahr', 'Releasejahr']) || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-zinc-500 text-[10px] uppercase tracking-wider font-mono mb-0.5">Genre</span>
                    <span className="text-zinc-300 font-medium truncate block">{getProp(g, ['Genre', 'genre']) || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-zinc-500 text-[10px] uppercase tracking-wider font-mono mb-0.5">Entwickler</span>
                    <span className="text-zinc-300 font-medium truncate block">{getProp(g, ['Entwickler', 'entwickler']) || '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SearchResultsPage;