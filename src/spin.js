/**
 * Lucky wheel ("Roda da sorte"), shared by the browser (device profile) and the server.
 *
 * A free spin is offered every few hours and offered right away to anyone who cannot afford the
 * cheapest competition, so a player who lost their coins can always get back to the table.
 */
import { COMPETITIONS } from './competitions.js';

export const SPIN_COOLDOWN_MS = 4 * 3600 * 1000;
/** Below this many coins (the cheapest entry) the wheel is always available. */
export const SPIN_RESCUE_BELOW = Math.min(...COMPETITIONS.map((c) => c.stake));

/** Wheel segments, clockwise from the top. `weight` is the relative chance of landing there. */
export const SPIN_SEGMENTS = Object.freeze([
  { coins: 250_000, weight: 18 },
  { coins: 1_000_000, weight: 14 },
  { coins: 500_000, weight: 18 },
  { coins: 5_000_000, weight: 2 },
  { coins: 300_000, weight: 18 },
  { coins: 2_000_000, weight: 8 },
  { coins: 750_000, weight: 16 },
  { coins: 10_000_000, weight: 1 },
]);

const TOTAL_WEIGHT = SPIN_SEGMENTS.reduce((sum, s) => sum + s.weight, 0);

/** When the next spin is available (0 = now) for a player with `coins` who last spun at `lastSpinAt`. */
export function spinReadyAt(lastSpinAt, coins, cooldownMs = SPIN_COOLDOWN_MS) {
  if (coins < SPIN_RESCUE_BELOW) return 0;
  return (lastSpinAt ?? 0) + cooldownMs;
}

/** Picks a segment index by weight. */
export function drawSegment(rng = Math.random) {
  let r = rng() * TOTAL_WEIGHT;
  for (let i = 0; i < SPIN_SEGMENTS.length; i++) {
    r -= SPIN_SEGMENTS[i].weight;
    if (r < 0) return i;
  }
  return SPIN_SEGMENTS.length - 1;
}
