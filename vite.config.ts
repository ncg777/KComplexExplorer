import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // disables auto-generation, uses your file
      includeAssets: ['logo32.png','logo192.png','logo512.png','manifest.json'],
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 // 5 MiB, adjust as needed
      }
    })
  ],
  build: {
    outDir: 'docs', // or 'build' if you want to match CRA
  },
  base: '/KComplexExplorer/'
});