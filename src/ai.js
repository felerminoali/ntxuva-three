/**
 * Ntuxa computer opponent.
 *
 * - easy:   mostly greedy one-ply play with frequent random choices.
 * - medium: shallow minimax with alpha-beta pruning.
 * - hard:   iterative-deepening minimax with alpha-beta pruning and a time budget.
 *
 * Every candidate comes from the rules engine (`actionsFor`), so the AI can only make legal moves.
 */
import { STATUS, actionsFor, applyAction, actingPlayer, legalMovesFor, seedsOf } from './gameLogic.js';

export const DIFFICULTIES = Object.freeze({
  easy: { maxDepth: 1, timeMs: 200, randomness: 0.4 },
  medium: { maxDepth: 3, timeMs: 700, randomness: 0 },
  hard: { maxDepth: 12, timeMs: 1800, randomness: 0 },
});

const WIN = 1_000_000;
const EXTRA_BRANCH_LIMIT = 4;

class Timeout extends Error {}

export function evaluate(state, me) {
  if (state.status === STATUS.OVER) {
    if (state.winner === null) return 0;
    return state.winner === me ? WIN : -WIN;
  }
  const them = 1 - me;
  const material = seedsOf(state, me) - seedsOf(state, them);
  const mobility = legalMovesFor(state, me).length - legalMovesFor(state, them).length;
  // Seeds in the attacking row threaten captures but are also exposed to them.
  let front = 0;
  const { columns } = state;
  for (let i = columns; i < 2 * columns; i++) {
    front += (state.bins[me][i] > 0 ? 1 : 0) - (state.bins[them][i] > 0 ? 1 : 0);
  }
  return material * 10 + mobility * 0.5 + front * 0.2;
}

function orderedChildren(state, me, root) {
  let actions = actionsFor(state);
  if (!root && state.status === STATUS.CHOOSING_EXTRA && actions.length > EXTRA_BRANCH_LIMIT) {
    const opp = 1 - state.pendingCapture.player;
    actions = actions
      .slice()
      .sort((a, b) => state.bins[opp][b.bin] - state.bins[opp][a.bin])
      .slice(0, EXTRA_BRANCH_LIMIT);
  }
  const children = actions.map((action) => {
    const next = applyAction(state, action).state;
    return { action, state: next, quick: evaluate(next, me) };
  });
  const maximizing = actingPlayer(state) === me;
  children.sort((a, b) => (maximizing ? b.quick - a.quick : a.quick - b.quick));
  return children;
}

function minimax(state, depth, alpha, beta, me, deadline, counter) {
  if ((++counter.nodes & 255) === 0 && Date.now() > deadline) throw new Timeout();
  if (state.status === STATUS.OVER || depth <= 0) {
    const score = evaluate(state, me);
    // Prefer quicker wins and slower losses.
    return score >= WIN ? score + depth : score <= -WIN ? score - depth : score;
  }
  const maximizing = actingPlayer(state) === me;
  const children = orderedChildren(state, me, false);
  let best = maximizing ? -Infinity : Infinity;
  for (const child of children) {
    // Choosing the extra bin continues the same turn and does not consume depth.
    const nextDepth = child.action.type === 'extra' ? depth : depth - 1;
    const value = minimax(child.state, nextDepth, alpha, beta, me, deadline, counter);
    if (maximizing) {
      if (value > best) best = value;
      if (best > alpha) alpha = best;
    } else {
      if (value < best) best = value;
      if (best < beta) beta = best;
    }
    if (beta <= alpha) break;
  }
  return best;
}

/**
 * Picks an action for the player who must act in `state`.
 * @returns {{type:'move'|'extra', bin:number}|null}
 */
export function chooseAction(state, { difficulty = 'medium', rng = Math.random, timeMs, maxDepth } = {}) {
  const config = DIFFICULTIES[difficulty] ?? DIFFICULTIES.medium;
  const me = actingPlayer(state);
  if (me === null) return null;
  const actions = actionsFor(state);
  if (actions.length === 0) return null;
  if (actions.length === 1) return actions[0];
  if (config.randomness && rng() < config.randomness) {
    return actions[Math.floor(rng() * actions.length)];
  }

  const deadline = Date.now() + (timeMs ?? config.timeMs);
  const depthLimit = maxDepth ?? config.maxDepth;
  const rootChildren = orderedChildren(state, me, true);
  let bestAction = rootChildren[0].action;
  const counter = { nodes: 0 };

  for (let depth = 1; depth <= depthLimit; depth++) {
    try {
      let alpha = -Infinity;
      let depthBest = null;
      let depthBestValue = -Infinity;
      const scored = [];
      for (const child of rootChildren) {
        const nextDepth = child.action.type === 'extra' ? depth : depth - 1;
        const value = minimax(child.state, nextDepth, alpha, Infinity, me, deadline, counter);
        scored.push({ child, value });
        if (value > depthBestValue) {
          depthBestValue = value;
          depthBest = child.action;
        }
        if (value > alpha) alpha = value;
      }
      bestAction = depthBest;
      // Search the best line first next iteration.
      scored.sort((a, b) => b.value - a.value);
      rootChildren.splice(0, rootChildren.length, ...scored.map((s) => s.child));
      if (depthBestValue >= WIN) break;
    } catch (err) {
      if (err instanceof Timeout) break;
      throw err;
    }
    if (Date.now() > deadline) break;
  }
  return bestAction;
}
