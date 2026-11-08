import {
  isEasyPlatinGame,
  isQuickwinStyleType,
  isServerDeadType,
} from './gameSchema.js';

/**
 * Eine Weiche für die Guide-Seite und die Hub-Kachel.
 * Die Typ-Helfer lesen `spiel_typ` über `parseGameTypes`
 * (String, Komma-Liste oder JSON-Array).
 *
 * @param {object|null|undefined} game
 * @param {{ variant?: 'page'|'inline', isAdmin?: boolean }} [options]
 * `variant` ist `page` (GameDetailPage) oder `inline` (QuickwinGameCard).
 * `isAdmin` gehört zur Signatur, die Weiche hängt aber nur am Spieltyp.
 */
export function getGameViewPolicy(game, { variant = 'page', isAdmin = false } = {}) {
  void isAdmin;
  const view = variant === 'inline' ? 'inline' : 'page';
  const isQuickwin = isQuickwinStyleType(game?.spiel_typ);
  const isEasyPlatin = isEasyPlatinGame(game);
  const isServerDead = isServerDeadType(game?.spiel_typ);
  const isHubType = isQuickwin || isEasyPlatin || isServerDead;

  return {
    isQuickwin,
    isEasyPlatin,
    isServerDead,
    isHubType,
    /** Hubs: Beschreibung und guide_tip fallen auf DE/EN zurück. */
    useTextFallback: isHubType,
    showServerDeadNotice: isServerDead,
    showOverview: !isQuickwin && !isServerDead && (view === 'page' || Boolean(game?.radar_profile)),
    showNewerVersionsTab: isServerDead,
    collectiblesTabLabelKey: (isServerDead || isEasyPlatin) ? 'collectGuide' : 'completion',
    allowFullPageLink: view === 'inline',
  };
}

const TAB_META = {
  reiter0: { icon: '🏆', labelKey: 'trophies' },
  reiter1: { icon: '📖', labelKey: 'fullGameplay' },
  reiter2: { icon: '📦', labelKey: 'completion' },
  reiter3: { icon: '⚔️', labelKey: 'bosses' },
  reiter4: { icon: '↗', labelKey: 'newerVersions' },
};

const PAGE_TAB_ORDER = ['reiter0', 'reiter1', 'reiter2', 'reiter3', 'reiter4'];
const INLINE_TAB_ORDER = ['reiter0', 'reiter1', 'reiter2', 'reiter4', 'reiter3'];

/**
 * Sichtbare Guide-Reiter in der Reihenfolge der jeweiligen Ansicht.
 * Die Seite braucht die Liste vor dem Rendern (Wischgeste, Scroll-Memory).
 * @param {object} args
 * @param {'page'|'inline'} [args.variant]
 * @param {ReturnType<typeof getGameViewPolicy>} [args.policy]
 * @param {(key: string) => string} args.t
 * @param {Record<string, number>} [args.counts]
 * @param {boolean} [args.loading]
 * @param {boolean} [args.canSeeGuides]
 */
export function buildGuideWorkspaceTabs({
  variant = 'page',
  policy,
  t,
  counts = {},
  loading = false,
  canSeeGuides = true,
}) {
  const order = variant === 'inline' ? INLINE_TAB_ORDER : PAGE_TAB_ORDER;
  const collectiblesKey = policy?.collectiblesTabLabelKey || TAB_META.reiter2.labelKey;
  const visible = order.filter((id) => {
    if (id === 'reiter0') return true;
    if (id === 'reiter4') {
      return Boolean(policy?.showNewerVersionsTab) && !loading && (counts.reiter4 ?? 0) > 0;
    }
    const count = counts[id] ?? 0;
    if (variant === 'inline') {
      if (id === 'reiter1') return loading || count > 0;
      return !loading && count > 0;
    }
    return canSeeGuides && (loading || count > 0);
  });

  return visible.map((id) => ({
    id,
    icon: TAB_META[id].icon,
    label: id === 'reiter2' ? t(collectiblesKey) : t(TAB_META[id].labelKey),
    count: counts[id] ?? 0,
  }));
}
