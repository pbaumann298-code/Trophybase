import { trophyTypeIcon, TROPHY_TYPE } from '../lib/trophyTypes';
import { useLocale } from '../context/LocaleContext';

/**
 * Kleiner Platin-Pokal (unten links auf dem Cover), sobald die Platin abgehakt / verdient ist.
 */
function PlatinumUnlockedBadge({ visible = false, size = 'md' }) {
  const { t } = useLocale();
  if (!visible) return null;

  const src = trophyTypeIcon(TROPHY_TYPE.PLATINUM);
  if (!src) return null;

  const iconPx = size === 'sm' ? 26 : 34;

  return (
    <div
      className={`platinum-unlocked-badge platinum-unlocked-badge--${size}`}
      role="status"
      aria-label={t('platinumUnlocked')}
      title={t('platinumUnlocked')}
    >
      <img
        src={src}
        alt=""
        width={iconPx}
        height={iconPx}
        draggable={false}
        className="platinum-unlocked-badge__icon"
      />
    </div>
  );
}

export default PlatinumUnlockedBadge;
