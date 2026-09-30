import { useState } from 'react';
import Reportable from './Reportable';
import { normalizeTrophyType, trophyTypeIcon, trophyTypeLabel } from '../lib/trophyTypes';

/**
 * Das Trophäenbild aus game_achievements.icon_url.
 *
 * Die Bilder liegen auf Sonys CDN. Verschwindet ein Spiel dort, liefert der
 * Link 404 – dann springt das Stufen-Icon ein, damit die Zeile nicht mit einem
 * kaputten Bild dasteht.
 */
function TrophyArtwork({
  trophy,
  gameId = '',
  reportKey = '',
  size = 48,
  reportable = false,
  className = '',
  title,
}) {
  // Die gescheiterte URL merken, nicht nur ein Flag: so wird beim Spiel- oder
  // Sprachwechsel automatisch wieder das neue Original versucht.
  const [failedSrc, setFailedSrc] = useState('');
  const artwork = String(trophy?.icon_url ?? '').trim();

  const type = normalizeTrophyType(trophy?.trophy_type);
  const fallback = trophyTypeIcon(type);
  const useFallback = !artwork || failedSrc === artwork;
  const src = useFallback ? fallback : artwork;
  if (!src) return null;

  const label = trophyTypeLabel(type);
  const name = String(trophy?.trophy_name ?? '').trim();
  const alt = [name, label && `${label}-Trophäe`].filter(Boolean).join(' – ') || 'Trophäe';

  // Sonys Artwork ist quadratisch und randlos, das Stufen-Icon braucht Luft.
  const fit = useFallback ? 'object-contain p-0.5' : 'object-cover';
  const shared = {
    src,
    width: size,
    height: size,
    style: { width: size, height: size },
    className: `flex-shrink-0 ${fit} ${className}`.trim(),
    onError: useFallback ? undefined : () => setFailedSrc(artwork),
    loading: 'lazy',
    draggable: false,
  };

  if (!reportable) {
    return <img {...shared} alt={alt} title={title ?? alt} />;
  }

  return (
    <Reportable
      as="img"
      source={gameId}
      type="trophy"
      reportKey={reportKey}
      field="icon_url"
      {...shared}
      alt={alt}
    />
  );
}

export default TrophyArtwork;
