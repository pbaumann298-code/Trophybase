import { useState } from 'react';
import { useLocale } from '../context/LocaleContext';
import { PLAYER_ARCHETYPES } from '../lib/catalogTaxonomy';

function ArchetypeCover({ item }) {
  const [failed, setFailed] = useState(false);

  if (failed || !item.coverUrl) {
    return (
      <div
        className="home-tile-cover archetype-cover-fallback"
        style={{
          background: `linear-gradient(165deg, ${item.accentColor}73 0%, #121314 68%)`,
        }}
      >
        <span className="archetype-cover-emoji" aria-hidden>
          {item.icon}
        </span>
      </div>
    );
  }

  return (
    <img
      src={item.coverUrl}
      alt=""
      className="home-tile-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Spielertypen als vertikale Cover-Kacheln, gleiche Breite und 3:4-Cover wie GameTile.
 */
export default function EasyPlatinsArchetypeTrack({ counts = {}, selectedId = '', onSelect }) {
  const { t } = useLocale();

  return (
    <div className="archetype-track flex gap-3.5 overflow-x-auto pb-2">
      {PLAYER_ARCHETYPES.map((item) => {
        const count = counts[item.id] || 0;
        const isActive = selectedId === item.id;
        const blocked = count === 0 && !isActive;
        const label = t(item.labelKey);
        return (
          <button
            key={item.id}
            type="button"
            disabled={blocked}
            aria-pressed={isActive}
            onClick={() => onSelect?.(item.id)}
            className={`catalog-tile-shell catalog-tile-shell--carousel archetype-tile w-[9.25rem] sm:w-[10.5rem] flex-shrink-0 snap-start ${
              blocked ? 'is-blocked' : ''
            } ${isActive ? 'is-active' : ''}`}
          >
            <article
              className={`home-tile group h-full w-full ${
                isActive ? 'ring-2 ring-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.35)]' : ''
              }`}
              style={{ '--tile-accent': item.accentColor }}
            >
              <div className="home-tile-cover-wrap aspect-[3/4]">
                <ArchetypeCover item={item} />
                {isActive ? (
                  <span className="archetype-active-flag">✓ Aktiv</span>
                ) : null}
                <span className="archetype-count">{count}</span>
              </div>
              <div className="home-tile-meta">
                <p className="home-tile-title archetype-tile-title" title={label}>
                  {label}
                </p>
              </div>
            </article>
          </button>
        );
      })}
    </div>
  );
}
