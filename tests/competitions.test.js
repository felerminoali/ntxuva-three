import { describe, it, expect } from 'vitest';
import {
  COMPETITIONS,
  COMPETITION_BY_ID,
  MAX_SKILL,
  skillForRating,
  matchedSkill,
  drawSkill,
  drawOpponent,
  payoutFor,
  rankTitle,
  eloDelta,
  competitionBlocker,
} from '../src/competitions.js';
import { chooseAction, skillConfig } from '../src/ai.js';
import { createGame, actionsFor } from '../src/gameLogic.js';

describe('competition ladder', () => {
  it('starts at Cuamba 1M, then Nampula 5M, and ends at Maputo 2B', () => {
    expect(COMPETITIONS[0]).toMatchObject({ id: 'cuamba', stake: 1_000_000 });
    expect(COMPETITIONS[1]).toMatchObject({ id: 'nampula', stake: 5_000_000 });
    expect(COMPETITIONS.at(-1)).toMatchObject({ id: 'maputo', stake: 2_000_000_000 });
    for (let i = 1; i < COMPETITIONS.length; i++) {
      expect(COMPETITIONS[i].stake).toBeGreaterThan(COMPETITIONS[i - 1].stake);
      expect(COMPETITIONS[i].skill[1]).toBeGreaterThanOrEqual(COMPETITIONS[i - 1].skill[1]);
    }
    expect(COMPETITIONS.at(-1).skill[1]).toBe(MAX_SKILL);
  });

  it('draws integer opponent skills between the band floor and the matched skill', () => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const comp of COMPETITIONS) {
      for (const rating of [800, 1200, 1500, 2200]) {
        const top = matchedSkill(comp, rating);
        expect(top).toBeGreaterThanOrEqual(comp.skill[0]);
        expect(top).toBeLessThanOrEqual(comp.skill[1]);
        const seen = new Set();
        for (let i = 0; i < 200; i++) {
          const s = drawSkill(comp, rating, rng);
          expect(Number.isInteger(s)).toBe(true);
          expect(s).toBeGreaterThanOrEqual(comp.skill[0]);
          expect(s).toBeLessThanOrEqual(top);
          seen.add(s);
        }
        expect(seen.size).toBe(top - comp.skill[0] + 1);
      }
    }
    expect(skillForRating(-5000)).toBe(1);
    expect(skillForRating(99999)).toBe(MAX_SKILL);
  });

  it('builds named computer opponents with avatars', () => {
    const bot = drawOpponent(COMPETITION_BY_ID.beira, 1400, () => 0.5);
    expect(bot).toMatchObject({ bot: true });
    expect(bot.name.length).toBeGreaterThan(2);
    expect(bot.avatar).toMatch(/^data:image\/svg\+xml/);
  });

  it('pays double the entry for a win, refunds a draw and gates on coins', () => {
    const c = COMPETITION_BY_ID.cuamba;
    expect(payoutFor(c, 'win')).toBe(2_000_000);
    expect(payoutFor(c, 'draw')).toBe(1_000_000);
    expect(payoutFor(c, 'loss')).toBe(0);
    expect(competitionBlocker(c, { coins: 999_999 })).toBe('not-enough-coins');
    expect(competitionBlocker(c, { coins: 1_000_000 })).toBe(null);
    expect(competitionBlocker(COMPETITION_BY_ID.nowhere, { coins: 1e12 })).toBe('unknown-competition');
  });

  it('computes Elo and rank titles', () => {
    expect(eloDelta(1200, 1200, 1)).toBe(12);
    expect(eloDelta(1200, 1200, 0)).toBe(-12);
    expect(rankTitle(1000)).toBe('novice');
    expect(rankTitle(1800)).toBe('grandmaster');
  });
});

describe('skill-based AI', () => {
  it('gets deeper and less random as skill rises', () => {
    const low = skillConfig(1);
    const high = skillConfig(20);
    expect(high.maxDepth).toBeGreaterThan(low.maxDepth);
    expect(high.randomness).toBe(0);
    expect(low.randomness).toBeGreaterThan(0);
  });

  it('only chooses legal actions at every skill', () => {
    const state = createGame({ columns: 8 });
    for (const skill of [1, 7, 14, 20]) {
      const action = chooseAction(state, { difficulty: skill, timeMs: 60 });
      expect(actionsFor(state)).toContainEqual(action);
    }
  });
});
