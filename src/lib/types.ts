import type { Card } from 'ts-fsrs';

export type G = 'm' | 'f';
export type Level = 'A1' | 'A2' | 'B1' | 'B2';
/** One memory track per noun and skill: g = gender, s = sens (meaning). */
export type Skill = 'g' | 's';
export type Lang = 'fr' | 'en';
export type ArtMode = 'un' | 'le' | 'mix';

export interface Word {
  id: string; l: string; g: G; lv: Level;
  /** Ending guideline this noun falls under ('' if none); see rules.json. */
  end: string;
  /** True when the noun takes l' (vowel or silent h), which hides its gender. */
  el: boolean;
  def: string; en: string; ex: string; exEn: string; tags: string[];
  note?: string; noteEn?: string;
  /** Mass or one-of-a-kind noun (eau, soleil): never quizzed or shown with un/une. */
  unc?: boolean;
}
export interface Rule { end: string; g: G; pct: number; n: number; examples: string[]; exceptions: string[] }
/** Saved state of one card: the FSRS card plus when it was first seen. */
export interface Rec { c: Card; first: number }
export interface Settings {
  lang: Lang; theme: '' | 'light' | 'dark'; levels: Level[]; art: ArtMode;
  /** Legacy daily limits retained for backup compatibility; no longer used by the trainer. */
  newG: number; newS: number;
}
/** Pending retries per skill: ids of words missed and not yet answered correctly. */
export interface Retry { g: string[]; s: string[] }
/** A card the user marked as wrong, confusing or not ideal, keyed by word id. */
export interface Flag { t: number; note: string; skill: Skill; /** Removed again: kept as a marker so the removal reaches other devices. */ del?: boolean }
/**
 * One answer, exactly as it happened. `first` = first answer to a card in a session (graded),
 * `retry` = a repeat inside the session (not graded), `guess` = legacy (the "I guessed" button, removed in 0.4.1:
 * it re-graded the preceding `first`), `article` = a wrong article in a
 * typed answer, charged to the gender card. `r` is the FSRS grade applied, absent when none was.
 */
export interface LogEvent { t: number; k: string; kind: 'first' | 'retry' | 'guess' | 'article'; ok: boolean; r?: number; a?: string }

export const LEVELS: Level[] = ['A1', 'A2', 'B1', 'B2'];
export const DEFAULTS: Settings = { lang: 'fr', theme: '', levels: ['A1', 'A2', 'B1'], art: 'mix', newG: 20, newS: 10 };
