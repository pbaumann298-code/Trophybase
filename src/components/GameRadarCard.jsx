import React from 'react';
import { useLocale } from '../context/LocaleContext';
import { RADAR_AXIS_LABELS, resolveRadarProfile } from '../lib/gameOverviewCopy';
import { normalizeLocale } from '../lib/locale';

export { RADAR_AXIS_LABELS };

/**
 * Platin-Anforderungsprofil (6-Achsen-DNA) Radar Chart.
 *
 * @param {Object} props
 * @param {Object|null} props.profile - RadarProfile mit { summary?: string, axes: Array<{ key, label, score, reason }> }
 * @param {boolean} [props.isAdmin] - True für Admins / Preview
 * @param {boolean} [props.embedded=false] - In übergeordneter CollapsibleSectionCard eingebettet
 * @param {string} [props.locale] - Optionale Zielsprache (überschreibt globalLocale)
 */
export default function GameRadarCard({ profile, embedded = false, locale: localeProp = '' }) {
  const { globalLocale, t } = useLocale();
  const langKey = normalizeLocale(localeProp || globalLocale || 'de');

  const resolvedProfile = React.useMemo(
    () => resolveRadarProfile(profile, langKey),
    [profile, langKey],
  );

  // Guard: Wenn noch keine Daten da sind -> unsichtbar
  if (!resolvedProfile || !resolvedProfile.axes || resolvedProfile.axes.length !== 6) {
    return null;
  }

  const heading =
    RADAR_AXIS_LABELS[langKey]?.title ||
    t('radarProfileHeading') ||
    RADAR_AXIS_LABELS.de.title;

  const size = 260;
  const center = size / 2;
  const radius = 90;
  const levels = [2, 4, 6, 8, 10]; // Gestrichelte Ringe

  // Hilfsfunktion: Berechnet X/Y-Koordinaten für Achse i (0-5) und Wert (0-10)
  const getCoordinates = (index, value) => {
    const angle = (Math.PI / 3) * index - Math.PI / 2; // Startet oben bei 12 Uhr
    const r = (value / 10) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  // Punkte für das farbige Daten-Polygon
  const polygonPoints = resolvedProfile.axes
    .map((axis, i) => {
      const { x, y } = getCoordinates(i, axis.score);
      return `${x},${y}`;
    })
    .join(' ');

  const radarBody = (
    <div>
      {resolvedProfile.summary && (
        <p className="mb-4 text-sm text-zinc-400 leading-relaxed">{resolvedProfile.summary}</p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-center">
        {/* Links: SVG Radar Chart */}
        <div className="flex justify-center lg:col-span-5">
          <svg width={size} height={size} className="overflow-visible">
            {/* Hintergrund-Hexagone (Skala 2, 4, 6, 8, 10) */}
            {levels.map((level) => {
              const pts = [0, 1, 2, 3, 4, 5]
                .map((i) => {
                  const { x, y } = getCoordinates(i, level);
                  return `${x},${y}`;
                })
                .join(' ');
              return (
                <polygon
                  key={level}
                  points={pts}
                  fill="none"
                  stroke="#3f3f46"
                  strokeWidth="1"
                  strokeDasharray={level === 10 ? 'none' : '3,3'}
                />
              );
            })}

            {/* Achsen-Linien vom Zentrum nach außen */}
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const { x, y } = getCoordinates(i, 10);
              return (
                <line
                  key={i}
                  x1={center}
                  y1={center}
                  x2={x}
                  y2={y}
                  stroke="#3f3f46"
                  strokeWidth="1"
                />
              );
            })}

            {/* Das eigentliche Spiel-Polygon */}
            <polygon
              points={polygonPoints}
              fill="rgba(56, 189, 248, 0.2)"
              stroke="#38bdf8"
              strokeWidth="2.5"
            />

            {/* Eckpunkte & Labels */}
            {resolvedProfile.axes.map((axis, i) => {
              const dot = getCoordinates(i, axis.score);
              const labelPos = getCoordinates(i, 12.2); // Etwas außerhalb vom Rand
              return (
                <g key={axis.key || i}>
                  <circle cx={dot.x} cy={dot.y} r="4" fill="#38bdf8" />
                  <text
                    x={labelPos.x}
                    y={labelPos.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-zinc-300 text-[11px] font-medium"
                  >
                    {axis.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Rechts: Konkrete Aufschlüsselung & Erklärung */}
        <div className="space-y-3 lg:col-span-7">
          {resolvedProfile.axes.map((axis) => (
            <div
              key={axis.key || axis.label}
              className="rounded-lg bg-zinc-900/60 p-2.5 border border-zinc-800/60"
            >
              <div className={`flex items-center justify-between ${axis.reason ? 'mb-1' : ''}`}>
                <span className="text-xs font-semibold text-zinc-200">
                  {axis.label}
                </span>
                <span className="text-xs font-bold text-sky-400 font-mono">
                  {axis.score} / 10
                </span>
              </div>
              {axis.reason ? (
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {axis.reason}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return (
      <details open className="group mt-6 pt-5 border-t border-zinc-800/80">
        <summary className="mb-3 flex cursor-pointer list-none items-center justify-between gap-2 select-none [&::-webkit-details-marker]:hidden">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-xs sm:text-sm text-zinc-300 font-mono uppercase tracking-wider">
              {heading}
            </h4>
          </div>
          <span
            aria-hidden="true"
            className="text-xs text-zinc-500 transition-transform duration-200 group-open:rotate-180"
          >
            ▼
          </span>
        </summary>
        {radarBody}
      </details>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-950/90 text-zinc-100 shadow-lg p-5">
      <div className="mb-3 flex items-center gap-2">
        <h4 className="font-semibold text-xs sm:text-sm text-zinc-300 font-mono uppercase tracking-wider">
          {heading}
        </h4>
      </div>
      {radarBody}
    </div>
  );
}
