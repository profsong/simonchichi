import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), 'VITE_');
  // Android packages load from their local root even when a shell still has a
  // Pages deployment path set. Web builds default to the existing root path.
  const configuredBase = mode === 'android-demo' ? '/' : environment.VITE_BASE_PATH?.trim() || '/';
  if (
    /[\\?#:]/.test(configuredBase) ||
    configuredBase.includes('//') ||
    configuredBase.split('/').some((part) => part === '.' || part === '..')
  )
    throw new Error('VITE_BASE_PATH must be a local directory path such as /simonchichi/.');
  const base = `/${configuredBase.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
  const navigationPrefix = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        scope: base,
        registerType: 'prompt',
        // The runtime registers explicitly on web; installed Android uses bundled assets.
        injectRegister: false,
        includeAssets: ['icons/*.png', 'icons/*.svg'],
        manifest: {
          name: '시몬치치',
          short_name: '시몬치치',
          description: '몬치치와 20단어씩, 나만의 영어 모험',
          lang: 'ko',
          start_url: base,
          scope: base,
          display: 'standalone',
          theme_color: '#f7fcff',
          background_color: '#f7fcff',
          icons: [
            { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
            {
              src: `${base}icons/icon-512.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,txt}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallback: 'index.html',
          navigateFallbackAllowlist: [navigationPrefix],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
  };
});
