import { describe, expect, it } from 'vitest';
import { chooseAction, evaluate } from '../src/ai.js';
import { NORTH, SOUTH, STATUS, actionsFor, applyAction, createGame } from '../src/gameLogic.js';
import { mulberry32 } from './helpers.js';

const N = 8;
const side = (entries) => {
  const arr = new Array(2 * N).fill(0);
  for (const [bin, n] of Object.entries(entries)) arr[Number(bin)] = n;
  return arr;
};

const isLegal = (state, action) =>
  actionsFor(state).some((a) => a.type === action.type && a.bin === action.bin);

describe('AI opponent', () => {
  it('returns a legal move from the opening for every difficulty', () => {
    const s = createGame();
    for (const difficulty of ['easy', 'medium', 'hard']) {
      const action = chooseAction(s, { difficulty, timeMs: 150, rng: mulberry32(1) });
      expect(isLegal(s, action)).toBe(true);
    }
  });

  it('finds an immediate winning capture', () => {
    const s = createGame({ columns: N, bins: [side({ 12: 2, 0: 3 }), side({ 9: 2, 6: 1 })] });
    const action = chooseAction(s, { difficulty: 'medium' });
    expect(action).toEqual({ type: 'move', bin: 12 });
  });

  it('chooses the richest extra bin when it ends the game', () => {
    const s0 = createGame({ columns: N, bins: [side({ 6: 3, 0: 2 }), side({ 14: 3, 5: 1, 10: 1 })], extraCapture: true });
    const { state } = applyAction(s0, { type: 'move', bin: 6 });
    expect(state.status).toBe(STATUS.CHOOSING_EXTRA);
    const action = chooseAction(state, { difficulty: 'hard', timeMs: 300 });
    expect(action.type).toBe('extra');
    expect(isLegal(state, action)).toBe(true);
  });

  it('returns null when nothing can be played', () => {
    const s = createGame({ columns: N, bins: [side({ 0: 2 }), side({})] });
    expect(chooseAction(s)).toBeNull();
  });

  it('evaluates wins and losses from the right perspective', () => {
    const s = createGame({ columns: N, bins: [side({ 0: 2 }), side({})] });
    expect(evaluate(s, SOUTH)).toBeGreaterThan(0);
    expect(evaluate(s, NORTH)).toBeLessThan(0);
  });

  it('only ever makes legal moves in full AI vs AI games', () => {
    const rng = mulberry32(7);
    for (const [a, b] of [
      ['easy', 'medium'],
      ['medium', 'easy'],
    ]) {
      let s = createGame({ columns: N });
      for (let turn = 0; turn < 300 && s.status !== STATUS.OVER; turn++) {
        const actor = s.status === STATUS.CHOOSING_EXTRA ? s.pendingCapture.player : s.current;
        const action = chooseAction(s, { difficulty: actor === SOUTH ? a : b, timeMs: 30, rng });
        expect(isLegal(s, action)).toBe(true);
        s = applyAction(s, action).state;
      }
    }
  });

  it('a searching AI beats a random player most of the time', () => {
    const rng = mulberry32(11);
    let wins = 0;
    const games = 6;
    for (let g = 0; g < games; g++) {
      let s = createGame({ columns: N, startingPlayer: g % 2, extraCapture: g % 2 === 0 });
      for (let turn = 0; turn < 400 && s.status !== STATUS.OVER; turn++) {
        const actor = s.status === STATUS.CHOOSING_EXTRA ? s.pendingCapture.player : s.current;
        let action;
        if (actor === SOUTH) {
          action = chooseAction(s, { difficulty: 'medium', timeMs: 40, maxDepth: 2 });
        } else {
          const actions = actionsFor(s);
          action = actions[Math.floor(rng() * actions.length)];
        }
        s = applyAction(s, action).state;
      }
      if (s.winner === SOUTH) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(4);
  });
});
