import { clear, createStore, entries, get, set } from 'idb-keyval';
import { DEFAULTS, type LogEvent, type Rec, type Settings } from './types';

/** Bump when the saved shape changes, and migrate in `load`. */
export const SCHEMA = 1;
const logStore = createStore('lmj-log', 'events');
let seq = 0;

export interface Saved { settings: Settings; cards: Record<string, Rec>; persistent: boolean }

export async function load(): Promise<Saved> {
  try {
    const [settings, cards] = await Promise.all([get<Settings>('settings'), get<Record<string, Rec>>('cards')]);
    await set('schema', SCHEMA);
    navigator.storage?.persist?.().catch(() => {});
    return { settings: { ...DEFAULTS, ...settings }, cards: cards ?? {}, persistent: true };
  } catch {
    return { settings: { ...DEFAULTS }, cards: {}, persistent: false };   // e.g. private window: works, but forgets
  }
}
export const saveSettings = (s: Settings) => { set('settings', s).catch(() => {}); };
export const saveCards = (c: Record<string, Rec>) => { set('cards', c).catch(() => {}); };
/** Every answer is logged raw, so the scheduler can be changed or re-fitted later. */
export const logEvent = (e: LogEvent) => { set(`${e.t}-${seq++}`, e, logStore).catch(() => {}); };

export async function exportAll(dataVersion: string) {
  const [settings, cards, log] = await Promise.all([get('settings'), get('cards'), entries(logStore)]);
  return { app: 'le-mot-juste', schema: SCHEMA, dataVersion, exported: new Date().toISOString(), settings, cards, log: log.map(([, v]) => v) };
}

export async function importAll(data: any): Promise<void> {
  if (data?.app !== 'le-mot-juste' || typeof data.cards !== 'object' || data.schema > SCHEMA) throw new Error('bad file');
  const cards: Record<string, Rec> = {};
  for (const [k, r] of Object.entries<any>(data.cards)) {
    if (!r?.c?.due) continue;
    cards[k] = { first: Number(r.first) || Date.now(), c: { ...r.c, due: new Date(r.c.due), last_review: r.c.last_review ? new Date(r.c.last_review) : undefined } };
  }
  await set('cards', cards);
  if (data.settings) await set('settings', { ...DEFAULTS, ...data.settings });
  await clear(logStore);
  for (const e of (data.log ?? []) as LogEvent[]) await set(`${e.t}-${seq++}`, e, logStore);
}

export async function resetAll(): Promise<void> {
  await Promise.all([set('cards', {}), clear(logStore)]);
}
