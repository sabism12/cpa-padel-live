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
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        devOptions: { enabled: false },
        includeAssets: ['cpa logo final.svg', 'cpa logo.svg'],
        manifest: {
          name: 'CPA Padel Tournament',
          short_name: 'CPA Padel',
          description: 'Live scoring, courts, standings and the live group draw for CPA Padel Tournament.',
          theme_color: '#170036',
          background_color: '#070A12',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            { src: '/cpa%20logo%20final.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff,woff2,ttf,otf,eot}'],
          // Never let a service worker intercept API traffic.
          navigateFallbackDenylist: [/^\/api\//, /^\/draw\/admin/],
          runtimeCaching: [
            {
              // Network-only for every API call: no caching of live data or tokens.
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
            },
          ],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
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
