function isProductionTrophyBaseHost() {
  if (typeof window === 'undefined') return false;
  const host = String(window.location.hostname || '').toLowerCase();
  return (
    host === 'trophybase.app' ||
    host === 'www.trophybase.app' ||
    host.endsWith('.trophybase.app')
  );
}

const RAW_MICRO_APPS = [
  {
    id: 'website',
    subdomain: null,
    productionUrl: 'https://trophybase.app/',
    localPath: '/',
    title: 'TrophyBase',
    shortTitle: 'Website',
    subtitle: 'Öffentliche Startseite & Live-Guides',
    iconSrc: '/icons/tb-icon-192.png',
    emoji: '🌐',
    accent: 'border-[#00ff66]/40 bg-[#00ff66]/10 text-[#00ff66]',
    isPublicSite: true,
  },
  {
    id: 'roadmap',
    subdomain: 'bugs',
    productionUrl: 'https://bugs.trophybase.app/',
    localPath: '/admin-apps/roadmap/',
    title: 'TB Bugs & Ideen',
    shortTitle: 'Bugs & Ideen',
    subtitle: 'Schnelleingabe, Screenshots & Roadmap',
    iconSrc: '/icons/apps/roadmap-192.png',
    emoji: '🗺️',
    accent: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  },
  {
    id: 'drafts',
    subdomain: 'drafts',
    productionUrl: 'https://drafts.trophybase.app/',
    localPath: '/admin-apps/drafts/',
    title: 'TB Entwürfe',
    shortTitle: 'Entwürfe',
    subtitle: 'Staging-Queue & Guide-Bearbeitung',
    iconSrc: '/icons/apps/drafts-192.png',
    emoji: '📝',
    accent: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  },
  {
    id: 'workflows',
    subdomain: 'workflows',
    productionUrl: 'https://workflows.trophybase.app/',
    localPath: '/admin-apps/workflows/',
    title: 'TB Workflows',
    shortTitle: 'Workflows',
    subtitle: 'Video-Finder, Skripte & Live-Stats',
    iconSrc: '/icons/apps/workflows-192.png',
    emoji: '⚙️',
    accent: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  },
  {
    id: 'radar',
    subdomain: 'radar',
    productionUrl: 'https://radar.trophybase.app/',
    localPath: '/admin-apps/radar/',
    title: 'TB D-Freigabe',
    shortTitle: 'D-Freigabe',
    subtitle: 'Radar-Spiele prüfen & freigeben',
    iconSrc: '/icons/apps/radar-192.png',
    emoji: '⚡',
    accent: 'border-lime-500/40 bg-lime-500/10 text-lime-300',
  },
  {
    id: 'krankenstation',
    subdomain: 'krankenstation',
    productionUrl: 'https://krankenstation.trophybase.app/',
    localPath: '/admin-apps/krankenstation/',
    title: 'TB Krankenstation',
    shortTitle: 'Klinik',
    subtitle: 'Servertot-Prüfung & Sprach-Audit',
    iconSrc: '/icons/apps/krankenstation-192.png',
    emoji: '🏥',
    accent: 'border-red-500/40 bg-red-500/10 text-red-300',
  },
  {
    id: 'reports',
    subdomain: 'reports',
    productionUrl: 'https://reports.trophybase.app/',
    localPath: '/admin-apps/reports/',
    title: 'TB Reports',
    shortTitle: 'Reports',
    subtitle: 'Community-Fehlermeldungen abarbeiten',
    iconSrc: '/icons/apps/reports-192.png',
    emoji: '⚑',
    accent: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
  },
  {
    id: 'db',
    subdomain: 'db',
    productionUrl: 'https://db.trophybase.app/',
    localPath: '/admin-apps/db/',
    title: 'TB Datenbank',
    shortTitle: 'Datenbank',
    subtitle: 'Spiele-Suche & Wiedervorlage',
    iconSrc: '/icons/apps/db-192.png',
    emoji: '🗄️',
    accent: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
  },
  {
    id: 'creators',
    subdomain: 'creators',
    productionUrl: 'https://creators.trophybase.app/',
    localPath: '/admin-apps/creators/',
    title: 'TB Creator',
    shortTitle: 'Creator',
    subtitle: 'Kanäle, Outreach & Claim-Tokens',
    iconSrc: '/icons/apps/creators-192.png',
    emoji: '🎬',
    accent: 'border-purple-500/40 bg-purple-500/10 text-purple-300',
  },
];

export const MICRO_APPS = RAW_MICRO_APPS.map((item) => ({
  ...item,
  get href() {
    return isProductionTrophyBaseHost() ? item.productionUrl : item.localPath;
  },
}));

export function getMicroAppById(appId) {
  return MICRO_APPS.find((app) => app.id === appId) || null;
}

export function getMicroAppHref(appId) {
  const app = getMicroAppById(appId);
  if (!app) return '/admin-apps/';
  return app.href;
}

export function getHubHref() {
  if (!isProductionTrophyBaseHost()) return '/admin-apps/';
  const host = String(window.location.hostname || '').toLowerCase();
  if (host === 'apps.trophybase.app') return 'https://apps.trophybase.app/';
  return 'https://trophybase.app/admin-apps/';
}

export function getAdminDesktopHref() {
  return isProductionTrophyBaseHost() ? 'https://trophybase.app/admin.html' : '/admin.html';
}
