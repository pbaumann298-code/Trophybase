import React, { useState, useEffect } from 'react';
import { supabase } from "./supabaseClient";
import Dashboard from '../components/Dashboard';
import { GAME_PK } from '../lib/gameSchema';

/** Desktop: exakt 5 Kacheln sichtbar (gap-3 → 4 × 12px = 3rem) */
const CAROUSEL_TILE_CLASS =
  'flex-shrink-0 w-44 sm:w-48 lg:w-[calc((100%-3rem)/5)] max-w-[12rem] lg:max-w-none';

function HomePage({ openGame, getProp, searchQuery, setSearchQuery, handleSearchSubmit, sessionUser, setCurrentView }) {
  const [beliebtGames, setBeliebtGames] = useState([]);
  const [soulsGames, setSoulsGames] = useState([]);
  const [ubisoftGames, setUbisoftGames] = useState([]);

  useEffect(() => {
    async function fetchHomeData() {
      try {
        const [beliebtRes, soulsGenreRes, soulsDevRes, ubisoftRes] = await Promise.allSettled([
          supabase.from('Playstation_Games').select('*').order('views', { ascending: false }).limit(12),
          supabase.from('Playstation_Games').select('*').ilike('Genre', '%Soulslike%'),
          supabase.from('Playstation_Games').select('*').ilike('Entwickler', '%FromSoftware%'),
          supabase.from('Playstation_Games').select('*').ilike('Entwickler', '%Ubisoft%').limit(12)
        ]);

        if (beliebtRes.status === 'fulfilled' && beliebtRes.value.data) {
          setBeliebtGames(beliebtRes.value.data);
        }

        let kombiniereSouls = [];
        if (soulsGenreRes.status === 'fulfilled' && soulsGenreRes.value.data) {
          kombiniereSouls = [...kombiniereSouls, ...soulsGenreRes.value.data];
        }
        if (soulsDevRes.status === 'fulfilled' && soulsDevRes.value.data) {
          kombiniereSouls = [...kombiniereSouls, ...soulsDevRes.value.data];
        }

        const eindeutigeSouls = Array.from(
          new Map(
            kombiniereSouls.map(game => [
              game.id || getProp(game, ['Spieltitel', 'spieltitel']),
              game
            ])
          ).values()
        );
        setSoulsGames(eindeutigeSouls.slice(0, 12));

        if (ubisoftRes.status === 'fulfilled' && ubisoftRes.value.data) {
          setUbisoftGames(ubisoftRes.value.data);
        }

      } catch (err) {
        console.error("Kritischer Fehler beim Laden der Startseite:", err);
      }
    }

    fetchHomeData();
  }, [getProp]);

  const renderGameTile = (g, index) => {
    const gameId = g[GAME_PK] ?? getProp(g, [GAME_PK]);
    return (
      <a
        href={`/guide/${gameId}`}
        key={gameId || index}
        className={CAROUSEL_TILE_CLASS}
        onClick={(e) => {
          e.preventDefault();
          window.history.pushState({}, '', `/guide/${gameId}`);
          openGame(g);
        }}
      >
        <div className="w-full bg-[#1a1b1c] border border-zinc-800 rounded-xl p-3 cursor-pointer hover:border-zinc-700 transition h-full">
          <img
            src={getProp(g, ['Cover_URL', 'cover_url'])}
            className="w-full aspect-[3/4] object-cover rounded shadow-md"
            alt=""
          />
          <p className="text-xs mt-2 text-center truncate text-zinc-300">
            {getProp(g, ['Spieltitel', 'spieltitel'])}
          </p>
        </div>
      </a>
    );
  };

  const renderCarousel = (games) => (
    <div className="w-full min-w-0 max-w-full overflow-hidden">
      <div className="flex gap-3 overflow-x-auto scrollbar-hide scroll-smooth w-full overscroll-x-contain pb-1">
        {games}
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-7xl min-w-0 overflow-x-hidden mx-auto px-4 pt-8 flex flex-col gap-12 box-border">

      <div className="w-full min-w-0 max-w-md mx-auto mt-4">
        <form onSubmit={handleSearchSubmit} className="relative w-full">
          <input
            type="text"
            placeholder="Nach PlayStation-Spielen suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1a1b1c] text-zinc-200 pl-4 pr-10 py-3 rounded-xl border border-zinc-800 focus:border-zinc-700 focus:outline-none text-sm transition shadow-lg"
          />
          <div className="absolute right-3.5 top-3.5 text-zinc-500 pointer-events-none">
            🔍
          </div>
        </form>
      </div>

      <Dashboard sessionUser={sessionUser} openGame={openGame} />

      {sessionUser && (
        <div className="flex justify-center -mt-4">
          <button
            type="button"
            onClick={() => setCurrentView('inbox')}
            className="text-xs font-mono uppercase tracking-wider text-zinc-500 hover:text-[#00ff66] transition bg-transparent border-none cursor-pointer"
          >
            Postfach öffnen →
          </button>
        </div>
      )}

      <section className="w-full min-w-0 max-w-full">
        <h3 className="text-xs font-bold text-zinc-400 uppercase mb-4 tracking-wider">
          Beliebt (nach Zugriffen)
        </h3>
        {beliebtGames.length === 0 ? (
          <p className="text-xs text-zinc-600 italic pl-2">Keine Einträge oder Spalte 'views' fehlt.</p>
        ) : (
          renderCarousel(beliebtGames.map(renderGameTile))
        )}
      </section>

      <section className="w-full min-w-0 max-w-full">
        <h3 className="text-xs font-bold text-zinc-400 uppercase mb-4 tracking-wider">
          Souls + Souls-Likes
        </h3>
        {soulsGames.length === 0 ? (
          <p className="text-xs text-zinc-600 italic pl-2">Keine Souls-Spiele gefunden.</p>
        ) : (
          renderCarousel(soulsGames.map(renderGameTile))
        )}
      </section>

      <section className="w-full min-w-0 max-w-full">
        <h3 className="text-xs font-bold text-zinc-400 uppercase mb-4 tracking-wider">
          Ubisoft Spiele
        </h3>
        {ubisoftGames.length === 0 ? (
          <p className="text-xs text-zinc-600 italic pl-2">Keine Ubisoft-Spiele in der Datenbank.</p>
        ) : (
          renderCarousel(ubisoftGames.map(renderGameTile))
        )}
      </section>

    </div>
  );
}

export default HomePage;
