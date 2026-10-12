/** Server configuration from environment variables (see README "Online server"). */
const int = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Math.trunc(Number(v)));

export function loadConfig(env = process.env) {
  return {
    port: int(env.PORT, 8787),
    dbPath: env.DB_PATH || 'server/data/ntuxa.db',
    facebookAppId: env.FACEBOOK_APP_ID || '',
    facebookAppSecret: env.FACEBOOK_APP_SECRET || '',
    startingCoins: int(env.STARTING_COINS, 5000),
    dailyBonus: int(env.DAILY_BONUS, 1000),
    rakePercent: Math.min(50, Math.max(0, int(env.RAKE_PERCENT, 0))),
    turnSeconds: int(env.TURN_SECONDS, 60),
    reconnectSeconds: int(env.RECONNECT_SECONDS, 60),
    maxTimeouts: int(env.MAX_TIMEOUTS, 3),
    storeCooldownSeconds: int(env.STORE_COOLDOWN_SECONDS, 30),
    messagesPerSecond: int(env.MESSAGES_PER_SECOND, 40),
    columns: 16,
    staticDir: env.STATIC_DIR || 'dist',
  };
}
