import { trophyTypeIcon, TROPHY_TYPE } from '../lib/trophyTypes';
import { useLocale } from '../context/LocaleContext';

/**
 * Kleiner Platin-Pokal unten links, sobald die Platin abgehakt / verdient ist.
 */
function PlatinumUnlockedBadge({ visible = false }) {
  const { t } = useLocale();
  if (!visible) return null;

  const src = trophyTypeIcon(TROPHY_TYPE.PLATINUM);
  if (!src) return null;

  return (
    <div
      className="platinum-unlocked-badge"
      role="status"
      aria-label={t('platinumUnlocked')}
      title={t('platinumUnlocked')}
    >
      <img
        src={src}
        alt=""
        width={40}
        height={40}
        draggable={false}
        className="platinum-unlocked-badge__icon"
      />
    </div>
  );
}

export default PlatinumUnlockedBadge;
