import { getGameUuid, getRouteSlug, getGameTitle, getGameCover } from '../lib/gameModel';
import { GAME_FIELDS } from '../lib/gameSchema';
import { gameGuidePath, navigateToGame } from '../lib/routeUtils';
import { useLocale } from '../context/LocaleContext';
import '../styles/home.css';

const TILE_CLASS =
  'flex-shrink-0 w-[9.5rem] sm:w-44';

function RelatedTile({ game, openGame }) {
  const { globalLocale } = useLocale();
  const title = getGameTitle(game, globalLocale);
  const cover = getGameCover(game, globalLocale);
  const consoleLabel = game[GAME_FIELDS.console] ?? '';
  const key = getRouteSlug(game) || getGameUuid(game);

  return (
    <a
      href={gameGuidePath(game, globalLocale)}
      className={TILE_CLASS}
      onClick={(event) => {
        event.preventDefault();
        navigateToGame(game, { locale: globalLocale });
        openGame?.(game);
      }}
    >
      <article className="home-tile group h-full" style={{ '--tile-accent': '#00ff66' }}>
        <div className="home-tile-cover-wrap">
          {cover ? (
            <img src={cover} className="home-tile-cover" alt="" loading="lazy" />
          ) : (
            <div className="home-tile-cover home-tile-cover--empty">🎮</div>
          )}
          <div className="home-tile-shine" aria-hidden />
        </div>
        <div className="home-tile-meta">
          <p className="home-tile-title" title={title}>
            {title}
          </p>
          {consoleLabel ? <span className="home-tile-badge">{consoleLabel}</span> : null}
        </div>
      </article>
    </a>
  );
}

function RelatedBlock({ title, games, openGame }) {
  if (!games?.length) return null;
  return (
    <section className="home-category w-full min-w-0 mt-10">
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
