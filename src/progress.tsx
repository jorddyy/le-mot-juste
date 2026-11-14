import { useEffect, useState } from 'preact/hooks';
import { progress } from './lib/progress';
import { key } from './lib/sched';
import { norm } from './lib/text';
import type { Skill, Word } from './lib/types';
import { Chunk, type Ctx } from './trainer';

export function Progress({ words, pool, ctx, launch }: { words: Word[]; pool: Word[]; ctx: Ctx; launch: (sk: Skill, reviews: boolean) => void }) {
  const [query, setQuery] = useState(''), [needs, setNeeds] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30000); return () => clearInterval(timer); }, []);
  const en = ctx.lang === 'en';
  const labels = en ? { intro: 'You choose how much to practise. Reviews return when scheduled.', ready: 'Ready to review', started: 'Words introduced', needs: 'Needs another attempt', learn: 'Learn more · up to 10 new words', upcoming: 'Coming up', scope: 'Review counts and forecast follow your selected levels. Pending retries are always included. Your word list covers all levels.', list: 'My words', search: 'Search French or English', filter: 'Needs another attempt only', unseen: 'Not introduced', due: 'Ready now', last: 'Last review', reviews: 'Scheduled reviews', empty: 'No matching words.', next: 'Next review', none: 'No future reviews scheduled.', skills: { g: 'Gender', s: 'Meaning' } } : { intro: 'Tu choisis combien pratiquer. Les révisions reviennent à la date prévue.', ready: 'À réviser', started: 'Mots commencés', needs: 'Nouvel essai nécessaire', learn: 'Continuer · jusqu’à 10 nouveaux mots', upcoming: 'À venir', scope: 'Révisions et prévisions selon les niveaux sélectionnés. Les essais en attente sont toujours inclus. La liste couvre tous les niveaux.', list: 'Mes mots', search: 'Chercher en français ou en anglais', filter: 'Seulement les mots à reprendre', unseen: 'Pas encore commencé', due: 'À réviser maintenant', last: 'Dernière révision', reviews: 'Révisions programmées', empty: 'Aucun mot correspondant.', next: 'Prochaine révision', none: 'Aucune révision future programmée.', skills: { g: 'Genre', s: 'Sens' } };
  const date = (v: number | Date) => new Date(v).toLocaleString(ctx.lang, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const stats = (['g', 's'] as const).map(sk => ({ sk, ...progress(words, pool, ctx.cards, ctx.retry, sk, now) }));
  const matches = words.filter(w => (ctx.cards[key(w, 'g')] || ctx.cards[key(w, 's')] || ctx.retry.g.includes(w.id) || ctx.retry.s.includes(w.id)) && norm(`${w.l} ${w.en}`).includes(norm(query)) && (!needs || ctx.retry.g.includes(w.id) || ctx.retry.s.includes(w.id)));
  return <>
    <section class="card"><h2>{ctx.L.tabs.p}</h2><p class="tight">{labels.intro}</p><p class="note tight">{labels.scope} ({ctx.settings.levels.join(', ')})</p>
      {stats.map(s => <div class="skill-progress" key={s.sk}>
        <h2>{labels.skills[s.sk]}</h2>
        <dl><div><dt>{labels.started}</dt><dd>{s.introduced} / {words.length}</dd></div><div><dt>{labels.ready}</dt><dd>{s.ready}</dd></div><div><dt>{labels.needs}</dt><dd>{s.needsPractice}</dd></div></dl>
        <p class="note">{s.next ? `${labels.next}: ${date(s.next)}` : labels.none}</p>
        <div class="row wrap"><button class="primary" disabled={!s.ready} onClick={() => launch(s.sk, true)}>{ctx.L.reviewNow} · {s.ready}</button><button class="ghost" disabled={!pool.some(w => !ctx.cards[key(w, s.sk)])} onClick={() => launch(s.sk, false)}>{labels.learn}</button></div>
      </div>)}
    </section>
    <section class="card"><h2>{labels.upcoming}</h2><table class="forecast"><thead><tr><th>Date</th><th>{labels.skills.g}</th><th>{labels.skills.s}</th></tr></thead><tbody>{Array.from({ length: 7 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() + i); return <tr key={i}><td>{d.toLocaleDateString(ctx.lang, { weekday: 'short', day: 'numeric', month: 'short' })}</td>{stats.map(s => <td key={s.sk}>{s.upcoming[i]}</td>)}</tr>; })}</tbody></table><p class="note tight">{en ? 'Future scheduled reviews; counts change as you practise. Ready reviews are counted above.' : 'Révisions futures ; les nombres évoluent avec tes réponses. Les révisions déjà dues sont comptées ci-dessus.'}</p></section>
    <section class="card"><h2>{labels.list} · {matches.length}</h2><input class="word-search" type="search" aria-label={labels.search} placeholder={labels.search} value={query} onInput={e => setQuery(e.currentTarget.value)} /><label><input type="checkbox" checked={needs} onChange={e => setNeeds(e.currentTarget.checked)} /> {labels.filter}</label>
      {!matches.length && <p>{labels.empty}</p>}
      <ul class="word-progress">{matches.map(w => <li key={w.id}><b><Chunk w={w} /></b> <span class="note">{w.lv} · {w.en}</span><div class="track-grid">{(['g', 's'] as const).map(sk => { const r = ctx.cards[key(w, sk)], owed = ctx.retry[sk].includes(w.id); return <div key={sk}><strong>{labels.skills[sk]}</strong><p>{owed ? labels.needs : !r ? labels.unseen : new Date(r.c.due) <= now ? labels.due : `${labels.next}: ${date(r.c.due)}`}</p>{r && <details><summary>{en ? 'Review summary' : 'Bilan des révisions'}</summary><p>{labels.reviews}: {r.c.reps}<br />{labels.last}: {r.c.last_review ? date(r.c.last_review) : '—'}<br />{labels.next}: {date(r.c.due)}</p></details>}</div>; })}</div></li>)}</ul>
    </section>
  </>;
}
