import { useState, useRef, useEffect } from 'react';
import { useLocale } from '../context/LocaleContext';
import { localeOptions } from '../lib/uiStrings';
import { SUPPORTED_LOCALES } from '../lib/locale';
import { DEFAULT_AVAILABLE_LOCALES } from '../lib/contentLocales';

function LocaleSelector({ className = '', menuAlign = 'left' }) {
  const { globalLocale, setGlobalLocale, availableLocales, t } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const options = localeOptions(availableLocales ?? DEFAULT_AVAILABLE_LOCALES);
  const active = options.find((o) => o.code === globalLocale) ?? options[0];

  useEffect(() => {
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  if (options.length < 2 || !active) return null;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 flex-shrink-0 text-xs font-medium text-zinc-300 bg-[#121314] hover:bg-[#202122] border border-zinc-800 px-2.5 sm:px-3 py-1.5 rounded-lg transition whitespace-nowrap"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('language')}
      >
        <span aria-hidden>{active.flag}</span>
        <span className="font-mono font-bold">{active.short}</span>
        <span className="text-zinc-500 text-[10px]" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t('language')}
          className={`absolute ${menuAlign === 'right' ? 'right-0' : 'left-0'} top-full mt-1 z-[60] min-w-[9rem] rounded-lg border border-zinc-800 bg-[#1a1b1c] py-1 shadow-xl`}
        >
          {options.map((opt) => (
            <li key={opt.code} role="option" aria-selected={opt.code === globalLocale}>
              <button
                type="button"
                onClick={() => {
                  setGlobalLocale(opt.code);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition ${
                  opt.code === globalLocale
                    ? 'bg-[#00ff66]/10 text-[#00ff66]'
                    : 'text-zinc-300 hover:bg-zinc-800/80'
                }`}
              >
                <span aria-hidden>{opt.flag}</span>
                <span>{opt.label}</span>
                <span className="ml-auto font-mono text-[10px] text-zinc-500">{opt.short}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LocaleSelector;

/** Admin-Register: alle 14 Sprachen, die Ansicht folgt der freigegebenen Sprache. */
export function LocaleRegister({ className = '' }) {
  const { globalLocale, setGlobalLocale, t } = useLocale();
  const options = localeOptions(SUPPORTED_LOCALES);

  return (
    <div
      role="tablist"
      aria-label={t('language')}
      className={`flex flex-wrap gap-1 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.code === globalLocale;
        return (
          <button
            key={opt.code}
            type="button"
            role="tab"
            aria-selected={active}
            title={opt.label}
            aria-label={opt.label}
            onClick={() => setGlobalLocale(opt.code, { unlock: true })}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-md border text-sm leading-none transition ${
              active
                ? 'border-[#00ff66]/50 bg-[#00ff66]/10'
                : 'border-zinc-800 bg-[#121314] hover:border-zinc-700'
            }`}
          >
            <span aria-hidden>{opt.flag}</span>
          </button>
        );
      })}
    </div>
  );
}
