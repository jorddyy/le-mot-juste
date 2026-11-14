# Changelog

## 0.4.5 — 2026-11-14

- A round already in progress no longer shows a noun you have just answered in the other tab.

## 0.4.4 — 2026-11-14

- Round summary: "needed another attempt" now counts only words missed in this round, and words carried
  over from an earlier round are mentioned separately.
- After flagging a card, a line says where the flags can be found.
- Mass nouns and one-of-a-kind nouns (eau, lait, argent, soleil…) are no longer shown with un/une:
  they get le/la, ce/cette or mon/ma, and cet/cette before a vowel.

## 0.4.3 — 2026-11-14

- Two tabs of the app on one device no longer overwrite each other's progress.

## 0.4.2 — 2026-11-14

- Sync no longer overwrites an answer given while it was running: it only adds what the other device did.
- Removing a flag, erasing everything, or restoring a backup now carries over to your other devices.
- A refused token says so; the sync address must be https.
- Sync server: safe simultaneous uploads and connection timeouts.

## 0.4.1 — 2026-11-14

- Removed the "J'ai deviné" button: answering by feel is the point, and a lucky guess gets caught at the next review.

## 0.4.0 — 2026-11-14

- Optional sync between devices through a server of your own (Settings → Sync): merges at start-up,
  after each round and when you leave the app. A small reference server is in `server/`.

## 0.3.0 — 2026-11-14

- Works offline: after one visit the app, fonts and word list are stored on the device (about 0.4 MB).
- When a new version has been downloaded, an "update available · reload" line appears.

## 0.2.2 — 2026-11-14

- Flag a card with the small ⚑ at its top right, with an optional note on what is wrong or confusing.
  Flags are saved, included in the export, and can be copied from Settings.
- A noun's article card and meaning card no longer appear on the same day.

## 0.2.1 — 2026-11-14

- Keep all four navigation tabs and the language selector on one line on phones.
- Tighten mobile header/card spacing and fix oversized rule badges in round summaries.

## 0.2.0 — 2026-11-14

- Add a Progress tab with separate gender/meaning review counts, a seven-day forecast, and a searchable word list with review dates.
- Replace daily quotas with on-demand review rounds and batches of up to 10 new words.
- Show words practised and retries in round summaries, label round progress, and show next review dates after answers.

## 0.1.2 — 2026-11-14

- Use purple for feminine and teal for masculine in both themes, keeping gender distinct from red error feedback.

## 0.1.1 — 2026-11-14

- A missed word now stays owed until you answer it correctly, even if you switch tab, change
  levels or reload the page.
- Importing a backup can no longer damage your progress: the file is checked completely first,
  and a failed import leaves everything as it was.
- The app warns when it cannot save, and exporting still works from what is in memory.
- The round in progress is kept when you visit another tab.
- "poste" is now two words: la poste (post office) and le poste (job).
- The answer log records every answer, including repeats and "J'ai deviné" corrections.
- Favicon and home-screen icon.
- Data build stops on unresolved checks; deployment verifies the word list first.

## 0.1.0 — 2026-11-14

First version.

- Article trainer: un/une, le/la or mixed articles; ending-pattern feedback with measured
  reliability; "J'ai deviné" button.
- Word trainer: recognition first, then typed production with the article.
- Rules page: 56 ending guidelines measured on Lexique, with exceptions.
- 663 nouns (A1-B2) with French definitions, translations and examples; themed words for
  science, administration, tech, cinema and Swiss French.
- Spaced repetition (FSRS), progress saved in the browser, export/import, light/dark theme,
  French/English interface.
