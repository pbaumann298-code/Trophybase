import { useEffect } from 'react';
import { useLocale } from '../context/LocaleContext';
import {
  guideHelpPageCopy,
  guideHelpPublicPath,
  parseGuideHelpPath,
} from '../lib/guideHelpPage';
import {
  easyPlatinsPageCopy,
  easyPlatinsPublicPath,
} from '../lib/easyPlatinsPage';
import {
  quickwinsPageCopy,
  quickwinsPublicPath,
} from '../lib/quickwinsPage';
import {
  servertotPageCopy,
  servertotPublicPath,
} from '../lib/servertotPage';
import { normalizeLocale } from '../lib/locale';
import { t as translateUi } from '../lib/uiStrings';

const SECTIONS = [
  ['wischen', 'howToSwipeTitle', 'howToSwipeBody'],
  ['abhaken', 'howToCheckTitle', 'howToCheckBody'],
  ['watchlist', 'howToWatchTitle', 'howToWatchBody'],
  ['querformat', 'howToLandscapeTitle', 'howToLandscapeBody'],
  ['fehler', 'howToReportTitle', 'howToReportBody'],
];

function isPlainLeftClick(event) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function HowToPage({
  onBack,
  onOpenEasyPlatins,
  onOpenQuickwins,
  onOpenServertot,
}) {
  const { globalLocale, setGlobalLocale } = useLocale();
  const parsedPath =
    typeof window !== 'undefined'
      ? parseGuideHelpPath(window.location.pathname)
      : null;
  const activeLocale = normalizeLocale(parsedPath?.locale || globalLocale);

  const copy = guideHelpPageCopy(activeLocale);
  const easyPlatinsCopy = easyPlatinsPageCopy(activeLocale);
  const microPlatinsCopy = quickwinsPageCopy(activeLocale);
  const servertotCopy = servertotPageCopy(activeLocale);

  const easyPlatinsHref = easyPlatinsPublicPath(activeLocale);
  const microPlatinsHref = quickwinsPublicPath(activeLocale);
  const servertotHref = servertotPublicPath(activeLocale);

  useEffect(() => {
    const alignPath = () => {
      const parsed = parseGuideHelpPath(window.location.pathname);
      if (!parsed) return;
      const locale = parsed.locale || normalizeLocale(globalLocale);
      if (parsed.locale && parsed.locale !== normalizeLocale(globalLocale)) {
        setGlobalLocale(parsed.locale);
      }
      const target = guideHelpPublicPath(locale);
      const current = window.location.pathname.replace(/\/$/, '') || '/';
      if (current !== target) {
        window.history.replaceState(
          {},
          '',
          `${target}${window.location.search}${window.location.hash}`,
        );
      }
      const id = window.location.hash.replace('#', '');
      if (!id) {
        window.scrollTo(0, 0);
        return;
      }
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
    };
    alignPath();
    window.addEventListener('popstate', alignPath);
    return () => window.removeEventListener('popstate', alignPath);
  }, [globalLocale, setGlobalLocale]);

  const handleHubClick = (handler) => (event) => {
    if (!handler || !isPlainLeftClick(event)) return;
    event.preventDefault();
    handler();
  };

  const specialHubs = [
    {
      id: 'easy-platins',
      href: easyPlatinsHref,
      title: easyPlatinsCopy.title,
      lead: easyPlatinsCopy.lead,
      onClick: handleHubClick(onOpenEasyPlatins),
    },
    {
      id: 'micro-platins',
      href: microPlatinsHref,
      title: microPlatinsCopy.title,
      lead: microPlatinsCopy.lead,
      onClick: handleHubClick(onOpenQuickwins),
    },
    {
      id: 'servertot',
      href: servertotHref,
      title: servertotCopy.title,
      lead: servertotCopy.lead,
      onClick: handleHubClick(onOpenServertot),
    },
  ];

  return (
    <article className="w-full max-w-3xl min-w-0 mx-auto px-4 sm:px-6 pt-8 pb-16 box-border">
      <button
        type="button"
        onClick={onBack}
        className="text-xs font-mono text-zinc-500 hover:text-[#00ff66] bg-transparent border-none cursor-pointer mb-6 px-0"
      >
        ← TrophyBase
      </button>
      <h1 className="text-2xl font-bold text-white tracking-tight mb-3">{copy.title}</h1>
      <p className="text-sm text-zinc-400 leading-relaxed mb-8">{copy.lead}</p>
      <div className="space-y-8">
        {SECTIONS.map(([id, titleKey, bodyKey]) => (
          <section key={id} id={id} className="scroll-mt-24">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-2">
              {translateUi(activeLocale, titleKey)}
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed">
              {translateUi(activeLocale, bodyKey)}
            </p>
          </section>
        ))}

        <section id="spamschutz" className="scroll-mt-24">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-2">
            {copy.spamTitle}
          </h2>
          <p className="text-sm text-zinc-300 leading-relaxed">
            {copy.spamBeforeHub}
            <a
              href={microPlatinsHref}
              onClick={handleHubClick(onOpenQuickwins)}
              className="text-[#00ff66] hover:underline font-medium"
            >
              {microPlatinsCopy.title}
            </a>
            {copy.spamAfterHub}
          </p>
        </section>

        <section id="kataloge" className="scroll-mt-24 pt-2 border-t border-zinc-800/80">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-2">
            {copy.hubsTitle}
          </h2>
          <p className="text-sm text-zinc-400 leading-relaxed mb-4">
            {copy.hubsIntro}
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3 list-none p-0 m-0">
            {specialHubs.map((hub) => (
              <li key={hub.id} className="min-w-0">
                <a
                  href={hub.href}
                  onClick={hub.onClick}
                  className="block h-full rounded-xl border border-zinc-800 bg-[#1a1b1c]/80 p-3.5 no-underline transition hover:border-[#00ff66]/45 hover:bg-[#1a1b1c]"
                >
                  <span className="block text-sm font-bold text-[#00ff66] mb-1">
                    {hub.title}
                  </span>
                  <span className="block text-xs text-zinc-400 leading-relaxed">
                    {hub.lead}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
}

export default HowToPage;
