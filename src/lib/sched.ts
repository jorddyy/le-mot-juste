import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from 'ts-fsrs';
import type { Rec, Skill, Word } from './types';

// Long-term scheduling only: repeats inside a session are handled by the trainer itself.
const F = fsrs(generatorParameters({ enable_fuzz: true, enable_short_term: false }));

export { Rating };
export type { Grade };
export const key = (w: Word, s: Skill) => `${w.id}:${s}`;

/** Apply one graded answer to a card (a new card if `prev` is undefined). */
export function review(prev: Rec | undefined, grade: Grade, now = new Date()): Rec {
  const base: Card = prev?.c ?? (createEmptyCard(now) as Card);
  return { c: F.next(base, now, grade).card, first: prev?.first ?? now.getTime() };
}

/** The study day rolls over at 04:00 local time. */
export function dayStart(now: Date): number {
  const d = new Date(now);
  d.setHours(4, 0, 0, 0);
  if (d.getTime() > now.getTime()) d.setDate(d.getDate() - 1);
  return d.getTime();
}

export interface Item { w: Word; isNew: boolean; rep?: boolean; recog?: boolean }
export interface Plan { queue: Item[]; due: number; fresh: number }

const isPack = (w: Word) => w.tags.some(t => t !== 'faux-ami');

/**
 * Choose the next new words: round-robin over the levels present, and within a level
 * two general words (most frequent first) for every themed one.
 */
export function pickNew(unseen: Word[], n: number): Word[] {
  const lv = new Map<string, { core: Word[]; pack: Word[]; k: number }>();
  for (const w of unseen) {
    if (!lv.has(w.lv)) lv.set(w.lv, { core: [], pack: [], k: 0 });
    lv.get(w.lv)![isPack(w) ? 'pack' : 'core'].push(w);
  }
  const out: Word[] = [];
  for (let any = true; any && out.length < n;) {
    any = false;
    for (const g of lv.values()) {
      if (out.length >= n) break;
      const w = g.k++ % 3 === 2 ? g.pack.shift() ?? g.core.shift() : g.core.shift() ?? g.pack.shift();
      if (w) { out.push(w); any = true; }
    }
  }
  return out;
}

/** The next queue for one skill: due reviews (most overdue first), with the new words spread through them. */
export function plan(skill: Skill, pool: Word[], cards: Record<string, Rec>, batchSize: number, now = new Date(), extra = 0): Plan {
  const t = now.getTime();
  const due: Word[] = [], unseen: Word[] = [];
  for (const w of pool) {
    const r = cards[key(w, skill)];
    if (!r) { unseen.push(w); continue; }
    if (new Date(r.c.due).getTime() <= t) due.push(w);
  }
  due.sort((a, b) => new Date(cards[key(a, skill)].c.due).getTime() - new Date(cards[key(b, skill)].c.due).getTime());
  const fresh = pickNew(unseen, Math.max(0, batchSize) + extra);
  const queue: Item[] = [];
  for (let a = 0, b = 0; a < due.length || b < fresh.length;) {
    if (b < fresh.length && (a >= due.length || b * due.length <= a * fresh.length)) queue.push({ w: fresh[b++], isNew: true });
    else queue.push({ w: due[a++], isNew: false });
  }
  return { queue, due: due.length, fresh: fresh.length };
}
