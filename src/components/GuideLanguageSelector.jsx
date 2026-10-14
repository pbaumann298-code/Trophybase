import { useLocale } from '../context/LocaleContext';
import { localeOptions } from '../lib/uiStrings';
import { resolveGuideLanguage } from '../lib/localeResolver';

function GuideLanguageSelector({
  guideLanguageOverride,
  onGuideLanguageOverride,
  locales,
  className = '',
}) {
  const { globalLocale, t } = useLocale();
  const options = localeOptions(locales ?? [globalLocale]);
  const effective = resolveGuideLanguage(globalLocale, guideLanguageOverride);
  const value = options.some((opt) => opt.code === effective) ? effective : options[0]?.code ?? '';

  if (options.length < 2) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-2 sm:gap-3 rounded-xl border border-zinc-800/80 bg-[#121314]/90 px-3 py-2.5 mb-4 ${className}`}
    >
      <label className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
        {t('guideLanguage')}
        <select
          value={value}
          aria-label={t('guideLanguage')}
          onChange={(event) => {
            const code = event.target.value;
            onGuideLanguageOverride(code === globalLocale ? null : code);
          }}
          className="rounded-lg border border-zinc-700 bg-[#121314] px-2 py-1 text-xs font-sans normal-case tracking-normal text-zinc-200"
        >
          {options.map((opt) => (
            <option key={opt.code} value={opt.code}>
              {opt.flag} {opt.label}
            </option>
          ))}
        </select>
      </label>

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
