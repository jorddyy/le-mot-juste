# Le mot juste

**Use it: <https://jorddyy.github.io/le-mot-juste/>**

A small web app to learn French noun genders and vocabulary.

- **Articles**: pick the right article; the feedback tells you whether the noun follows an ending
  pattern (-tion, -age, -ment ...) or is an exception.
- **Mots**: learn what the words mean, French definition first.
- **Règles**: the ending patterns, with how reliable each one really is.

Words come back when you are about to forget them (spaced repetition). Progress stays in your browser.

```sh
npm install
npm run build && npm run preview     # http://localhost:4173
```

Rebuilding the word list (`npm run data`) needs `raw/Lexique383.tsv` from
<http://www.lexique.org/databases/Lexique383/Lexique383.tsv>.

`public/data/rules.json` is derived from Lexique and shared under CC BY-SA 4.0.
Ending-pattern statistics are computed from [Lexique 3.83](http://www.lexique.org) (New, Pallier,
Brysbaert & Ferrand). See `AGENTS.md` and `docs/` for how the project is organised; release notes
are in `CHANGELOG.md`.
