import React from 'react';
import { useLocale } from '../context/LocaleContext';

function YoutubeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M23.5 6.2a3.1 3.1 0 0 0-2.2-2.2C19.4 3.5 12 3.5 12 3.5s-7.4 0-9.3.5A3.1 3.1 0 0 0 .5 6.2 32.6 32.6 0 0 0 0 12a32.6 32.6 0 0 0 .5 5.8 3.1 3.1 0 0 0 2.2 2.2c1.9.5 9.3.5 9.3.5s7.4 0 9.3-.5a3.1 3.1 0 0 0 2.2-2.2A32.6 32.6 0 0 0 24 12a32.6 32.6 0 0 0-.5-5.8zM9.8 15.5v-7L16 12l-6.2 3.5z"
      />
    </svg>
  );
}

function GameSeoInfobox({ title, description, creator = null, creators = null }) {
  const { globalLocale, t } = useLocale();
  const text = typeof description === 'string' ? description.trim() : '';
  const list = (Array.isArray(creators) ? creators : [creator]).filter(Boolean);
  const names = [...new Set(list.map((item) => String(item.channelName ?? '').trim()).filter(Boolean))];
  const withYoutube = list.filter((item) => String(item.youtubeUrl ?? '').trim());
  const andWord = globalLocale === 'es' ? 'y' : globalLocale === 'de' ? 'und' : 'and';
  const nameLabel =
    names.length <= 1
      ? names[0] || ''
      : names.length === 2
        ? `${names[0]} ${andWord} ${names[1]}`
        : `${names.slice(0, -1).join(', ')} ${andWord} ${names[names.length - 1]}`;
  const credit = nameLabel ? t('creatorCredit').replaceAll('{name}', nameLabel) : '';

  if (!text && !credit && withYoutube.length === 0) return null;

  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <section
      className="relative mb-8 overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#1a1b1c] via-[#161718] to-[#121314] p-6 md:p-8 shadow-xl"
      aria-label="Spielbeschreibung"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(-45deg, transparent, transparent 8px, #00ff66 8px, #00ff66 9px)',
        }}
      />
      <div className="pointer-events-none absolute -left-24 -top-24 h-48 w-48 rounded-full bg-[#00ff66]/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -right-16 h-40 w-40 rounded-full bg-emerald-500/5 blur-3xl" />

      <div className="relative border-l-2 border-[#00ff66]/40 pl-5 md:pl-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded border border-[#00ff66]/20 bg-[#00ff66]/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#00ff66]">
            <span aria-hidden="true">◆</span> Guide-Info
          </span>
          {title && (
            <h3 className="text-sm font-bold tracking-tight text-zinc-200 md:text-base">
              {title}
            </h3>
          )}
        </div>

        {paragraphs.length > 0 && (
          <div className="space-y-3 text-sm leading-relaxed text-zinc-300 md:text-[15px]">
            {paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        )}

        {(credit || withYoutube.length > 0) && (
          <div className={`${paragraphs.length > 0 ? 'mt-5 pt-5 border-t border-zinc-800/80' : ''} space-y-3`}>
            {credit ? (
              <p className="text-sm leading-relaxed text-red-400/90">{credit}</p>
            ) : null}
            {withYoutube.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {withYoutube.map((item) => (
                  <a
                    key={item.id || item.youtubeUrl}
                    href={item.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-[#ff0000] hover:bg-[#e00000] text-white text-xs font-bold uppercase tracking-wider px-4 py-2.5 transition"
                  >
                    <YoutubeIcon />
                    {t('creatorYoutube')}
                    {item.channelName ? (
                      <span className="normal-case tracking-normal font-semibold opacity-95">
                        {item.channelName}
                      </span>
                    ) : null}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

export default GameSeoInfobox;
