import { key } from './sched';
import type { Rec, Retry, Skill, Word } from './types';

/** Due and owed overlap: count each word once. Normal reviews respect selected levels. */
export function progress(words: Word[], pool: Word[], cards: Record<string, Rec>, retry: Retry, skill: Skill, now = new Date()) {
  const selected = new Set(pool.map(w => w.id)), owed = new Set(retry[skill]);
  let introduced = 0, ready = 0, needsPractice = 0;
  const upcoming = Array<number>(7).fill(0);
  let next: number | undefined;
  for (const w of words) {
    const r = cards[key(w, skill)];
    if (r) introduced++;
    if (owed.has(w.id)) needsPractice++;
    const due = r ? new Date(r.c.due).getTime() : undefined;
    if (owed.has(w.id) || (selected.has(w.id) && due !== undefined && due <= now.getTime())) ready++;
    if (!selected.has(w.id) || owed.has(w.id) || due === undefined || due <= now.getTime()) continue;
    next = Math.min(next ?? due, due);
    for (let i = 0; i < 7; i++) {
      const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() + i);
      const end = new Date(start); end.setDate(end.getDate() + 1);
      if (due >= start.getTime() && due < end.getTime()) upcoming[i]++;
    }
  }
  return { introduced, ready, needsPractice, upcoming, next };
}
