# TODO

## Next
- [ ] Run `npm run data` with Lexique and commit `public/data`: 0.4.7's rule exclusions (`not`, `mixed`, `grp`)
      only show once the data is rebuilt. Check the new table in `build/report.md` first.
- [x] Deploy: GitHub Pages via `.github/workflows/pages.yml` (2026-11-14).
- [x] Offline support: `vite-plugin-pwa`, prompt-style updates via `src/lib/update.ts` (2026-11-14). Test on a real phone.
- [ ] Review the model-written definitions/examples; fix anything odd found while using the app.
- [x] Sibling burying: a noun's two cards never appear on the same day (0.2.2).
- [ ] Second senses for more two-gender nouns (la tour, la livre, le mode...), like `poste#n2`.

## Later
- [ ] Back up `/root/lmj-sync/data` on the user's server.
- [ ] Word list pipeline: FLELex levels + Lexique + Wiktionary + Tatoeba, as separate files per licence.
      Confirm the Lexique licence (README says CC BY-SA 4.0, Lexique 4 page says CC BY-NC 4.0).
- [ ] Other word types in the word trainer (verbs, adjectives, adverbs).
- [ ] Derived forms: du/de la, au/à la, adjective agreement, then il/elle, le/la in sentences.
- [ ] Add-a-word button and a personal list; pack mix setting.
- [x] Sync between devices: client + reference server (2026-11-14). The user's own endpoint still has to be deployed.
- [ ] Pre-generated audio with a good voice.
- [ ] Stats: words known per level, forecast, leeches (4+ lapses) with a mnemonic note field.
