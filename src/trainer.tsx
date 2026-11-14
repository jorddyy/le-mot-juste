import { useEffect, useRef, useState } from 'preact/hooks';
import { PAIRS, pickPair, type Pair } from './lib/articles';
import type { Strings } from './lib/i18n';
import { key, plan, Rating, review, type Grade, type Item } from './lib/sched';
import { checkAnswer, type Check } from './lib/text';
import type { G, LogEvent, Rec, Rule, Settings, Skill, Word } from './lib/types';

/** What the trainers need from the app shell. `cards` is the live, mutable progress map. */
export interface Ctx {
  L: Strings; lang: 'fr' | 'en'; settings: Settings; cards: Record<string, Rec>; rules: Map<string, Rule>;
  save: (k: string, rec: Rec, ev: LogEvent) => void;
}

const ROUND = 15;      // cards per round
const GAP = 4;         // a missed card comes back this many cards later

interface Ans { ok: boolean; g?: G; base?: Rec; guessed?: boolean; raw?: string; check?: Check }
interface St {
  q: Item[]; i: number; ans: Ans | null; done: boolean; first: number; total: number;
  miss: Word[]; left: number; showEn: boolean; revealed: boolean; pair: Pair;
}

const Html = ({ html, cls }: { html: string; cls?: string }) => <div class={cls} dangerouslySetInnerHTML={{ __html: html }} />;

/** The noun, with its ending underlined once the answer is known. */
function Noun({ w, mark }: { w: Word; mark: boolean }) {
  return mark && w.end ? <>{w.l.slice(0, -w.end.length)}<span class="end">{w.end}</span></> : <>{w.l}</>;
}
export function Chunk({ w, pair = PAIRS.un, mark = false }: { w: Word; pair?: Pair; mark?: boolean }) {
  return <><span class={`g-${w.g}`}>{pair[w.g]}</span> <Noun w={w} mark={mark} /></>;
}
/** Does the noun follow an ending guideline, break one, or have none? */
export function Pill({ w, ctx }: { w: Word; ctx: Ctx }) {
  const r = ctx.rules.get(w.end);
  if (!r) return <span class="pill none">{ctx.L.pNone}</span>;
  return r.g === w.g ? <span class="pill">{ctx.L.pRule(w.end)}</span> : <span class="pill exc">{ctx.L.pExc(w.end)}</span>;
}
function ruleHtml(w: Word, pair: Pair, ctx: Ctx): string {
  const r = ctx.rules.get(w.end), c = `${pair[w.g]} ${w.l}`;
  return !r ? ctx.L.noRule(c) : r.g === w.g ? ctx.L.rule(r.end, r.g, r.pct) : ctx.L.exc(r.end, r.g, r.pct, c);
}

export function Trainer({ skill, pool, ctx }: { skill: Skill; pool: Word[]; ctx: Ctx }) {
  const { L, settings, cards } = ctx;
  const pairFor = (w: Word) => (skill === 'g' ? pickPair(w, settings.art) : PAIRS.un);
  const mk = (extra = 0): St => {
    const p = plan(skill, pool, cards, skill === 'g' ? settings.newG : settings.newS, new Date(), extra);
    // A meaning card starts as recognition (read, recall, self-grade) and becomes typed production after two reviews.
    const q = p.queue.slice(0, ROUND).map(it => ({ ...it, recog: skill === 's' && (cards[key(it.w, 's')]?.c.reps ?? 0) < 2 }));
    return {
      q, i: 0, ans: null, done: !q.length, first: 0, total: q.length, miss: [], left: p.queue.length - q.length,
      showEn: false, revealed: false, pair: q[0] ? pairFor(q[0].w) : PAIRS.un,
    };
  };
  const [st, setSt] = useState<St>(mk);
  const input = useRef<HTMLInputElement>(null), nextBtn = useRef<HTMLButtonElement>(null);
  const item = st.q[st.i], w = item?.w;

  useEffect(() => {         // a change of article mode applies to the card on screen, unless already answered
    setSt(s => (s.done || s.ans ? s : { ...s, pair: pairFor(s.q[s.i].w) }));
  }, [settings.art]);
  useEffect(() => { if (st.ans || st.done) nextBtn.current?.focus(); else input.current?.focus(); }, [st.i, !!st.ans, st.done, st.revealed]);

  const commit = (wd: Word, sk: Skill, grade: Grade, base: Rec | undefined) => {
    const k = key(wd, sk);
    ctx.save(k, review(base, grade), { t: Date.now(), k, r: grade });
  };
  const requeue = (s: St): Item[] => {
    const q = s.q.slice();
    q.splice(Math.min(s.i + GAP, q.length), 0, { ...s.q[s.i], rep: true, isNew: false });
    return q;
  };
  const missed = (s: St) => (s.miss.includes(w) ? s.miss : [...s.miss, w]);
  const advance = (s: St): St => {
    const i = s.i + 1;
    return i >= s.q.length ? { ...s, i, ans: null, done: true }
      : { ...s, i, ans: null, revealed: false, showEn: false, pair: pairFor(s.q[i].w) };
  };

  function answerG(g: G) {
    if (st.ans || st.done) return;
    const ok = g === w.g, base = cards[key(w, 'g')];
    if (!item.rep) {
      // A new noun that obeys a reliable ending needs little review: schedule it far out.
      const r = ctx.rules.get(w.end), easy = ok && !base && !!r && r.g === w.g && r.pct >= 90;
      commit(w, 'g', ok ? (easy ? Rating.Easy : Rating.Good) : Rating.Again, base);
    }
    setSt({ ...st, ans: { ok, g, base }, q: ok ? st.q : requeue(st), first: st.first + (ok && !item.rep ? 1 : 0), miss: ok ? st.miss : missed(st) });
  }
  function guessed() {
    const a = st.ans;
    if (!a?.ok || a.guessed) return;
    if (!item.rep) commit(w, 'g', Rating.Again, a.base);       // a lucky guess is not knowledge: undo the credit
    setSt({ ...st, ans: { ...a, guessed: true }, q: requeue(st), first: st.first - (item.rep ? 0 : 1), miss: missed(st) });
  }
  function gradeRecog(knew: boolean) {
    if (!item.rep) commit(w, 's', knew ? Rating.Good : Rating.Again, cards[key(w, 's')]);
    setSt(advance({ ...st, q: knew ? st.q : requeue(st), first: st.first + (knew && !item.rep ? 1 : 0), miss: knew ? st.miss : missed(st) }));
  }
  function submit() {
    if (st.ans || st.done) return;
    const raw = input.current?.value.trim() ?? '', check = checkAnswer(raw, w), ok = check.word;
    if (!item.rep) {
      commit(w, 's', ok ? Rating.Good : Rating.Again, cards[key(w, 's')]);
      if (ok && check.art === false) commit(w, 'g', Rating.Again, cards[key(w, 'g')]);   // wrong article: the gender track pays
    }
    setSt({ ...st, ans: { ok, raw, check }, q: ok ? st.q : requeue(st), first: st.first + (ok && !item.rep ? 1 : 0), miss: ok ? st.miss : missed(st) });
  }
  const next = () => setSt(advance(st));
  const toggleEn = () => setSt({ ...st, showEn: !st.showEn });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      if (st.done) return;
      if (e.key === 'Enter') {
        if ((e.target as HTMLElement)?.tagName === 'BUTTON') return;      // the focused button handles it
        e.preventDefault();
        if (st.ans) next(); else if (skill === 's' && !item.recog) submit(); else if (item.recog && !st.revealed) setSt({ ...st, revealed: true });
      } else if (typing) return;
      else if (skill === 'g' && !st.ans && e.key === 'ArrowLeft') answerG('m');
      else if (skill === 'g' && !st.ans && e.key === 'ArrowRight') answerG('f');
      else if (item.recog && st.revealed && e.key === 'ArrowLeft') gradeRecog(false);
      else if (item.recog && st.revealed && e.key === 'ArrowRight') gradeRecog(true);
      else if (e.key.toLowerCase() === 'e') toggleEn();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // ---------- end of a round ----------
  if (st.done) {
    const again = (extra = 0) => setSt(mk(extra));
    return (
      <>
        <div class="progWrap"><div class="progress"><i style={{ width: '100%' }} /></div></div>
        <section class="card">
          {st.total ? <>
            <div class="score">{st.first} / {st.total}</div>
            <p class="center muted tight">{L.first}</p>
            {st.miss.length ? <div><b>{L.review}</b>
              <ul class="miss">{st.miss.map(m => <li key={m.id}><span><Chunk w={m} mark /></span><span class="note">{m.en} <Pill w={m} ctx={ctx} /></span></li>)}</ul>
            </div> : <p class="center"><b>{L.perfect}</b></p>}
          </> : <><p class="def center">{L.nothing}</p><p class="center muted tight">{L.comeBack}</p></>}
          {st.left > 0
            ? <button class="primary" ref={nextBtn} onClick={() => again()}>{L.more(st.left)}</button>
            : <>{st.total > 0 && <p class="center muted tight">{L.doneToday}</p>}
              <button class={st.total ? 'ghost' : 'primary'} ref={nextBtn} onClick={() => again(10)}>{L.extra}</button></>}
        </section>
      </>
    );
  }

  // ---------- one card ----------
  const a = st.ans, p = st.pair, note = ctx.lang === 'en' ? w.noteEn ?? w.note : w.note;
  const answered = !!a || (item.recog && st.revealed);
  const head = (
    <div class="meta">
      <span>{w.lv}</span>
      {w.tags.filter(t => t !== 'faux-ami').map(t => <span class="tag" key={t}>{t === 'ch' ? L.sw : t}</span>)}
      {item.isNew && <span class="tag new">{L.newWord}</span>}
    </div>
  );
  const meaning = (
    <div>
      <div class="def">{w.def}</div>
      <div class="tr">
        <button class="linkish" onClick={toggleEn}>{st.showEn ? L.hideEn : L.showEn}</button>
        {skill === 'g' && <kbd>E</kbd>}
        {st.showEn && <span class="en">{w.en}</span>}
      </div>
    </div>
  );
  const feedback = (extra?: preact.ComponentChildren) => a && (
    <>
      <div class={`fb ${a.ok ? 'ok' : 'bad'}`}>
        <div class="vrow"><div class="verdict">{a.ok ? `✓ ${L.ok}` : `✗ ${skill === 'g' ? L.bad : L.bad2}`}</div><Pill w={w} ctx={ctx} /></div>
        {extra}
        <Html cls="rule" html={ruleHtml(w, p, ctx)} />
        <div class="ex">{w.ex}{st.showEn && <div class="en">{w.exEn}</div>}</div>
        {note && <div class="note">{note}</div>}
      </div>
      {a.guessed && <div class="note center">{L.willReturn}</div>}
      <div class="row">
        {skill === 'g' && a.ok && !a.guessed && <button class="ghost" onClick={guessed}>{L.guessed}</button>}
        <button class="primary" ref={nextBtn} onClick={next}>{L.next} <kbd>↵</kbd></button>
      </div>
    </>
  );

  let body: preact.ComponentChildren;
  if (skill === 'g') {
    body = <>
      {head}{meaning}
      <div class="noun"><span class={`slot ${a ? w.g : ''}`}>{a ? p[w.g] : ' '}</span><Noun w={w} mark={!!a} /></div>
      <div class="choices">
        {(['m', 'f'] as G[]).map(g => (
          <button key={g} disabled={!!a} class={a ? (g === w.g ? 'right' : a.g === g ? 'wrong' : '') : ''} onClick={() => answerG(g)}>
            {p[g]}<kbd>{g === 'm' ? '←' : '→'}</kbd>
          </button>
        ))}
      </div>
      {settings.art === 'le' && w.el && !a && <div class="note center">{L.vowel}</div>}
      {feedback()}
    </>;
  } else if (item.recog) {
    body = <>
      {head}
      <div class="noun"><Chunk w={w} mark={st.revealed} /></div>
      {!st.revealed
        ? <><p class="center muted tight">{L.recall}</p>
          <button class="primary" ref={nextBtn} onClick={() => setSt({ ...st, revealed: true })}>{L.reveal} <kbd>↵</kbd></button></>
        : <>
          {meaning}
          <div class="ex">{w.ex}{st.showEn && <div class="en">{w.exEn}</div>}</div>
          {note && <div class="note">{note}</div>}
          <div class="choices small">
            <button onClick={() => gradeRecog(false)}>{L.notYet}<kbd>←</kbd></button>
            <button onClick={() => gradeRecog(true)}>{L.knew}<kbd>→</kbd></button>
          </div>
        </>}
    </>;
  } else {
    const c = a?.check;
    body = <>
      {head}{meaning}
      {!a ? <>
        <input type="text" ref={input} key={st.i} placeholder={L.ph} aria-label={L.inpLabel} autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck={false} />
        <button class="primary" onClick={submit}>{L.check} <kbd>↵</kbd></button>
      </> : <>
        <div class="noun"><Chunk w={w} mark /></div>
        {feedback(c && <div class="checks">
          <span>{L.your}</span><span>{a.raw || '—'}</span>
          <span>{L.word}</span><span class={c.word ? 'y' : 'n'}>{c.word ? '✓' : '✗'}{c.word && !c.accents && <span class="note"> {L.accents} {w.l}</span>}</span>
          <span>{L.article}</span>
          <span class={!c.word ? '' : c.art === true ? 'y' : c.art === false ? 'n' : ''}>{!c.word ? '—' : c.art === true ? '✓' : c.art === false ? `✗ (${L.artWrong})` : `— ${c.artMsg ? L[c.artMsg] : ''}`}</span>
        </div>)}
      </>}
    </>;
  }

  return (
    <>
      <div class="progWrap">
        <div class="progress"><i style={{ width: `${(100 * st.i) / st.q.length}%` }} /></div>
        <span class="count">{st.i + 1} / {st.q.length}{st.left > 0 && ` · ${L.later(st.left)}`}</span>
      </div>
      <section class={`card ${answered ? w.g : ''}`} aria-live="polite">{body}</section>
    </>
  );
}
