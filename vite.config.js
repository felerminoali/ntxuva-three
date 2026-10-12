import { defineConfig } from 'vite';

// During development the online server (npm run server) runs on port 8787;
// Vite forwards the WebSocket and API calls to it.
const target = process.env.NTUXA_SERVER ?? 'http://localhost:8787';

export default defineConfig({
  server: {
    proxy: {
      '/ws': { target, ws: true, changeOrigin: true },
      '/api': { target, changeOrigin: true },
    },
  },
});
