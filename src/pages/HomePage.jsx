import React, { useState, useEffect, useRef } from 'react';
import { supabase } from "./supabaseClient";
import Link from 'next/link';

function HomePage({ getProp }) { // openGame wird nicht mehr gebraucht, da wir direkt verlinken
  const [beliebtGames, setBeliebtGames] = useState([]);
  const [soulsGames, setSoulsGames] = useState([]);
  const [ubisoftGames, setUbisoftGames] = useState([]); 

  const beliebtRef = useRef(null);
  const soulsRef = useRef(null);
  const ubisoftRef = useRef(null); 

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

  return (
    <div className="max-w-[1400px] mx-auto px-8 pt-8 flex flex-col gap-12">
      
      {/* KATEGORIE: BELIEBT */}
      <div>
        <h3 className="text-xs font-bold text-zinc-400 uppercase mb-4 tracking-wider">Beliebt (nach Zugriffen)</h3>
        <div ref={beliebtRef} className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
          {beliebtGames.length === 0 ? (
            <p className="text-xs text-zinc-600 italic pl-2">Keine Einträge oder Spalte 'views' fehlt.</p>
          ) : (
            beliebtGames.map((g, i) => (
              /* 🔥 KORREKTUR: Link umschließt die Kachel, key wandert hierher, onClick fliegt raus */
              <Link href={`/guide/${getProp(g, ['NPWR_ID', 'npwr_id', 'Npwr_Id'])}`} key={i}>
                <div className="flex-none w-[170px] bg-[#1a1b1c] border border-zinc-800 rounded-xl p-3 cursor-pointer hover:border-zinc-700 transition h-full">
                  <img src={getProp(g, ['Cover_URL', 'cover_url'])} className="w-full aspect-[3/4] object-cover rounded shadow-md" alt="" />
                  <p className="text-xs mt-2 text-center truncate text-zinc-300">{getProp(g, ['Spieltitel', 'spieltitel'])}</p>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* KATEGORIE: SOULS */}
      <div>
        <h3 className="text-xs font-bold text-zinc-400 uppercase mb-4 tracking-wider">Souls + Souls-Likes</h3>
        <div ref={soulsRef} className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
          {soulsGames.length === 0 ? (
            <p className="text-xs text-zinc-600 italic pl-2">Keine Souls-Spiele gefunden.</p>
          ) : (
            soulsGames.map((g, i) => (
              /* 🔥 KORREKTUR: Link umschließt die Kachel */
              <Link href={`/guide/${getProp(g, ['NPWR_ID', 'npwr_id', 'Npwr_Id'])}`} key={i}>
                <div className="flex-none w-[170px] bg-[#1a1b1c] border border-zinc-800 rounded-xl p-3 cursor-pointer hover:border-zinc-700 transition h-full">
                  <img src={getProp(g, ['Cover_URL', 'cover_url'])} className="w-full aspect-[3/4] object-cover rounded shadow-md" alt="" />
                  <p className="text-xs mt-2 text-center truncate text-zinc-300">{getProp(g, ['Spieltitel', 'spieltitel'])}</p>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* KATEGORIE: UBISOFT */}
      <div>
        <h3 className="text-xs font-bold text-zinc-400 uppercase mb-4 tracking-wider">Ubisoft Spiele</h3>
        <div ref={ubisoftRef} className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
          {ubisoftGames.length === 0 ? (
            <p className="text-xs text-zinc-600 italic pl-2">Keine Ubisoft-Spiele in der Datenbank.</p>
          ) : (
            ubisoftGames.map((g, i) => (
              /* 🔥 KORREKTUR: Link umschließt die Kachel */
              <Link href={`/guide/${getProp(g, ['NPWR_ID', 'npwr_id', 'Npwr_Id'])}`} key={i}>
                <div className="flex-none w-[170px] bg-[#1a1b1c] border border-zinc-800 rounded-xl p-3 cursor-pointer hover:border-zinc-700 transition h-full">
                  <img src={getProp(g, ['Cover_URL', 'cover_url'])} className="w-full aspect-[3/4] object-cover rounded shadow-md" alt="" />
                  <p className="text-xs mt-2 text-center truncate text-zinc-300">{getProp(g, ['Spieltitel', 'spieltitel'])}</p>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

    </div>
  );
}

export default HomePage;