import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { generarVersionApp } from './scripts/generate-app-version.mjs';
import { copyTesseractAssets } from './scripts/copy-tesseract-assets.mjs';

function appVersionPlugin() {
  return {
    name: 'pos3b-app-version',
    config() {
      const meta = generarVersionApp({ maxCambios: 10 });
      return {
        define: {
          'import.meta.env.VITE_APP_BUILD': JSON.stringify(meta.buildId),
          'import.meta.env.VITE_APP_VERSION': JSON.stringify(meta.version),
          'import.meta.env.VITE_APP_BUILT_AT': JSON.stringify(meta.builtAt),
        },
      };
    },
  };
}

function tesseractAssetsPlugin() {
  return {
    name: 'pos3b-tesseract-assets',
    buildStart() {
      copyTesseractAssets();
    },
    configureServer() {
      copyTesseractAssets();
    },
  };
}

// Web: base '/'. Electron portable: VITE_BASE_PATH=./ al compilar.
export default defineConfig({
  plugins: [appVersionPlugin(), tesseractAssetsPlugin(), react()],
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
});
