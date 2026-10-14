import { describe, it, expect } from 'vitest';
import { SPIN_COOLDOWN_MS, SPIN_RESCUE_BELOW, SPIN_SEGMENTS, drawSegment, spinReadyAt } from '../src/spin.js';
import { COMPETITIONS } from '../src/competitions.js';
import { DeviceCareer, LocalCompetition } from '../src/arenaLocal.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) };
}

describe('lucky wheel', () => {
  it('is free right away for players who cannot afford the cheapest competition', () => {
    expect(SPIN_RESCUE_BELOW).toBe(COMPETITIONS[0].stake);
    const now = 1e12;
    expect(spinReadyAt(now, SPIN_RESCUE_BELOW - 1)).toBe(0);
    expect(spinReadyAt(now, SPIN_RESCUE_BELOW)).toBe(now + SPIN_COOLDOWN_MS);
    expect(spinReadyAt(0, 5_000_000)).toBe(SPIN_COOLDOWN_MS);
  });

  it('draws every segment, weighted towards the small prizes', () => {
    const counts = new Array(SPIN_SEGMENTS.length).fill(0);
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 20000; i++) counts[drawSegment(rng)]++;
    expect(counts.every((n) => n > 0)).toBe(true);
    const jackpot = SPIN_SEGMENTS.findIndex((s) => s.coins === 10_000_000);
    const small = SPIN_SEGMENTS.findIndex((s) => s.coins === 250_000);
    expect(counts[small]).toBeGreaterThan(counts[jackpot] * 5);
    expect(drawSegment(() => 0)).toBe(0);
    expect(drawSegment(() => 0.999999)).toBe(SPIN_SEGMENTS.length - 1);
  });

  it('lets a device player win back lost coins', () => {
    let now = 1e12;
    const career = new DeviceCareer({ storage: memoryStorage(), now: () => now });
    const first = career.spin(() => 0);
    expect(first.coins).toBe(SPIN_SEGMENTS[0].coins);
    expect(career.data.coins).toBe(2_000_000 + first.coins);
    expect(career.spin()).toBe(null);
    // Lose everything: the wheel is offered again straight away.
    career.data.coins = 0;
    expect(career.spinAt()).toBe(0);
    while (career.data.coins < SPIN_RESCUE_BELOW) expect(career.spin()).not.toBe(null);
    expect(career.spin()).toBe(null);
    now += SPIN_COOLDOWN_MS;
    expect(career.spin()).not.toBe(null);
  });
});

describe('device competitions', () => {
  it('use the chosen board size and fall back to 4 x 16 for unsupported sizes', () => {
    const make = (columns) => {
      const career = new DeviceCareer({ storage: memoryStorage() });
      const game = new LocalCompetition({ career, competition: COMPETITIONS[0], columns, emit: () => {}, introMs: 0 });
      game.dispose?.();
      return game.startMessage().state.columns;
    };
    expect(make(8)).toBe(8);
    expect(make(24)).toBe(24);
    expect(make(10)).toBe(16);
    expect(make(undefined)).toBe(16);
  });
});