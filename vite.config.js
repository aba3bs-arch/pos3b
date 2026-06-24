import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Web: base '/'. Electron portable: VITE_BASE_PATH=./ al compilar.
export default defineConfig({
  plugins: [react()],
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
