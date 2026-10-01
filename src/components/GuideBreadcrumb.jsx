import { useLocale } from '../context/LocaleContext';
import { hardwareLabel } from '../lib/gameSlug';
import { GAME_STRUCT } from '../lib/gameSchema';
import { navigateToHome } from '../lib/routeUtils';

function CrumbSep() {
  return (
    <li aria-hidden="true" className="text-zinc-700">
      /
    </li>
  );
}

function GuideBreadcrumb({ game, title, onHome }) {
  const { t } = useLocale();
  const platform = hardwareLabel(game?.hardware);
  const genre = String(game?.[GAME_STRUCT.genre] ?? '').trim();

  const goHome = (event) => {
    event.preventDefault();
    if (onHome) onHome();
    else navigateToHome();
  };

  return (
    <nav aria-label={t('breadcrumbNav')} className="mb-4 min-w-0">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] font-mono uppercase tracking-wider text-zinc-500">
        <li>
          <a
            href="/"
            onClick={goHome}
            className="text-[#00ff66] hover:underline"
          >
            {t('breadcrumbHome')}
          </a>
        </li>
        {platform ? (
          <>
            <CrumbSep />
            <li>{platform}</li>
          </>
        ) : null}
        {genre ? (
          <>
            <CrumbSep />
            <li className="normal-case tracking-normal truncate max-w-[10rem] sm:max-w-[16rem]">
              {genre}
            </li>
          </>
        ) : null}
        {title ? (
          <>
            <CrumbSep />
            <li className="normal-case tracking-normal text-zinc-300 truncate max-w-[12rem] sm:max-w-[22rem]">
              {title}
            </li>
          </>
        ) : null}
      </ol>
    </nav>
  );
}

export default GuideBreadcrumb;
