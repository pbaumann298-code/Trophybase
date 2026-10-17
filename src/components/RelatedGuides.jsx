import { getGameUuid, getRouteSlug } from '../lib/gameModel';
import { gameGuidePath, navigateToGame } from '../lib/routeUtils';
import { useLocale } from '../context/LocaleContext';
import GameTile from './GameTile';
import '../styles/home.css';

const TILE_CLASS = 'flex-shrink-0 w-[9.5rem] sm:w-44';

function RelatedTile({ game, openGame }) {
  const { globalLocale } = useLocale();

  return (
    <GameTile
      game={game}
      href={gameGuidePath(game, globalLocale)}
      className={TILE_CLASS}
      onOpen={() => {
        navigateToGame(game, { locale: globalLocale });
        openGame?.(game);
      }}
    />
  );
}

export function RelatedBlock({ title, games, openGame, compact = false }) {
  if (!games?.length) return null;
  return (
    <section className={`home-category w-full min-w-0 ${compact ? 'mt-1' : 'mt-10'}`}>
      <header className="home-category-header mb-3">
        <h2 className="text-sm font-bold tracking-tight text-zinc-200">{title}</h2>
      </header>
      <div className="flex flex-wrap gap-3">
        {games.map((game, index) => (
          <RelatedTile
            key={getGameUuid(game) || getRouteSlug(game) || `${title}-${index}`}
            game={game}
            openGame={openGame}
          />
        ))}
      </div>
    </section>
  );
}

function RelatedGuides({ creatorName, creatorGames, similarGames, openGame }) {
  const { t } = useLocale();
  const creatorTitle = creatorName
    ? t('moreFromCreator').replaceAll('{name}', creatorName)
    : t('moreFromCreators');

  if (!creatorGames?.length && !similarGames?.length) return null;

  return (
    <div className="w-full min-w-0 mt-4">
      <RelatedBlock title={creatorTitle} games={creatorGames} openGame={openGame} />
      <RelatedBlock title={t('similarGuides')} games={similarGames} openGame={openGame} />
    </div>
  );
}

export default RelatedGuides;
