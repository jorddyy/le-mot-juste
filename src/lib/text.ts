import type { Word } from './types';

/** Lower-case, strip accents, unify apostrophes and spaces: for forgiving comparison. */
export const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’`´]/g, "'").replace(/œ/g, 'oe').replace(/\s+/g, ' ').trim();

export interface Check {
  /** The noun itself is right (accents forgiven). */
  word: boolean;
  /** ...and its accents are right too. */
  accents: boolean;
  /** true/false when the typed article shows the gender; null when it cannot be judged. */
  art: boolean | null;
  artMsg: '' | 'noArt' | 'elide';
}

/** Judge a typed answer such as "une plage": the noun and the article are judged separately. */
export function checkAnswer(raw: string, w: Word): Check {
  const clean = raw.toLowerCase().replace(/[’`´]/g, "'").replace(/\s+/g, ' ').trim();
  const m = clean.match(/^(?:(une|un|le|la)\s+|(l')\s*)(.+)$/);
  const art = m ? (m[1] ?? m[2]) : '';
  const body = m ? m[3] : clean;
  const word = norm(body) === norm(w.l);
  let ok: boolean | null = null, artMsg: Check['artMsg'] = '';
  if (!art) artMsg = 'noArt';
  else if (art === "l'") artMsg = 'elide';
  else ok = (art === 'un' || art === 'le') === (w.g === 'm');
  return { word, accents: word && body === w.l, art: ok, artMsg };
}
