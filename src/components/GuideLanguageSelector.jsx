import React from 'react';
import { useLocale } from '../context/LocaleContext';
import { localeOptions } from '../lib/uiStrings';
import { resolveGuideLanguage } from '../lib/localeResolver';

function GuideLanguageSelector({
  guideLanguageOverride,
  onGuideLanguageOverride,
  className = '',
}) {
  const { globalLocale, t } = useLocale();
  const options = localeOptions();
  const effective = resolveGuideLanguage(globalLocale, guideLanguageOverride);

  return (
    <div
      className={`flex flex-wrap items-center gap-2 sm:gap-3 rounded-xl border border-zinc-800/80 bg-[#121314]/90 px-3 py-2.5 mb-4 ${className}`}
    >
      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 flex-shrink-0">
        {t('guideLanguage')}
      </span>

      <div className="flex flex-wrap items-center gap-1.5">
        {options.map((opt) => {
          const isActive = effective === opt.code;
          const isOverride = guideLanguageOverride === opt.code;
          return (
            <button
              key={opt.code}
              type="button"
              title={opt.label}
              onClick={() => {
                if (opt.code === globalLocale) {
                  onGuideLanguageOverride(null);
                  return;
                }
                onGuideLanguageOverride(isOverride && opt.code !== globalLocale ? null : opt.code);
              }}
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition ${
                isActive
                  ? 'border-[#00ff66]/40 bg-[#00ff66]/10 text-[#00ff66]'
                  : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
              }`}
            >
              <span aria-hidden>{opt.flag}</span>
              <span className="font-mono text-[10px]">{opt.short}</span>
            </button>
          );
        })}
      </div>

      <span className="text-[10px] font-mono text-zinc-600 ml-auto">
        {t('guideLanguageHint')}: {globalLocale.toUpperCase()}
        {guideLanguageOverride && (
          <>
            {' · '}
            <button
              type="button"
              onClick={() => onGuideLanguageOverride(null)}
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
