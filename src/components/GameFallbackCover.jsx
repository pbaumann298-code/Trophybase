import { useState } from 'react';
import { useLocale } from '../context/LocaleContext';
import Reportable from './Reportable';

const FALLBACK_SRC = '/images/fallback-cover.jpeg';

/**
 * Spiel-Cover. Fehlt die URL oder antwortet der Link mit einem Fehler,
 * liegt das TrophyBase-Motiv mit Spieltitel im freien unteren Drittel darüber.
 * `failedSrc` merkt die konkrete URL, damit ein neues Cover sofort wieder erscheint.
 */
function GameFallbackCover({
  src,
  title = '',
  alt = '',
  variant = 'card',
  imgClassName = '',
  className = '',
  onClick,
  titleAttr,
  loading = 'lazy',
  reportableProps = null,
}) {
  const { t } = useLocale();
  const [failedSrc, setFailedSrc] = useState('');
  const trimmed = String(src ?? '').trim();
  const showFallback = !trimmed || failedSrc === trimmed;
  const frameClass = className || imgClassName;

  const image = showFallback ? (
    <div
      className={`relative overflow-hidden select-none bg-[#070b09] [container-type:inline-size] ${frameClass}`.trim()}
      onClick={onClick}
      title={titleAttr || undefined}
    >
      <img
        src={FALLBACK_SRC}
        alt={alt}
        loading={loading}
        draggable={false}
        className={`absolute inset-0 h-full w-full object-cover ${className ? imgClassName : ''}`.trim()}
      />
      {variant !== 'thumb' ? (
        <div className="pointer-events-none absolute inset-x-0 top-[67%] bottom-[11%] flex flex-col items-center justify-center px-[12%] text-center">
          {title ? (
            <p className="line-clamp-2 break-words bg-gradient-to-b from-white via-zinc-100 to-zinc-400 bg-clip-text font-extrabold uppercase leading-[1.15] tracking-wide text-transparent drop-shadow-[0_2px_8px_rgba(0,255,102,0.28)] text-[clamp(0.55rem,8.2cqw,1.35rem)]">
              {title}
            </p>
          ) : null}
          <p className="mt-[2.5cqw] line-clamp-1 font-mono font-semibold uppercase leading-tight tracking-[0.12em] text-[#86efac]/85 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] text-[clamp(0.42rem,4.6cqw,0.72rem)]">
            {t('noCoverFound')}
          </p>
        </div>
      ) : null}
    </div>
  ) : (
    <img
      src={trimmed}
      alt={alt}
      loading={loading}
      draggable={false}
      title={titleAttr || undefined}
      onClick={onClick}
      onError={() => setFailedSrc(trimmed)}
      className={imgClassName}
    />
  );

  if (!reportableProps?.source || !reportableProps?.field) return image;

  return (
    <Reportable
      as="span"
      source={reportableProps.source}
      type={reportableProps.type}
      reportKey={reportableProps.reportKey}
      field={reportableProps.field}
      className="contents"
      style={{ display: 'contents' }}
    >
      {image}
    </Reportable>
  );
}

export default GameFallbackCover;
