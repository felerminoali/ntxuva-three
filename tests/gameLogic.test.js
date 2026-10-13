import { describe, expect, it } from 'vitest';
import {
  IllegalMoveError,
  NORTH,
  SOUTH,
  STATUS,
  actionsFor,
  applyAction,
  binAt,
  binLabel,
  chooseExtra,
  columnOf,
  createGame,
  describeRecord,
  isPhaseTwo,
  legalMoves,
  oppositeBins,
  playMove,
  previewMove,
  rowOf,
  seedsOf,
  totalSeeds,
  validateMove,
} from '../src/gameLogic.js';
import { mulberry32 } from './helpers.js';

const N = 8;
const empty = () => new Array(2 * N).fill(0);
function side(entries) {
  const arr = empty();
  for (const [bin, n] of Object.entries(entries)) arr[Number(bin)] = n;
  return arr;
}
function game(south, north, extra = {}) {
  return createGame({ columns: N, bins: [side(south), side(north)], ...extra });
}

describe('initial setup', () => {
  it('creates a 4 x 16 board with two seeds per bin and South to move', () => {
    const s = createGame();
    expect(s.columns).toBe(16);
    expect(s.bins[SOUTH]).toHaveLength(32);
    expect(s.bins[NORTH]).toHaveLength(32);
    expect(s.bins.flat().every((n) => n === 2)).toBe(true);
    expect(totalSeeds(s)).toBe(128);
    expect(s.current).toBe(SOUTH);
    expect(s.status).toBe(STATUS.PLAYING);
    expect(legalMoves(s)).toHaveLength(32);
  });

  it('supports other traditional board sizes', () => {
    for (const columns of [8, 9, 12, 13, 15, 24]) {
      const s = createGame({ columns });
      expect(totalSeeds(s)).toBe(columns * 4 * 2);
    }
  });

  it('rejects invalid configurations', () => {
    expect(() => createGame({ columns: 1 })).toThrow(RangeError);
    expect(() => createGame({ columns: 8, bins: [[1], [1]] })).toThrow(RangeError);
    expect(() => createGame({ startingPlayer: 2 })).toThrow(RangeError);
  });

  it('restarting yields an identical clean state', () => {
    const a = createGame();
    playMove(a, 0);
    const b = createGame();
    expect(a).toEqual(b);
  });
});

describe('board geometry', () => {
  it('maps bins to columns and back for both players', () => {
    for (const player of [SOUTH, NORTH]) {
      for (let bin = 0; bin < 2 * N; bin++) {
        const col = columnOf(N, player, bin);
        expect(binAt(N, player, bin >= N, col)).toBe(bin);
      }
    }
  });

  it('sows anti-clockwise as seen from above (South at the bottom)', () => {
    // South: back row runs west -> east, front row east -> west.
    expect(columnOf(N, SOUTH, 0)).toBe(0);
    expect(columnOf(N, SOUTH, N - 1)).toBe(N - 1);
    expect(columnOf(N, SOUTH, N)).toBe(N - 1);
    expect(rowOf(N, SOUTH, 0)).toBe(0);
    expect(rowOf(N, SOUTH, N)).toBe(1);
    // North: front row runs west -> east, back row east -> west.
    expect(columnOf(N, NORTH, N)).toBe(0);
    expect(columnOf(N, NORTH, 2 * N - 1)).toBe(N - 1);
    expect(columnOf(N, NORTH, 0)).toBe(N - 1);
    expect(rowOf(N, NORTH, N)).toBe(2);
    expect(rowOf(N, NORTH, 0)).toBe(3);
  });

  it('finds the opponent bins in the same column', () => {
    // South front bin 9 is column 6; North front bin 14 and back bin 1 are column 6.
    expect(oppositeBins(N, SOUTH, 9)).toEqual([14, 1]);
    expect(oppositeBins(N, NORTH, 14)).toEqual([9, 6]);
  });

  it('labels bins from the owner\u2019s point of view', () => {
    expect(binLabel(N, 0)).toBe('a1');
    expect(binLabel(N, N - 1)).toBe('a8');
    expect(binLabel(N, N)).toBe('b8');
    expect(binLabel(N, 2 * N - 1)).toBe('b1');
  });
});

describe('sowing', () => {
  it('drops seeds one by one and ends in an empty back-row bin', () => {
    const s = game({ 2: 3 }, { 0: 2 });
    const { state, events, record } = playMove(s, 2);
    expect(state.bins[SOUTH].slice(0, 7)).toEqual([0, 0, 0, 1, 1, 1, 0]);
    expect(state.current).toBe(NORTH);
    expect(state.turn).toBe(2);
    expect(record.sown).toBe(3);
    expect(record.laps).toBe(1);
    expect(record.captured).toBe(0);
    expect(events.filter((e) => e.type === 'sow').map((e) => e.bin)).toEqual([3, 4, 5]);
  });

  it('does not mutate the input state', () => {
    const s = createGame();
    const snapshot = JSON.parse(JSON.stringify(s));
    playMove(s, 5);
    expect(s).toEqual(snapshot);
  });

  it('relays when the last seed lands in a non-empty bin', () => {
    const s = game({ 1: 2, 3: 2 }, { 0: 2 });
    const { state, record, events } = playMove(s, 1);
    expect(record.laps).toBe(2);
    expect(record.sown).toBe(5);
    expect(state.bins[SOUTH].slice(0, 8)).toEqual([0, 0, 1, 0, 1, 1, 1, 0]);
    const pickups = events.filter((e) => e.type === 'pickup');
    expect(pickups.map((e) => [e.bin, e.count, e.relay])).toEqual([
      [1, 2, false],
      [3, 3, true],
    ]);
  });

  it('wraps from the front row back to the back row', () => {
    const s = game({ 15: 2 }, { 0: 2 });
    const { state } = playMove(s, 15);
    expect(state.bins[SOUTH][0]).toBe(1);
    expect(state.bins[SOUTH][1]).toBe(1);
  });

  it('passes through the emptied starting bin on a full lap', () => {
    const s = game({ 0: 16 }, { 0: 2 });
    const { state, record } = playMove(s, 0);
    expect(state.bins[SOUTH].every((n) => n === 1)).toBe(true);
    expect(record.lastBin).toBe(0);
    expect(record.captured).toBe(0);
  });

  it('stops endless relays at the configured safety cap', () => {
    const s = game({ 1: 2, 3: 2 }, { 0: 2 }, { maxSowsPerTurn: 2 });
    const { state, record } = playMove(s, 1);
    expect(record.loopLimited).toBe(true);
    expect(state.current).toBe(NORTH);
    expect(totalSeeds(state)).toBe(totalSeeds(s));
  });
});

describe('captures', () => {
  it('captures the opposite column and lets the player choose an extra bin', () => {
    const s = game({ 6: 3 }, { 14: 3, 1: 2, 5: 4, 10: 1 }, { extraCapture: true });
    const first = playMove(s, 6);
    expect(first.record.lastBin).toBe(9);
    expect(first.state.status).toBe(STATUS.CHOOSING_EXTRA);
    expect(first.state.pendingCapture.options).toEqual([5, 10]);
    expect(first.state.bins[NORTH][14]).toBe(0);
    expect(first.state.bins[NORTH][1]).toBe(0);
    expect(first.events.find((e) => e.type === 'capture').count).toBe(5);
    expect(actionsFor(first.state)).toEqual([
      { type: 'extra', bin: 5 },
      { type: 'extra', bin: 10 },
    ]);
    // Moving is not allowed until the extra bin is chosen.
    expect(validateMove(first.state, 7).code).toBe('awaiting-extra');
    expect(() => chooseExtra(first.state, 0)).toThrow(IllegalMoveError);

    const second = chooseExtra(first.state, 5);
    expect(second.state.status).toBe(STATUS.PLAYING);
    expect(second.state.bins[NORTH][5]).toBe(0);
    expect(second.state.bins[NORTH][10]).toBe(1);
    expect(second.state.captured[SOUTH]).toBe(9);
    expect(second.record.captured).toBe(9);
    expect(second.record.extraLabel).toBe('a6');
    expect(second.state.current).toBe(NORTH);
  });

  it('does not capture when the facing front pit is empty, even if the back pit has seeds', () => {
    const s = game({ 6: 3 }, { 1: 2, 5: 4, 10: 1 }, { extraCapture: true });
    const { state, record, events } = playMove(s, 6);
    expect(record.lastBin).toBe(9);
    expect(record.captured).toBe(0);
    expect(events.some((e) => e.type === 'capture')).toBe(false);
    expect(state.status).toBe(STATUS.PLAYING);
    expect(state.bins[NORTH][1]).toBe(2);
    expect(state.current).toBe(NORTH);
  });

  it('captures the back pit too when the facing front pit has seeds', () => {
    const s = game({ 6: 3 }, { 14: 1, 1: 2, 5: 4 });
    const { state, record } = playMove(s, 6);
    expect(record.captured).toBe(3);
    expect(state.bins[NORTH][14]).toBe(0);
    expect(state.bins[NORTH][1]).toBe(0);
    expect(state.bins[NORTH][5]).toBe(4);
  });

  it('takes the only remaining bin automatically as the extra bin', () => {
    const s = game({ 6: 3 }, { 14: 3, 5: 4 }, { extraCapture: true });
    const { state, record } = playMove(s, 6);
    expect(state.status).toBe(STATUS.OVER);
    expect(record.extra).toBe(5);
    expect(record.captured).toBe(7);
    expect(seedsOf(state, NORTH)).toBe(0);
  });

  it('does not capture when the opposite column is empty', () => {
    const s = game({ 6: 3 }, { 5: 4, 10: 1 });
    const { state, record } = playMove(s, 6);
    expect(record.captured).toBe(0);
    expect(seedsOf(state, NORTH)).toBe(5);
    expect(state.current).toBe(NORTH);
  });

  it('does not capture when ending in the back (non-attacking) row', () => {
    // Ends in bin 5 (column 5); North's column 5 is front bin 13 and back bin 2.
    const s = game({ 2: 3 }, { 13: 2, 2: 2 });
    const { record } = playMove(s, 2);
    expect(record.lastBin).toBe(5);
    expect(record.captured).toBe(0);
  });

  it('only captures after the final relay lap', () => {
    // First lap ends in South 9 (non-empty) -> relay continues beyond the attacking bin.
    const s = game({ 7: 2, 9: 1 }, { 14: 3, 1: 2, 4: 1 });
    const { record, state } = playMove(s, 7);
    expect(record.laps).toBe(2);
    expect(record.lastBin).toBe(11);
    // Column of bin 11 is 4 -> North 12 and 3 are empty, so nothing is captured.
    expect(record.captured).toBe(0);
    expect(seedsOf(state, NORTH)).toBe(6);
  });

  it('North captures symmetrically', () => {
    // North front bin 14 (column 6) is opposite South front bin 9 and back bin 6.
    const s = game({ 9: 2, 6: 1, 0: 3 }, { 11: 3, 0: 2 }, { startingPlayer: NORTH, extraCapture: true });
    const { state, record } = playMove(s, 11);
    expect(record.lastBin).toBe(14);
    expect(record.captured).toBe(6);
    expect(state.status).toBe(STATUS.OVER);
    expect(seedsOf(state, SOUTH)).toBe(0);
    expect(state.winner).toBe(NORTH);
  });
});

describe('default capture rule (column only)', () => {
  it('captures only the opposite column and passes the turn', () => {
    const s = game({ 6: 3 }, { 14: 3, 1: 2, 5: 4, 10: 1 });
    expect(s.extraCapture).toBe(false);
    const { state, record, events } = playMove(s, 6);
    expect(state.status).toBe(STATUS.PLAYING);
    expect(record.captured).toBe(5);
    expect(record.extra).toBe(null);
    expect(state.bins[NORTH][5]).toBe(4);
    expect(state.bins[NORTH][10]).toBe(1);
    expect(events.some((e) => e.type === 'chooseExtra')).toBe(false);
    expect(state.current).toBe(NORTH);
  });

  it('does not take a remaining bin automatically', () => {
    const s = game({ 6: 3 }, { 14: 3, 5: 4 });
    const { state, record } = playMove(s, 6);
    expect(state.status).toBe(STATUS.PLAYING);
    expect(record.captured).toBe(3);
    expect(seedsOf(state, NORTH)).toBe(4);
  });

  it('still ends the game when the column held all remaining seeds', () => {
    const s = game({ 6: 3 }, { 14: 3, 1: 2 });
    const { state } = playMove(s, 6);
    expect(state.status).toBe(STATUS.OVER);
    expect(state.winner).toBe(SOUTH);
  });
});
describe('phases and legality', () => {
  it('phase one forbids single seeds while a bin has more than one', () => {
    const s = game({ 0: 1, 4: 2 }, { 0: 2 });
    expect(legalMoves(s)).toEqual([4]);
    expect(isPhaseTwo(s)).toBe(false);
    expect(validateMove(s, 0).code).toBe('phase-one-single');
    expect(() => playMove(s, 0)).toThrow(IllegalMoveError);
  });

  it('phase two allows single seeds whose next bin is empty', () => {
    const s = game({ 0: 1, 1: 1, 3: 1, 8: 1, 9: 1 }, { 0: 2 });
    expect(isPhaseTwo(s)).toBe(true);
    expect(legalMoves(s)).toEqual([1, 3, 9]);
    expect(validateMove(s, 0).code).toBe('next-not-empty');
    expect(validateMove(s, 8).code).toBe('next-not-empty');
  });

  it('rejects empty bins, bad indices and moves after the game ends', () => {
    const s = createGame({ columns: N });
    expect(validateMove(s, -1).code).toBe('not-a-bin');
    expect(validateMove(s, 16).code).toBe('not-a-bin');
    expect(validateMove(s, 1.5).code).toBe('not-a-bin');
    const t = game({ 2: 3 }, { 0: 2 });
    expect(validateMove(t, 0).code).toBe('empty');
    const over = game({ 12: 2 }, { 9: 2, 6: 1 });
    const done = playMove(over, 12).state;
    expect(done.status).toBe(STATUS.OVER);
    expect(validateMove(done, 13).code).toBe('game-over');
    expect(legalMoves(done)).toEqual([]);
  });

  it('alternates turns', () => {
    let s = createGame({ columns: N });
    const order = [];
    for (let i = 0; i < 6 && s.status === STATUS.PLAYING; i++) {
      order.push(s.current);
      s = playMove(s, legalMoves(s)[0]).state;
      if (s.status === STATUS.CHOOSING_EXTRA) s = chooseExtra(s, s.pendingCapture.options[0]).state;
    }
    expect(order).toEqual([SOUTH, NORTH, SOUTH, NORTH, SOUTH, NORTH].slice(0, order.length));
  });
});

describe('end of game', () => {
  it('a player wins by capturing all of the opponent\u2019s seeds', () => {
    const s = game({ 12: 2 }, { 9: 2, 6: 1 });
    const { state, events } = playMove(s, 12);
    expect(state.status).toBe(STATUS.OVER);
    expect(state.winner).toBe(SOUTH);
    expect(state.endReason).toBe('captured-all');
    expect(events.at(-1)).toEqual({ type: 'gameOver', winner: SOUTH, reason: 'captured-all' });
  });

  it('a player with seeds but no legal move loses', () => {
    const north = {};
    for (let i = 0; i < 2 * N; i++) north[i] = 1;
    // South sows into its back row, North is left with 16 singles and no empty bin.
    const s = game({ 2: 3 }, north);
    const { state } = playMove(s, 2);
    expect(state.status).toBe(STATUS.OVER);
    expect(state.winner).toBe(SOUTH);
    expect(state.endReason).toBe('no-moves');
  });

  it('the optional move limit ends the game on material', () => {
    let s = createGame({ columns: N, moveLimit: 2 });
    s = playMove(s, legalMoves(s)[0]).state;
    if (s.status === STATUS.CHOOSING_EXTRA) s = chooseExtra(s, s.pendingCapture.options[0]).state;
    s = playMove(s, legalMoves(s)[0]).state;
    if (s.status === STATUS.CHOOSING_EXTRA) s = chooseExtra(s, s.pendingCapture.options[0]).state;
    expect(s.status).toBe(STATUS.OVER);
    expect(s.endReason).toBe('move-limit');
  });

  it('a custom position that is already decided starts as over', () => {
    const s = game({ 0: 2 }, {});
    expect(s.status).toBe(STATUS.OVER);
    expect(s.winner).toBe(SOUTH);
  });
});

describe('random playouts preserve the invariants', () => {
  it('conserves seeds, never goes negative and only plays legal moves', () => {
    const rng = mulberry32(42);
    let finished = 0;
    for (let g = 0; g < 60; g++) {
      let s = createGame({ columns: [8, 12, 16][g % 3], extraCapture: g % 2 === 0 });
      const initial = totalSeeds(s);
      for (let turn = 0; turn < 400 && s.status !== STATUS.OVER; turn++) {
        const actions = actionsFor(s);
        expect(actions.length).toBeGreaterThan(0);
        const action = actions[Math.floor(rng() * actions.length)];
        const before = s.current;
        const result = applyAction(s, action);
        s = result.state;
        expect(s.bins.flat().every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
        expect(totalSeeds(s) + s.captured[0] + s.captured[1]).toBe(initial);
        if (s.status === STATUS.PLAYING) {
          const turnOver = result.events.some((e) => e.type === 'turnEnd');
          expect(s.current).toBe(turnOver ? 1 - before : before);
        }
      }
      if (s.status === STATUS.OVER) {
        finished++;
        expect(s.winner === SOUTH || s.winner === NORTH).toBe(true);
      }
    }
    expect(finished).toBeGreaterThan(0);
  });
});

describe('previews and descriptions', () => {
  it('previews a move without changing the game', () => {
    const s = game({ 6: 3 }, { 14: 3, 1: 2, 5: 4, 10: 1 }, { extraCapture: true });
    const p = previewMove(s, 6);
    expect(p.ok).toBe(true);
    expect(p.needsExtra).toBe(true);
    expect(p.record.captured).toBe(5);
    expect(s.bins[NORTH][14]).toBe(3);
    expect(previewMove(s, 0).ok).toBe(false);
  });

  it('describes a move record', () => {
    const s = game({ 6: 3 }, { 14: 3, 5: 4 }, { extraCapture: true });
    const { record } = playMove(s, 6);
    expect(describeRecord(record, N)).toBe('South a7: 3 sown, ends b7 \u2014 captures 7 (extra a6)');
  });
});
