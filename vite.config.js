import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { countryToLocale } from './shared/countryLocaleMap.js';
import { handleSitemapRequest } from './server/sitemap.js';
import { handleGuideRequest } from './server/guidePage.js';
import { parsePrettyGuidePath } from './server/prettyPath.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function sendWebResponse(res, webResponse) {
  res.statusCode = webResponse.status;
  webResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  return webResponse.text().then((body) => {
    res.end(body);
  });
}

/** Dev: /api/geo-locale, /admin, /intranet, Sitemap, Pretty-URL-HTML */
function devApiPlugin(env) {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const host = req.headers.host || 'localhost';
        const url = new URL(req.url ?? '/', `http://${host}`);

        if (url.pathname === '/api/geo-locale') {
          const mockCountry =
            url.searchParams.get('mock_country') ||
            env.VITE_GEO_MOCK_COUNTRY ||
            '';
          const country = String(mockCountry).trim().toUpperCase();
          const locale = country ? countryToLocale(country) : null;

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              country: country || null,
              locale,
              source: country ? 'vite-dev-mock' : 'vite-dev',
            }),
          );
          return;
        }

        if (url.pathname === '/admin' || url.pathname === '/admin/') {
          req.url = '/admin.html';
          next();
          return;
        }

        if (url.pathname === '/intranet' || url.pathname === '/intranet/') {
          req.url = '/intranet.html';
          next();
          return;
        }

        if (url.pathname === '/sitemap.xml' || url.pathname.startsWith('/sitemap-')) {
          try {
            await sendWebResponse(res, await handleSitemapRequest(url));
          } catch (error) {
            res.statusCode = 500;
            res.end(error?.message ?? 'Sitemap-Fehler');
          }
          return;
        }

        if (parsePrettyGuidePath(url.pathname)) {
          try {
            await sendWebResponse(res, await handleGuideRequest(url));
          } catch (error) {
            res.statusCode = 500;
            res.end(error?.message ?? 'Guide-Fehler');
          }
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.VITE_SUPABASE_URL) process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL;
  if (env.VITE_SUPABASE_ANON_KEY) process.env.VITE_SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

  return {
    plugins: [react(), tailwindcss(), devApiPlugin(env)],
    appType: 'spa',
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          admin: resolve(__dirname, 'admin.html'),
          intranet: resolve(__dirname, 'intranet.html'),
        },
      },
    },
  };
});
