import { describe, expect, it } from 'vitest';
import { PAIRS, pickPair } from './articles';
import { dayStart, key, pickNew, plan, Rating, review } from './sched';
import { checkAnswer } from './text';
import type { Word } from './types';

const w = (l: string, g: 'm' | 'f', over: Partial<Word> = {}): Word =>
  ({ id: `${l}#n`, l, g, lv: 'A1', end: '', el: /^[aeiouéh]/.test(l), def: '', en: '', ex: '', exEn: '', tags: [], ...over });

describe('checkAnswer', () => {
  const ecole = w('école', 'f'), lac = w('lac', 'm');
  it('judges noun and article separately', () => {
    expect(checkAnswer('une école', ecole)).toEqual({ word: true, accents: true, art: true, artMsg: '' });
    expect(checkAnswer('Un  ecole', ecole)).toEqual({ word: true, accents: false, art: false, artMsg: '' });
    expect(checkAnswer('la table', ecole).word).toBe(false);
  });
  it("cannot judge the gender behind l' or without an article", () => {
    expect(checkAnswer('l’école', ecole)).toMatchObject({ word: true, art: null, artMsg: 'elide' });
    expect(checkAnswer('école', ecole)).toMatchObject({ word: true, art: null, artMsg: 'noArt' });
  });
  it('does not mistake the start of a word for an article', () => {
    expect(checkAnswer('lac', lac)).toMatchObject({ word: true, artMsg: 'noArt' });
    expect(checkAnswer('le lac', lac)).toMatchObject({ word: true, art: true });
  });
});

describe('pickPair', () => {
  it('never offers a pair that hides the gender', () => {
    const arbre = w('arbre', 'm'), table = w('table', 'f', { el: false });
    for (let r = 0; r < 1; r += 0.05) {
      expect([PAIRS.un, PAIRS.cet]).toContain(pickPair(arbre, 'mix', () => r));
      expect(pickPair(table, 'mix', () => r)).not.toBe(PAIRS.cet);
    }
    expect(pickPair(arbre, 'le')).toBe(PAIRS.un);
    expect(pickPair(table, 'le')).toBe(PAIRS.le);
  });
});

describe('scheduling', () => {
  const now = new Date(2026, 10, 14, 12);
  it('pushes a correct card into the future and keeps a missed one close', () => {
    const good = review(undefined, Rating.Good, now), again = review(undefined, Rating.Again, now);
    expect(good.c.due.getTime()).toBeGreaterThan(again.c.due.getTime());
    expect(again.c.due.getTime()).toBeGreaterThan(now.getTime());
    expect(review(good, Rating.Good, good.c.due).first).toBe(now.getTime());
  });
  it('rolls the day over at 04:00', () => {
    expect(new Date(dayStart(new Date(2026, 10, 14, 3))).getDate()).toBe(13);
    expect(new Date(dayStart(now)).getDate()).toBe(14);
  });
  it('mixes levels and themed words when picking new words', () => {
    const pool = [w('a', 'm'), w('b', 'm'), w('c', 'm'), w('p', 'm', { tags: ['science'] }), w('x', 'm', { lv: 'B1' }), w('y', 'm', { lv: 'B1' })];
    expect(pickNew(pool, 6).map(x => x.l)).toEqual(['a', 'x', 'b', 'y', 'p', 'c']);
    expect(pickNew(pool, 2)).toHaveLength(2);
  });
  it('plans due reviews plus the daily allowance of new words', () => {
    const pool = [w('a', 'm'), w('b', 'm'), w('c', 'm'), w('d', 'm')];
    const yesterday = new Date(2026, 10, 13, 12);
    const cards = { [key(pool[0], 'g')]: review(undefined, Rating.Again, yesterday), [key(pool[1], 'g')]: review(undefined, Rating.Good, now) };
    const p = plan('g', pool, cards, 2, new Date(2026, 10, 14, 18));
    expect(p.due).toBe(1);          // a: missed yesterday, due again
    expect(p.fresh).toBe(1);        // b was already introduced today, so one new word is left
    expect(p.queue.map(i => i.w.l).sort()).toEqual(['a', 'c']);
    expect(plan('g', pool, cards, 2, new Date(2026, 10, 14, 18), 10).fresh).toBe(2);
  });
});
