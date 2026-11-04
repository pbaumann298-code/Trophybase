import { getGameCover } from '../lib/gameModel';
import { useLocale } from '../context/LocaleContext';
import { formatQuickwinCount } from './QuickwinGameCard';

const PUBLISHER_ACCENTS = ['#00ff66', '#38bdf8', '#a855f7', '#f59e0b', '#ec4899', '#14b8a6'];

function publisherAccent(label) {
  const value = String(label ?? '');
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return PUBLISHER_ACCENTS[hash % PUBLISHER_ACCENTS.length];
}

/** 1–2 Initialen: zwei Wörter → je der erste Buchstabe, CamelCase → die Großbuchstaben, sonst die ersten zwei. */
export function publisherInitials(label) {
  const raw = String(label ?? '').trim();
  if (!raw) return '•';
  const words = raw.split(/[\s._&+/]+/).filter(Boolean);
  const firstChar = (word) => word.match(/\p{L}|\p{N}/u)?.[0] || '';
  if (words.length >= 2) {
    const initials = `${firstChar(words[0])}${firstChar(words[1])}`.toUpperCase();
    if (initials) return initials;
  }
  const camel = raw.match(/^(\p{L}).*?(\p{Lu})/u);
  if (camel && camel[2].toUpperCase() !== camel[1].toUpperCase()) {
    return `${camel[1]}${camel[2]}`.toUpperCase();
  }
  const letters = raw.match(/\p{L}|\p{N}/gu) || [];
  if (letters.length >= 2) return `${letters[0]}${letters[1]}`.toUpperCase();
  if (letters.length === 1) return letters[0].toUpperCase();
  return raw.slice(0, 2).toUpperCase();
}

function coverUrls(games, locale) {
  const urls = [];
  for (const game of games || []) {
    const url = String(getGameCover(game, locale) || '').trim();
    if (!url || urls.includes(url)) continue;
    urls.push(url);
    if (urls.length === 4) break;
  }
  return urls;
}

/**
 * 3:4-Publisher-Kachel. Das Cover ist ein TrophyBase-Monogramm über einem
 * abgedunkelten Spiele-Mosaik, ohne Publisher-Logo.
 */
export default function PublisherTile({ group, selected = false, onSelect }) {
  const { t, globalLocale } = useLocale();
  const label = group?.label || '';
  const accent = publisherAccent(label);
  const initials = publisherInitials(label);
  const covers = coverUrls(group?.games, globalLocale);
  const countLabel = formatQuickwinCount(
    group?.games?.length || 0,
    t('quickwinsGameCountOne'),
    t('quickwinsGameCount'),
  );

  return (
    <button
      type="button"
      className={`publisher-tile home-tile group h-full${selected ? ' is-selected' : ''}`}
      style={{ '--tile-accent': accent }}
      aria-pressed={selected}
      aria-expanded={selected}
      onClick={onSelect}
    >
      <div className="home-tile-cover-wrap">
        {covers.length > 0 ? (
          <div
            className={
              covers.length === 1
                ? 'absolute inset-0'
                : 'absolute inset-0 grid grid-cols-2 grid-rows-2'
            }
            aria-hidden
          >
            {covers.map((url) => (
              <img
                key={url}
                src={url}
                alt=""
                className="w-full h-full object-cover opacity-25 scale-105 group-hover:scale-110 transition-transform duration-500"
              />
            ))}
          </div>
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0e0f10] via-[#121314]/80 to-[#121314]/60" />
        <span className="absolute top-2 right-2 z-20 bg-black/75 border border-zinc-700/80 text-[#00ff66] font-mono text-[10px] font-bold px-2 py-0.5 rounded-full">
          ⚡ {group?.games?.length || 0}
        </span>
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 px-2">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-2xl border bg-black/45 text-lg font-black tracking-wide"
            style={{ borderColor: accent, color: accent }}
          >
            {initials}
          </span>
          <span className="text-xs sm:text-sm font-extrabold text-white text-center px-2 line-clamp-2">
            {label}
          </span>
        </div>
      </div>
      <div className="home-tile-meta">
        <p className="home-tile-title">{label}</p>
        <span className="home-tile-badge">{countLabel}</span>
      </div>
    </button>
  );
}
