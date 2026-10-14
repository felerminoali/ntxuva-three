/**
 * Competitions on this device, for players who are not signed in to the game server.
 *
 * The career (coins, record, rating, trophies) lives in localStorage. `LocalCompetition` runs a
 * game against a computer player and speaks the same messages as the server (`match.start`,
 * `game.update`, `game.over`), so the game session plays both kinds of match the same way.
 */
import { NORTH, SOUTH, STATUS, actingPlayer, actionsFor, applyAction, createGame } from './gameLogic.js';
import { requestAiAction } from './aiClient.js';
import { STARTING_RATING, competitionBlocker, drawOpponent, eloDelta, payoutFor, rankTitle } from './competitions.js';
import { levelFor } from './tiers.js';
import { SPIN_SEGMENTS, drawSegment, spinReadyAt } from './spin.js';

export const CAREER_KEY = 'ntuxa.career.v1';
export const DEVICE_STARTING_COINS = 2_000_000;
export const COMPETITION_COLUMNS = 16;
// Covers the opponent-draw animation (about 4.4 s) before the computer may move.
const INTRO_MS = 4500;

function freshCareer(now) {
  return {
    name: '',
    avatar: null,
    coins: DEVICE_STARTING_COINS,
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    rating: STARTING_RATING,
    winnings: 0,
    tournaments: 0,
    trophies: {},
    lastSpinAt: 0,
    active: null,
    createdAt: now,
  };
}

/** The player's career on this device. */
export class DeviceCareer {
  constructor({ storage = globalThis.localStorage, now = () => Date.now() } = {}) {
    this.storage = storage;
    this.now = now;
    this.data = this.load();
    // A game that was still running when the page closed counts as a loss.
    if (this.data.active) {
      const { opponentRating } = this.data.active;
      this.record({ outcome: 'loss', opponentRating, competition: null, payout: 0 });
    }
  }

  load() {
    try {
      const raw = this.storage?.getItem(CAREER_KEY);
      if (raw) return { ...freshCareer(this.now()), ...JSON.parse(raw) };
    } catch {
      // corrupt or unavailable storage: start again
    }
    return freshCareer(this.now());
  }

  save() {
    try {
      this.storage?.setItem(CAREER_KEY, JSON.stringify(this.data));
    } catch {
      // private mode / quota: the career just won't persist
    }
  }

  /** Same shape as the server's public profile, so the UI can render either. */
  get profile() {
    const d = this.data;
    const level = levelFor({ games: d.games, wins: d.wins });
    return {
      id: 'device',
      device: true,
      name: d.name,
      avatar: d.avatar,
      facebook: false,
      coins: d.coins,
      games: d.games,
      wins: d.wins,
      losses: d.losses,
      draws: d.draws,
      rating: d.rating,
      level,
      spinAt: this.spinAt(),
      career: {
        aiGames: d.games,
        aiWins: d.wins,
        aiLosses: d.losses,
        aiDraws: d.draws,
        aiRating: d.rating,
        winnings: d.winnings,
        tournaments: d.tournaments,
        trophies: { ...d.trophies },
        rank: null,
        rankTitle: rankTitle(d.rating),
      },
    };
  }

  /** When the lucky wheel can next be spun (0 = now). */
  spinAt() {
    return spinReadyAt(this.data.lastSpinAt, this.data.coins);
  }

  /** Spins the wheel; returns the segment won, or null when it is not ready yet. */
  spin(rng = Math.random) {
    if (this.spinAt() > this.now()) return null;
    const segment = drawSegment(rng);
    const { coins } = SPIN_SEGMENTS[segment];
    this.data.coins += coins;
    this.data.lastSpinAt = this.now();
    this.save();
    return { segment, coins, profile: this.profile };
  }

  rename(name) {
    this.data.name = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
    this.save();
  }

  setAvatar(avatar) {
    this.data.avatar = avatar || null;
    this.save();
  }

  /** Pays the entry and marks the game as running. */
  enter(competition, opponentRating) {
    const blocker = competitionBlocker(competition, this.data);
    if (blocker) throw Object.assign(new Error(blocker), { code: blocker });
    if (this.data.active) throw Object.assign(new Error('in-game'), { code: 'in-game' });
    this.data.coins -= competition.stake;
    this.data.active = { competition: competition.id, stake: competition.stake, opponentRating };
    this.save();
  }

  /** Settles a game; returns the rating change. */
  record({ outcome, opponentRating, competition, payout }) {
    const d = this.data;
    const score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
    const delta = eloDelta(d.rating, opponentRating ?? d.rating, score);
    d.rating += delta;
    d.games += 1;
    if (outcome === 'win') {
      d.wins += 1;
      d.winnings += payout;
      if (competition) {
        d.tournaments += 1;
        d.trophies[competition] = (d.trophies[competition] ?? 0) + 1;
      }
    } else if (outcome === 'draw') d.draws += 1;
    else d.losses += 1;
    d.coins += payout;
    d.active = null;
    this.save();
    return delta;
  }
}

/**
 * One competition game on this device. `emit(message)` receives server-style pushes.
 * `isPaused()` holds the computer while the player has the pause menu open.
 */
export class LocalCompetition {
  constructor({ career, competition, extraCapture, emit, isPaused = () => false, rng = Math.random, introMs = INTRO_MS, think = [450, 1100] }) {
    Object.assign(this, { career, competition, emit, isPaused, rng, think });
    this.bot = drawOpponent(competition, career.data.rating, rng);
    career.enter(competition, this.bot.rating);
    this.gameId = `local-${Date.now().toString(36)}-${Math.floor(rng() * 1e6).toString(36)}`;
    this.side = rng() < 0.5 ? SOUTH : NORTH;
    this.botSide = 1 - this.side;
    this.extraCapture = !!extraCapture;
    this.state = createGame({ columns: COMPETITION_COLUMNS, extraCapture: this.extraCapture });
    this.records = [];
    this.ply = 0;
    this.over = false;
    this.startsAt = Date.now() + introMs;
  }

  /** The `match.start` message for this game. */
  startMessage() {
    const { id, name, avatar, skill, rating, games, wins, level } = this.bot;
    return {
      t: 'match.start',
      resume: false,
      gameId: this.gameId,
      side: this.side,
      tier: this.competition.id,
      competition: this.competition.id,
      stake: this.competition.stake,
      extraCapture: this.extraCapture,
      opponent: { id, name, avatar, bot: true, facebook: false, skill, rating, games, wins, level },
      opponentConnected: true,
      state: this.state,
      deadline: 0,
      history: [],
      local: true,
    };
  }

  /** Starts the computer's clock (call once the session has the match). */
  begin() {
    this.schedule();
  }

  /** The player's move or extra-bin choice. */
  async send(action) {
    if (this.over) throw Object.assign(new Error('no-game'), { code: 'no-game' });
    if (actingPlayer(this.state) !== this.side) throw Object.assign(new Error('not-your-turn'), { code: 'not-your-turn' });
    this.apply(this.side, { type: action.type, bin: action.bin });
    return { ok: true };
  }

  resign() {
    if (this.over) return;
    this.finish(this.botSide, 'resign');
  }

  /** Stops the computer without settling (the session was torn down). */
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
  }

  apply(side, action) {
    const result = applyAction(this.state, action);
    this.state = result.state;
    this.ply++;
    if (result.state.status !== STATUS.CHOOSING_EXTRA) this.records.push(result.record);
    this.emit({
      t: 'game.update',
      gameId: this.gameId,
      by: side,
      action,
      auto: false,
      events: result.events,
      record: result.record,
      state: this.state,
      deadline: 0,
    });
    if (this.state.status === STATUS.OVER) {
      this.finish(this.state.winner, this.state.endReason);
      return;
    }
    this.schedule();
  }

  schedule() {
    if (this.over || this.disposed || actingPlayer(this.state) !== this.botSide) return;
    const ply = this.ply;
    const [lo, hi] = this.think;
    const wait = Math.max(0, this.startsAt - Date.now()) + lo + this.rng() * (hi - lo);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.playBot(ply), wait);
  }

  async playBot(ply) {
    if (this.over || this.disposed || this.ply !== ply) return;
    if (this.isPaused()) {
      this.timer = setTimeout(() => this.playBot(ply), 250);
      return;
    }
    let action = null;
    try {
      action = await requestAiAction(this.state, this.bot.skill);
    } catch {
      // fall back to a random legal move below
    }
    if (this.over || this.disposed || this.ply !== ply) return;
    const legal = actionsFor(this.state);
    if (!action || !legal.some((a) => a.type === action.type && a.bin === action.bin)) {
      action = legal[Math.floor(this.rng() * legal.length)];
    }
    this.apply(this.botSide, action);
  }

  finish(winnerSide, reason) {
    if (this.over) return;
    this.over = true;
    clearTimeout(this.timer);
    const draw = winnerSide === null || winnerSide === undefined;
    const outcome = draw ? 'draw' : winnerSide === this.side ? 'win' : 'loss';
    const payout = payoutFor(this.competition, outcome);
    const ratingDelta = this.career.record({
      outcome,
      opponentRating: this.bot.rating,
      competition: this.competition.id,
      payout,
    });
    this.emit({
      t: 'game.over',
      gameId: this.gameId,
      winner: draw ? null : winnerSide,
      reason,
      payout,
      stake: this.competition.stake,
      ratingDelta,
      competition: this.competition.id,
      state: this.state,
      profile: this.career.profile,
    });
  }
}
