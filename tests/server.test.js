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
  const config = { ...loadConfig({}), dbPath: ':memory:', staticDir: 'does-not-exist', ...env };
  app = createApp(config);
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
