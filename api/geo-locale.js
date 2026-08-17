import { countryToLocale } from '../shared/countryLocaleMap.js';

export const config = {
  runtime: 'edge',
};

/**
 * Vercel Edge: liest x-vercel-ip-country und liefert eine Locale-Empfehlung.
 * @param {Request} request
 */
export default function handler(request) {
  const country = String(request.headers.get('x-vercel-ip-country') ?? '').trim().toUpperCase();
  const locale = countryToLocale(country);

  return Response.json(
    {
      country: country || null,
      locale,
      source: country ? 'vercel-geo' : 'unknown',
    },
    {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    },
  );
}
