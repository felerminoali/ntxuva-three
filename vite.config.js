import { defineConfig } from 'vite';

// During development the online server (npm run server) runs on port 8787;
// Vite forwards the WebSocket and API calls to it.
const target = process.env.NTUXA_SERVER ?? 'http://localhost:8787';

// Build-time settings, injected with `define`. They are not secrets, and plain names keep hosts
// such as Vercel from flagging a public VITE_ prefix (the VITE_ names still work as fallbacks).
// SERVER_URL: WebSocket of the game server, e.g. wss://<service>.onrender.com/ws (default: same host).
const serverUrl = process.env.SERVER_URL ?? process.env.VITE_SERVER_URL ?? '';
// DRAW_WAIT_MS: wait (ms) after the opponent roulette stops.
const drawWaitMs = process.env.DRAW_WAIT_MS ?? process.env.VITE_DRAW_WAIT_MS ?? '';

export default defineConfig({
  define: {
    __DRAW_WAIT_MS__: JSON.stringify(drawWaitMs),
    __SERVER_URL__: JSON.stringify(serverUrl),
  },
  server: {
    proxy: {
      '/ws': { target, ws: true, changeOrigin: true },
      '/api': { target, changeOrigin: true },
    },
  },
});
