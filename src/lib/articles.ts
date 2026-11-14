import type { ArtMode, G, Word } from './types';

export type Pair = Record<G, string>;
export const PAIRS = {
  un: { m: 'un', f: 'une' }, le: { m: 'le', f: 'la' }, ce: { m: 'ce', f: 'cette' },
  cet: { m: 'cet', f: 'cette' }, mon: { m: 'mon', f: 'ma' },
} satisfies Record<string, Pair>;

/**
 * Which pair of articles to quiz this noun with. Never one that hides the gender:
 * before a vowel or silent h, le/la become l' and ma becomes mon, so those nouns
 * only get un/une or cet/cette.
 */
export function pickPair(w: Word, mode: ArtMode, rnd: () => number = Math.random): Pair {
  if (mode === 'un') return PAIRS.un;
  if (mode === 'le') return w.el ? PAIRS.un : PAIRS.le;
  const opts: Pair[] = w.el ? [PAIRS.un, PAIRS.cet] : [PAIRS.un, PAIRS.le, PAIRS.ce, PAIRS.mon];
  return opts[Math.floor(rnd() * opts.length)];
}
