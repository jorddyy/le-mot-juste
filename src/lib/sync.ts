import type { LogEvent } from './types';
import { parseBackup, SCHEMA, type Backup } from './validate';

/**
 * Optional sync through a server of the user's own (see server/README.md). The protocol is two
 * calls on one URL with `Authorization: Bearer <token>`: GET returns the stored backup (404 if
 * none), PUT stores one. No address or secret lives in this repo: both are typed into Settings
 * and kept in that browser only.
 */
export interface SyncConf { url: string; token: string }
type Data = Omit<Backup, 'settings'>;

const time = (d: unknown) => (d ? new Date(d as string).getTime() : 0);
const sig = (b: Data) => JSON.stringify([
  Object.entries(b.cards).map(([k, r]) => [k, time(r.c.last_review), r.c.reps]).sort(),
  b.log.length, Object.entries(b.flags).sort(), b.retry, b.epoch,
]);
export const reviewedAt = (r: { c: { last_review?: unknown } }) => time(r.c.last_review);

/** Combine two devices' progress: per card the most recently reviewed copy wins; logs and flags are united. */
export function merge(a: Data, b: Data): Data {
  // A reset or a restored backup starts a new epoch: it replaces the other side instead of merging with it.
  if (a.epoch !== b.epoch) return a.epoch > b.epoch ? a : b;
  const cards = { ...b.cards };
  for (const [k, r] of Object.entries(a.cards)) if (!cards[k] || time(r.c.last_review) >= time(cards[k].c.last_review)) cards[k] = r;
  const seen = new Map<string, LogEvent>();
  for (const e of [...a.log, ...b.log]) seen.set(`${e.t}|${e.k}|${e.kind}`, e);
  const log = [...seen.values()].sort((x, y) => x.t - y.t);
  const flags = { ...b.flags };
  for (const [id, f] of Object.entries(a.flags)) if (!flags[id] || f.t >= flags[id].t) flags[id] = f;
  // Owed retries follow whichever device was used last.
  const last = (d: Data) => d.log.reduce((m, e) => Math.max(m, e.t), 0);
  return { epoch: a.epoch, cards, log, flags, retry: last(a) >= last(b) ? a.retry : b.retry };
}

/**
 * One sync: fetch the remote copy, merge, store the result remotely if it adds anything.
 * Returns the merged data when this device must take it over, else null. Remote data is
 * validated like an imported file; an invalid remote copy aborts without overwriting anything.
 */
export async function syncOnce(conf: SyncConf, local: unknown, fetchFn: typeof fetch = fetch): Promise<Data | null> {
  const mine = parseBackup(JSON.parse(JSON.stringify(local)));
  const headers = { Authorization: `Bearer ${conf.token}` };
  const res = await fetchFn(conf.url, { headers, cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (res.status !== 404 && !res.ok) throw new Error(`${res.status}`);
  const theirs = res.status === 404 ? null : parseBackup(await res.json());
  const out = theirs ? merge(mine, theirs) : mine;
  if (!theirs || sig(out) !== sig(theirs)) {
    const put = await fetchFn(conf.url, {
      method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ app: 'le-mot-juste', schema: SCHEMA, exported: new Date().toISOString(), ...out }),
    });
    if (!put.ok) throw new Error(`${put.status}`);
  }
  return sig(out) !== sig(mine) ? out : null;
}
