/**
 * Persistence with Node's built-in SQLite (node:sqlite). All coin changes go through
 * `adjustCoins`, which records a ledger entry and never lets a balance go negative.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { eloDelta } from '../src/competitions.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  avatar TEXT,
  fb_id TEXT UNIQUE,
  coins INTEGER NOT NULL,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  rating INTEGER NOT NULL DEFAULT 1200,
  last_bonus_at INTEGER NOT NULL DEFAULT 0,
  last_store_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance INTEGER NOT NULL,
  ref TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  tier TEXT NOT NULL,
  stake INTEGER NOT NULL,
  extra_capture INTEGER NOT NULL,
  south_id INTEGER NOT NULL,
  north_id INTEGER NOT NULL,
  winner_id INTEGER,
  reason TEXT,
  turns INTEGER,
  moves TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE TABLE IF NOT EXISTS competition_wins (
  user_id INTEGER NOT NULL REFERENCES users(id),
  competition TEXT NOT NULL,
  wins INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, competition)
);
`;

/** Columns added after the first release; created on start-up when missing. */
const MIGRATIONS = {
  users: {
    ai_games: 'INTEGER NOT NULL DEFAULT 0',
    ai_wins: 'INTEGER NOT NULL DEFAULT 0',
    ai_losses: 'INTEGER NOT NULL DEFAULT 0',
    ai_draws: 'INTEGER NOT NULL DEFAULT 0',
    ai_rating: 'INTEGER NOT NULL DEFAULT 1200',
    winnings: 'INTEGER NOT NULL DEFAULT 0',
    tournaments: 'INTEGER NOT NULL DEFAULT 0',
  },
  games: {
    kind: "TEXT NOT NULL DEFAULT 'online'",
    bot: 'TEXT',
  },
};

const FIELDS =
  'id, name, avatar, fb_id, coins, games, wins, losses, draws, rating, last_bonus_at, last_store_at, ' +
  'ai_games, ai_wins, ai_losses, ai_draws, ai_rating, winnings, tournaments';

export class Store {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys = ON;');
    if (path !== ':memory:') this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(SCHEMA);
    this.migrate();
  }

  migrate() {
    for (const [table, columns] of Object.entries(MIGRATIONS)) {
      const have = new Set(this.db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
      for (const [name, type] of Object.entries(columns)) {
        if (!have.has(name)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
      }
    }
  }

  close() {
    this.db.close();
  }

  /** Runs `fn` atomically. */
  transaction(fn) {
    this.db.exec('BEGIN');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  // --- Users & sessions ---------------------------------------------------------------

  createUser({ name, avatar = null, fbId = null, coins }) {
    const now = Date.now();
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO users (name, avatar, fb_id, coins, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(name, avatar, fbId, coins, now);
    const id = Number(lastInsertRowid);
    this.db
      .prepare('INSERT INTO ledger (user_id, kind, amount, balance, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, 'welcome', coins, coins, null, now);
    return this.getUser(id);
  }

  getUser(id) {
    const row = this.db.prepare(`SELECT ${FIELDS} FROM users WHERE id = ?`).get(id);
    return row ? { ...row } : null;
  }

  getUserByFacebook(fbId) {
    const row = this.db.prepare(`SELECT ${FIELDS} FROM users WHERE fb_id = ?`).get(fbId);
    return row ? { ...row } : null;
  }

  updateProfile(id, { name, avatar, fbId }) {
    if (name !== undefined) this.db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, id);
    if (avatar !== undefined) this.db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, id);
    if (fbId !== undefined) this.db.prepare('UPDATE users SET fb_id = ? WHERE id = ?').run(fbId, id);
    return this.getUser(id);
  }

  createSession(userId) {
    const token = randomBytes(24).toString('base64url');
    this.db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, Date.now());
    return token;
  }

  userForToken(token) {
    if (typeof token !== 'string' || !token) return null;
    const row = this.db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);
    return row ? this.getUser(row.user_id) : null;
  }

  deleteSession(token) {
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  // --- Coins ------------------------------------------------------------------------------

  /** Adds (or, with a negative amount, removes) coins. Throws if the balance would go negative. */
  adjustCoins(userId, amount, kind, ref = null) {
    const user = this.getUser(userId);
    if (!user) throw new Error('unknown user');
    const balance = user.coins + amount;
    if (balance < 0) throw Object.assign(new Error('Not enough coins.'), { code: 'not-enough-coins' });
    this.db.prepare('UPDATE users SET coins = ? WHERE id = ?').run(balance, userId);
    this.db
      .prepare('INSERT INTO ledger (user_id, kind, amount, balance, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, kind, amount, balance, ref, Date.now());
    return balance;
  }

  setTimestamp(userId, field, value) {
    if (!['last_bonus_at', 'last_store_at'].includes(field)) throw new Error('bad field');
    this.db.prepare(`UPDATE users SET ${field} = ? WHERE id = ?`).run(value, userId);
  }

  ledger(userId, limit = 20) {
    return this.db
      .prepare('SELECT kind, amount, balance, ref, created_at FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?')
      .all(userId, limit)
      .map((r) => ({ ...r }));
  }

  // --- Games --------------------------------------------------------------------------------

  recordGameStart({ id, tier, stake, extraCapture, southId, northId, kind = 'online', bot = null }) {
    this.db
      .prepare(
        'INSERT INTO games (id, tier, stake, extra_capture, south_id, north_id, started_at, kind, bot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, tier, stake, extraCapture ? 1 : 0, southId, northId, Date.now(), kind, bot);
  }

  recordGameEnd({ id, winnerId, reason, turns, moves }) {
    this.db
      .prepare('UPDATE games SET winner_id = ?, reason = ?, turns = ?, moves = ?, ended_at = ? WHERE id = ?')
      .run(winnerId, reason, turns, JSON.stringify(moves), Date.now(), id);
  }

  /** Updates win/loss counters and Elo ratings. `winnerSide` is 0, 1 or null (draw). */
  recordResult(southId, northId, winnerSide) {
    const a = this.getUser(southId);
    const b = this.getUser(northId);
    const expectedA = 1 / (1 + 10 ** ((b.rating - a.rating) / 400));
    const scoreA = winnerSide === null ? 0.5 : winnerSide === 0 ? 1 : 0;
    const deltaA = Math.round(24 * (scoreA - expectedA));
    const bump = (id, delta, field) =>
      this.db
        .prepare(`UPDATE users SET games = games + 1, ${field} = ${field} + 1, rating = rating + ? WHERE id = ?`)
        .run(delta, id);
    bump(a.id, deltaA, scoreA === 1 ? 'wins' : scoreA === 0 ? 'losses' : 'draws');
    bump(b.id, -deltaA, scoreA === 0 ? 'wins' : scoreA === 1 ? 'losses' : 'draws');
    return deltaA;
  }

  /** Adds prize money to a player's lifetime winnings. */
  addWinnings(userId, amount) {
    this.db.prepare('UPDATE users SET winnings = winnings + ? WHERE id = ?').run(amount, userId);
  }

  /**
   * Records a competition game against a computer player and returns the rating change.
   * `score` is 1 (win), 0.5 (draw) or 0 (loss); a win also counts as a tournament won.
   */
  recordCompetitionResult(userId, { opponentRating, score, competition, winnings = 0 }) {
    const user = this.getUser(userId);
    const delta = eloDelta(user.ai_rating, opponentRating, score);
    const field = score === 1 ? 'ai_wins' : score === 0 ? 'ai_losses' : 'ai_draws';
    this.db
      .prepare(`UPDATE users SET ai_games = ai_games + 1, ${field} = ${field} + 1, ai_rating = ai_rating + ? WHERE id = ?`)
      .run(delta, userId);
    if (winnings) this.addWinnings(userId, winnings);
    if (score === 1) {
      this.db.prepare('UPDATE users SET tournaments = tournaments + 1 WHERE id = ?').run(userId);
      this.db
        .prepare(
          'INSERT INTO competition_wins (user_id, competition, wins) VALUES (?, ?, 1) ' +
            'ON CONFLICT(user_id, competition) DO UPDATE SET wins = wins + 1',
        )
        .run(userId, competition);
    }
    return delta;
  }

  /** Competitions won, by competition id. */
  trophies(userId) {
    const out = {};
    for (const r of this.db.prepare('SELECT competition, wins FROM competition_wins WHERE user_id = ?').all(userId)) {
      out[r.competition] = r.wins;
    }
    return out;
  }

  /** 1-based position of the player in the coin ranking. */
  rankOf(user) {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM users WHERE coins > ? OR (coins = ? AND id < ?)')
      .get(user.coins, user.coins, user.id);
    return Number(row.n) + 1;
  }

  leaderboard(limit = 20) {
    return this.db
      .prepare(
        'SELECT id, name, avatar, coins, wins + ai_wins AS wins, games + ai_games AS games, rating, ai_rating, tournaments ' +
          'FROM users ORDER BY coins DESC, rating DESC LIMIT ?',
      )
      .all(limit)
      .map((r) => ({ ...r }));
  }
}
