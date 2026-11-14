# AGENTS.md — le-mot-juste

French noun-gender and vocabulary trainer (phone-first web app, also fine on a laptop).
Public repo. Read `docs/DESIGN.md` for the why, `docs/TODO.md` for what is next.

## Commands

| | |
|---|---|
| `npm run data` | Rebuild `public/data/*.json` from `data/src/*.json`; writes `build/report.md`; exits 1 and writes no data while a `CHECK:` flag is open |
| `npm run check:data` | CI gate (no Lexique needed): shipped data is a clean build of the current sources |
| `npm run dev` | Dev server |
| `npm test` | Unit tests (Vitest) |
| `npm run build` | Type-check + production build into `dist/` |
| `npm run preview` | Serve `dist/` on http://localhost:4173 |

## Layout

| Path | What |
|---|---|
| `data/src/*.json` | Hand-curated nouns (one entry per line). The source of truth for words |
| `scripts/build_data.py` | Validates, dedupes, cross-checks gender against Lexique, measures ending rules, writes `public/data/words.json` + `rules.json` + `build/report.md` |
| `raw/` (gitignored) | `Lexique383.tsv`, downloaded from lexique.org. Never commit |
| `src/lib/` | Pure logic: `sched.ts` (FSRS + daily plan), `session.ts` (rounds and owed retries), `text.ts` (typed-answer check), `articles.ts` (which article pair), `validate.ts` (backup/settings validation, schema), `sync.ts` (optional sync: merge + protocol), `update.ts` (service-worker update prompt), `store.ts` (IndexedDB), `i18n.ts` (FR/EN strings), `types.ts` |
| `server/` | Reference sync endpoint (`sync_server.py`) and setup notes |
| `src/trainer.tsx` | One round of cards for a skill (`g` = gender, `s` = meaning) |
| `src/app.tsx` | Shell: tabs, levels, settings dialog, rules page |
| `.github/workflows/pages.yml` | Tests, builds and deploys `main` to GitHub Pages (https://jorddyy.github.io/le-mot-juste/) |

## Rules

- **Token strategy.** Never open `data/src/*.json`, `public/data/*.json` or `raw/*` in full. Run
  `npm run data` and read `build/report.md` (counts, flags, 20 random rows); use `grep`/`jq` for
  single entries. Bulk content (new words, definitions) is drafted by cheaper sub-agents, one file
  each, then checked by the script. Design, app code and review stay in the main session.
- **Gender must be right.** A word whose gender disagrees with Lexique is dropped by the build.
  Words Lexique cannot check go into `REVIEWED` in `build_data.py` only after a human or careful
  review. Any `CHECK:` flag in the report must be resolved before shipping.
- **Never show an article that hides the gender** (l', mon before a vowel, les/des) as a prompt.
  `pickPair` enforces this; `Word.el` marks nouns that elide.
- **Word ids are stable** (`lemma#n`; a second sense with another gender is `lemma#n2`, marked `"s": 2`
  in the source). Progress is keyed `id:skill`; renaming an id orphans progress.
- **After editing `data/src`, run `npm run data` and commit `public/data`**: CI rejects stale data.
- **Saved data has a schema version** (`SCHEMA` in `validate.ts`): bump it and migrate in `load` when
  the shape changes. Imports go through `parseBackup` (validate everything, then write, roll back on
  failure). Scheduling and logging are separate: every answer is logged (`lmj-log` store, `LogEvent`
  kinds first/retry/guess/article); only the first answer of a session is graded.
- **Versioning.** Bump `version` in `package.json` and add a `CHANGELOG.md` entry for every
  user-visible change. The app shows version, commit and build date, plus the data version (a hash
  of the word list).
- **Offline.** A service worker (`vite-plugin-pwa`, config in `vite.config.ts`) precaches everything in
  `dist` matching its glob patterns; a new file type must be added there. Updates are never applied
  silently: `src/lib/update.ts` raises the "update available · reload" line.
- **Sync is opt-in and generic.** `src/lib/sync.ts` talks to whatever URL/token the user types into
  Settings (stored under `sync` in that browser, never exported). Never commit a real address or token.
  Remote data goes through `parseBackup` like any import. `server/` holds the reference endpoint.
- **No third-party requests at runtime**: fonts are self-hosted (`@fontsource-variable/fraunces`).
- **Licences.** Lexique-derived numbers (rule percentages, word order) ship in `public/data`; its
  licence must be confirmed before the site is made public (see TODO). FLELex (CC BY-NC-SA) and
  Wiktionary (CC BY-SA) data must stay in separate files, never merged into one.
- Don't commit or push unless asked.
