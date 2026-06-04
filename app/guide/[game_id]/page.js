import { supabase } from '../../../src/pages/supabaseClient';
import { fetchGameGuideBundle } from '../../../src/lib/guideQueries';

const getProp = (obj, keys) => {
  if (!obj) return '';
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return '';
};

export default async function GuidePage({ params }) {
  const { game_id } = params;

  const { data: gameData } = await supabase
    .from('Playstation_Games')
    .select('*')
    .or(`NPWR_ID.eq.${game_id},npwr_id.eq.${game_id},Npwr_Id.eq.${game_id}`)
    .single();

  if (!gameData) {
    return (
      <div className="text-white p-8">
        ⚠️ Spiel-Guide mit der ID {game_id} wurde in der Datenbank nicht gefunden.
      </div>
    );
  }

  const { data: trophiesData } = await supabase
    .from('game_trophies')
    .select('*')
    .eq('game_id', game_id);

  const { guides, bosses } = await fetchGameGuideBundle(supabase, game_id);

  return (
    <div className="text-white p-8">
      <h1>{getProp(gameData, ['Spieltitel', 'spieltitel'])}</h1>
      <p className="text-zinc-400 text-sm mt-2">
        Reiter 0: {trophiesData?.length ?? 0} Trophäen · Reiter 1+2: {guides.length} Guides · Reiter
        3: {bosses.length} Bosse
      </p>
      <p className="text-zinc-500 text-xs mt-4">
        Vollständige interaktive UI: Vite-App unter /guide/{game_id} (GameDetailPage).
      </p>
    </div>
  );
}
