import { handleSitemapRequest } from '../server/sitemap.js';

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req, res) {
  const url = toUrl(req);
  const response = await handleSitemapRequest(url);
  return send(res, response);
}

function toUrl(req) {
  let url;
  if (req?.url && typeof req.url === 'string' && req.url.startsWith('http')) {
    url = new URL(req.url);
  } else {
    const host = req?.headers?.host || 'trophybase.app';
    const path = req?.url || '/sitemap.xml';
    url = new URL(path, `https://${host}`);
  }

  // Vercel-Rewrite für /sitemap-de.xml → /api/sitemap?locale=de
  if (req.query?.locale && !url.searchParams.has('locale')) {
    url.searchParams.set('locale', String(req.query.locale));
  }

  return url;
}

async function send(res, response) {
  if (!res || typeof res.end !== 'function') return response;
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.end(await response.text());
}
