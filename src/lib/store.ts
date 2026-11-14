import { createStore, entries, getMany, promisifyRequest, set, setMany } from 'idb-keyval';
import type { LogEvent, Rec, Retry, Settings } from './types';
import { normEvent, parseBackup, sanitizeRetry, sanitizeSettings, SCHEMA } from './validate';

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

export interface Saved { settings: Settings; cards: Record<string, Rec>; retry: Retry; persistent: boolean }

/** Replace the whole log in one transaction. */
const replaceLog = (rows: [IDBValidKey, LogEvent][]) => logStore('readwrite', store => {
  store.clear();
  for (const [k, v] of rows) store.put(v, k);
  return promisifyRequest(store.transaction);
});

export async function load(): Promise<Saved> {
  try {
    const [settings, cards, retry, schema] = await getMany(['settings', 'cards', 'retry', 'schema']);
    if (schema !== SCHEMA) {      // schema 1 -> 2: log events gain kind/ok
      const rows = await entries<IDBValidKey, unknown>(logStore);
      await replaceLog(rows.flatMap(([k, v]) => { const e = normEvent(v); return e ? [[k, e] as [IDBValidKey, LogEvent]] : []; }));
      await set('schema', SCHEMA);
    }
    navigator.storage?.persist?.().catch(() => {});
    return { settings: sanitizeSettings(settings), cards: cards ?? {}, retry: sanitizeRetry(retry), persistent: true };
  } catch {
    return { settings: sanitizeSettings(null), cards: {}, retry: sanitizeRetry(null), persistent: false };   // e.g. private window
  }
}
export const saveSettings = (s: Settings) => guard(set('settings', s));
export const saveCards = (c: Record<string, Rec>) => guard(set('cards', c));
export const saveRetry = (r: Retry) => guard(set('retry', r));
export const logEvent = (e: LogEvent) => guard(set(logKey(e), e, logStore), () => unsaved.push(e));

/** Backup built from what the app holds in memory, so it works even when storage has stopped accepting writes. */
export async function exportAll(mem: { settings: Settings; cards: Record<string, Rec>; retry: Retry }, dataVersion: string) {
  let log: LogEvent[] = [];
  try { log = (await entries<IDBValidKey, LogEvent>(logStore)).map(([, v]) => v); } catch { /* storage unavailable */ }
  return { app: 'le-mot-juste', schema: SCHEMA, dataVersion, exported: new Date().toISOString(), ...mem, log: [...log, ...unsaved] };
}

/**
 * Replace all progress with a backup. The file is validated completely before anything is
 * written; if a write then fails, what was there before is put back.
 */
export async function importAll(data: unknown): Promise<void> {
  const b = parseBackup(data);                                   // throws before any change
  const before = { main: await getMany(['cards', 'settings', 'retry']), log: await entries<IDBValidKey, LogEvent>(logStore) };
  try {
    await replaceLog(b.log.map(e => [logKey(e), e]));
    await setMany([['cards', b.cards], ['retry', b.retry], ['settings', b.settings ?? sanitizeSettings(before.main[1])], ['schema', SCHEMA]]);
  } catch (err) {
    await replaceLog(before.log).catch(() => {});
    await setMany([['cards', before.main[0] ?? {}], ['settings', before.main[1]], ['retry', before.main[2]]]).catch(() => {});
    throw err;
  }
}

export async function resetAll(): Promise<void> {
  await replaceLog([]);
  await setMany([['cards', {}], ['retry', { g: [], s: [] }]]);
}
