/**
 * Types and constants shared by the language module. Kept out of db.ts, whose
 * `module.exports = [...]` (the modular-rest collection list) replaces named exports.
 */
export const LANGUAGE_STATUSES = ["active", "paused", "removed", "purging"] as const;
export type LanguageStatus = (typeof LANGUAGE_STATUSES)[number];

export const CEFR_STARTS = ["A1", "A2", "B1", "B2"] as const;
export type CefrStart = (typeof CEFR_STARTS)[number];

export const STARTER_PACK_STATES = ["none", "offered", "in_progress", "done", "skipped"] as const;
export type StarterPackState = (typeof STARTER_PACK_STATES)[number];

/**
 * One learner's study of one language (ADR-006 point 2, work list B-04). The source of truth
 * for which languages a learner has; the profile's `learningLanguages` / `pausedLanguages`
 * are a copy that `get-language-state` repairs from here.
 *
 * Status moves: active ⇄ paused (plan limit), active/paused → removed (`purgeAt` 30 days
 * ahead) → active again on re-add, or removed → purging (claimed by the purge job, which
 * deletes this document last).
 */
export interface LanguageProfile {
  _id?: any;
  userId: string;
  language: string;
  status: LanguageStatus;
  startLevel: CefrStart;
  startLevelSource: "test" | "default";
  goals: string[];
  /** The language the Coach explains in; unset means the learner's own language. */
  explanationLanguage?: string;
  /** New phrases a day taken into review (intake). Unset means the Leitner default. */
  newPhrasesPerDay?: number;
  /** Pool settings, per language (moved here from the profile). Unset means the profile's. */
  poolChunkSize?: number;
  poolAgeCutoffDays?: number;
  starterPack: { state: StarterPackState; heard: string[]; total: number };
  addedAt: Date;
  removedAt?: Date | null;
  purgeAt?: Date | null;
  /** When the purge job claimed it; a stale claim is retried. */
  purgeClaimedAt?: Date | null;
}
