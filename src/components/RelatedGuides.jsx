import { getGameUuid, getRouteSlug } from '../lib/gameModel';
import { creatorPublicPath } from '../lib/creatorPage';
import { gameGuidePath, writeAppPath } from '../lib/routeUtils';
import { useLocale } from '../context/LocaleContext';
import GameTile from './GameTile';
import '../styles/home.css';

const TILE_CLASS = 'flex-shrink-0 w-[9.5rem] sm:w-44';

function isPlainLeftClick(event) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function RelatedTile({ game, openGame }) {
  const { globalLocale } = useLocale();

  return (
    <GameTile
      game={game}
      href={gameGuidePath(game, globalLocale)}
      className={TILE_CLASS}
      onOpen={() => {
        openGame?.(game);
      }}
    />
  );
}

export function RelatedBlock({ title, titleHref = '', games, openGame, compact = false }) {
  if (!games?.length) return null;
  return (
    <section className={`home-category w-full min-w-0 ${compact ? 'mt-1' : 'mt-10'}`}>
      <header className="home-category-header mb-3">
        <h2 className="text-sm font-bold tracking-tight text-zinc-200">
          {titleHref ? (
            <a
              href={titleHref}
              onClick={(event) => {
                if (!isPlainLeftClick(event)) return;
                event.preventDefault();
                writeAppPath(titleHref);
                window.dispatchEvent(new PopStateEvent('popstate'));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="group inline-flex items-center gap-1.5 text-zinc-100 hover:text-[#00ff66] underline-offset-4 hover:underline transition-colors"
            >
              <span>{title}</span>
              <span
                aria-hidden="true"
                className="text-xs text-[#00ff66]/80 transition-transform group-hover:translate-x-0.5"
              >
                →
              </span>
            </a>
          ) : (
            title
          )}
        </h2>
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

function RelatedGuides({ creatorName, creatorSlug = '', creatorGames, similarGames, openGame }) {
  const { t, globalLocale } = useLocale();
  const creatorTitle = creatorName
    ? t('moreFromCreator').replaceAll('{name}', creatorName)
    : t('moreFromCreators');
  const creatorHref = creatorSlug ? creatorPublicPath(globalLocale, creatorSlug) : '';

  if (!creatorGames?.length && !similarGames?.length) return null;

  return (
    <div className="w-full min-w-0 mt-4">
      <RelatedBlock
        title={creatorTitle}
        titleHref={creatorHref}
        games={creatorGames}
        openGame={openGame}
      />
      <RelatedBlock title={t('similarGuides')} games={similarGames} openGame={openGame} />
    </div>
  );
}

export default RelatedGuides;
