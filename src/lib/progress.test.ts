import { describe, expect, it } from 'vitest';
import { progress } from './progress';
import { key, plan, Rating, review } from './sched';
import { startRound } from './session';
import type { Word } from './types';
const word = (l: string, lv: Word['lv'] = 'A1'): Word => ({ id: `${l}#n`, l, lv, g: 'm', end: '', el: false, def: '', en: '', ex: '', exEn: '', tags: [] });
const now = new Date(2026, 10, 14, 12);
const rec = (due: Date) => ({ ...review(undefined, Rating.Good, now), c: { ...review(undefined, Rating.Good, now).c, due } });

describe('progress and self-paced rounds', () => {
  it('counts due and owed once, includes out-of-level retries, and separates skills', () => {
    const words = [word('a'), word('b', 'B2'), word('c', 'B2')];
    const cards = Object.fromEntries(words.map(w => [key(w, 'g'), rec(now)]));
    const retry = { g: ['a#n', 'b#n', 'missing#n'], s: [] };
    expect(progress(words, [words[0]], cards, retry, 'g', now)).toMatchObject({ introduced: 3, ready: 2, needsPractice: 2 });
    expect(progress(words, [words[0]], cards, retry, 's', now)).toMatchObject({ introduced: 0, ready: 0 });
  });
  it('forecasts future dates, excludes ready/owed cards and respects level filters', () => {
    const words = ['a', 'b', 'c', 'd'].map(l => word(l));
    const cards = { 'a#n:g': rec(new Date(2026, 10, 14, 13)), 'b#n:g': rec(new Date(2026, 10, 15, 0)), 'c#n:g': rec(new Date(2026, 10, 15, 4)), 'd#n:g': rec(new Date(2026, 10, 16, 1)) };
    const stats = progress(words, words.slice(0, 3), cards, { g: ['c#n'], s: [] }, 'g', now);
    expect(stats.upcoming).toEqual([1, 1, 0, 0, 0, 0, 0]);
    expect(stats.next).toBe(new Date(2026, 10, 14, 13).getTime());
    expect(stats.ready).toBe(1);
  });
  it('permits another full batch after earlier introductions and review-only rounds add no new words', () => {
    const words = ['a', 'b', 'c', 'd'].map(l => word(l));
    const cards = { 'a#n:g': rec(new Date(2026, 10, 16)), 'b#n:g': rec(now) };
    expect(plan('g', words, cards, 2, now).fresh).toBe(2);
    const r = startRound('g', words, new Map(words.map(w => [w.id, w])), cards, ['a#n'], 0, now);
    expect(r.q.map(it => it.w.id).sort()).toEqual(['a#n', 'b#n']);
    expect(r.q.every(it => !it.isNew)).toBe(true);
  });
  it('handles an empty history without inventing a next review', () => {
    expect(progress([], [], {}, { g: [], s: [] }, 'g', now)).toEqual({ introduced: 0, ready: 0, needsPractice: 0, upcoming: [0, 0, 0, 0, 0, 0, 0], next: undefined });
  });
});
