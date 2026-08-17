import { normalizeLocale } from '../../shared/countryLocaleMap.js';

const GEO_ENDPOINT = '/api/geo-locale';
const GEO_TIMEOUT_MS = 2500;

/**
 * @returns {Promise<string|null>}
 */
export async function fetchGeoLocale() {
  if (typeof fetch === 'undefined') return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEO_TIMEOUT_MS);

  try {
    const response = await fetch(GEO_ENDPOINT, {
      method: 'GET',
      credentials: 'same-origin',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!data?.locale) return null;
    return normalizeLocale(data.locale);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
