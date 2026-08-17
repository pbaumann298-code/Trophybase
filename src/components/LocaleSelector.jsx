import React, { useState, useRef, useEffect } from 'react';
import { useLocale } from '../context/LocaleContext';
import { localeOptions } from '../lib/uiStrings';

function LocaleSelector({ className = '' }) {
  const { globalLocale, setGlobalLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const options = localeOptions();
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
          className="absolute right-0 top-full mt-1 z-[60] min-w-[9rem] rounded-lg border border-zinc-800 bg-[#1a1b1c] py-1 shadow-xl"
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
