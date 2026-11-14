import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../context/LocaleContext';

function RewindIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3 w-3 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

/**
 * Kompakter, mehrfach klickbarer -15s-Zurückspul-Button für den eingebetteten YouTube-Player.
 * Zeigt bei Klick nur kurz ein dezentes kumulatives Feedback-Pillchen über dem Button.
 */
export default function VideoRewindButton({
  onRewind,
  stepSeconds = 15,
  className = '',
}) {
  const { t } = useLocale();
  const [cumulativeSeconds, setCumulativeSeconds] = useState(0);
  const timerRef = useRef(null);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const handleClick = (event) => {
    event.stopPropagation();
    onRewind?.(stepSeconds);
    setCumulativeSeconds((prev) => prev + stepSeconds);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setCumulativeSeconds(0);
      timerRef.current = null;
    }, 1400);
  };

  const feedbackText =
    cumulativeSeconds > 0
      ? t('videoRewindFeedback').replaceAll('{seconds}', String(cumulativeSeconds))
      : '';

  return (
    <div className={`relative inline-flex items-center justify-end ${className}`}>
      {cumulativeSeconds > 0 ? (
        <span
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute bottom-full end-0 z-20 mb-1 whitespace-nowrap rounded border border-[#00ff66]/45 bg-[#121314]/95 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#00ff66] shadow-lg"
        >
          {feedbackText}
        </span>
      ) : null}
      <button
        type="button"
        onClick={handleClick}
        aria-label={t('videoRewind15sAria')}
        title={t('videoRewind15sAria')}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-zinc-700/90 bg-[#121314] px-1.5 py-0.5 font-mono text-[11px] font-bold text-zinc-300 transition hover:border-[#00ff66]/50 hover:text-[#00ff66] active:scale-95 cursor-pointer"
      >
        <RewindIcon />
        <span className="tb-bidi-isolate">-{stepSeconds}s</span>
      </button>
    </div>
  );
}
