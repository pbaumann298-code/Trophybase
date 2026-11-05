import { getLocalizedHomeTagItems } from '../lib/homeTagDefs';
import { buildAdvancedSearchPath, navigateToAdvancedSearch } from '../lib/routeUtils';
import { extractSearchableStudioRoot } from '../lib/studioCredits';

const LINK_CLASS = 'hover:text-[#00ff66] hover:underline transition cursor-pointer';

function openAdvancedSearch(event, filters) {
  event.preventDefault();
  event.stopPropagation();
  navigateToAdvancedSearch(filters, { excludeQuickwins: false });
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Studio- oder Publisher-Name. Sichtbar bleibt der Originalname, gesucht wird der Dachmarken-Kern. */
export function DeveloperSearchLink({ name, className = LINK_CLASS, children = null }) {
  const root = extractSearchableStudioRoot(name);
  const label = children ?? name;
  if (!root) return label || null;
  return (
    <a
      href={buildAdvancedSearchPath({ developer: root }, 1, false)}
      className={className}
      onClick={(event) => openAdvancedSearch(event, { developer: root })}
    >
      {label}
    </a>
  );
}

/** home_tags als Links auf /suche?tag=…, getrennt durch „ · “. */
export function HomeTagSearchLinks({ tags, locale = 'de', className = LINK_CLASS, fallback = null }) {
  const items = getLocalizedHomeTagItems(tags, locale);
  if (items.length === 0) return fallback;
  return items.map((item, index) => (
    <span key={item.slug}>
      {index > 0 ? ' · ' : null}
      <a
        href={buildAdvancedSearchPath({ tag: item.slug }, 1, false)}
        className={className}
        onClick={(event) => openAdvancedSearch(event, { tag: item.slug })}
      >
        {item.label}
      </a>
    </span>
  ));
}
