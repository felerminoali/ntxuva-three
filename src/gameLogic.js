/**
 * Ntuxa (Ntxuva) rules engine.
 *
 * Pure, DOM-free and Three.js-free so it can be unit-tested and reused by the AI worker.
 *
 * Board model
 * -----------
 * The board has 4 rows of `columns` bins. Each player owns the two rows on their side
 * and only ever sows inside those 2 * columns bins. A player's bins are indexed
 * 0 .. 2*columns-1 following that player's anti-clockwise sowing loop:
 *
 *   indices 0 .. columns-1          outer (back / non-attacking) row, left -> right from
 *                                   the owner's point of view
 *   indices columns .. 2*columns-1  inner (front / attacking) row, right -> left from the
 *                                   owner's point of view
 *
 * so sowing is simply `bin = (bin + 1) % (2 * columns)`.
 *
 * Global columns are numbered 0 .. columns-1 from west to east as seen by South.
 */

export const SOUTH = 0;
export const NORTH = 1;
export const PLAYER_NAMES = Object.freeze(['South', 'North']);

/** Board sizes documented for traditional Ntxuva boards (columns per row, 4 rows). */
export const SUPPORTED_COLUMNS = Object.freeze([8, 9, 12, 13, 15, 16, 24]);

export const DEFAULT_OPTIONS = Object.freeze({
  columns: 16,
  seedsPerBin: 2,
  startingPlayer: SOUTH,
  /** Safety cap on seeds sown in one turn, guarding against endless relay loops. */
  maxSowsPerTurn: 20000,
  /** Optional house rule: 0 = disabled; otherwise the game ends after this many turns. */
  moveLimit: 0,
  /** Optional rule: after a column capture, also take one opponent bin of the capturer's choice. */
  extraCapture: false,
});

export const STATUS = Object.freeze({
  PLAYING: 'playing',
  CHOOSING_EXTRA: 'choosingExtra',
  OVER: 'over',
});

export class IllegalMoveError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'IllegalMoveError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

export function binCount(columns) {
  return columns * 2;
}

export function isAttackingBin(columns, bin) {
  return bin >= columns;
}

/** Global column (0 = west from South's view) of a player's bin. */
export function columnOf(columns, player, bin) {
  if (player === SOUTH) return bin < columns ? bin : 2 * columns - 1 - bin;
  return bin < columns ? columns - 1 - bin : bin - columns;
}

/** Bin index of a player's bin at a global column in the attacking (inner) or outer row. */
export function binAt(columns, player, attacking, column) {
  if (player === SOUTH) return attacking ? 2 * columns - 1 - column : column;
  return attacking ? column + columns : columns - 1 - column;
}

/** Board row 0..3 (0 = South outer, 1 = South inner, 2 = North inner, 3 = North outer). */
export function rowOf(columns, player, bin) {
  const attacking = isAttackingBin(columns, bin);
  if (player === SOUTH) return attacking ? 1 : 0;
  return attacking ? 2 : 3;
}

/** The opponent's [inner, outer] bins in the same column as `bin`. */
export function oppositeBins(columns, player, bin) {
  const column = columnOf(columns, player, bin);
  const opponent = 1 - player;
  return [binAt(columns, opponent, true, column), binAt(columns, opponent, false, column)];
}

/**
 * Human-readable bin label from the owner's point of view:
 * "a" = back row, "b" = front (attacking) row, numbered 1..columns from the owner's left.
 */
export function binLabel(columns, bin) {
  return bin < columns ? `a${bin + 1}` : `b${2 * columns - bin}`;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function createGame(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { columns, seedsPerBin } = opts;
  if (!Number.isInteger(columns) || columns < 2) {
    throw new RangeError(`columns must be an integer >= 2 (got ${columns})`);
  }
  if (!Number.isInteger(seedsPerBin) || seedsPerBin < 0) {
    throw new RangeError(`seedsPerBin must be a non-negative integer (got ${seedsPerBin})`);
  }
  if (opts.startingPlayer !== SOUTH && opts.startingPlayer !== NORTH) {
    throw new RangeError('startingPlayer must be SOUTH (0) or NORTH (1)');
  }
  const size = binCount(columns);
  let bins;
  if (opts.bins) {
    if (!Array.isArray(opts.bins) || opts.bins.length !== 2) throw new RangeError('bins must be [south[], north[]]');
    bins = opts.bins.map((side) => {
      if (!Array.isArray(side) || side.length !== size) throw new RangeError(`each side needs ${size} bins`);
      return side.map((n) => {
        if (!Number.isInteger(n) || n < 0) throw new RangeError('bin counts must be non-negative integers');
        return n;
      });
    });
  } else {
    bins = [new Array(size).fill(seedsPerBin), new Array(size).fill(seedsPerBin)];
  }

  const state = {
    columns,
    bins,
    current: opts.startingPlayer,
    status: STATUS.PLAYING,
    winner: null,
    endReason: null,
    pendingCapture: null,
    turn: 1,
    captured: [0, 0],
    moveLimit: opts.moveLimit || 0,
    maxSowsPerTurn: opts.maxSowsPerTurn,
    extraCapture: !!opts.extraCapture,
  };

  // Custom positions may already be decided.
  for (const player of [SOUTH, NORTH]) {
    if (seedsOf(state, player) === 0) {
      state.status = STATUS.OVER;
      state.winner = 1 - player;
      state.endReason = 'captured-all';
      return state;
    }
  }
  if (legalMovesFor(state, state.current).length === 0) {
    state.status = STATUS.OVER;
    state.winner = 1 - state.current;
    state.endReason = 'no-moves';
  }
  return state;
}

export function cloneState(state) {
  return {
    ...state,
    bins: [state.bins[0].slice(), state.bins[1].slice()],
    captured: state.captured.slice(),
    pendingCapture: state.pendingCapture
      ? {
          ...state.pendingCapture,
          options: state.pendingCapture.options.slice(),
          record: cloneRecord(state.pendingCapture.record),
        }
      : null,
  };
}

function cloneRecord(record) {
  return { ...record, capturedBins: record.capturedBins.map((c) => ({ ...c })) };
}

export function seedsOf(state, player) {
  let total = 0;
  for (const n of state.bins[player]) total += n;
  return total;
}

export function totalSeeds(state) {
  return seedsOf(state, SOUTH) + seedsOf(state, NORTH);
}

/** Who has to act now (the capturer while an extra bin is being chosen). */
export function actingPlayer(state) {
  if (state.status === STATUS.CHOOSING_EXTRA) return state.pendingCapture.player;
  if (state.status === STATUS.PLAYING) return state.current;
  return null;
}

/**
 * Phase two starts (for a player) once every non-empty bin on their side holds exactly one seed.
 */
export function isPhaseTwo(state, player = state.current) {
  let any = false;
  for (const n of state.bins[player]) {
    if (n > 1) return false;
    if (n === 1) any = true;
  }
  return any;
}

/** Legal bins for `player`, regardless of whose turn it is. */
export function legalMovesFor(state, player) {
  const own = state.bins[player];
  const size = own.length;
  const multi = [];
  for (let i = 0; i < size; i++) if (own[i] > 1) multi.push(i);
  if (multi.length) return multi;
  const singles = [];
  for (let i = 0; i < size; i++) if (own[i] === 1 && own[(i + 1) % size] === 0) singles.push(i);
  return singles;
}

export function legalMoves(state) {
  if (state.status !== STATUS.PLAYING) return [];
  return legalMovesFor(state, state.current);
}

/** Opponent bins that may be taken as the "extra" bin after a column capture. */
export function extraOptions(state, opponent) {
  const options = [];
  state.bins[opponent].forEach((n, i) => {
    if (n > 0) options.push(i);
  });
  return options;
}

/** Explains why a bin cannot be played; `{ ok: true }` when it can. */
export function validateMove(state, bin) {
  if (state.status === STATUS.OVER) return { ok: false, code: 'game-over', message: 'The game is over.' };
  if (state.status === STATUS.CHOOSING_EXTRA) {
    return { ok: false, code: 'awaiting-extra', message: 'Choose an extra opponent bin to capture first.' };
  }
  const size = binCount(state.columns);
  if (!Number.isInteger(bin) || bin < 0 || bin >= size) {
    return { ok: false, code: 'not-a-bin', message: 'That is not one of your bins.' };
  }
  const own = state.bins[state.current];
  if (own[bin] === 0) return { ok: false, code: 'empty', message: 'That bin is empty.' };
  if (own[bin] === 1) {
    if (own.some((n) => n > 1)) {
      return {
        ok: false,
        code: 'phase-one-single',
        message: 'While you have a bin with more than one seed, you cannot play a single seed.',
      };
    }
    if (own[(bin + 1) % size] !== 0) {
      return {
        ok: false,
        code: 'next-not-empty',
        message: 'In phase two a single seed may only be played into an empty next bin.',
      };
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

/**
 * Plays `bin` for the current player.
 * Returns `{ state, events, record }`. When a capture leaves more than one possible
 * extra bin, the returned state has status CHOOSING_EXTRA and `chooseExtra` must be called.
 */
export function playMove(state, bin) {
  const check = validateMove(state, bin);
  if (!check.ok) throw new IllegalMoveError(check.code, check.message);

  const s = cloneState(state);
  const player = s.current;
  const { columns } = s;
  const own = s.bins[player];
  const size = own.length;
  const events = [];
  const record = {
    turn: s.turn,
    player,
    bin,
    label: binLabel(columns, bin),
    seeds: own[bin],
    sown: 0,
    laps: 1,
    lastBin: bin,
    captured: 0,
    capturedBins: [],
    extra: null,
    extraLabel: null,
    extraCount: 0,
    loopLimited: false,
    result: null,
  };

  let hand = own[bin];
  own[bin] = 0;
  events.push({ type: 'pickup', player, bin, count: hand, relay: false });
  let pos = bin;
  for (;;) {
    while (hand > 0) {
      pos = (pos + 1) % size;
      own[pos] += 1;
      hand -= 1;
      record.sown += 1;
      events.push({ type: 'sow', player, bin: pos });
    }
    if (own[pos] > 1) {
      // The last seed fell into a non-empty bin: pick everything up and keep sowing.
      if (record.sown >= s.maxSowsPerTurn) {
        record.loopLimited = true;
        events.push({ type: 'loopLimit', player, bin: pos });
        break;
      }
      hand = own[pos];
      own[pos] = 0;
      record.laps += 1;
      events.push({ type: 'pickup', player, bin: pos, count: hand, relay: true });
      continue;
    }
    break;
  }
  record.lastBin = pos;

  if (!record.loopLimited && isAttackingBin(columns, pos)) {
    const opponent = 1 - player;
    const taken = [];
    for (const b of oppositeBins(columns, player, pos)) {
      const n = s.bins[opponent][b];
      if (n > 0) {
        taken.push({ bin: b, count: n });
        s.bins[opponent][b] = 0;
      }
    }
    if (taken.length) {
      const count = taken.reduce((a, t) => a + t.count, 0);
      s.captured[player] += count;
      record.captured += count;
      record.capturedBins.push(...taken);
      events.push({
        type: 'capture',
        player,
        from: opponent,
        kind: 'column',
        column: columnOf(columns, player, pos),
        bins: taken,
        count,
      });
      const options = s.extraCapture ? extraOptions(s, opponent) : [];
      if (options.length > 1) {
        s.status = STATUS.CHOOSING_EXTRA;
        s.pendingCapture = { player, options, record };
        events.push({ type: 'chooseExtra', player, options: options.slice() });
        return { state: s, events, record: cloneRecord(record) };
      }
      if (options.length === 1) takeExtra(s, player, options[0], events, record);
    }
  }

  finishTurn(s, player, events, record);
  return { state: s, events, record };
}

/** Completes a pending capture by taking the chosen opponent bin. */
export function chooseExtra(state, bin) {
  if (state.status !== STATUS.CHOOSING_EXTRA) {
    throw new IllegalMoveError('no-pending-capture', 'There is no capture waiting for an extra bin.');
  }
  if (!state.pendingCapture.options.includes(bin)) {
    throw new IllegalMoveError('not-an-option', 'Choose a non-empty bin on your opponent\u2019s side.');
  }
  const s = cloneState(state);
  const { player, record } = s.pendingCapture;
  s.pendingCapture = null;
  s.status = STATUS.PLAYING;
  const events = [];
  takeExtra(s, player, bin, events, record);
  finishTurn(s, player, events, record);
  return { state: s, events, record };
}

function takeExtra(s, player, bin, events, record) {
  const opponent = 1 - player;
  const count = s.bins[opponent][bin];
  s.bins[opponent][bin] = 0;
  s.captured[player] += count;
  record.captured += count;
  record.extra = bin;
  record.extraLabel = binLabel(s.columns, bin);
  record.extraCount = count;
  record.capturedBins.push({ bin, count, extra: true });
  events.push({ type: 'capture', player, from: opponent, kind: 'extra', bins: [{ bin, count }], count });
}

function finishTurn(s, player, events, record) {
  const opponent = 1 - player;
  if (seedsOf(s, opponent) === 0) {
    endGame(s, player, 'captured-all');
  } else {
    s.current = opponent;
    s.turn += 1;
    if (legalMovesFor(s, opponent).length === 0) {
      endGame(s, player, 'no-moves');
    } else if (s.moveLimit && s.turn > s.moveLimit) {
      const south = seedsOf(s, SOUTH);
      const north = seedsOf(s, NORTH);
      endGame(s, south === north ? null : south > north ? SOUTH : NORTH, 'move-limit');
    }
  }
  record.result = s.status === STATUS.OVER ? { winner: s.winner, reason: s.endReason } : null;
  events.push({ type: 'turnEnd', player, next: s.status === STATUS.OVER ? null : s.current });
  if (s.status === STATUS.OVER) events.push({ type: 'gameOver', winner: s.winner, reason: s.endReason });
}

function endGame(s, winner, reason) {
  s.status = STATUS.OVER;
  s.winner = winner;
  s.endReason = reason;
}

// ---------------------------------------------------------------------------
// Uniform action interface (used by the AI and by tests)
// ---------------------------------------------------------------------------

export function actionsFor(state) {
  if (state.status === STATUS.CHOOSING_EXTRA) {
    return state.pendingCapture.options.map((bin) => ({ type: 'extra', bin }));
  }
  return legalMoves(state).map((bin) => ({ type: 'move', bin }));
}

export function applyAction(state, action) {
  return action.type === 'extra' ? chooseExtra(state, action.bin) : playMove(state, action.bin);
}

/** Predicts the outcome of a move without changing `state` (used for previews/hints). */
export function previewMove(state, bin) {
  const check = validateMove(state, bin);
  if (!check.ok) return { ok: false, ...check };
  const { state: next, record } = playMove(state, bin);
  return { ok: true, record, needsExtra: next.status === STATUS.CHOOSING_EXTRA, state: next };
}

export function describeRecord(record, columns) {
  const who = PLAYER_NAMES[record.player];
  let text = `${who} ${record.label}: ${record.sown} sown`;
  if (record.laps > 1) text += `, ${record.laps - 1} relay${record.laps > 2 ? 's' : ''}`;
  text += `, ends ${binLabel(columns, record.lastBin)}`;
  if (record.captured) {
    text += ` \u2014 captures ${record.captured}`;
    if (record.extraLabel) text += ` (extra ${record.extraLabel})`;
  }
  if (record.loopLimited) text += ' (loop limit)';
  return text;
}
