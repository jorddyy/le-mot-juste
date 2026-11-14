import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Progress } from './progress';
import { PAIRS } from './lib/articles';
import { T } from './lib/i18n';
import { addRetry, dropRetry } from './lib/session';
import { exportAll, importAll, load, logEvent, loadSync, onWriteError, resetAll, saveCards, saveFlags, saveRetry, saveSettings, saveSync } from './lib/store';
import { DEFAULTS, LEVELS, type ArtMode, type G, type Lang, type Level, type Rec, type Retry, type Rule, type Settings, type Skill, type Word } from './lib/types';
import { syncOnce, type SyncConf } from './lib/sync';
import { applyUpdate, onUpdateReady } from './lib/update';
import { isDark, SCHEMA } from './lib/validate';
import { Chunk, Trainer, type Ctx, type St } from './trainer';

declare const __BUILD__: { version: string; commit: string; time: string };
type Tab = 'g' | 's' | 'r' | 'p';
interface Data { version: string; words: Word[]; rules: Rule[]; source: string }

async function fetchData(): Promise<Data> {
  const base = import.meta.env.BASE_URL;
  const [w, r] = await Promise.all([fetch(`${base}data/words.json`), fetch(`${base}data/rules.json`)]);
  if (!w.ok || !r.ok) throw new Error('data');
  const words = await w.json(), rules = await r.json();
  return { version: words.version, words: words.words, rules: rules.rules, source: rules.source };
}

function Seg<V extends string>({ value, options, onChange, small, label, navigation }: { value: V; options: [V, string][]; onChange: (v: V) => void; small?: boolean; label?: string; navigation?: boolean }) {
  return (
    <div class={`seg ${small ? 'small' : ''} ${navigation ? 'main-tabs' : ''}`} role="group" aria-label={label}>
      {options.map(([v, text]) => <button key={v} aria-pressed={v === value} onClick={() => onChange(v)}>{text}</button>)}
    </div>
  );
}

function Rules({ data, ctx }: { data: Data; ctx: Ctx }) {
  const { L } = ctx;
  const fake = (l: string, g: G): Word => ({ l, g } as Word);
  const block = (g: G) => (
    <>
      <h2><i style={{ background: `var(--${g})` }} />{g === 'f' ? L.fem : L.masc}</h2>
      <table>
        {data.rules.filter(r => r.g === g).map(r => {
          const mine = data.words.filter(w => w.end === r.end && w.g === g).slice(0, 3);
          const ex = mine.length ? mine : r.examples.slice(0, 3).map(l => fake(l, g));
          const other: G = g === 'f' ? 'm' : 'f';
          return (
            <tr key={r.end}>
              <td>-{r.end}</td>
              <td class="pct">{r.pct} %</td>
              <td>
                {ex.map((w, k) => <span key={w.l}>{k > 0 && ', '}<Chunk w={{ ...w, end: r.end }} pair={PAIRS.un} mark /></span>)}
                {r.exceptions.length > 0 && <span class="exc">{L.but} : {r.exceptions.slice(0, 5).map((l, k) => <span key={l}>{k > 0 && ', '}<Chunk w={fake(l, other)} /></span>)}</span>}
              </td>
            </tr>
          );
        })}
      </table>
    </>
  );
  return (
    <section class="card">
      <div class="def">{L.rulesIntro}</div>
      {block('f')}{block('m')}
      <div class="note">{L.rulesFoot('Lexique 3.83')}</div>
    </section>
  );
}

export function App() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [persistent, setPersistent] = useState(true);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [tab, setTab] = useState<Tab>('g');
  const [, bump] = useState(0);
  const [saveErr, setSaveErr] = useState(false);
  const [update, setUpdate] = useState(false);
  const [sync, setSync] = useState<SyncConf>({ url: '', token: '' });
  const [syncMsg, setSyncMsg] = useState('');
  const live = useRef<{ settings: Settings; flags: Record<string, import('./lib/types').Flag>; version: string; conf: SyncConf | null; busy: Promise<void> | null }>({ settings: DEFAULTS, flags: {}, version: '', conf: null, busy: null });
  /** Merge with the user's own sync server, if one is configured. Never throws; reports in Settings. */
  const doSync = () => (live.current.busy ??= (async () => {
    const { conf, settings: st, flags: fl, version } = live.current;
    if (!conf) return;
    try {
      const merged = await syncOnce(conf, await exportAll({ settings: st, cards: cards.current, retry: retry.current, flags: fl }, version));
      if (merged) {                 // another device did something: take it over, in storage and in memory
        await importAll({ app: 'le-mot-juste', schema: SCHEMA, ...merged });
        Object.assign(cards.current, merged.cards);
        retry.current.g = merged.retry.g; retry.current.s = merged.retry.s;
        setFlags(merged.flags);
      }
      setSyncMsg(`✓ ${new Date().toLocaleTimeString().slice(0, 5)}`);
    } catch { setSyncMsg('✗'); }
  })().finally(() => { live.current.busy = null; }));
  const [flags, setFlags] = useState<Record<string, import('./lib/types').Flag>>({});
  const copyFlags = () => navigator.clipboard?.writeText(Object.entries(flags).map(([id, f]) => `${id} (${f.skill === 'g' ? 'article' : 'mot'}): ${f.note || '—'}`).join('\n')).then(() => alert(L.copied), () => {});
  const cards = useRef<Record<string, Rec>>({});
  const retry = useRef<Retry>({ g: [], s: [] });
  /** The round in progress in each trainer, kept while the user looks at another tab. */
  const sessions = useRef<Record<string, St>>({});
  const dialog = useRef<HTMLDialogElement>(null), file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([fetchData(), load(), loadSync()]).then(async ([d, saved, conf]) => {
      cards.current = saved.cards; retry.current = saved.retry; setFlags(saved.flags);
      setSettings(saved.settings); setPersistent(saved.persistent);
      live.current = { settings: saved.settings, flags: saved.flags, version: d.version, conf, busy: null };
      if (conf) { setSync(conf); await Promise.race([doSync(), new Promise(r => setTimeout(r, 5000))]); }   // start from the newest progress
      setData(d);
    }).catch(() => setErr(true));
    onWriteError(() => setSaveErr(true));
    onUpdateReady(() => setUpdate(true));
    document.addEventListener('visibilitychange', () => { if (document.hidden) doSync(); });
  }, []);
  useEffect(() => {
    if (settings.theme) document.documentElement.dataset.theme = settings.theme; else delete document.documentElement.dataset.theme;
    document.documentElement.lang = settings.lang;
  }, [settings.theme, settings.lang]);

  const L = T[settings.lang];
  const set = (patch: Partial<Settings>) => { const s = { ...settings, ...patch }; setSettings(s); saveSettings(s); };
  const pool = useMemo(() => (data ? data.words.filter(w => settings.levels.includes(w.lv)) : []), [data, settings.levels]);
  const rules = useMemo(() => new Map((data?.rules ?? []).map(r => [r.end, r])), [data]);
  const byId = useMemo(() => new Map((data?.words ?? []).map(w => [w.id, w])), [data]);

  if (err) return <main><p class="center">{L.loadErr}</p></main>;
  live.current.settings = settings; live.current.flags = flags;
  const saveSyncConf = () => {
    const conf = sync.url.trim() && sync.token.trim() ? { url: sync.url.trim(), token: sync.token.trim() } : null;
    live.current.conf = conf; saveSync(conf); setSyncMsg(conf ? '…' : ''); doSync();
  };
  if (!data) return <main><p class="center muted">{L.loading}</p></main>;

  const ctx: Ctx = {
    flags,
    flag: (id, f) => { const next = { ...flags }; if (f) next[id] = f; else delete next[id]; setFlags(next); saveFlags(next); },
    L, lang: settings.lang, settings, cards: cards.current, rules, byId, retry: retry.current,
    save: (k, rec) => { cards.current[k] = rec; saveCards(cards.current); },
    log: logEvent,
    owe: (sk, id, owed) => {
      const ids = retry.current[sk], next = owed ? addRetry(ids, id) : dropRetry(ids, id);
      if (next !== ids && next.length !== ids.length) { retry.current[sk] = next; saveRetry(retry.current); }
    },
  };
  const dark = isDark(settings.theme, matchMedia('(prefers-color-scheme: dark)').matches);
  const tkey = `${tab}|${settings.levels.join()}|${reviewOnly}`;
  const launch = (sk: Skill, reviews: boolean) => {
    sessions.current = {};
    setReviewOnly(reviews); setTab(sk);
  };
  const toggleLevel = (l: Level) => {
    const has = settings.levels.includes(l);
    if (has && settings.levels.length === 1) return;
    set({ levels: LEVELS.filter(x => (x === l ? !has : settings.levels.includes(x))) });
  };
  const started = (sk: string) => Object.keys(cards.current).filter(k => k.endsWith(`:${sk}`)).length;
  const doExport = async () => {
    const mem = { settings, cards: cards.current, retry: retry.current, flags };
    const blob = new Blob([JSON.stringify(await exportAll(mem, data.version))], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `le-mot-juste-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(a.href);
  };
  const doImport = async (f?: File) => {
    if (!f) return;
    try { await importAll(JSON.parse(await f.text())); alert(L.imported); location.reload(); } catch { alert(L.badFile); }
  };
  const doReset = async () => { if (confirm(L.resetAsk)) { await resetAll(); location.reload(); } };


  return (
    <main>
      <header>
        <h1>Le mot <em>juste</em></h1>
        <button class="ver" onClick={() => dialog.current?.showModal()} title={L.version}>v{__BUILD__.version}</button>
        <span class="spacer" />
        <button class="round" aria-label={L.theme} onClick={() => set({ theme: dark ? 'light' : 'dark' })}>{dark ? '☀' : '☾'}</button>
        <Seg small value={settings.lang} options={[['fr', 'FR'], ['en', 'EN']]} onChange={(lang: Lang) => set({ lang })} />
        <button class="round" aria-label={L.settings} onClick={() => dialog.current?.showModal()}>⚙</button>
      </header>
      <Seg navigation value={tab} options={[['g', L.tabs.g], ['s', L.tabs.s], ['r', L.tabs.r], ['p', L.tabs.p]]} onChange={(t: Tab) => setTab(t)} />
      {!persistent && <p class="warn">{L.noSave}</p>}
      {update && <p class="info">{L.updateReady} <button class="linkish" onClick={() => applyUpdate()}>{L.reload}</button></p>}
      {saveErr && <p class="warn">{L.saveFailed} <button class="linkish" onClick={doExport}>{L.exportB}</button></p>}
      {(tab === 'g' || tab === 's') && (
        <div class="controls">
          <div class="chips" role="group" aria-label={L.levels}>
            {LEVELS.map(l => <button key={l} class="chip" aria-pressed={settings.levels.includes(l)} onClick={() => toggleLevel(l)}>{l}</button>)}
          </div>
          {tab === 'g' && <Seg small value={settings.art} options={[['un', 'un · une'], ['le', 'le · la'], ['mix', L.mix]]} onChange={(art: ArtMode) => set({ art })} />}
        </div>
      )}
      {tab === 'r'
        ? <Rules data={data} ctx={ctx} />
        : tab === 'p' ? <Progress words={data.words} pool={pool} ctx={ctx} launch={launch} />
        : <Trainer reviewOnly={reviewOnly} key={tkey} skill={tab} pool={pool} ctx={ctx} saved={sessions.current[tkey]} onState={s => { if (s.done && !sessions.current[tkey]?.done) doSync(); sessions.current = { ...sessions.current, [tkey]: s }; }} />}

      <dialog ref={dialog} onClose={() => bump(n => n + 1)}>
        <h2>{L.settings}</h2>
        <p class="note">{L.seen(started('g'), started('s'), data.words.length)}</p>
        <div class="row wrap">
          <button class="ghost" onClick={doExport}>{L.exportB}</button>
          {Object.keys(flags).length > 0 && <button class="ghost" onClick={copyFlags}>{L.flagsCopy(Object.keys(flags).length)}</button>}
          <button class="ghost" onClick={() => file.current?.click()}>{L.importB}</button>
          <button class="ghost danger" onClick={doReset}>{L.reset}</button>
          <input type="file" accept="application/json,.json" hidden ref={file} onChange={e => doImport((e.target as HTMLInputElement).files?.[0])} />
        </div>
        <details class="sync">
          <summary>{L.sync}</summary>
          <input type="url" class="plain" placeholder="https://…" value={sync.url} onInput={e => { const url = (e.target as HTMLInputElement).value; setSync(c => ({ ...c, url })); }} />
          <input type="password" class="plain" placeholder={L.syncToken} value={sync.token} autocomplete="off" onInput={e => { const token = (e.target as HTMLInputElement).value; setSync(c => ({ ...c, token })); }} />
          <div class="row"><button class="ghost" onClick={saveSyncConf}>{L.syncNow}</button><span class="note">{syncMsg}</span></div>
          <p class="note">{L.syncHelp}</p>
        </details>
        <p class="note">{L.version} {__BUILD__.version} · {__BUILD__.commit} · {__BUILD__.time.slice(0, 10)}<br />{L.data} {data.version} · {data.words.length}</p>
        <button class="primary" onClick={() => dialog.current?.close()}>{L.close}</button>
      </dialog>
    </main>
  );
}
