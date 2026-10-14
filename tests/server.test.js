/**
 * Online server integration tests: real WebSocket clients against an in-memory server.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import { createApp, sanitizeName } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { actionsFor, actingPlayer, playMove, createGame } from '../src/gameLogic.js';
import { verifyFacebookToken } from '../server/facebook.js';
import { TIERS, levelFor, tierBlocker, formatCoins } from '../src/tiers.js';
import { COMPETITION_BY_ID, matchedSkill, payoutFor } from '../src/competitions.js';
import { SPIN_SEGMENTS } from '../src/spin.js';
import { createAiPool } from '../server/aiPool.js';
import { Store } from '../server/db.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

class Client {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.seq = 0;
    this.pending = new Map();
    this.inbox = [];
    this.waiters = [];
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.t === 'reply') {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.ok ? p.resolve(msg.data) : p.reject(Object.assign(new Error(msg.error.code), msg.error));
        return;
      }
      this.inbox.push(msg);
      this.waiters = this.waiters.filter((w) => {
        const i = this.inbox.findIndex(w.match);
        if (i < 0) return true;
        w.resolve(this.inbox.splice(i, 1)[0]);
        return false;
      });
    });
  }
  open() {
    return new Promise((res, rej) => {
      if (this.ws.readyState === 1) return res();
      this.ws.once('open', res);
      this.ws.once('error', rej);
    });
  }
  req(t, payload = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ t, id, ...payload }));
    });
  }
  next(t, pred = () => true, timeout = 4000) {
    const match = (m) => m.t === t && pred(m);
    const i = this.inbox.findIndex(match);
    if (i >= 0) return Promise.resolve(this.inbox.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const w = { match, resolve };
      this.waiters.push(w);
      setTimeout(() => reject(new Error(`timeout waiting for ${t}`)), timeout);
    });
  }
  close() {
    this.ws.close();
  }
}

let app;
let url;
const clients = [];
async function client() {
  const c = new Client(url);
  clients.push(c);
  await c.open();
  return c;
}
async function boot(env = {}) {
  // Most tests were written for small online stakes; competitions tests raise the coins.
  const config = { ...loadConfig({}), dbPath: ':memory:', staticDir: 'does-not-exist', startingCoins: 5000, ...env };
  app = createApp(config, { aiPool: env.aiPool });
  const port = await app.listen(0);
  url = `ws://localhost:${port}/ws`;
  return config;
}

async function pair(tier = 'massinga', extraCapture = false) {
  const a = await client();
  const b = await client();
  const pa = await a.req('auth.guest', { name: 'Ana' });
  const pb = await b.req('auth.guest', { name: 'Bento' });
  expect((await a.req('queue.join', { tier, extraCapture })).matched).toBe(false);
  expect((await b.req('queue.join', { tier, extraCapture })).matched).toBe(true);
  const ma = await a.next('match.start');
  const mb = await b.next('match.start');
  const bySide = ma.side === 0 ? [a, b] : [b, a];
  return { a, b, pa, pb, ma, mb, bySide, gameId: ma.gameId };
}

beforeEach(() => {
  clients.length = 0;
});
afterEach(async () => {
  clients.forEach((c) => c.close());
  await app?.close();
  app = null;
});

describe('shared tiers', () => {
  it('ladders from 1K in a district to 2B in Maputo City', () => {
    expect(TIERS[0].stake).toBe(1000);
    expect(TIERS.at(-1)).toMatchObject({ id: 'maputo', stake: 2_000_000_000 });
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i].stake).toBeGreaterThan(TIERS[i - 1].stake);
      expect(TIERS[i].minLevel).toBeGreaterThanOrEqual(TIERS[i - 1].minLevel);
    }
  });
  it('blocks tiers by coins and experience', () => {
    const rookie = { coins: 5000, games: 0, wins: 0 };
    expect(levelFor(rookie)).toBe(1);
    expect(tierBlocker(TIERS[0], rookie)).toBe(null);
    expect(tierBlocker(TIERS[3], rookie)).toBe('not-enough-coins');
    expect(tierBlocker(TIERS[3], { ...rookie, coins: 1e6 })).toBe('level-too-low');
    expect(formatCoins(2_000_000_000)).toBe('2B');
    expect(formatCoins(2500)).toBe('2.5K');
  });
  it('sanitizes player names', () => {
    expect(sanitizeName('  <b>Zé</b>  ', 'x')).toBe('bZé/b');
    expect(sanitizeName('a', 'fallback')).toBe('fallback');
  });
});

describe('accounts and wallet', () => {
  it('creates guests with the starting coins and resumes sessions', async () => {
    await boot();
    const c = await client();
    const { token, profile } = await c.req('auth.guest', { name: 'Maria' });
    expect(profile).toMatchObject({ name: 'Maria', coins: 5000, level: 1, facebook: false });
    const c2 = await client();
    const resumed = await c2.req('auth.resume', { token });
    expect(resumed.profile.id).toBe(profile.id);
    await expect(c2.req('auth.resume', { token: 'nope' })).rejects.toMatchObject({ code: 'bad-token' });
  });

  it('pays the daily bonus once and sells simulated packs with a cooldown', async () => {
    await boot();
    const c = await client();
    await c.req('auth.guest', { name: 'Maria' });
    expect((await c.req('bonus.claim')).amount).toBe(1000);
    await expect(c.req('bonus.claim')).rejects.toMatchObject({ code: 'bonus-not-ready' });
    await c.req('store.buy', { pack: 'cesto' });
    await expect(c.req('store.buy', { pack: 'saco' })).rejects.toMatchObject({ code: 'store-cooldown' });
    const { profile } = await c.req('profile.get');
    expect(profile.coins).toBe(5000 + 1000 + 100_000);
    const { entries } = await c.req('ledger.get');
    expect(entries.map((e) => e.kind)).toEqual(['store-simulated', 'daily-bonus', 'welcome']);
  });

  it('spins the lucky wheel once per cooldown', async () => {
    await boot({ startingCoins: 2_000_000 });
    const c = await client();
    const { profile } = await c.req('auth.guest', { name: 'Rosa' });
    expect(profile.spinAt).toBeLessThanOrEqual(Date.now());
    const spin = await c.req('spin.play');
    expect(spin.coins).toBe(SPIN_SEGMENTS[spin.segment].coins);
    expect(spin.profile.coins).toBe(2_000_000 + spin.coins);
    expect(spin.profile.spinAt).toBeGreaterThan(Date.now());
    await expect(c.req('spin.play')).rejects.toMatchObject({ code: 'spin-not-ready' });
    const { entries } = await c.req('ledger.get');
    expect(entries[0].kind).toBe('lucky-wheel');
  });

  it('requires sign-in and enforces tier requirements', async () => {
    await boot();
    const c = await client();
    await expect(c.req('queue.join', { tier: 'massinga' })).rejects.toMatchObject({ code: 'not-signed-in' });
    await c.req('auth.guest', { name: 'Rui' });
    await expect(c.req('queue.join', { tier: 'montepuez' })).rejects.toMatchObject({ code: 'not-enough-coins' });
    await expect(c.req('queue.join', { tier: 'maputo' })).rejects.toMatchObject({ code: 'not-enough-coins' });
    await expect(c.req('queue.join', { tier: 'atlantis' })).rejects.toMatchObject({ code: 'unknown-tier' });
  });

  it('verifies Facebook tokens against the configured app', async () => {
    const fakeFetch = async (u) => {
      const body = u.includes('/app?')
        ? { id: '42' }
        : u.includes('/me?')
          ? { id: '777', name: 'Fátima', picture: { data: { url: 'https://x/p.jpg' } } }
          : {};
      return { ok: true, json: async () => body };
    };
    expect(await verifyFacebookToken('token-1234567', { appId: '42' }, fakeFetch)).toEqual({
      fbId: '777',
      name: 'Fátima',
      avatar: 'https://x/p.jpg',
    });
    await expect(verifyFacebookToken('token-1234567', { appId: '43' }, fakeFetch)).rejects.toMatchObject({ code: 'fb-invalid' });
    await expect(verifyFacebookToken('token-1234567', { appId: '' }, fakeFetch)).rejects.toMatchObject({ code: 'fb-disabled' });
  });
});

describe('online matches', () => {
  it('matches two players in the same room and escrows the stake', async () => {
    await boot();
    const { a, ma, mb, gameId } = await pair('massinga');
    expect(ma.gameId).toBe(mb.gameId);
    expect(ma.side + mb.side).toBe(1);
    expect(ma.opponent.name).toBe('Bento');
    expect(ma.extraCapture).toBe(false);
    expect(ma.state.bins[0].length).toBe(32);
    const { profile } = await a.req('profile.get');
    expect(profile.coins).toBe(4000);
    expect(gameId).toBeTruthy();
  });

  it('only pairs players who chose the same capture rule', async () => {
    await boot();
    const a = await client();
    const b = await client();
    await a.req('auth.guest', { name: 'Ana' });
    await b.req('auth.guest', { name: 'Bento' });
    expect((await a.req('queue.join', { tier: 'massinga', extraCapture: true })).matched).toBe(false);
    expect((await b.req('queue.join', { tier: 'massinga', extraCapture: false })).matched).toBe(false);
    expect((await b.req('queue.leave')).left).toBe(true);
  });

  it('enforces turn order and legality, and relays moves to both players', async () => {
    await boot();
    const { bySide, gameId, ma } = await pair();
    const [south, north] = bySide;
    await expect(north.req('game.action', { gameId, action: { type: 'move', bin: 0 } })).rejects.toMatchObject({
      code: 'not-your-turn',
    });
    await expect(south.req('game.action', { gameId, action: { type: 'move', bin: 99 } })).rejects.toMatchObject({
      code: 'not-a-bin',
    });
    await south.req('game.action', { gameId, action: { type: 'move', bin: 0 } });
    const us = await south.next('game.update');
    const them = await north.next('game.update');
    const expected = playMove(createGame({ columns: 16 }), 0).state;
    expect(us.state.bins).toEqual(expected.bins);
    expect(them.events.length).toBe(us.events.length);
    expect(us.state.current).toBe(expected.current);
    expect(ma.state.turn).toBe(1);
  });

  it('pays the winner the pot when the opponent resigns', async () => {
    await boot();
    const { bySide, gameId } = await pair('vilankulo');
    const [south, north] = bySide;
    await north.req('game.resign', { gameId });
    const overS = await south.next('game.over');
    const overN = await north.next('game.over');
    expect(overS).toMatchObject({ winner: 0, reason: 'resign', payout: 10000 });
    expect(overS.profile.coins).toBe(10000);
    expect(overS.profile.wins).toBe(1);
    expect(overN.profile.coins).toBe(0);
    expect(overN.profile.losses).toBe(1);
    expect(overS.ratingDelta).toBeGreaterThan(0);
  });

  it('plays a full game to the end with only legal moves', async () => {
    await boot({ turnSeconds: 0, messagesPerSecond: 100000 });
    const { bySide, gameId, ma } = await pair('massinga');
    let state = ma.state;
    let over = null;
    for (let i = 0; i < 3000 && !over; i++) {
      const side = actingPlayer(state);
      const actions = actionsFor(state);
      const action = actions[(i * 7) % actions.length];
      await bySide[side].req('game.action', { gameId, action });
      const upd = await bySide[0].next('game.update');
      state = upd.state;
      if (state.status === 'over') over = await bySide[0].next('game.over');
    }
    expect(over).not.toBe(null);
    expect(over.reason).toMatch(/captured-all|no-moves/);
    expect(over.profile.games).toBe(1);
  }, 30000);

  it('auto-plays on timeout and forfeits after repeated timeouts', async () => {
    await boot({ turnSeconds: 0.2, maxTimeouts: 2 });
    const { bySide } = await pair();
    const [south, north] = bySide;
    const auto = await south.next('game.update');
    expect(auto.auto).toBe(true);
    expect(auto.by).toBe(0);
    const over = await north.next('game.over', () => true, 6000);
    expect(over.reason).toBe('timeout');
  }, 10000);

  it('lets a player reconnect and forfeits players who leave', async () => {
    await boot({ reconnectSeconds: 0.3 });
    const { bySide, pa, pb, ma } = await pair();
    const [south, north] = bySide;
    const southToken = (ma.side === 0 ? pa : pb).token;
    south.close();
    const gone = await north.next('opponent.status');
    expect(gone.connected).toBe(false);
    const back = await client();
    const resumed = await back.req('auth.resume', { token: southToken });
    expect(resumed.match).toMatchObject({ resume: true, side: 0 });
    expect((await north.next('opponent.status')).connected).toBe(true);
    back.close();
    const over = await north.next('game.over', () => true, 4000);
    expect(over).toMatchObject({ reason: 'abandon', winner: 1 });
  }, 10000);
});

describe('competitions against computer players', () => {
  const fastPool = { choose: async (state) => actionsFor(state)[0], close: async () => {} };
  const compBoot = (env = {}) =>
    boot({ startingCoins: 2_000_000, aiIntroMs: 0, aiMinThinkMs: 0, turnSeconds: 0, messagesPerSecond: 100000, aiPool: fastPool, ...env });

  it('gives new players 2M coins by default', () => {
    expect(loadConfig({}).startingCoins).toBe(2_000_000);
  });

  it('derives the competition intro from DRAW_WAIT_MS unless AI_INTRO_MS is set', () => {
    expect(loadConfig({})).toMatchObject({ drawWaitMs: 1500, aiIntroMs: 4700 });
    expect(loadConfig({ DRAW_WAIT_MS: '3000' })).toMatchObject({ drawWaitMs: 3000, aiIntroMs: 6200 });
    expect(loadConfig({ DRAW_WAIT_MS: '3000', AI_INTRO_MS: '1000' }).aiIntroMs).toBe(1000);
  });

  it('plays competitions on the chosen board size and sends the draw wait', async () => {
    await compBoot({ drawWaitMs: 2500 });
    const c = await client();
    await c.req('auth.guest', { name: 'Lina' });
    await expect(c.req('competition.join', { competition: 'cuamba', columns: 10 })).rejects.toMatchObject({ code: 'bad-board' });
    await c.req('competition.join', { competition: 'cuamba', columns: 8 });
    const start = await c.next('match.start');
    expect(start.state.columns).toBe(8);
    expect(start.drawWaitMs).toBe(2500);
  });

  it('charges the entry, draws a matched computer opponent and blocks unaffordable competitions', async () => {
    await compBoot();
    const c = await client();
    await c.req('auth.guest', { name: 'Lina' });
    await expect(c.req('competition.join', { competition: 'nampula' })).rejects.toMatchObject({ code: 'not-enough-coins' });
    await expect(c.req('competition.join', { competition: 'atlantis' })).rejects.toMatchObject({ code: 'unknown-competition' });
    const joined = await c.req('competition.join', { competition: 'cuamba', extraCapture: false });
    const start = await c.next('match.start');
    expect(start).toMatchObject({ competition: 'cuamba', stake: 1_000_000, opponentConnected: true });
    expect(start.opponent.bot).toBe(true);
    expect(start.opponent.skill).toBeGreaterThanOrEqual(1);
    expect(start.opponent.skill).toBeLessThanOrEqual(matchedSkill(COMPETITION_BY_ID.cuamba, 1200));
    expect(joined.side).toBe(start.side);
    const { profile } = await c.req('profile.get');
    expect(profile.coins).toBe(1_000_000);
    await expect(c.req('competition.join', { competition: 'cuamba' })).rejects.toMatchObject({ code: 'in-game' });
  });

  it('records a resignation as a lost competition', async () => {
    await compBoot();
    const c = await client();
    await c.req('auth.guest', { name: 'Lina' });
    const { gameId } = await c.req('competition.join', { competition: 'cuamba' });
    await c.req('game.resign', { gameId });
    const over = await c.next('game.over');
    expect(over).toMatchObject({ reason: 'resign', payout: 0, competition: 'cuamba' });
    expect(over.ratingDelta).toBeLessThan(0);
    expect(over.profile.coins).toBe(1_000_000);
    expect(over.profile.career).toMatchObject({ aiGames: 1, aiLosses: 1, tournaments: 0, rank: 1 });
  });

  it('plays a full competition game with the computer moving by itself', async () => {
    await compBoot();
    const c = await client();
    await c.req('auth.guest', { name: 'Lina' });
    const { gameId, side } = await c.req('competition.join', { competition: 'cuamba' });
    let state = (await c.next('match.start')).state;
    let over = null;
    for (let i = 0; i < 4000 && !over; i++) {
      if (state.status !== 'over' && actingPlayer(state) === side) {
        const actions = actionsFor(state);
        await c.req('game.action', { gameId, action: actions[(i * 5) % actions.length] });
      }
      const upd = await c.next('game.update');
      state = upd.state;
      if (state.status === 'over') over = await c.next('game.over');
    }
    expect(over).not.toBe(null);
    const outcome = over.winner === null ? 'draw' : over.winner === side ? 'win' : 'loss';
    expect(over.payout).toBe(payoutFor(COMPETITION_BY_ID.cuamba, outcome));
    expect(over.profile.coins).toBe(1_000_000 + over.payout);
    expect(over.profile.career.aiGames).toBe(1);
    expect(over.profile.career.tournaments).toBe(outcome === 'win' ? 1 : 0);
    if (outcome === 'win') {
      expect(over.profile.career.trophies).toEqual({ cuamba: 1 });
      expect(over.profile.career.winnings).toBe(2_000_000);
    }
  }, 30000);

  it('stores uploaded avatars and rejects anything that is not a small image', async () => {
    await compBoot();
    const c = await client();
    await c.req('auth.guest', { name: 'Lina' });
    const avatar = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    expect((await c.req('profile.avatar', { avatar })).profile.avatar).toBe(avatar);
    await expect(c.req('profile.avatar', { avatar: 'https://evil/x.png' })).rejects.toMatchObject({ code: 'bad-avatar' });
    await expect(c.req('profile.avatar', { avatar: `data:image/png;base64,${'A'.repeat(14000)}` })).rejects.toMatchObject({
      code: 'bad-avatar',
    });
    expect((await c.req('profile.avatar', { avatar: null })).profile.avatar).toBe(null);
  });

  it('runs computer searches in a worker thread', async () => {
    const pool = createAiPool({ size: 1 });
    const state = createGame({ columns: 8 });
    const action = await pool.choose(state, 4);
    expect(actionsFor(state)).toContainEqual(action);
    await pool.close();
  });

  it('adds the career columns to an existing database', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ntx-'));
    const path = join(dir, 'old.db');
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, avatar TEXT, fb_id TEXT UNIQUE,
      coins INTEGER NOT NULL, games INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0, rating INTEGER NOT NULL DEFAULT 1200, last_bonus_at INTEGER NOT NULL DEFAULT 0,
      last_store_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
      INSERT INTO users (name, coins, created_at) VALUES ('Velho', 5000, 0);`);
    old.close();
    const store = new Store(path);
    const user = store.getUser(1);
    expect(user).toMatchObject({ name: 'Velho', coins: 5000, ai_rating: 1200, tournaments: 0, winnings: 0 });
    expect(store.recordCompetitionResult(1, { opponentRating: 1200, score: 1, competition: 'cuamba', winnings: 2_000_000 })).toBe(12);
    expect(store.getUser(1)).toMatchObject({ ai_wins: 1, tournaments: 1, winnings: 2_000_000, ai_rating: 1212 });
    expect(store.trophies(1)).toEqual({ cuamba: 1 });
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
