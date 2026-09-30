import { normalizeTrophyType, trophyTypeIcon, trophyTypeLabel } from '../lib/trophyTypes';

/**
 * Abzeichen der Trophäenstufe (Bronze / Silber / Gold / Platin).
 * Ersetzt die frühere Textmarke, die den Rohwert aus der Pipeline zeigte.
 */
function TrophyTypeIcon({ type, size = 18, className = '', title }) {
  const normalized = normalizeTrophyType(type);
  if (!normalized) return null;

  const label = trophyTypeLabel(normalized);

  return (
    <img
      src={trophyTypeIcon(normalized)}
      width={size}
      height={size}
      alt={label}
      title={title ?? `${label}-Trophäe`}
      draggable={false}
      loading="lazy"
      className={`inline-block flex-shrink-0 object-contain ${className}`.trim()}
      style={{ width: size, height: size }}
    />
  );
}

export default TrophyTypeIcon;
