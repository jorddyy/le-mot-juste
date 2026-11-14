# Design

## Idea

Two trainers over one word list. Every noun has two independent memory tracks:
**gender** (`g`) and **meaning** (`s`), each scheduled by FSRS (`ts-fsrs`).

## Article trainer

- Prompt: French definition (translation behind a toggle), the bare noun, two article buttons.
- Article pair: un/une, le/la, or mixed (also ce/cette, mon/ma). Never a form that hides the gender.
- Feedback: verdict, a badge (follows the -X pattern / exception / no pattern), the rule sentence
  with its measured reliability, an example sentence. Gender colour appears only after answering.
- "J'ai deviné" turns a correct answer into a miss: a 50/50 guess is weak evidence.
- A new noun that obeys an ending rule with reliability >= 90% is rated Easy on first success,
  so review time goes to exceptions and rule-less nouns.

## Word trainer

- A meaning card starts as **recognition** (see "une plage", recall, reveal, self-grade) and
  becomes **typed production** after two reviews (definition -> type "une plage").
- Typed answers: accents forgiven but reported; noun and article judged separately. A right noun
  with a wrong article counts as correct for meaning and as a miss on the gender track.

## Sessions

- Daily plan per skill: due reviews (most overdue first) with new words spread through them.
  New words: round-robin over the selected levels, most frequent first, one themed word in three.
- Rounds of 15. A missed card returns 4 cards later until answered correctly; only the first
  answer of the day is graded. The study day rolls over at 04:00.

## Ending rules

Measured by `build_data.py` on Lexique 3.83 noun lemmas (frequency >= 0.5 per million): each noun
is assigned to its longest candidate ending; an ending is a guideline when it has >= 15 nouns and
>= 85% share one gender. Well-known "rules" that fail the test (-té outside -ité/-eté, -eur, -ique)
are deliberately not shown.

## Data

`data/src/*.json` entries: `l` lemma, `g`, `lv` (A1-B2), `def` (simple French), `en`, `ex`, `exEn`,
optional `tags` (science, admin, tech, cinema, ch, faux-ami), `note`/`noteEn`, `h`.
The first list (663 nouns) was drafted by Claude Sonnet sub-agents on 2026-11-14; genders were
cross-checked against Lexique (37 words Lexique cannot check were reviewed by hand). Definitions,
examples and CEFR levels are model-written and only spot-checked.

## Decisions

- Vite + TypeScript + Preact; progress in IndexedDB (`idb-keyval`); export/import as a JSON file.
- English translations, French definitions first. UI and feedback switchable FR/EN.
- Swiss and France French both: Swiss words carry the `ch` tag and a note with the French word.
- Audio removed (browser voices are poor); pre-generated audio is a later option.
