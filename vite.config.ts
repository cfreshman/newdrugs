import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.cloud-dev', quiet: true });

const origin = process.env.NEWDRUGS_DEV_ORIGIN || 'https://dev.druggie.org';
if (!origin.startsWith('https://')) throw new Error('Development uses the HTTPS cloud backend.');

export default defineConfig({
  plugins: [react()],
  cacheDir: 'node_modules/.vite-web',
  server: {
    port: 7330,
    strictPort: true,
    watch: { ignored: ['**/dist/**', '**/.data/**', '**/.logs/**'] },
    proxy: { '/api': { target: origin, changeOrigin: true,
      configure(proxy) {
        proxy.on('proxyReq', request => {
          request.setHeader('Origin', origin);
          if (process.env.NEWDRUGS_DEV_ACCESS_KEY) request.setHeader('X-NewDrugs-Dev-Key', process.env.NEWDRUGS_DEV_ACCESS_KEY);
        });
        // The local UI is HTTP localhost. Cloud cookies remain Secure on the actual dev site.
        proxy.on('proxyRes', response => {
          if (response.headers['set-cookie']) response.headers['set-cookie'] = response.headers['set-cookie'].map(cookie => cookie.replace(/;\s*Secure/ig, ''));
        });
      },
    } },
  },
  build: { outDir: 'dist/web' },
});
