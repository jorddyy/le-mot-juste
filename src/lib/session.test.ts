import { describe, expect, it } from 'vitest';
import { key, Rating, review } from './sched';
import { addRetry, dropRetry, GAP, startRound } from './session';
import type { Word } from './types';
import { isDark, normEvent, sanitizeSettings } from './validate';

const w = (l: string, over: Partial<Word> = {}): Word =>
  ({ id: `${l}#n`, l, g: 'm', lv: 'A1', end: '', el: false, def: '', en: '', ex: '', exEn: '', tags: [], ...over });

describe('retries', () => {
  const now = new Date(2026, 10, 14, 12);
  const pool = ['a', 'b', 'c', 'd', 'e', 'f'].map(l => w(l));
  const far = w('loin', { lv: 'B2' });                       // not in the selected levels
  const byId = new Map([...pool, far].map(x => [x.id, x]));

  it('a missed card stays in the round until corrected, even though its due date has moved on', () => {
    // "a" was missed a moment ago: FSRS has scheduled it for another day, so the plan alone would drop it.
    const cards = { [key(pool[0], 'g')]: review(undefined, Rating.Again, now) };
    expect(startRound('g', pool, byId, cards, [], 10, now).q.map(i => i.w.l)).not.toContain('a');
    const r = startRound('g', pool, byId, cards, ['a#n'], 10, now);
    const again = r.q.find(i => i.w.l === 'a')!;
    expect(again.rep).toBe(true);                             // practice only: never graded twice
    expect(r.q.indexOf(again)).toBe(GAP);
    expect(r.total).toBe(5);                                  // the score counts the five planned cards
    // corrected: it is no longer owed, and the next round does not bring it back
    expect(startRound('g', pool, byId, cards, dropRetry(['a#n'], 'a#n'), 10, now).q.map(i => i.w.l)).not.toContain('a');
  });
  it('survives a change of levels and is not planned twice', () => {
    const r = startRound('g', pool.slice(1), byId, {}, ['loin#n', 'b#n'], 10, now);
    expect(r.q.filter(i => i.w.l === 'loin')).toHaveLength(1);
    expect(r.q.filter(i => i.w.l === 'b')).toHaveLength(1);
    expect(r.q.find(i => i.w.l === 'b')!.rep).toBe(true);
  });
  it('ignores ids that no longer exist and keeps the set free of duplicates', () => {
    expect(startRound('g', pool, byId, {}, ['gone#n'], 3, now).q).toHaveLength(3);
    expect(addRetry(addRetry([], 'a#n'), 'a#n')).toEqual(['a#n']);
  });
  it('shows a meaning card as recognition until it has two reviews', () => {
    const once = review(undefined, Rating.Good, new Date(2026, 9, 1));
    const cards = { [key(pool[0], 's')]: review(once, Rating.Good, new Date(2026, 9, 5)), [key(pool[1], 's')]: once };
    const q = startRound('s', pool.slice(0, 3), byId, cards, [], 10, now).q;
    expect(Object.fromEntries(q.map(i => [i.w.l, i.recog]))).toEqual({ a: false, b: true, c: true });
  });
});

describe('theme', () => {
  it.each([true, false])('toggles back and forth whatever the system prefers (system dark: %s)', osDark => {
    let theme: '' | 'light' | 'dark' = '';
    const seen: boolean[] = [isDark(theme, osDark)];
    for (let k = 0; k < 4; k++) { theme = isDark(theme, osDark) ? 'light' : 'dark'; seen.push(isDark(theme, osDark)); }
    expect(seen).toEqual([osDark, !osDark, osDark, !osDark, osDark]);
  });
});

describe('validation', () => {
  it('repairs settings field by field', () => {
    expect(sanitizeSettings({ lang: 'en', levels: ['B2', 'nope', 'A1'], newG: 500, theme: 'dark' }))
      .toEqual({ lang: 'en', theme: 'dark', levels: ['A1', 'B2'], art: 'mix', newG: 20, newS: 10 });
  });
  it('keeps the kinds of answer apart in the log', () => {
    expect(normEvent({ t: 1, k: 'a#n:g', kind: 'retry', ok: true })).toEqual({ t: 1, k: 'a#n:g', kind: 'retry', ok: true });
    expect(normEvent({ t: 1, k: 'a#n2:s', kind: 'guess', ok: false, r: 1 })).toMatchObject({ kind: 'guess', r: 1 });
    expect(normEvent({ t: 1, k: 'a#n:g', kind: 'first', ok: true, r: 9 })).toBeNull();
    expect(normEvent({ t: 1, k: 'nonsense', r: 3 })).toBeNull();
  });
});
