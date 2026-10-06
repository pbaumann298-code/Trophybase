import { useEffect } from 'react';
import { useLocale } from '../context/LocaleContext';

const SECTIONS = [
  ['wischen', 'howToSwipeTitle', 'howToSwipeBody'],
  ['abhaken', 'howToCheckTitle', 'howToCheckBody'],
  ['watchlist', 'howToWatchTitle', 'howToWatchBody'],
  ['querformat', 'howToLandscapeTitle', 'howToLandscapeBody'],
  ['fehler', 'howToReportTitle', 'howToReportBody'],
];

function HowToPage({ onBack }) {
  const { t } = useLocale();

  useEffect(() => {
    const previous = document.title;
    document.title = `${t('howTo')} · TrophyBase`;
    return () => {
      document.title = previous;
    };
  }, [t]);

  useEffect(() => {
    const id = window.location.hash.replace('#', '');
    if (!id) {
      window.scrollTo(0, 0);
      return;
    }
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, []);

  return (
    <article className="w-full max-w-3xl min-w-0 mx-auto px-4 sm:px-6 pt-8 pb-16 box-border">
      <button
        type="button"
        onClick={onBack}
        className="text-xs font-mono text-zinc-500 hover:text-[#00ff66] bg-transparent border-none cursor-pointer mb-6 px-0"
      >
        ← TrophyBase
      </button>
      <h1 className="text-2xl font-bold text-white tracking-tight mb-3">{t('howTo')}</h1>
      <p className="text-sm text-zinc-400 leading-relaxed mb-8">{t('howToLead')}</p>
      <div className="space-y-8">
        {SECTIONS.map(([id, titleKey, bodyKey]) => (
          <section key={id} id={id} className="scroll-mt-24">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-2">
              {t(titleKey)}
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed">{t(bodyKey)}</p>
          </section>
        ))}
      </div>
    </article>
  );
}

export default HowToPage;
