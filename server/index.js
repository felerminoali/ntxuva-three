/** Entry point: `npm run server` (see README "Online server"). */
import { loadConfig } from './config.js';
import { createApp } from './app.js';

const config = loadConfig();
const app = createApp(config, { log: (m) => console.log(`[ntuxa] ${m}`) });
const port = await app.listen();
console.log(`[ntuxa] server listening on http://localhost:${port} (WebSocket /ws)`);
if (!config.facebookAppId) console.log('[ntuxa] FACEBOOK_APP_ID not set: Facebook login disabled, guest accounts only.');

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
