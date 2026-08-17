import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { countryToLocale } from './shared/countryLocaleMap.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Dev: /api/geo-locale (Vercel-Edge-Äquivalent) + /admin → admin.html */
function devApiPlugin(env) {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');

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
        }

        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
  plugins: [react(), devApiPlugin(env)],
  appType: 'spa',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
  };
});
