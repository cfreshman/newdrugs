import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
loadEnv({ path: '.env.cloud-dev', quiet: true });
const origin = process.env.NEWDRUGS_DEV_ORIGIN || 'https://dev.druggie.org';
export default defineConfig({ root: resolve('admin'), base: '/admin/', cacheDir: resolve('node_modules/.vite-admin'), plugins: [react()],
  build: { outDir: resolve('dist/admin'), emptyOutDir: true },
  server: { port: 7334, strictPort: true, proxy: { '/api/admin': { target: origin, changeOrigin: true,
    configure(proxy) {
      proxy.on('proxyReq', request => { request.setHeader('Origin', origin); if (process.env.NEWDRUGS_DEV_ACCESS_KEY) request.setHeader('X-NewDrugs-Dev-Key', process.env.NEWDRUGS_DEV_ACCESS_KEY); });
      proxy.on('proxyRes', response => { if (response.headers['set-cookie']) response.headers['set-cookie'] = response.headers['set-cookie'].map(cookie => cookie.replace(/;\s*Secure/ig, '')); });
    },
  } } },
});
