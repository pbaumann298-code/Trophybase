import { useLocale } from '../context/LocaleContext';

function ErrorReportBubble({ position, onOpen }) {
  const { t } = useLocale();
  if (!position) return null;

  const style = {
    top: `${position.top}px`,
    left: `${position.left}px`,
  };

  const placementClass = position.placement === 'below'
    ? '-translate-x-1/2'
    : '-translate-x-1/2 -translate-y-full';

  return (
    <button
      type="button"
      style={style}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onOpen}
      className={`fixed z-[9999] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1a1b1c] border border-[#00ff66]/40 text-[#00ff66] text-xs font-bold font-mono uppercase tracking-wide shadow-[0_4px_24px_rgba(0,0,0,0.45)] hover:bg-zinc-900 hover:border-[#00ff66] transition-all duration-200 ${placementClass}`}
      aria-label={t('reportError')}
    >
      <span aria-hidden className="text-sm leading-none">
        ⚑
      </span>
      {t('reportError')}
    </button>
  );
}

export default ErrorReportBubble;
