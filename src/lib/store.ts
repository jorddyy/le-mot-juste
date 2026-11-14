import { createStore, entries, get, getMany, promisifyRequest, set, setMany } from 'idb-keyval';
import type { SyncConf } from './sync';
import type { Flag, LogEvent, Rec, Retry, Settings } from './types';
import { normEvent, parseBackup, sanitizeFlags, sanitizeRetry, sanitizeSettings, SCHEMA } from './validate';

export { SCHEMA };
const logStore = createStore('lmj-log', 'events');
let seq = 0;
const logKey = (e: LogEvent) => `${e.t}-${seq++}`;

/** Log events whose write failed: kept in memory so an export still contains them. */
const unsaved: LogEvent[] = [];
let onError: (() => void) | null = null;
/** Called whenever a write to the browser's storage fails, so the app can warn instead of pretending. */
export const onWriteError = (cb: () => void) => { onError = cb; };
const guard = (p: Promise<unknown>, onFail?: () => void) => p.then(() => true, () => { onFail?.(); onError?.(); return false; });

export interface Saved { settings: Settings; cards: Record<string, Rec>; retry: Retry; flags: Record<string, Flag>; epoch: number; persistent: boolean }

/** Replace the whole log in one transaction. */
const replaceLog = (rows: [IDBValidKey, LogEvent][]) => logStore('readwrite', store => {
  store.clear();
  for (const [k, v] of rows) store.put(v, k);
  return promisifyRequest(store.transaction);
});

export async function load(): Promise<Saved> {
  try {
    const [settings, cards, retry, schema, flags, epoch] = await getMany(['settings', 'cards', 'retry', 'schema', 'flags', 'epoch']);
    if (schema !== SCHEMA) {      // schema 1 -> 2: log events gain kind/ok
      const rows = await entries<IDBValidKey, unknown>(logStore);
      await replaceLog(rows.flatMap(([k, v]) => { const e = normEvent(v); return e ? [[k, e] as [IDBValidKey, LogEvent]] : []; }));
      await set('schema', SCHEMA);
    }
    navigator.storage?.persist?.().catch(() => {});
    return { settings: sanitizeSettings(settings), cards: cards ?? {}, retry: sanitizeRetry(retry), flags: sanitizeFlags(flags), epoch: Number(epoch) || 0, persistent: true };
  } catch {
    return { settings: sanitizeSettings(null), cards: {}, retry: sanitizeRetry(null), flags: {}, epoch: 0, persistent: false };   // e.g. private window
  }
}
export const saveSettings = (s: Settings) => guard(set('settings', s));
export const saveCards = (c: Record<string, Rec>) => guard(set('cards', c));
export const saveRetry = (r: Retry) => guard(set('retry', r));
/** Sync address and token: kept in this browser only, never exported. */
export const loadSync = (): Promise<SyncConf | null> => get('sync').then(c => (c && typeof c.url === 'string' && typeof c.token === 'string' ? c : null), () => null);
export const saveSync = (c: SyncConf | null) => guard(set('sync', c));
/** Add log events that are not stored yet (after a sync); never removes any. */
export async function mergeLog(events: LogEvent[]): Promise<void> {
  const id = (e: LogEvent) => `${e.t}|${e.k}|${e.kind}`;
  const have = new Set((await entries<IDBValidKey, LogEvent>(logStore)).map(([, v]) => id(v)));
  const add = events.filter(e => !have.has(id(e)));
  if (add.length) await setMany(add.map(e => [logKey(e), e] as [IDBValidKey, LogEvent]), logStore);
}
export const saveFlags = (f: Record<string, Flag>) => guard(set('flags', f));
export const logEvent = (e: LogEvent) => guard(set(logKey(e), e, logStore), () => unsaved.push(e));

/** Backup built from what the app holds in memory, so it works even when storage has stopped accepting writes. */
export async function exportAll(mem: { settings: Settings; cards: Record<string, Rec>; retry: Retry; flags: Record<string, Flag>; epoch: number }, dataVersion: string) {
  let log: LogEvent[] = [];
  try { log = (await entries<IDBValidKey, LogEvent>(logStore)).map(([, v]) => v); } catch { /* storage unavailable */ }
  return { app: 'le-mot-juste', schema: SCHEMA, dataVersion, exported: new Date().toISOString(), ...mem, log: [...log, ...unsaved] };
}

/**
 * Replace all progress with a backup. The file is validated completely before anything is
 * written; if a write then fails, what was there before is put back.
 */
export async function importAll(data: unknown, epoch?: number): Promise<void> {
  const b = parseBackup(data);                                   // throws before any change
  const before = { main: await getMany(['cards', 'settings', 'retry']), log: await entries<IDBValidKey, LogEvent>(logStore) };
  try {
    await replaceLog(b.log.map(e => [logKey(e), e]));
    await setMany([['cards', b.cards], ['retry', b.retry], ['flags', b.flags], ['settings', b.settings ?? sanitizeSettings(before.main[1])], ['schema', SCHEMA], ['epoch', epoch ?? b.epoch]]);
  } catch (err) {
    await replaceLog(before.log).catch(() => {});
    await setMany([['cards', before.main[0] ?? {}], ['settings', before.main[1]], ['retry', before.main[2]]]).catch(() => {});
    throw err;
  }
}

export async function resetAll(): Promise<void> {
  await replaceLog([]);
  await setMany([['cards', {}], ['retry', { g: [], s: [] }], ['flags', {}], ['epoch', Date.now()]]);   // new epoch: the reset wins on sync
}
