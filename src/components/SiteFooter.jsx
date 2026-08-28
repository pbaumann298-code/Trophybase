import React from 'react';
import { TRADEMARK_DISCLAIMER } from '../lib/legalConfig';
import { useLocale } from '../context/LocaleContext';

function SiteFooter({ dbOk, onOpenImpressum, onOpenPrivacy }) {
  const { t } = useLocale();

  return (
    <footer className="w-full max-w-full min-w-0 overflow-x-hidden bg-[#1a1b1c] border-t border-t-zinc-800/80 px-4 sm:px-6 md:px-8 py-6 flex flex-col gap-4 text-xs text-zinc-500">
      <p className="text-[11px] leading-relaxed text-zinc-500 max-w-4xl">
        {TRADEMARK_DISCLAIMER}
      </p>
      <p className="text-[11px] leading-relaxed text-zinc-600 max-w-4xl">
        {t('fairUseNote')}
      </p>
      <div className="flex flex-col sm:flex-row flex-wrap justify-between items-start sm:items-center gap-4">
        <nav className="flex flex-wrap gap-4 sm:gap-6 min-w-0" aria-label="Rechtliches">
          <a
            href="/impressum"
            className="hover:text-zinc-300 transition"
            onClick={(e) => {
              e.preventDefault();
              onOpenImpressum();
            }}
          >
            {t('impressum')}
          </a>
          <a
            href="/datenschutz"
            className="hover:text-zinc-300 transition"
            onClick={(e) => {
              e.preventDefault();
              onOpenPrivacy();
            }}
          >
            {t('privacy')}
          </a>
        </nav>
        <div className="flex items-center gap-2 font-mono text-[11px] min-w-0 max-w-full">
          <span
            className={`w-2 h-2 flex-shrink-0 rounded-full ${
              dbOk === true
                ? 'bg-[#00ff66] shadow-[0_0_8px_#00ff66]'
                : dbOk === false
                  ? 'bg-red-500'
                  : 'bg-zinc-600'
            }`}
          />
          <span className="truncate">
            {t('dbLabel')}: {dbOk === null ? '…' : dbOk ? t('dbConnected') : t('dbFailed')}
          </span>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
