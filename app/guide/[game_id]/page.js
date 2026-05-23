import { supabase } from '@/pages/supabaseClient'; // Pfad eventuell anpassen an dein Projekt
import GameDetailPageClient from './GameDetailPageClient'; // Der Client-Teil für Klicks und Haken

// Hilfsfunktion für die IDs, genau wie in deiner App.js
const getProp = (obj, keys) => {
  if (!obj) return '';
  for (let key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return '';
};

// Next.js übergibt die ID aus der URL vollautomatisch in { params }
export default async function GuidePage({ params }) {
  const { game_id } = params;

  // 1. Spieldaten auslesen (Aus deiner Tabelle 'Playstation_Games')
  const { data: gameData } = await supabase
    .from('Playstation_Games')
    .select('*')
    .or(`NPWR_ID.eq.${game_id},npwr_id.eq.${game_id},Npwr_Id.eq.${game_id}`)
    .single();

  if (!gameData) {
    return <div className="text-white p-8">⚠️ Spiel-Guide mit der ID {game_id} wurde in der Datenbank nicht gefunden.</div>;
  }

  // 2. Trophäen für Reiter 0 laden
  const { data: trophiesData } = await supabase
    .from('game_trophies')
    .select('*')
    .eq('game_id', game_id);

  // 3. Collectibles für Reiter 1 laden
  const { data: guidesData } = await supabase
    .from('game_guides')
    .select('*')
    .eq('game_id', game_id)
    .order('guide_id', { ascending: true });

  // Da wir in React-Komponenten Haken setzen wollen (Zustand!),
  // übergeben wir die geladenen Server-Daten jetzt an eine Client-Komponente:
  return (
    <GameDetailPageClient 
      selectedGame={gameData}
      activeTrophies={trophiesData || []}
      guideItems={guidesData || []}
      getProp={getProp}
    />
  );
}