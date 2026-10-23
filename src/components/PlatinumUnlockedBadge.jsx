import { trophyTypeIcon, TROPHY_TYPE } from '../lib/trophyTypes';
import { useLocale } from '../context/LocaleContext';

/**
 * Platin-Pokal (unten links auf dem Cover).
 * Active = leuchtend Blau/Gold hervorgehoben (Platin erspielt / Abgeschlossen / 100%).
 * Inactive = subtil / gedimmt unten links auf dem Cover.
 */
function PlatinumUnlockedBadge({ active = false, visible = true, size = 'md' }) {
  const { t } = useLocale();
  if (!visible) return null;

  const src = trophyTypeIcon(TROPHY_TYPE.PLATINUM);
  if (!src) return null;

  const iconPx = size === 'sm' ? 22 : 28;

  return (
    <div
      className={`platinum-unlocked-badge platinum-unlocked-badge--${size} ${
        active ? 'platinum-unlocked-badge--active' : 'platinum-unlocked-badge--inactive'
      }`}
      role="status"
      aria-label={active ? t('platinumUnlocked') : t('platinized')}
      title={active ? t('platinumUnlocked') : t('platinized')}
    >
      <span
        className={`home-tile-overlay-chip pointer-events-none transition-all duration-300 ${
          active
            ? 'home-tile-overlay-chip--platinum-active'
            : 'home-tile-overlay-chip--platinum-inactive'
        }`}
      >
        <img
          src={src}
          alt=""
          width={iconPx}
          height={iconPx}
          draggable={false}
          className={`platinum-unlocked-badge__icon ${
            active ? 'filter drop-shadow-[0_0_6px_rgba(234,179,8,0.9)]' : 'opacity-40 grayscale'
          }`}
        />
      </span>
    </div>
  );
}

export default PlatinumUnlockedBadge;
