import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../context/LocaleContext';
import { localeOptions } from '../lib/uiStrings';
import { SUPPORTED_LOCALES } from '../lib/locale';
import { resolveGuideLanguage } from '../lib/localeResolver';

function GuideLanguageSelector({
  guideLanguageOverride,
  onGuideLanguageOverride,
  locales,
  className = '',
}) {
  const { globalLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const publishedSet = new Set(
    (locales ?? []).map((code) => String(code ?? '').trim().toLowerCase()).filter(Boolean),
  );
  const allCodes = Array.from(new Set([...(locales ?? []), ...SUPPORTED_LOCALES]));
  const options = localeOptions(allCodes);
  const effective = resolveGuideLanguage(globalLocale, guideLanguageOverride);
  const activeOption =
    options.find((opt) => opt.code === effective) ??
    localeOptions([effective])[0] ??
    options[0];

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const chooseLanguage = (code) => {
    onGuideLanguageOverride(code === globalLocale ? null : code);
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className={`relative flex flex-wrap items-center gap-2 sm:gap-3 rounded-xl border border-zinc-800/80 bg-[#121314]/90 px-3 py-2.5 mb-4 ${className}`}
    >
      <div className="relative inline-flex items-center gap-2">
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
          {t('guideLanguage') || 'Guidesprache'}
        </span>
        <button
          type="button"
          aria-label={t('guideLanguage') || 'Guidesprache'}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-xs font-bold transition ${
            open
              ? 'border-[#00ff66]/50 bg-[#00ff66]/10 text-[#00ff66]'
              : 'border-zinc-700 bg-[#121314] text-zinc-200 hover:border-zinc-600 hover:text-white'
          }`}
        >
          {activeOption?.flag ? <span aria-hidden>{activeOption.flag}</span> : null}
          <span>{effective.toUpperCase()}</span>
          <span aria-hidden className="text-[10px] text-zinc-400">
            {open ? '▴' : '▾'}
          </span>
        </button>

        {open ? (
          <div
            role="listbox"
            aria-label={t('guideLanguage') || 'Guidesprache'}
            className="absolute left-0 top-[calc(100%+0.4rem)] z-[70] max-h-64 min-w-[13.5rem] overflow-y-auto rounded-xl border border-zinc-800 bg-[#121314] py-1.5 shadow-xl shadow-black/50"
          >
            {options.map((opt) => {
              const selected = opt.code === effective;
              const isReleased = publishedSet.has(opt.code);
              return (
                <button
                  key={opt.code}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => chooseLanguage(opt.code)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
                    selected
                      ? 'bg-[#00ff66]/10 text-[#00ff66]'
                      : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                  }`}
                >
                  <span aria-hidden>{opt.flag}</span>
                  <span className="font-semibold">{opt.label}</span>
                  <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] text-zinc-500">
                    {isReleased ? (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-[#00ff66]/80"
                        title="Freigegeben"
                        aria-hidden
                      />
                    ) : null}
                    <span>{opt.short}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <span className="text-[10px] font-mono text-zinc-600 ml-auto">
        {t('guideLanguageHint')}: {globalLocale.toUpperCase()}
        {guideLanguageOverride && (
          <>
            {' · '}
            <button
              type="button"
              onClick={() => {
                onGuideLanguageOverride(null);
                setOpen(false);
              }}
              className="text-zinc-500 hover:text-[#00ff66] underline bg-transparent border-none cursor-pointer p-0 font-mono text-[10px]"
            >
              {t('guideLanguageReset')}
            </button>
          </>
        )}
      </span>
    </div>
  );
}

export default GuideLanguageSelector;
