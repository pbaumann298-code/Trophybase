import { SUPPORTED_LOCALES } from '../../shared/countryLocaleMap.js';
import { hardwareToUrlSegment, buildPrettyGamePath } from './gameSlug';

export async function ensureGameSlug(supabase, gameUuid) {
  const { data, error } = await supabase.rpc('tb_ensure_game_slug', { p_id: gameUuid });
  if (error) return { slug: null, error };
  const slug = String(data ?? '').trim();
  return { slug: slug || null, error: null };
}

export async function warmPublishedGuidePages({ origin, hardware, slug }) {
  const hw = hardwareToUrlSegment(hardware);
  const base = String(origin || (typeof window !== 'undefined' ? window.location.origin : '')).replace(
    /\/$/,
    '',
  );
  if (!hw || !slug || !base) return;

  await Promise.all(
    SUPPORTED_LOCALES.map((locale) => {
      const path = buildPrettyGamePath(locale, hw, slug);
      return path ? fetch(`${base}${path}`, { method: 'GET', cache: 'reload' }).catch(() => {}) : null;
    }),
  );
}
