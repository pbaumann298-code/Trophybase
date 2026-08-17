import React from 'react';
import WatchlistButton from '../components/WatchlistButton';
import { GAME_FIELDS } from '../lib/gameSchema';
import { getGameUuid, getRouteSlug, getGameTitle, getGameCover } from '../lib/gameModel';

function SearchResultsPage({ searchResults, openGame, getProp, loading, onRequestLogin }) {
  if (loading) return <div className="text-center pt-12 text-zinc-400 text-sm">Suche läuft...</div>;

  return (
    <div className="w-full max-w-4xl min-w-0 overflow-x-hidden mx-auto px-4 sm:px-6 pt-8 box-border">
      <h3 className="text-sm font-bold text-zinc-400 mb-6 uppercase tracking-wider">
        Suchergebnisse ({searchResults.length})
      </h3>

      {searchResults.length === 0 ? (
        <p className="text-sm text-zinc-500 bg-[#1a1b1c] p-6 rounded-xl border border-zinc-800 text-center">
          Keine passenden Einträge in der Datenbank gefunden.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {searchResults.map((g, i) => {
            const watchlistId = getGameUuid(g) || getRouteSlug(g);
            const title = getGameTitle(g) || getProp(g, [GAME_FIELDS.title, 'Spieltitel']);
            const cover = getGameCover(g) || getProp(g, [GAME_FIELDS.cover, 'Cover_URL']);
            return (
              <div
                key={watchlistId || i}
                onClick={() => openGame(g)}
                className="w-full min-w-0 bg-[#1a1b1c] p-4 rounded-xl border border-zinc-800 flex flex-wrap sm:flex-nowrap gap-4 sm:gap-5 cursor-pointer hover:border-zinc-700 hover:bg-[#202122] transition items-start"
              >
                <img
                  src={cover}
                  className="w-24 h-32 object-cover rounded-lg shadow-lg flex-shrink-0 border border-zinc-800"
                  alt=""
                />

                <div className="flex-1 min-w-0 flex flex-col h-full justify-between pt-1">
                  <div className="min-w-0 flex items-start justify-between gap-3">
                    <h4 className="font-bold text-white text-base md:text-lg hover:text-[#00ff66] transition break-words">
                      {title}
                      {g._translationFallback && (
                        <span className="ml-2 text-[10px] font-mono text-zinc-500 uppercase">
                          EN
                        </span>
                      )}
                    </h4>
                    <WatchlistButton
                      gameId={watchlistId}
                      onRequestLogin={onRequestLogin}
                      size="md"
                      className="flex-shrink-0"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-4 pt-4 border-t border-zinc-800/60 text-xs min-w-0 w-full">
                    <div>
                      <span className="block text-zinc-500 text-[10px] uppercase tracking-wider font-mono mb-0.5">
                        Plattform
                      </span>
                      <span className="text-zinc-300 font-medium">
                        {getProp(g, [GAME_FIELDS.console, 'hardware', 'Konsole']) || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-zinc-500 text-[10px] uppercase tracking-wider font-mono mb-0.5">
                        Jahr
                      </span>
                      <span className="text-zinc-300 font-medium">
                        {getProp(g, [GAME_FIELDS.year, 'release_year', 'Release_Jahr']) || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-zinc-500 text-[10px] uppercase tracking-wider font-mono mb-0.5">
                        Genre
                      </span>
                      <span className="text-zinc-300 font-medium truncate block">
                        {getProp(g, [GAME_FIELDS.genre, 'genre', 'Genre']) || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-zinc-500 text-[10px] uppercase tracking-wider font-mono mb-0.5">
                        Entwickler
                      </span>
                      <span className="text-zinc-300 font-medium truncate block">
                        {getProp(g, [GAME_FIELDS.developer, 'developer', 'Entwickler']) || '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SearchResultsPage;
