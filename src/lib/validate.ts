import type { Card } from 'ts-fsrs';
import { DEFAULTS, LEVELS, type Level, type LogEvent, type Rec, type Retry, type Settings } from './types';

/** Saved-data format. 2: log events carry kind/ok, pending retries are stored. */
export const SCHEMA = 2;
const KEY = /^.+#n\d*:[gs]$/;
const isObj = (x: unknown): x is Record<string, any> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown, min = -Infinity, max = Infinity) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;

export const isDark = (theme: Settings['theme'], osDark: boolean) => (theme || (osDark ? 'dark' : 'light')) === 'dark';

/** Anything in, valid settings out: unknown or damaged values fall back to the defaults. */
export function sanitizeSettings(x: unknown): Settings {
  const s = isObj(x) ? x : {};
  const levels = Array.isArray(s.levels) ? LEVELS.filter(l => s.levels.includes(l)) : [];
  const count = (v: unknown, d: number) => (num(v, 0, 200) ? Math.round(v as number) : d);
  return {
    lang: s.lang === 'en' || s.lang === 'fr' ? s.lang : DEFAULTS.lang,
    theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : '',
    levels: levels.length ? (levels as Level[]) : DEFAULTS.levels,
    art: s.art === 'un' || s.art === 'le' || s.art === 'mix' ? s.art : DEFAULTS.art,
    newG: count(s.newG, DEFAULTS.newG), newS: count(s.newS, DEFAULTS.newS),
  };
}

export function sanitizeRetry(x: unknown): Retry {
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((i): i is string => typeof i === 'string'))] : []);
  return isObj(x) ? { g: ids(x.g), s: ids(x.s) } : { g: [], s: [] };
}

/** Accepts current events and schema-1 ones ({t, k, r}: always a graded first answer). */
export function normEvent(e: unknown): LogEvent | null {
  if (!isObj(e) || !num(e.t, 0) || typeof e.k !== 'string' || !KEY.test(e.k)) return null;
  if (e.kind === undefined) return num(e.r, 1, 4) ? { t: e.t, k: e.k, kind: 'first', ok: e.r > 1, r: e.r } : null;
  if (!['first', 'retry', 'guess', 'article'].includes(e.kind) || typeof e.ok !== 'boolean') return null;
  if (e.r !== undefined && !num(e.r, 1, 4)) return null;
  if (e.a !== undefined && typeof e.a !== 'string') return null;
  return { t: e.t, k: e.k, kind: e.kind, ok: e.ok, ...(e.r !== undefined && { r: e.r }), ...(e.a !== undefined && { a: e.a }) };
}

function parseRec(r: unknown): Rec | null {
  if (!isObj(r) || !isObj(r.c) || !num(r.first, 0)) return null;
  const c = r.c, due = new Date(c.due), last = c.last_review == null ? undefined : new Date(c.last_review);
  if (c.due == null || Number.isNaN(due.getTime()) || (last && Number.isNaN(last.getTime()))) return null;
  if (!num(c.stability, 0) || !num(c.difficulty, 0) || !num(c.elapsed_days, 0) || !num(c.scheduled_days, 0)) return null;
  if (!num(c.reps, 0) || !num(c.lapses, 0) || !num(c.state, 0, 3) || !Number.isInteger(c.state)) return null;
  const card: Card = {
    due, stability: c.stability, difficulty: c.difficulty, elapsed_days: c.elapsed_days, scheduled_days: c.scheduled_days,
    learning_steps: num(c.learning_steps, 0) ? c.learning_steps : 0, reps: c.reps, lapses: c.lapses, state: c.state, last_review: last,
  };
  return { c: card, first: r.first };
}

export interface Backup { cards: Record<string, Rec>; log: LogEvent[]; retry: Retry; settings: Settings | null }

/**
 * Check a whole backup file and return clean data, or throw. Nothing is partially accepted:
 * one bad card or log entry rejects the file, so an import can never half-replace progress.
 */
export function parseBackup(data: unknown): Backup {
  const bad = (why: string): never => { throw new Error(`invalid backup: ${why}`); };
  if (!isObj(data) || data.app !== 'le-mot-juste') return bad('not a le-mot-juste file');
  if (!Number.isInteger(data.schema) || data.schema < 1 || data.schema > SCHEMA) return bad('unknown schema');
  if (!isObj(data.cards)) return bad('cards');
  const cards: Record<string, Rec> = {};
  for (const [k, r] of Object.entries(data.cards)) {
    const rec = KEY.test(k) ? parseRec(r) : null;
    if (!rec) return bad(`card ${k}`);
    cards[k] = rec;
  }
  if (data.log !== undefined && !Array.isArray(data.log)) return bad('log');
  const log = ((data.log ?? []) as unknown[]).map((e, i) => normEvent(e) ?? bad(`log entry ${i}`));
  if (data.settings != null && !isObj(data.settings)) return bad('settings');
  if (data.retry != null && !isObj(data.retry)) return bad('retry');
  return { cards, log, retry: sanitizeRetry(data.retry), settings: data.settings == null ? null : sanitizeSettings(data.settings) };
}
