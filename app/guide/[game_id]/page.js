import { supabase } from '../../../src/pages/supabaseClient';
import { fetchGameGuideBundle } from '../../../src/lib/guideQueries';
import { fetchGameByRouteRef } from '../../../src/lib/gameQueries';
import { fetchAchievementsForGame } from '../../../src/lib/achievementQueries';
import { getGameTitle } from '../../../src/lib/gameModel';
import { DEFAULT_LOCALE } from '../../../src/lib/locale';

export default async function GuidePage({ params }) {
  const { game_id: routeRef } = params;

  const { data: gameData } = await fetchGameByRouteRef(supabase, routeRef, DEFAULT_LOCALE);

  if (!gameData) {
    return (
      <div className="text-white p-8">
        ⚠️ Spiel-Guide mit der ID {routeRef} wurde in der Datenbank nicht gefunden.
      </div>
    );
  }

  const { data: trophiesData } = await fetchAchievementsForGame(
    supabase,
    gameData,
    DEFAULT_LOCALE,
  );

  const { walkthrough, collectibles, bosses } = await fetchGameGuideBundle(
    supabase,
    gameData,
    DEFAULT_LOCALE,
  );

  return (
    <div className="text-white p-8">
      <h1>{getGameTitle(gameData)}</h1>
      <p className="text-zinc-400 text-sm mt-2">
        Trophäen: {trophiesData?.length ?? 0} · Walkthrough: {walkthrough.length} · Sammelobjekte:{' '}
        {collectibles.length} · Bosse: {bosses.length}
      </p>
      <p className="text-zinc-500 text-xs mt-4">
        Vollständige interaktive UI: Vite-App unter /guide/{routeRef} (GameDetailPage).
      </p>
    </div>
  );
}
