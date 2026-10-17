/**
 * Social-Login-Provider für später (Google / Discord Pflicht).
 *
 * Supabase liefert dem Browser **keine** Liste der im Dashboard aktivierten
 * Provider. Daher:
 *   1. Provider in Supabase → Authentication → Providers einschalten
 *   2. Optional per Env steuern, welche Buttons die UI zeigt
 *   3. signInWithOAuth nur für konfigurierte Provider aufrufen
 *
 * Env (Vite), kommagetrennt, z. B.:
 *   VITE_AUTH_PROVIDERS=google,discord
 *   VITE_AUTH_PROVIDERS=google,discord,github,apple
 */

/** @typedef {'google'|'discord'|'github'|'apple'|'facebook'|'twitter'|'slack'|'spotify'|'twitch'|'linkedin_oidc'} OAuthProviderId */

/** Pflicht für den Launch. */
export const REQUIRED_OAUTH_PROVIDERS = /** @type {const} */ (['google', 'discord']);

/** Weitere Provider, die Supabase unterstützt und wir optional anbieten können. */
export const OPTIONAL_OAUTH_PROVIDERS = /** @type {const} */ ([
  'github',
  'apple',
  'facebook',
  'twitter',
  'slack',
  'spotify',
  'twitch',
  'linkedin_oidc',
]);

export const ALL_KNOWN_OAUTH_PROVIDERS = [
  ...REQUIRED_OAUTH_PROVIDERS,
  ...OPTIONAL_OAUTH_PROVIDERS,
];

const LABEL_BY_PROVIDER = {
  google: 'Google',
  discord: 'Discord',
  github: 'GitHub',
  apple: 'Apple',
  facebook: 'Facebook',
  twitter: 'X / Twitter',
  slack: 'Slack',
  spotify: 'Spotify',
  twitch: 'Twitch',
  linkedin_oidc: 'LinkedIn',
};

function parseEnvProviders() {
  const raw = String(import.meta.env?.VITE_AUTH_PROVIDERS ?? '').trim();
  if (!raw) return null;
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Provider, für die die UI Buttons zeigen soll.
 * Ohne Env → nur Google + Discord (Pflichtset).
 * @returns {OAuthProviderId[]}
 */
export function getConfiguredOAuthProviders() {
  const fromEnv = parseEnvProviders();
  const list = fromEnv?.length ? fromEnv : [...REQUIRED_OAUTH_PROVIDERS];
  const known = new Set(ALL_KNOWN_OAUTH_PROVIDERS);
  const unique = [];
  for (const id of list) {
    if (!known.has(id) || unique.includes(id)) continue;
    unique.push(/** @type {OAuthProviderId} */ (id));
  }
  // Pflicht immer dabei, auch wenn Env sie weglässt
  for (const required of REQUIRED_OAUTH_PROVIDERS) {
    if (!unique.includes(required)) unique.unshift(required);
  }
  return unique;
}

export function oauthProviderLabel(provider) {
  return LABEL_BY_PROVIDER[provider] || String(provider ?? '');
}

/**
 * Redirect-Ziel nach OAuth (Route später anlegen: /auth/callback).
 * @param {string} [path]
 */
export function getOAuthRedirectTo(path = '/auth/callback') {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

/**
 * Social-Login starten (wenn Provider in Supabase aktiviert ist).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {OAuthProviderId} provider
 * @param {{ redirectTo?: string }} [options]
 */
export async function signInWithOAuthProvider(supabase, provider, options = {}) {
  const redirectTo = options.redirectTo || getOAuthRedirectTo();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  });
  return { data, error };
}
