import React from 'react';
import { useMediaConsent } from '../context/MediaConsentContext';
import { useLocale } from '../context/LocaleContext';

function MediaConsentBanner({ onOpenPrivacy }) {
  const { decided, allowYoutube, declineOptional } = useMediaConsent();
  const { t } = useLocale();

  if (decided) return null;

  return (
    <div
      className="w-full sticky bottom-0 z-40 bg-[#161718] border-t border-zinc-800 px-4 sm:px-6 md:px-8 py-3 text-xs text-zinc-400"
      role="dialog"
      aria-label={t('consentTitle')}
    >
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="flex-1 min-w-0 leading-relaxed">{t('consentBody')}</p>
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={allowYoutube}
            className="px-3 py-1.5 rounded-lg bg-[#00ff66] text-black font-semibold hover:bg-[#00e65c] transition"
          >
            {t('consentAllowYoutube')}
          </button>
          <button
            type="button"
            onClick={declineOptional}
            className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition"
          >
            {t('consentNecessary')}
          </button>
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="px-3 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 underline-offset-2 hover:underline transition bg-transparent border-none cursor-pointer"
          >
            {t('privacy')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default MediaConsentBanner;
