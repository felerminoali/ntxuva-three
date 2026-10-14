/**
 * Ntuxa online server: guest and Facebook accounts, virtual-coin wallet (daily bonus and a
 * simulated store), stake-room matchmaking and authoritative online games.
 *
 * The server owns every game: clients only send intents ({type:'move'|'extra', bin}), which are
 * validated with the same pure rules engine the browser uses (src/gameLogic.js).
 * Coins are virtual only and can never be exchanged for money.
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { createGame, applyAction, actionsFor, actingPlayer, STATUS, SOUTH, NORTH } from '../src/gameLogic.js';
import { TIERS, TIER_BY_ID, STORE_PACKS, levelFor, xpForLevel, experience, tierBlocker } from '../src/tiers.js';
import {
  COMPETITION_BY_ID,
  competitionBlocker,
  drawOpponent,
  payoutFor,
  rankTitle,
} from '../src/competitions.js';
import { SPIN_SEGMENTS, drawSegment, spinReadyAt } from '../src/spin.js';
import { Store } from './db.js';
import { verifyFacebookToken } from './facebook.js';
import { createAiPool } from './aiPool.js';

const BONUS_COOLDOWN_MS = 20 * 60 * 60 * 1000;
/** Player slot used for computer opponents in competition games. */
const BOT_ID = 0;
const AVATAR_MAX = 12_000;
const AVATAR_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
};

class ClientError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code;
  }
}

export function sanitizeName(raw, fallback) {
  const name = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
  return name.length >= 2 ? name : fallback;
}

export function createApp(config, { store = new Store(config.dbPath), fetchImpl = fetch, log = () => {}, aiPool } = {}) {
  aiPool ??= createAiPool({ size: config.aiWorkers ?? 1, log });
  const conns = new Set();
  const userConns = new Map(); // userId -> Set<conn>
  const queues = new Map(); // `${tier}|${extra}` -> [{userId, since}]
  const matches = new Map(); // gameId -> match
  const userMatch = new Map(); // userId -> gameId

  // --- Helpers -------------------------------------------------------------------------

  const now = () => Date.now();

  function publicProfile(user) {
    const level = levelFor(user);
    return {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      facebook: !!user.fb_id,
      coins: user.coins,
      games: user.games,
      wins: user.wins,
      losses: user.losses,
      draws: user.draws,
      rating: user.rating,
      level,
      xp: experience(user),
      levelXp: xpForLevel(level),
      nextLevelXp: xpForLevel(level + 1),
      bonusAt: user.last_bonus_at + BONUS_COOLDOWN_MS,
      storeAt: user.last_store_at + config.storeCooldownSeconds * 1000,
      dailyBonus: config.dailyBonus,
      spinAt: spinReadyAt(user.last_spin_at, user.coins, config.spinCooldownSeconds * 1000),
      career: {
        aiGames: user.ai_games,
        aiWins: user.ai_wins,
        aiLosses: user.ai_losses,
        aiDraws: user.ai_draws,
        aiRating: user.ai_rating,
        winnings: user.winnings,
        tournaments: user.tournaments,
        trophies: store.trophies(user.id),
        rank: store.rankOf(user),
        rankTitle: rankTitle(user.ai_rating),
      },
    };
  }

  function botView(bot) {
    const { id, name, avatar, skill, rating, games, wins, level } = bot;
    return { id, name, avatar, bot: true, facebook: false, skill, rating, games, wins, level };
  }

  function opponentView(user) {
    const p = publicProfile(user);
    return { id: p.id, name: p.name, avatar: p.avatar, facebook: p.facebook, level: p.level, rating: p.rating, wins: p.wins, games: p.games };
  }

  function send(conn, msg) {
    if (conn.ws.readyState === 1) conn.ws.send(JSON.stringify(msg));
  }

  function sendUser(userId, msg) {
    for (const c of userConns.get(userId) ?? []) send(c, msg);
  }

  function pushProfile(userId) {
    const user = store.getUser(userId);
    if (user) sendUser(userId, { t: 'profile', profile: publicProfile(user) });
  }

  function online(userId) {
    return (userConns.get(userId)?.size ?? 0) > 0;
  }

  function lobbySnapshot() {
    const waiting = {};
    for (const [key, list] of queues) {
      const [tier] = key.split('|');
      waiting[tier] = (waiting[tier] ?? 0) + list.length;
    }
    const playing = {};
    for (const m of matches.values()) if (!m.over && !m.bot) playing[m.tier.id] = (playing[m.tier.id] ?? 0) + 2;
    return { online: userConns.size, waiting, playing };
  }

  let lobbyTimer = null;
  function broadcastLobby() {
    if (lobbyTimer) return;
    lobbyTimer = setTimeout(() => {
      lobbyTimer = null;
      const lobby = lobbySnapshot();
      for (const c of conns) if (c.userId) send(c, { t: 'lobby', lobby });
    }, 250);
  }

  // --- Authentication ------------------------------------------------------------------

  function attach(conn, user, token) {
    detach(conn);
    conn.userId = user.id;
    conn.token = token;
    if (!userConns.has(user.id)) userConns.set(user.id, new Set());
    userConns.get(user.id).add(conn);
    const gameId = userMatch.get(user.id);
    const match = gameId && matches.get(gameId);
    if (match && !match.over) {
      const side = match.players.indexOf(user.id);
      clearTimeout(match.disconnectTimers[side]);
      match.disconnectTimers[side] = null;
      sendUser(match.players[1 - side], { t: 'opponent.status', gameId, connected: true });
    }
    broadcastLobby();
    return {
      token,
      profile: publicProfile(user),
      lobby: lobbySnapshot(),
      match: match && !match.over ? matchStartMessage(match, user.id, true) : null,
    };
  }

  function detach(conn) {
    if (!conn.userId) return;
    const userId = conn.userId;
    const set = userConns.get(userId);
    set?.delete(conn);
    conn.userId = null;
    if (set && set.size === 0) {
      userConns.delete(userId);
      leaveQueues(userId);
      const gameId = userMatch.get(userId);
      const match = gameId && matches.get(gameId);
      if (match && !match.over) {
        const side = match.players.indexOf(userId);
        sendUser(match.players[1 - side], {
          t: 'opponent.status',
          gameId,
          connected: false,
          graceSeconds: config.reconnectSeconds,
        });
        clearTimeout(match.disconnectTimers[side]);
        match.disconnectTimers[side] = setTimeout(() => endMatch(match, 1 - side, 'abandon'), config.reconnectSeconds * 1000);
      }
    }
    broadcastLobby();
  }

  async function authFacebook(conn, accessToken) {
    const fb = await verifyFacebookToken(
      accessToken,
      { appId: config.facebookAppId, appSecret: config.facebookAppSecret },
      fetchImpl,
    );
    let user = store.getUserByFacebook(fb.fbId);
    if (user) {
      // Keep a picture the player uploaded; otherwise refresh the Facebook one.
      if (!user.avatar?.startsWith('data:')) user = store.updateProfile(user.id, { avatar: fb.avatar });
    } else if (conn.userId && !store.getUser(conn.userId).fb_id) {
      // Link the guest account the player is currently using, keeping its coins and stats.
      user = store.updateProfile(conn.userId, { fbId: fb.fbId, name: fb.name, avatar: fb.avatar });
    } else {
      user = store.createUser({ name: sanitizeName(fb.name, 'Jogador'), avatar: fb.avatar, fbId: fb.fbId, coins: config.startingCoins });
    }
    if (conn.userId && conn.userId !== user.id && userMatch.has(conn.userId)) {
      throw new ClientError('in-game', 'Finish your current game before switching accounts.');
    }
    return attach(conn, user, store.createSession(user.id));
  }

  // --- Wallet ----------------------------------------------------------------------------

  function claimBonus(userId) {
    const user = store.getUser(userId);
    if (now() < user.last_bonus_at + BONUS_COOLDOWN_MS) throw new ClientError('bonus-not-ready');
    store.transaction(() => {
      store.adjustCoins(userId, config.dailyBonus, 'daily-bonus');
      store.setTimestamp(userId, 'last_bonus_at', now());
    });
    pushProfile(userId);
    return { amount: config.dailyBonus };
  }

  /** Lucky wheel: the server draws the segment, the client only animates it. */
  function spinWheel(userId) {
    const user = store.getUser(userId);
    if (now() < spinReadyAt(user.last_spin_at, user.coins, config.spinCooldownSeconds * 1000)) {
      throw new ClientError('spin-not-ready');
    }
    const segment = drawSegment();
    const { coins } = SPIN_SEGMENTS[segment];
    store.transaction(() => {
      store.adjustCoins(userId, coins, 'lucky-wheel');
      store.setTimestamp(userId, 'last_spin_at', now());
    });
    pushProfile(userId);
    return { segment, coins, profile: publicProfile(store.getUser(userId)) };
  }

  function buyPack(userId, packId) {
    const pack = STORE_PACKS.find((p) => p.id === packId);
    if (!pack) throw new ClientError('unknown-pack');
    const user = store.getUser(userId);
    if (now() < user.last_store_at + config.storeCooldownSeconds * 1000) throw new ClientError('store-cooldown');
    store.transaction(() => {
      store.adjustCoins(userId, pack.coins, 'store-simulated', pack.id);
      store.setTimestamp(userId, 'last_store_at', now());
    });
    pushProfile(userId);
    return { coins: pack.coins };
  }

  // --- Matchmaking ----------------------------------------------------------------------

  function leaveQueues(userId) {
    let changed = false;
    for (const [key, list] of queues) {
      const i = list.findIndex((e) => e.userId === userId);
      if (i >= 0) {
        list.splice(i, 1);
        changed = true;
        if (list.length === 0) queues.delete(key);
      }
    }
    if (changed) broadcastLobby();
    return changed;
  }

  function joinQueue(userId, tierId, extraCapture) {
    if (userMatch.has(userId)) throw new ClientError('in-game');
    const tier = TIER_BY_ID[tierId];
    const blocker = tierBlocker(tier, store.getUser(userId));
    if (blocker) throw new ClientError(blocker);
    leaveQueues(userId);
    const key = `${tier.id}|${extraCapture ? 1 : 0}`;
    const list = queues.get(key) ?? [];
    queues.set(key, list);
    // Pair with the longest-waiting player who is still online and can still pay.
    while (list.length) {
      const other = list.shift();
      if (other.userId === userId || !online(other.userId) || userMatch.has(other.userId)) continue;
      if (tierBlocker(tier, store.getUser(other.userId))) {
        sendUser(other.userId, { t: 'queue.status', state: 'cancelled', reason: 'not-enough-coins' });
        continue;
      }
      if (list.length === 0) queues.delete(key);
      startMatch(tier, !!extraCapture, other.userId, userId);
      broadcastLobby();
      return { matched: true };
    }
    list.push({ userId, since: now() });
    broadcastLobby();
    return { matched: false, tier: tier.id, extraCapture: !!extraCapture };
  }

  function matchStartMessage(match, userId, resume = false) {
    const side = match.players.indexOf(userId);
    return {
      t: 'match.start',
      resume,
      gameId: match.id,
      side,
      tier: match.tier.id,
      competition: match.competition?.id ?? null,
      stake: match.tier.stake,
      extraCapture: match.extraCapture,
      opponent: match.bot ? botView(match.bot) : opponentView(store.getUser(match.players[1 - side])),
      opponentConnected: match.bot ? true : online(match.players[1 - side]),
      state: match.state,
      deadline: match.deadline,
      history: match.records,
    };
  }

  /** Starts a competition game against a computer player drawn for the user's rating. */
  function startCompetition(userId, competitionId, extraCapture) {
    if (userMatch.has(userId)) throw new ClientError('in-game');
    const competition = COMPETITION_BY_ID[competitionId];
    const user = store.getUser(userId);
    const blocker = competitionBlocker(competition, user);
    if (blocker) throw new ClientError(blocker);
    leaveQueues(userId);
    const bot = drawOpponent(competition, user.ai_rating);
    const humanSide = Math.random() < 0.5 ? SOUTH : NORTH;
    const players = humanSide === SOUTH ? [userId, BOT_ID] : [BOT_ID, userId];
    const id = randomUUID();
    store.transaction(() => {
      store.adjustCoins(userId, -competition.stake, 'competition-stake', id);
      store.recordGameStart({
        id,
        tier: competition.id,
        stake: competition.stake,
        extraCapture,
        southId: players[0],
        northId: players[1],
        kind: 'competition',
        bot: JSON.stringify({ name: bot.name, skill: bot.skill, rating: bot.rating }),
      });
    });
    const match = {
      id,
      tier: { id: competition.id, stake: competition.stake },
      competition,
      bot,
      botSide: 1 - humanSide,
      // Both clocks wait while the client shows the opponent draw.
      startsAt: now() + config.aiIntroMs,
      extraCapture: !!extraCapture,
      players,
      state: createGame({ columns: config.columns, extraCapture: !!extraCapture }),
      moves: [],
      records: [],
      timeouts: [0, 0],
      disconnectTimers: [null, null],
      turnTimer: null,
      botTimer: null,
      deadline: 0,
      over: false,
    };
    matches.set(id, match);
    userMatch.set(userId, id);
    pushProfile(userId);
    armClock(match);
    sendUser(userId, matchStartMessage(match, userId));
    log(`competition ${id} ${competition.id} user ${userId} vs ${bot.name} (skill ${bot.skill})`);
    return { matched: true, gameId: id, side: humanSide, opponent: botView(bot) };
  }

  /** Plays the computer's move after a short, human-like pause. */
  function scheduleBot(match) {
    clearTimeout(match.botTimer);
    const ply = match.moves.length;
    const wait = Math.max(0, (match.startsAt ?? 0) - now());
    match.botTimer = setTimeout(async () => {
      if (match.over || match.moves.length !== ply) return;
      const started = now();
      let action = null;
      try {
        action = await aiPool.choose(match.state, match.bot.skill);
      } catch (err) {
        if (!match.over) log(`AI search failed: ${err.message}`);
      }
      if (match.over || match.moves.length !== ply) return;
      const legal = actionsFor(match.state);
      if (!action || !legal.some((a) => a.type === action.type && a.bin === action.bin)) {
        action = legal[Math.floor(Math.random() * legal.length)];
      }
      const rest = config.aiMinThinkMs - (now() - started);
      if (rest > 0) await sleep(rest);
      if (match.over || match.moves.length !== ply) return;
      applyMatchAction(match, match.botSide, action);
    }, wait);
  }

  function startMatch(tier, extraCapture, firstUserId, secondUserId) {
    // Random sides; South always moves first.
    const players = Math.random() < 0.5 ? [firstUserId, secondUserId] : [secondUserId, firstUserId];
    const id = randomUUID();
    try {
      store.transaction(() => {
        for (const uid of players) store.adjustCoins(uid, -tier.stake, 'stake', id);
        store.recordGameStart({ id, tier: tier.id, stake: tier.stake, extraCapture, southId: players[0], northId: players[1] });
      });
    } catch (err) {
      for (const uid of players) sendUser(uid, { t: 'queue.status', state: 'cancelled', reason: err.code ?? 'error' });
      return;
    }
    const match = {
      id,
      tier,
      extraCapture,
      players,
      state: createGame({ columns: config.columns, extraCapture }),
      moves: [],
      records: [],
      timeouts: [0, 0],
      disconnectTimers: [null, null],
      turnTimer: null,
      deadline: 0,
      over: false,
    };
    matches.set(id, match);
    for (const uid of players) {
      userMatch.set(uid, id);
      pushProfile(uid);
    }
    armClock(match);
    for (const uid of players) sendUser(uid, matchStartMessage(match, uid));
    log(`match ${id} ${tier.id} ${players.join(' vs ')}`);
  }

  function armClock(match) {
    clearTimeout(match.turnTimer);
    if (match.over) return;
    if (match.bot && actingPlayer(match.state) === match.botSide) {
      match.deadline = 0;
      scheduleBot(match);
      return;
    }
    if (!config.turnSeconds) return;
    const ms = Math.max(0, (match.startsAt ?? 0) - now()) + config.turnSeconds * 1000;
    match.deadline = now() + ms;
    match.turnTimer = setTimeout(() => onTimeout(match), ms);
  }

  function onTimeout(match) {
    if (match.over) return;
    const side = actingPlayer(match.state);
    match.timeouts[side]++;
    if (match.timeouts[side] >= config.maxTimeouts) {
      endMatch(match, 1 - side, 'timeout');
      return;
    }
    // Play a random legal action for the player who ran out of time.
    const actions = actionsFor(match.state);
    applyMatchAction(match, side, actions[Math.floor(Math.random() * actions.length)], true);
  }

  function applyMatchAction(match, side, action, auto = false) {
    const result = applyAction(match.state, action);
    match.state = result.state;
    match.moves.push({ side, ...action, auto });
    if (result.state.status !== STATUS.CHOOSING_EXTRA) match.records.push(result.record);
    if (!auto) match.timeouts[side] = 0;
    const msg = {
      t: 'game.update',
      gameId: match.id,
      by: side,
      action,
      auto,
      events: result.events,
      record: result.record,
      state: match.state,
      deadline: 0,
    };
    if (match.state.status === STATUS.OVER) {
      for (const uid of match.players) sendUser(uid, msg);
      endMatch(match, match.state.winner, match.state.endReason);
      return;
    }
    armClock(match);
    msg.deadline = match.deadline;
    for (const uid of match.players) sendUser(uid, msg);
  }

  function gameAction(userId, gameId, action) {
    const match = matches.get(gameId);
    if (!match || match.over || !match.players.includes(userId)) throw new ClientError('no-game');
    const side = match.players.indexOf(userId);
    if (actingPlayer(match.state) !== side) throw new ClientError('not-your-turn');
    if (!action || !['move', 'extra'].includes(action.type) || !Number.isInteger(action.bin)) {
      throw new ClientError('bad-action');
    }
    try {
      applyMatchAction(match, side, { type: action.type, bin: action.bin });
    } catch (err) {
      throw new ClientError(err.code ?? 'illegal', err.message);
    }
    return { ok: true };
  }

  function endMatch(match, winnerSide, reason) {
    if (match.over) return;
    match.over = true;
    clearTimeout(match.turnTimer);
    clearTimeout(match.botTimer);
    match.disconnectTimers.forEach((t) => clearTimeout(t));
    if (match.bot) {
      endCompetition(match, winnerSide, reason);
      return;
    }
    const pot = match.tier.stake * 2;
    const rake = Math.floor((pot * config.rakePercent) / 100);
    let ratingDelta = 0;
    store.transaction(() => {
      if (winnerSide === null || winnerSide === undefined) {
        for (const uid of match.players) store.adjustCoins(uid, match.tier.stake, 'refund', match.id);
      } else {
        store.adjustCoins(match.players[winnerSide], pot - rake, 'win', match.id);
        store.addWinnings(match.players[winnerSide], pot - rake);
      }
      ratingDelta = store.recordResult(match.players[0], match.players[1], winnerSide ?? null);
      store.recordGameEnd({
        id: match.id,
        winnerId: winnerSide === null || winnerSide === undefined ? null : match.players[winnerSide],
        reason,
        turns: match.state.turn,
        moves: match.moves,
      });
    });
    match.players.forEach((uid, side) => {
      userMatch.delete(uid);
      const won = winnerSide === side;
      const draw = winnerSide === null || winnerSide === undefined;
      sendUser(uid, {
        t: 'game.over',
        gameId: match.id,
        winner: draw ? null : winnerSide,
        reason,
        payout: draw ? match.tier.stake : won ? pot - rake : 0,
        stake: match.tier.stake,
        ratingDelta: side === SOUTH ? ratingDelta : -ratingDelta,
        state: match.state,
        profile: publicProfile(store.getUser(uid)),
      });
    });
    log(`match ${match.id} over: winner ${winnerSide} (${reason})`);
    // Keep finished matches briefly for late messages, then forget them.
    setTimeout(() => matches.delete(match.id), 60_000).unref?.();
    broadcastLobby();
  }

  /** Settles a competition game: the house pays twice the entry to a winner. */
  function endCompetition(match, winnerSide, reason) {
    const humanSide = 1 - match.botSide;
    const uid = match.players[humanSide];
    const draw = winnerSide === null || winnerSide === undefined;
    const outcome = draw ? 'draw' : winnerSide === humanSide ? 'win' : 'loss';
    const payout = payoutFor(match.competition, outcome);
    let ratingDelta = 0;
    store.transaction(() => {
      if (payout) store.adjustCoins(uid, payout, draw ? 'refund' : 'competition-win', match.id);
      ratingDelta = store.recordCompetitionResult(uid, {
        opponentRating: match.bot.rating,
        score: outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0,
        competition: match.competition.id,
        winnings: outcome === 'win' ? payout : 0,
      });
      store.recordGameEnd({
        id: match.id,
        winnerId: draw ? null : match.players[winnerSide],
        reason,
        turns: match.state.turn,
        moves: match.moves,
      });
    });
    userMatch.delete(uid);
    sendUser(uid, {
      t: 'game.over',
      gameId: match.id,
      winner: draw ? null : winnerSide,
      reason,
      payout,
      stake: match.tier.stake,
      ratingDelta,
      competition: match.competition.id,
      state: match.state,
      profile: publicProfile(store.getUser(uid)),
    });
    log(`competition ${match.id} over: ${outcome} (${reason})`);
    setTimeout(() => matches.delete(match.id), 60_000).unref?.();
  }

  // --- Message dispatch ------------------------------------------------------------------

  const requireUser = (conn) => {
    if (!conn.userId) throw new ClientError('not-signed-in');
    return conn.userId;
  };

  const handlers = {
    ping: () => ({ now: now() }),
    'auth.resume': (conn, { token }) => {
      const user = store.userForToken(token);
      if (!user) throw new ClientError('bad-token');
      return attach(conn, user, token);
    },
    'auth.guest': (conn, { name }) => {
      const user = store.createUser({
        name: sanitizeName(name, `Jogador ${Math.floor(1000 + Math.random() * 9000)}`),
        coins: config.startingCoins,
      });
      return attach(conn, user, store.createSession(user.id));
    },
    'auth.facebook': (conn, { accessToken }) => authFacebook(conn, accessToken),
    'auth.logout': (conn) => {
      if (conn.userId && userMatch.has(conn.userId)) throw new ClientError('in-game');
      if (conn.token) store.deleteSession(conn.token);
      detach(conn);
      conn.token = null;
      return {};
    },
    'profile.get': (conn) => ({ profile: publicProfile(store.getUser(requireUser(conn))) }),
    'profile.rename': (conn, { name }) => {
      const userId = requireUser(conn);
      const clean = sanitizeName(name, null);
      if (!clean) throw new ClientError('bad-name');
      store.updateProfile(userId, { name: clean });
      pushProfile(userId);
      return { profile: publicProfile(store.getUser(userId)) };
    },
    'bonus.claim': (conn) => claimBonus(requireUser(conn)),
    'store.buy': (conn, { pack }) => buyPack(requireUser(conn), pack),
    'spin.play': (conn) => spinWheel(requireUser(conn)),
    'ledger.get': (conn) => ({ entries: store.ledger(requireUser(conn)) }),
    'leaderboard.get': () => ({ players: store.leaderboard(20) }),
    'lobby.get': () => ({ lobby: lobbySnapshot() }),
    'queue.join': (conn, { tier, extraCapture }) => joinQueue(requireUser(conn), tier, extraCapture),
    'queue.leave': (conn) => ({ left: leaveQueues(requireUser(conn)) }),
    'competition.join': (conn, { competition, extraCapture }) =>
      startCompetition(requireUser(conn), competition, extraCapture),
    'profile.avatar': (conn, { avatar }) => {
      const userId = requireUser(conn);
      if (avatar !== null && (typeof avatar !== 'string' || avatar.length > AVATAR_MAX || !AVATAR_RE.test(avatar))) {
        throw new ClientError('bad-avatar');
      }
      store.updateProfile(userId, { avatar });
      pushProfile(userId);
      return { profile: publicProfile(store.getUser(userId)) };
    },
    'game.action': (conn, { gameId, action }) => gameAction(requireUser(conn), gameId, action),
    'game.resign': (conn, { gameId }) => {
      const userId = requireUser(conn);
      const match = matches.get(gameId);
      if (!match || match.over || !match.players.includes(userId)) throw new ClientError('no-game');
      endMatch(match, 1 - match.players.indexOf(userId), 'resign');
      return {};
    },
  };

  async function onMessage(conn, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;
    // Simple flood protection.
    const t = now();
    if (t - conn.windowStart > 1000) {
      conn.windowStart = t;
      conn.count = 0;
    }
    if (++conn.count > config.messagesPerSecond) {
      send(conn, { t: 'reply', id: msg.id, ok: false, error: { code: 'rate-limited' } });
      return;
    }
    const handler = handlers[msg.t];
    try {
      if (!handler) throw new ClientError('unknown-message');
      const data = await handler(conn, msg);
      send(conn, { t: 'reply', id: msg.id, ok: true, data });
    } catch (err) {
      if (!(err instanceof ClientError) && !err.code) log(`error handling ${msg.t}: ${err.stack ?? err}`);
      send(conn, { t: 'reply', id: msg.id, ok: false, error: { code: err.code ?? 'server-error', message: err.message } });
    }
  }

  // --- HTTP + WebSocket ---------------------------------------------------------------------

  const staticRoot = resolve(config.staticDir);
  const httpServer = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/config') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(
        JSON.stringify({
          facebookAppId: config.facebookAppId || null,
          startingCoins: config.startingCoins,
          rakePercent: config.rakePercent,
          turnSeconds: config.turnSeconds,
          tiers: TIERS.map((t) => t.id),
        }),
      );
      return;
    }
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, online: userConns.size, matches: matches.size }));
      return;
    }
    // Serve the production build (npm run build) when present.
    let file = normalize(join(staticRoot, decodeURIComponent(url.pathname)));
    if (!file.startsWith(staticRoot)) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      // Clean URLs: /privacy serves privacy.html (matches vercel.json "cleanUrls").
      file = !extname(file) && existsSync(`${file}.html`) ? `${file}.html` : join(staticRoot, 'index.html');
    }
    if (!existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Run "npm run build" first, or use "npm run dev" for the client.');
      return;
    }
    const type = MIME[extname(file)] ?? 'application/octet-stream';
    const size = statSync(file).size;
    // Byte ranges let browsers stream and loop the background music.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      let end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end || start >= size) {
        res.writeHead(416, { 'content-range': `bytes */${size}` }).end();
        return;
      }
      res.writeHead(206, {
        'content-type': type,
        'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${size}`,
        'content-length': end - start + 1,
      });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size });
    createReadStream(file).pipe(res);
  });

  const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 32 * 1024 });
  wss.on('connection', (ws) => {
    const conn = { ws, userId: null, token: null, windowStart: 0, count: 0, alive: true };
    conns.add(conn);
    ws.on('message', (data) => onMessage(conn, data.toString()));
    ws.on('pong', () => (conn.alive = true));
    ws.on('close', () => {
      conns.delete(conn);
      detach(conn);
    });
    send(conn, { t: 'hello', facebookAppId: config.facebookAppId || null, tiers: TIERS.map((t) => t.id) });
  });

  // Drop dead connections so reconnect grace timers start promptly.
  const heartbeat = setInterval(() => {
    for (const c of conns) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
  }, 15_000);
  heartbeat.unref?.();

  return {
    httpServer,
    wss,
    store,
    matches,
    listen(port = config.port) {
      return new Promise((res) => httpServer.listen(port, () => res(httpServer.address().port)));
    },
    async close() {
      clearInterval(heartbeat);
      for (const m of matches.values()) {
        clearTimeout(m.turnTimer);
        clearTimeout(m.botTimer);
        m.disconnectTimers.forEach((t) => clearTimeout(t));
      }
      await aiPool.close();
      for (const c of conns) c.ws.terminate();
      await new Promise((res) => wss.close(() => res()));
      await new Promise((res) => httpServer.close(() => res()));
      store.close();
    },
  };
}

export { SOUTH, NORTH };
