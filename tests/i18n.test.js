import { describe, expect, it } from 'vitest';
import { DICTIONARIES, t } from '../src/i18n.js';
import { TUTORIAL_STEPS, localizeStep } from '../src/tutorial.js';

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n dictionaries', () => {
  const { en, pt } = DICTIONARIES;

  it('every English key has a Portuguese translation', () => {
    expect(Object.keys(en).filter((k) => !(k in pt))).toEqual([]);
  });

  it('every Portuguese key exists in English', () => {
    expect(Object.keys(pt).filter((k) => !(k in en))).toEqual([]);
  });

  it('translations use the same placeholders', () => {
    const mismatched = Object.keys(en).filter(
      (k) => k in pt && placeholders(en[k]).join() !== placeholders(pt[k]).join(),
    );
    expect(mismatched).toEqual([]);
  });

  it('t() substitutes parameters and falls back to the key', () => {
    expect(t('tutorial.step', { n: 2, total: 8 })).toBe('Step 2 of 8');
    expect(t('missing.key')).toBe('missing.key');
  });
});

describe('tutorial translations', () => {
  it('every step has Portuguese texts for each English text', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(step.pt).toBeDefined();
      for (const field of ['title', 'body', 'done']) {
        if (step[field] !== undefined) expect(step.pt[field], `${step.title}.${field}`).toBeTruthy();
      }
      const local = localizeStep(step, 'pt');
      expect(local.title).toBe(step.pt.title);
      expect(local.task).toBe(step.task);
      expect(localizeStep(step, 'en')).toBe(step);
    }
  });
});
