import { dayStart, key, plan, type Item } from './sched';
import type { Rec, Skill, Word } from './types';

export const ROUND = 15;      // cards per round
export const GAP = 4;         // a missed card comes back this many cards later

/**
 * Build one round. Words still waiting for a correct answer (`retry`) always come back,
 * whatever their due date and whatever levels are selected: a miss stays owed until it is
 * corrected, across tab switches and reloads. They are practice only (rep), never re-graded.
 */
export function startRound(
  skill: Skill, pool: Word[], byId: Map<string, Word>, cards: Record<string, Rec>, retry: string[],
  batchSize: number, now = new Date(), extra = 0,
): { q: Item[]; left: number; total: number } {
  const owed = retry.map(id => byId.get(id)).filter((w): w is Word => !!w);
  const owedIds = new Set(owed.map(w => w.id));
  // A noun's two cards never meet on the same day: seeing "une plage" in one trainer gives the other away.
  const start = dayStart(now), other: Skill = skill === 'g' ? 's' : 'g';
  const fresh = (w: Word) => { const last = cards[key(w, other)]?.c.last_review; return !last || new Date(last).getTime() < start; };
  const planned = plan(skill, pool.filter(fresh), cards, batchSize, now, extra).queue.filter(it => !owedIds.has(it.w.id));
  const q = planned.slice(0, ROUND);
  const total = q.length;
  q.splice(Math.min(GAP, q.length), 0, ...owed.map(w => ({ w, isNew: false, rep: true })));
  // A meaning card starts as recognition and becomes typed production after two reviews.
  for (const it of q) it.recog = skill === 's' && (cards[key(it.w, 's')]?.c.reps ?? 0) < 2;
  return { q, left: planned.length - total, total };
}

export const addRetry = (ids: string[], id: string) => (ids.includes(id) ? ids : [...ids, id]);
export const dropRetry = (ids: string[], id: string) => ids.filter(x => x !== id);
