import { describe, expect, it } from 'vitest';
import { Rating, review } from './sched';
import { merge, syncOnce } from './sync';
import { SCHEMA } from './validate';

const d1 = new Date(2026, 10, 10), d2 = new Date(2026, 10, 12);
const dev = (cards: any, log: any[] = [], flags: any = {}, retry: any = { g: [], s: [] }, epoch = 0) => ({ cards, log, flags, retry, epoch });
const ev = (t: number, k = 'a#n:g') => ({ t, k, kind: 'first' as const, ok: true, r: 3 });
const file = (d: any) => ({ app: 'le-mot-juste', schema: SCHEMA, ...d });

describe('merge', () => {
  it('keeps the most recently reviewed copy of each card and unites the rest', () => {
    const old = review(undefined, Rating.Good, d1), newer = review(old, Rating.Good, d2);
    const phone = dev({ 'a#n:g': newer, 'b#n:g': old }, [ev(1), ev(3)], { 'a#n': { t: 5, note: 'new', skill: 'g' } }, { g: ['b#n'], s: [] });
    const laptop = dev({ 'a#n:g': old, 'c#n:s': old }, [ev(1), ev(2)], { 'a#n': { t: 1, note: 'old', skill: 'g' } });
    for (const m of [merge(phone, laptop), merge(laptop, phone)]) {      // same result from either device
      expect(Object.keys(m.cards).sort()).toEqual(['a#n:g', 'b#n:g', 'c#n:s']);
      expect(m.cards['a#n:g'].c.reps).toBe(2);
      expect(m.log.map(e => e.t)).toEqual([1, 2, 3]);
      expect(m.flags['a#n'].note).toBe('new');
      expect(m.retry.g).toEqual(['b#n']);                                  // the phone was used last
    }
  });
  it('lets a removed flag stay removed', () => {
    const a = dev({}, [], { 'a#n': { t: 9, note: '', skill: 'g', del: true } }), b = dev({}, [], { 'a#n': { t: 5, note: 'odd', skill: 'g' } });
    expect(merge(a, b).flags['a#n'].del).toBe(true);
    expect(merge(b, a).flags['a#n'].del).toBe(true);
  });
  it('lets a reset replace the other device instead of being undone by it', () => {
    const wiped = dev({}, [], {}, { g: [], s: [] }, 500), old = dev({ 'a#n:g': review(undefined, Rating.Good, d1) }, [ev(1)]);
    expect(merge(wiped, old)).toBe(wiped);
    expect(merge(old, wiped)).toBe(wiped);
  });
});

describe('syncOnce', () => {
  const conf = { url: 'https://example.invalid/sync', token: 'secret' };
  const server = (stored: any) => {
    const calls: any[] = [];
    const fetchFn = (async (_u: string, init: any = {}) => {
      calls.push(init);
      if (init.method === 'PUT') { stored = JSON.parse(init.body); return new Response(null, { status: 204 }); }
      return stored === undefined ? new Response('', { status: 404 }) : new Response(JSON.stringify(stored), { status: 200 });
    }) as unknown as typeof fetch;
    return { fetchFn, calls, get: () => stored };
  };
  const mine = () => file(dev({ 'a#n:g': review(undefined, Rating.Good, d1) }, [ev(1)]));

  it('uploads when the server has nothing, with the token as a bearer header', async () => {
    const s = server(undefined);
    expect(await syncOnce(conf, mine(), s.fetchFn)).toBeNull();
    expect(s.calls[0].headers.Authorization).toBe('Bearer secret');
    expect(Object.keys(s.get().cards)).toEqual(['a#n:g']);
  });
  it('brings home what another device did, and sends back what it lacks', async () => {
    const s = server(JSON.parse(JSON.stringify(file(dev({ 'b#n:s': review(undefined, Rating.Good, d2) }, [ev(2, 'b#n:s')])))));
    const merged = await syncOnce(conf, mine(), s.fetchFn);
    expect(Object.keys(merged!.cards).sort()).toEqual(['a#n:g', 'b#n:s']);
    expect(Object.keys(s.get().cards).sort()).toEqual(['a#n:g', 'b#n:s']);
  });
  it('does nothing when both sides already agree', async () => {
    const s = server(JSON.parse(JSON.stringify(mine())));
    expect(await syncOnce(conf, mine(), s.fetchFn)).toBeNull();
    expect(s.calls.filter(c => c.method === 'PUT')).toHaveLength(0);
  });
  it('refuses a damaged or rejected remote copy without overwriting it', async () => {
    const bad = server({ app: 'le-mot-juste', schema: SCHEMA, cards: { junk: 1 } });
    await expect(syncOnce(conf, mine(), bad.fetchFn)).rejects.toThrow();
    expect(bad.calls.filter(c => c.method === 'PUT')).toHaveLength(0);
    const denied = { fetchFn: (async () => new Response('', { status: 401 })) as unknown as typeof fetch };
    await expect(syncOnce(conf, mine(), denied.fetchFn)).rejects.toThrow('401');
  });
});
