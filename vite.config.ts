import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // PWA: installable app shell that works offline. Deliberately caches ONLY
      // static build assets — never API responses, auth tokens, or secrets.
      VitePWA({
        // A new deploy's service worker takes over open pages at once
        // (skipWaiting + clientsClaim). src/appUpdate.ts registers it, checks
        // for new deploys while a page is open, and reloads public pages /
        // shows a reload bar on staff pages once the new version is in.
        registerType: 'autoUpdate',
        injectRegister: false,
        devOptions: { enabled: false },
        includeAssets: ['cpa logo final.svg', 'cpa logo.svg'],
        manifest: {
          name: 'CPA Padel Tournament',
          short_name: 'CPA Padel',
          description: 'Live scoring, courts, standings and the live group draw for CPA Padel Tournament.',
          theme_color: '#0A0A0F',
          background_color: '#070A12',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            { src: '/cpa%20logo%20final.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          ],
        },
        workbox: {
          // Precache ONLY the assets the app actually loads, in the smallest
          // formats. woff2 only: every browser that runs this app supports it,
          // so the duplicate .woff copies (another ~2 MB) are not precached —
          // they stay in the build and are still served if ever requested.
          // Raw .ttf/.otf/.eot font sources and the large decorative JPEG are
          // excluded entirely: they added ~6 MB to first load and no modern
          // browser needs them. The JPEG is fetched on demand via the
          // StaleWhileRevalidate rule below.
          globPatterns: [
            '**/*.{js,css,html,svg,json}',
            'fonts/**/*.woff2',
          ],
          // Never let a service worker intercept API traffic.
          navigateFallbackDenylist: [/^\/api\//, /^\/draw\/admin/],
          // API requests have NO route here, so the service worker never
          // handles them and they go straight to the network (never cached).
          // Do not add a route for /api/: routing the always-open live-events
          // stream through the worker keeps that fetch "in flight", and the
          // browser then never lets a new deploy's worker take over while a
          // page is open.
          runtimeCaching: [
            {
              // Large optional images: serve from cache when offline, but do
              // not block first load downloading them.
              urlPattern: /\.(?:jpg|jpeg|png)$/,
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'cpa-images' },
            },
          ],
          cleanupOutdatedCaches: true,
          // Take over open pages as soon as a new deploy is installed. The
          // plugin only sets this itself when it injects its own register
          // script, and src/appUpdate.ts registers the worker instead.
          skipWaiting: true,
          clientsClaim: true,
          // Do not precache the server bundle or its source map.
          globIgnores: ['server.cjs', 'server.cjs.map'],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || process.cwd(), '.'),
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'lucide-react', 'qrcode'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
