import 'fake-indexeddb/auto';
import { createStore, entries, getMany, set } from 'idb-keyval';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Rating, review } from './sched';
import { exportAll, importAll, load } from './store';
import { DEFAULTS } from './types';
import { parseBackup, SCHEMA } from './validate';

// Lets a test make the write to the main store fail, to exercise the rollback.
const fail = vi.hoisted(() => ({ on: false }));
vi.mock('idb-keyval', async orig => {
  const m = await orig<typeof import('idb-keyval')>();
  return { ...m, setMany: (...a: Parameters<typeof m.setMany>) => (fail.on ? Promise.reject(new Error('disk full')) : m.setMany(...a)) };
});

const logStore = createStore('lmj-log', 'events');
const now = new Date(2026, 10, 14, 12);
const file = (x: unknown) => JSON.parse(JSON.stringify(x));          // what a backup looks like once read from disk
const valid = () => file({
  app: 'le-mot-juste', schema: SCHEMA,
  cards: { 'plage#n:g': review(undefined, Rating.Good, now), 'plage#n:s': review(undefined, Rating.Again, now) },
  log: [{ t: 1, k: 'plage#n:g', kind: 'first', ok: true, r: 3, a: 'f' }, { t: 2, k: 'plage#n:s', kind: 'retry', ok: false }],
  retry: { g: [], s: ['plage#n'] }, settings: { ...DEFAULTS, lang: 'en' },
});
const snapshot = async () => JSON.stringify([await getMany(['cards', 'settings', 'retry']), (await entries(logStore)).map(([, v]) => v)]);

describe('importAll', () => {
  beforeEach(async () => { fail.on = false; await importAll(valid()); });

  it('stores a valid backup with real dates', async () => {
    const [cards, settings, retry] = await getMany(['cards', 'settings', 'retry']);
    expect(cards['plage#n:g'].c.due).toBeInstanceOf(Date);
    expect(settings.lang).toBe('en');
    expect(retry.s).toEqual(['plage#n']);
    expect(await entries(logStore)).toHaveLength(2);
  });

  const rejected: [string, (b: any) => void][] = [
    ['empty cards with a non-array log (would wipe progress, then crash)', b => { b.cards = {}; b.log = {}; }],
    ['a card with an invalid date', b => { b.cards['plage#n:g'].c.due = 'soon'; }],
    ['a card with a missing FSRS field', b => { delete b.cards['plage#n:s'].c.stability; }],
    ['a card key that is not id:skill', b => { b.cards.junk = b.cards['plage#n:g']; }],
    ['cards as an array', b => { b.cards = []; }],
    ['a damaged log entry', b => { b.log.push({ t: 'x', k: 'plage#n:g', kind: 'first', ok: true }); }],
    ['a newer schema', b => { b.schema = SCHEMA + 1; }],
    ['settings that are not an object', b => { b.settings = 'x'; }],
    ['another app’s file', b => { b.app = 'other'; }],
  ];
  it.each(rejected)('rejects %s and leaves everything as it was', async (_name, damage) => {
    const before = await snapshot(), b = valid();
    b.cards['table#n:g'] = b.cards['plage#n:g'];          // would be visible if anything had been written
    damage(b);
    await expect(importAll(b)).rejects.toThrow();
    expect(await snapshot()).toBe(before);
  });

  it('puts the old progress back when a write fails halfway', async () => {
    const before = await snapshot(), b = valid();
    b.log = []; b.cards = {};
    fail.on = true;
    await expect(importAll(b)).rejects.toThrow('disk full');
    fail.on = false;
    expect(await snapshot()).toBe(before);
  });

  it('never persists invalid settings', async () => {
    const b = valid();
    b.settings = { lang: 'xx', theme: 'neon', levels: ['Z9'], art: 7, newG: -5, newS: 'many' };
    await importAll(b);
    expect((await load()).settings).toEqual(DEFAULTS);
  });

  it('accepts a schema-1 backup and upgrades its log', async () => {
    const b = valid();
    b.schema = 1; delete b.retry; b.log = [{ t: 5, k: 'plage#n:g', r: 1 }];
    await importAll(b);
    expect((await entries(logStore)).map(([, v]) => v)).toEqual([{ t: 5, k: 'plage#n:g', kind: 'first', ok: false, r: 1 }]);
  });
});

describe('load and export', () => {
  it('migrates schema-1 log events on load', async () => {
    await importAll(valid());
    await set('old', { t: 9, k: 'plage#n:g', r: 3 }, logStore);
    await set('schema', 1);
    await load();
    const log = (await entries(logStore)).map(([, v]) => v as any);
    expect(log.every(e => e.kind && typeof e.ok === 'boolean')).toBe(true);
    expect(log).toHaveLength(3);
  });
  it('exports what is in memory in a form that imports again', async () => {
    await importAll(valid());
    const saved = await load();
    const out = file(await exportAll({ settings: saved.settings, cards: saved.cards, retry: saved.retry, flags: saved.flags }, 'abc'));
    const back = parseBackup(out);
    expect(Object.keys(back.cards)).toEqual(['plage#n:g', 'plage#n:s']);
    expect(back.log).toHaveLength(2);
    expect(back.retry).toEqual({ g: [], s: ['plage#n'] });
  });
});
