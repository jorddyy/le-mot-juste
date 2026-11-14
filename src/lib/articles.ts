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
/** The pair a noun is shown with by default: un/une, except for mass nouns ("une eau" is not something one says). */
export const basePair = (w: Word): Pair => (!w.unc ? PAIRS.un : w.el ? PAIRS.cet : PAIRS.le);

export function pickPair(w: Word, mode: ArtMode, rnd: () => number = Math.random): Pair {
  if (w.unc) {
    if (w.el) return PAIRS.cet;                       // cette eau, cet argent: the only form that shows the gender
    return mode === 'mix' ? [PAIRS.le, PAIRS.ce, PAIRS.mon][Math.floor(rnd() * 3)] : PAIRS.le;
  }
  if (mode === 'un') return PAIRS.un;
  if (mode === 'le') return w.el ? PAIRS.un : PAIRS.le;
  const opts: Pair[] = w.el ? [PAIRS.un, PAIRS.cet] : [PAIRS.un, PAIRS.le, PAIRS.ce, PAIRS.mon];
  return opts[Math.floor(rnd() * opts.length)];
}
