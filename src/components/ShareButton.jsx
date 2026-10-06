import { useState } from 'react';
import { useLocale } from '../context/LocaleContext';

/**
 * Teilt die aktuelle Seite. Auf dem Handy öffnet das die System-Auswahl
 * (WhatsApp, X, Mail, …). Ohne diese Schnittstelle wird der Link kopiert.
 */
function ShareButton({ title = '', className = '' }) {
  const { t } = useLocale();
  const [hint, setHint] = useState(null);

  const handleClick = async () => {
    const url = window.location.href;
    const payload = { title: title || document.title, url };
    setHint(null);

    if (typeof navigator.share === 'function') {
      try {
        const allowed = typeof navigator.canShare !== 'function' || navigator.canShare(payload);
        if (allowed) {
          await navigator.share(payload);
          return;
        }
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setHint({ text: t('shareCopied'), ok: true });
    } catch {
      setHint({ text: t('shareFailed'), ok: false });
    }
    window.setTimeout(() => setHint(null), 2200);
  };

  return (
    <div className={`inline-flex flex-col items-stretch sm:items-end gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-[#1a1b1c] px-4 py-2.5 text-xs font-mono font-bold uppercase tracking-wider text-zinc-300 transition-all duration-200 hover:border-[#00ff66]/35 hover:text-[#00ff66]"
      >
        <span aria-hidden className="text-base leading-none">↗</span>
        {t('share')}
      </button>
      {hint ? (
        <span className={`text-[10px] font-mono text-right leading-snug ${hint.ok ? 'text-[#00ff66]' : 'text-amber-400'}`}>
          {hint.text}
        </span>
      ) : null}
    </div>
  );
}

export default ShareButton;
