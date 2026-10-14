import { defineConfig } from 'vite';

// During development the online server (npm run server) runs on port 8787;
// Vite forwards the WebSocket and API calls to it.
const target = process.env.NTUXA_SERVER ?? 'http://localhost:8787';

// Wait (ms) after the opponent roulette stops. A plain build-time setting (not a secret),
// read from DRAW_WAIT_MS so hosts such as Vercel don't flag a public VITE_ prefix.
const drawWaitMs = process.env.DRAW_WAIT_MS ?? process.env.VITE_DRAW_WAIT_MS ?? '';

export default defineConfig({
  define: {
    __DRAW_WAIT_MS__: JSON.stringify(drawWaitMs),
  },
  server: {
    proxy: {
      '/ws': { target, ws: true, changeOrigin: true },
      '/api': { target, changeOrigin: true },
    },
  },
});
