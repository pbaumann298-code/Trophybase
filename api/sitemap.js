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
  if (req?.url && typeof req.url === 'string' && req.url.startsWith('http')) {
    return new URL(req.url);
  }
  const host = req?.headers?.host || 'trophybase.app';
  const path = req?.url || '/sitemap.xml';
  return new URL(path, `https://${host}`);
}

async function send(res, response) {
  if (!res || typeof res.end !== 'function') return response;
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.end(await response.text());
}
