import { LeitnerItem, ReviewItem } from "./db";
import { DATABASE, PHRASE_COLLECTION, DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION, BUNDLE_COLLECTION, PROFILE_COLLECTION, LANGUAGE_PROFILE_COLLECTION } from "../../config";
import { getCollection } from "@modular-rest/server";
import { Document } from "mongoose";
import { BoardService } from "../board/service";
import { ScheduleService } from "../schedule/service";
import { pickPrimaryChunkText } from "../../utils/chunk";
import { LangCode, langOf, languageFilter, toCode } from "../../languages/helper";
import { getLearnerLanguages, resolveLanguage, resolvePhraseLanguage } from "../../languages/learner";
import { findLanguageProfile, poolSettings } from "../../languages/language-settings";
import { getOrCreate } from "../../utils/get-or-create";
import { itemsPlan, mergeLeitnerItems, resolveLanguageDoc } from "../../languages/language-docs";

const LEITNER_MERGE = itemsPlan(mergeLeitnerItems);
import { clozeFields } from "./cloze-cue";

// Helper type since modular-rest types are opaque sometimes
type LeitnerSystemDoc = Document & {
  userId: string;
  language?: string;
  settings: {
    dailyLimit: number;
    totalBoxes: number;
    boxIntervals: number[];
    boxQuotas: number[];
    autoEntry: boolean;
    reviewInterval: number;
    reviewHour: number;
  };
  items: LeitnerItem[];
};

/**
 * The three-way review result (Q4, contract section 3). `close` (right word, wrong form)
 * keeps the card in its box: not up, not down.
 */
export type ReviewResult = "right" | "close" | "wrong";
export const REVIEW_RESULTS: ReviewResult[] = ["right", "close", "wrong"];

/** The result of a review request: `result` when valid, else the old `isCorrect` boolean. */
export function toReviewResult(result: unknown, isCorrect?: unknown): ReviewResult | undefined {
  if (typeof result === "string" && (REVIEW_RESULTS as string[]).includes(result)) return result as ReviewResult;
  if (typeof result === "boolean") return result ? "right" : "wrong";
  if (typeof isCorrect === "boolean") return isCorrect ? "right" : "wrong";
  return undefined;
}

// Stored items are Mongoose subdocuments; spreading one copies internals (on Mongoose 8
// including `$__parent`, the whole Leitner document) into every review item's JSON.
// Plain objects keep only the item's fields, at the top level where the clients read them.
function toPlainItem(item: LeitnerItem): LeitnerItem {
  const subdoc = item as any;
  return typeof subdoc.toObject === "function" ? subdoc.toObject() : item;
}

/**
 * Spaced review. One Leitner document per `(userId, language)` (ADR-006 point 3, work list
 * B-10): each language has its own items, daily limit and box chain; the review hour and
 * interval stay global on the profile. A document from before multilingual has no
 * `language` and is the English one (found in code by `getSystem`), so this works on today's data with
 * no backfill.
 *
 * Every method takes an optional `language`. Without one, a phrase-scoped call (review,
 * add, remove one card) uses the phrase's own language, and every other call uses the
 * learner's active language (old clients).
 */
export class LeitnerService {
  private static syncedUsers = new Set<string>();

  /**
   * The learner's Leitner document for the language. Resolved in code, not with one
   * language filter (`resolveLanguageDoc`): an old document with no `language` is found on
   * every database and adopted, and duplicate copies are merged into one.
   */
  private static async getSystem(userId: string, language: LangCode): Promise<LeitnerSystemDoc | null> {
    const col = await getCollection(DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION);
    return (await resolveLanguageDoc(col as any, { userId }, language, LEITNER_MERGE)) as LeitnerSystemDoc | null;
  }

  /** Every Leitner document of the user (one per language). */
  private static async getSystems(userId: string): Promise<LeitnerSystemDoc[]> {
    const col = await getCollection(DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION);
    return ((await col.find({ userId })) as unknown as LeitnerSystemDoc[]) || [];
  }

  /** Refreshes the review card of one language's board after its due count changed. */
  private static async refreshBoard(userId: string, language: LangCode, shouldToast: boolean, persistent = true, includeActive = true) {
    const dueCount = await this.getDueCount(userId, language);
    await BoardService.refreshActivity(
      userId,
      "leitner_review",
      includeActive ? { dueCount, isActive: dueCount > 0 } : { dueCount },
      shouldToast && dueCount > 0,
      "singleton",
      undefined,
      persistent,
      language
    );
  }

  /** Coerce to an integer in [min, max]; throw on anything out of range. Guards the
   *  Pool/review settings so a bad value can't break the age-out sweep or the cron. */
  private static validateInt(value: number, min: number, max: number, field: string): number {
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n) || n < min || n > max) {
      throw new Error(`${field} must be an integer between ${min} and ${max}`);
    }
    return n;
  }

  public static readonly DEFAULT_SETTINGS = {
    dailyLimit: 20,
    totalBoxes: 5,
    boxIntervals: [1, 2, 4, 8, 16],
    boxQuotas: [20, 10, 5, 5, 5],
    autoEntry: true,
    reviewInterval: 1,
    reviewHour: 9
  };

  static async getSettings(userId: string, language?: LangCode) {
    const lang = await resolveLanguage(userId, language);
    const system = await this.getSystem(userId, lang);
    const settings = system?.settings || this.DEFAULT_SETTINGS;

    // Proactive sync: if we are here and it's initialized but job might be missing 
    // (e.g. after upgrade), we can trigger a sync.
    // To avoid too many writes, we only do it if the user is authorized and we just loaded them.
    // However, syncScheduledJob is idempotent.
    if (system) {
      // Run in background to avoid blocking
      this.syncScheduledJob(userId).catch(e => console.error(`[LeitnerService] Async job sync failed for ${userId}:`, e));
    }

    const profileCol = await getCollection(DATABASE, PROFILE_COLLECTION);
    const profile = await profileCol.findOne({ refId: userId }) as any;

    // reviewHour/reviewInterval now live on the profile (global). Read profile-first, then
    // fall back to the (legacy) Leitner-system value, then the default — so users
    // whose values haven't been backfilled yet keep working. The Pool settings are per
    // language: the language profile, then the profile (no Leitner fallback exists).
    const pool = await poolSettings(userId, lang, profile);
    return {
      ...settings,
      reviewHour: profile?.reviewHour ?? settings.reviewHour ?? this.DEFAULT_SETTINGS.reviewHour,
      reviewInterval: profile?.reviewInterval ?? settings.reviewInterval ?? this.DEFAULT_SETTINGS.reviewInterval,
      poolAgeCutoffDays: pool.poolAgeCutoffDays,
      poolChunkSize: pool.poolChunkSize,
      timeZone: profile?.timeZone
    };
  }

  /**
   * Makes sure the learner has a Leitner document for the language. It creates one only
   * when `getSystem` finds none, old or new, so an old document is never hidden by a new
   * empty one. The create is one upsert with `$setOnInsert` on the plain `language` value
   * (ADR-006 point 3); a duplicate-key error from the unique `(userId, language)` index
   * counts as success. Before that index exists two calls at once can both insert, so the
   * document is read again afterwards, which merges any copy into one.
   * Returns the language it worked on.
   */
  static async ensureInitialized(userId: string, language?: LangCode): Promise<LangCode> {
    const lang = await resolveLanguage(userId, language);
    const existing = await this.getSystem(userId, lang);
    if (!existing) {
      const col = await getCollection(DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION);
      await getOrCreate(col, { userId, language: lang }, {
        userId,
        language: lang,
        settings: this.DEFAULT_SETTINGS,
        items: [],
      });
      await this.getSystem(userId, lang);
      await this.syncScheduledJob(userId);
    }
    return lang;
  }

  static async getDueItems(userId: string, _limit: number = 20, language?: LangCode) {
    const system = await this.getSystem(userId, await resolveLanguage(userId, language));
    if (!system) return [];

    const now = new Date();
    now.setHours(23, 59, 59, 999);
    const allDueItems = system.items.filter((item: LeitnerItem) => new Date(item.nextReviewDate) <= now);

    // Group by box level
    const dueByBox: Record<number, LeitnerItem[]> = {};
    allDueItems.forEach(item => {
      if (!dueByBox[item.boxLevel]) dueByBox[item.boxLevel] = [];
      dueByBox[item.boxLevel].push(item);
    });

    let selectedItems: LeitnerItem[] = [];

    // Apply Quotas
    const quotas = system.settings.boxQuotas || [];
    for (let boxLevel = 1; boxLevel <= system.settings.totalBoxes; boxLevel++) {
      const quota = quotas[boxLevel - 1] || 0; // 0 if not defined
      if (quota > 0 && dueByBox[boxLevel]) {
        // Sort by most overdue first
        dueByBox[boxLevel].sort((a, b) => new Date(a.nextReviewDate).getTime() - new Date(b.nextReviewDate).getTime());
        selectedItems = selectedItems.concat(dueByBox[boxLevel].slice(0, quota));
      }
    }

    // Apply Daily Limit
    const limit = system.settings.dailyLimit || _limit;
    if (selectedItems.length > limit) {
      selectedItems = selectedItems.slice(0, limit);
    }

    const phraseIds = selectedItems.map((i: LeitnerItem) => i.phraseId);
    if (phraseIds.length === 0) return [];

    const phraseCollection = await getCollection(DATABASE, PHRASE_COLLECTION);
    const phrases = await phraseCollection.find({ _id: { $in: phraseIds } });

    // Join
    return selectedItems.map((item: LeitnerItem): ReviewItem => {
      const phrase: any = phrases.find((p: any) => p._id.toString() === item.phraseId.toString());
      return {
        ...toPlainItem(item),
        phrase,
        confirmed_chunk: pickPrimaryChunkText(phrase?.chunks),
        source_sentence: phrase?.context ?? null,
        ...clozeFields(phrase),
      }
    }).filter((item: ReviewItem) => item.phrase);
  }

  static async getCustomReviewItems(userId: string, phraseIds: string[], language?: LangCode) {
    const system = await this.getSystem(userId, await resolveLanguage(userId, language));
    const items = system?.items || [];
    const now = new Date();

    const selectedItems: LeitnerItem[] = phraseIds.map((id) => {
      const existing = items.find((i: LeitnerItem) => i.phraseId.toString() === id.toString());
      if (existing) return existing;

      return {
        phraseId: id,
        boxLevel: 1,
        nextReviewDate: now,
        lastAttemptDate: new Date(0),
        consecutiveIncorrect: 0,
      } as unknown as LeitnerItem;
    });

    const phraseCollection = await getCollection(DATABASE, PHRASE_COLLECTION);
    const phrases = await phraseCollection.find({ _id: { $in: phraseIds } });

    return selectedItems
      .map((item: LeitnerItem): ReviewItem => {
        const phrase: any = phrases.find((p: any) => p._id.toString() === item.phraseId.toString());
        return {
          ...toPlainItem(item),
          phrase,
          confirmed_chunk: pickPrimaryChunkText(phrase?.chunks),
          source_sentence: phrase?.context ?? null,
          ...clozeFields(phrase),
        };
      })
      .filter((item: ReviewItem) => item.phrase);
  }

  static async getDueCount(userId: string, language?: LangCode): Promise<number> {
    const system = await this.getSystem(userId, await resolveLanguage(userId, language));
    if (!system) return 0;
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    const count = system.items.filter((item: LeitnerItem) => new Date(item.nextReviewDate) <= now).length;
    const dueCount = Math.min(count, system.settings.dailyLimit || 20);
    return dueCount;
  }

  /**
   * Records one answer. `result` is the three-way result (`true` / `false` still work for old
   * callers: right / wrong). Right moves the card up a box, wrong moves it down (twice wrong
   * at box 1 sends it back to the Pool), and close keeps its box and schedules it again at
   * that box's interval (Q4). Returns the language and the card's box before and after the
   * answer (`boxLevel` null: the card went back to the Pool).
   */
  static async submitReview(
    userId: string,
    phraseId: string,
    result: ReviewResult | boolean,
    language?: LangCode
  ): Promise<{ language: LangCode; boxLevel: number | null; fromBox: number | null }> {
    const outcome: ReviewResult = typeof result === "boolean" ? (result ? "right" : "wrong") : result;
    const isCorrect = outcome === "right";
    const lang = await resolvePhraseLanguage(userId, phraseId, language);
    const system = await this.getSystem(userId, lang);
    if (!system) {
      await this.ensureInitialized(userId, lang);
      return this.submitReview(userId, phraseId, outcome, lang);
    }
    let boxLevel: number | null = null;

    const col = await getCollection(DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION);
    const itemIndex = system.items.findIndex((i: LeitnerItem) => i.phraseId.toString() === phraseId.toString());
    const item = itemIndex >= 0 ? system.items[itemIndex] : null;
    const fromBox = item ? item.boxLevel : null;

    let newItem: LeitnerItem;
    const now = new Date();

    if (!item) {
      // A card answered before it was in a box starts at box 1; right moves it to box 2.
      const nextBox = isCorrect ? 2 : 1;
      const nextDate = this.calculateNextDate(nextBox, system.settings.boxIntervals);

      newItem = {
        phraseId,
        boxLevel: nextBox,
        nextReviewDate: nextDate,
        lastAttemptDate: now,
        consecutiveIncorrect: outcome === "wrong" ? 1 : 0
      };
      boxLevel = nextBox;

      await col.updateOne(
        { _id: system._id },
        { $push: { items: newItem } }
      );
    } else {
      let nextBox = item.boxLevel;
      let nextConsecutiveIncorrect = item.consecutiveIncorrect || 0;

      if (outcome === "close") {
        // Close: right word, wrong form. The card stays in its box and the wrong-answer run
        // is neither reset nor extended (Q4).
        nextBox = item.boxLevel;
      } else if (isCorrect) {
        nextBox = Math.min(item.boxLevel + 1, system.settings.totalBoxes);
        nextConsecutiveIncorrect = 0;
      } else {
        nextConsecutiveIncorrect++;
        if (nextConsecutiveIncorrect === 1) {
          nextBox = Math.max(1, item.boxLevel - 1);
        } else {
          nextBox = 1;
        }
      }

      // Forgot x2 at L1 -> Pool. A card stuck at L1 that is marked Forgot twice in a
      // row is pulled out of the Leitner queue and re-pooled for another
      // first-encounter pass (fresh pooled_at). Strictly L1 AND >= 2 consecutive
      // Forgots; a Learned in between resets the counter (nextConsecutiveIncorrect = 0
      // above), so it never fires on Forgot/Learned/Forgot. Higher boxes demote
      // normally. We skip the box $set but still run the board-refresh tail below.
      if (outcome === "wrong" && item.boxLevel === 1 && nextConsecutiveIncorrect >= 2) {
        await this.removePhraseFromBox(userId, phraseId, lang);
        // Lazy require avoids the pool <-> leitner_box import cycle (see PoolService.promote).
        const { PoolService } = require("../pool/service");
        await PoolService.add(userId, phraseId, lang);
      } else {
        boxLevel = nextBox;
        const nextDate = this.calculateNextDate(nextBox, system.settings.boxIntervals);

        const updateField = `items.${itemIndex}`;
        await col.updateOne(
          { _id: system._id },
          {
            $set: {
              [`${updateField}.boxLevel`]: nextBox,
              [`${updateField}.nextReviewDate`]: nextDate,
              [`${updateField}.lastAttemptDate`]: now,
              [`${updateField}.consecutiveIncorrect`]: nextConsecutiveIncorrect
            }
          }
        );
      }
    }

    // Sync Board State after review (don't re-toast during session)
    await this.refreshBoard(userId, lang, false);
    return { language: lang, boxLevel, fromBox };
  }

  private static calculateNextDate(boxLevel: number, intervals: number[]): Date {
    const now = new Date();
    // Use interval from settings (0-indexed array vs 1-indexed box)
    // Fallback to 1 day if undefined or 0
    const days = intervals && intervals[boxLevel - 1] ? intervals[boxLevel - 1] : 1;
    now.setDate(now.getDate() + days);
    return now;
  }

  static async getStats(userId: string, language?: LangCode) {
    const lang = await resolveLanguage(userId, language);
    const system = await this.getSystem(userId, lang);
    if (!system) return null;

    // Distribution
    const distribution: Record<number, number> = {};
    system.items.forEach((item) => {
      distribution[item.boxLevel] = (distribution[item.boxLevel] || 0) + 1;
    });

    if (system) {
      this.syncScheduledJob(userId).catch(e => console.error(`[LeitnerService] Async job sync failed for ${userId}:`, e));
    }

    // Return the profile-merged settings (reviewHour/reviewInterval + pool fields now
    // live on the profile) so the settings UI shows the authoritative values.
    const settings = await this.getSettings(userId, lang);

    return {
      language: lang,
      settings,
      distribution,
      totalItems: system.items.length
    };
  }

  static async updateSettings(userId: string, settings: { dailyLimit?: number; totalBoxes?: number; boxIntervals?: number[]; boxQuotas?: number[]; autoEntry?: boolean; reviewInterval?: number; reviewHour?: number; poolAgeCutoffDays?: number; poolChunkSize?: number }, language?: LangCode): Promise<void> {
    const lang = await resolveLanguage(userId, language);
    const system = await this.getSystem(userId, lang);
    if (!system) {
      await this.ensureInitialized(userId, lang);
      return this.updateSettings(userId, settings, lang);
    }

    const col = await getCollection(DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION);

    // Box-mechanics settings stay on the Leitner system doc.
    const updatePayload: any = {};
    if (settings.dailyLimit) updatePayload["settings.dailyLimit"] = settings.dailyLimit;
    if (settings.totalBoxes) updatePayload["settings.totalBoxes"] = settings.totalBoxes;
    if (settings.boxIntervals) updatePayload["settings.boxIntervals"] = settings.boxIntervals;
    if (settings.boxQuotas) updatePayload["settings.boxQuotas"] = settings.boxQuotas;
    if (typeof settings.autoEntry === "boolean") updatePayload["settings.autoEntry"] = settings.autoEntry;

    if (Object.keys(updatePayload).length > 0) {
      await col.updateOne({ _id: system._id }, { $set: updatePayload });
    }

    // reviewHour/reviewInterval + the Pool settings live on the profile doc.
    const profileCol = await getCollection(DATABASE, PROFILE_COLLECTION);
    const profilePayload: any = {};
    if (settings.reviewInterval !== undefined) {
      profilePayload.reviewInterval = this.validateInt(settings.reviewInterval, 1, 365, "reviewInterval");
    }
    if (settings.reviewHour !== undefined) {
      profilePayload.reviewHour = this.validateInt(settings.reviewHour, 0, 23, "reviewHour");
    }
    if (settings.poolAgeCutoffDays !== undefined) {
      profilePayload.poolAgeCutoffDays = this.validateInt(settings.poolAgeCutoffDays, 1, 90, "poolAgeCutoffDays");
    }
    if (settings.poolChunkSize !== undefined) {
      profilePayload.poolChunkSize = this.validateInt(settings.poolChunkSize, 1, 100, "poolChunkSize");
    }
    if (Object.keys(profilePayload).length > 0) {
      await profileCol.updateOne({ refId: userId }, { $set: profilePayload }, { upsert: true });
    }

    // The Pool settings are per language (ADR-006 point 2): when this language has a
    // language profile, write them there too, or its value would hide the one just set.
    const languagePool: any = {};
    if (profilePayload.poolAgeCutoffDays !== undefined) languagePool.poolAgeCutoffDays = profilePayload.poolAgeCutoffDays;
    if (profilePayload.poolChunkSize !== undefined) languagePool.poolChunkSize = profilePayload.poolChunkSize;
    if (Object.keys(languagePool).length > 0) {
      const languageProfile = await findLanguageProfile(userId, lang);
      if (languageProfile?._id) {
        const languageProfiles = await getCollection(DATABASE, LANGUAGE_PROFILE_COLLECTION);
        await languageProfiles.updateOne({ _id: languageProfile._id }, { $set: languagePool });
      }
    }

    // Sync schedule if interval or hour changed
    if (settings.reviewInterval !== undefined || settings.reviewHour !== undefined) {
      this.syncedUsers.delete(userId.toString()); // Force re-sync
      await this.syncScheduledJob(userId);
    }

    // If totalBoxes reduced, move items in higher boxes to the new max box
    if (settings.totalBoxes && settings.totalBoxes < system.settings.totalBoxes) {
      const newMaxBox = settings.totalBoxes;

      // We need to pull items down. 
      // Since Mongo doesn't support "update if > X" easily in array without pipeline or multiple queries,
      // and we have ~5000 items max, we can do it in memory for safety or use arrayFilters.
      // Let's use arrayFilters for atomicity if possible, but complexity is high.
      // Simpler approach: Load items, modify, save.

      const updatedSystem = await this.getSystem(userId, lang); // reload
      if (!updatedSystem) return;

      let hasChanges = false;
      updatedSystem.items.forEach(item => {
        if (item.boxLevel > newMaxBox) {
          item.boxLevel = newMaxBox;
          hasChanges = true;
          // Note: We are NOT changing nextReviewDate immediately. 
          // They will retain their old review date. When reviewed, they will follow new box rules.
        }
      });

      if (hasChanges) {
        await col.updateOne(
          { _id: system._id },
          { $set: { items: updatedSystem.items } }
        );
      }
    }
  }

  /** Empties one language's boxes; the other languages are not touched. */
  static async resetSystem(userId: string, language?: LangCode): Promise<void> {
    const lang = await resolveLanguage(userId, language);
    const system = await this.getSystem(userId, lang);
    if (!system) return;

    const col = await getCollection(DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION);

    // Clear all items, keep settings? 
    // Usually "Reset" implies cleaning the slate.
    await col.updateOne(
      { _id: system._id },
      { $set: { items: [] } }
    );

    // Sync Board
    await BoardService.refreshActivity(
      userId,
      "leitner_review",
      { dueCount: 0, isActive: false },
      false, // Hide toast
      "singleton",
      undefined,
      true, // persistent
      lang
    );
  }

  static async addPhraseToBox(
    userId: string,
    phraseId: string,
    initialBox: number = 1,
    opts: { onlyIfAbsent?: boolean; encountered?: boolean; language?: LangCode } = {}
  ): Promise<void> {
    const lang = await resolvePhraseLanguage(userId, phraseId, opts.language);
    const system = await this.getSystem(userId, lang);
    if (!system) {
      await this.ensureInitialized(userId, lang);
      return this.addPhraseToBox(userId, phraseId, initialBox, { ...opts, language: lang });
    }

    const col = await getCollection(DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION);
    const itemIndex = system.items.findIndex(i => i.phraseId.toString() === phraseId.toString());

    const now = new Date();

    if (itemIndex >= 0) {
      // `onlyIfAbsent` makes this a no-op when the card is already in Leitner — the
      // idempotency that keeps PoolService.promote crash-safe (an interrupted
      // promote leaves a harmless duplicate, and the next age-out sweep re-runs
      // without moving/resetting the card).
      if (opts.onlyIfAbsent) return;

      // Move existing item
      const updateField = `items.${itemIndex}`;
      await col.updateOne(
        { _id: system._id },
        {
          $set: {
            [`${updateField}.boxLevel`]: initialBox,
            [`${updateField}.nextReviewDate`]: now,
            [`${updateField}.lastAttemptDate`]: now,
          }
        }
      );
    } else {
      // Add new item
      const newItem: LeitnerItem = {
        phraseId,
        boxLevel: initialBox,
        nextReviewDate: now,
        lastAttemptDate: now,
        consecutiveIncorrect: 0,
        encountered: opts.encountered ?? false,
      };

      await col.updateOne(
        { _id: system._id },
        { $push: { items: newItem } }
      );
    }

    // Sync Board State
    // We can assume at least 1 is due now (the one we just added)
    // plus any others.
    await this.refreshBoard(userId, lang, true);
  }

  /**
   * Takes a card out of review. With a `language`, out of that language's boxes; without
   * one, out of every language that holds it (a deleted phrase has no language left to
   * read, so the delete triggers call it this way).
   */
  static async removePhraseFromBox(userId: string, phraseId: string, language?: LangCode): Promise<void> {
    const given = toCode(language);
    let systems: LeitnerSystemDoc[];
    if (given) {
      const system = await this.getSystem(userId, given);
      systems = system ? [system] : [];
    } else {
      systems = (await this.getSystems(userId)).filter((system) =>
        (system.items || []).some((item) => item.phraseId?.toString() === phraseId.toString())
      );
    }
    if (systems.length === 0) return;

    const col = await getCollection(DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION);

    for (const system of systems) {
      // Pull the item from the items array
      await col.updateOne(
        { _id: system._id },
        { $pull: { items: { phraseId: phraseId } } }
      );

      // Sync Board State
      await this.refreshBoard(userId, given ?? langOf(system), true, false, false);
    }
  }

  static async getPhraseManagementInfo(userId: string, language?: LangCode) {
    const lang = await resolveLanguage(userId, language);
    const system = await this.getSystem(userId, lang);
    const phraseToBoxMap: Record<string, number> = {};
    // Phrases whose next review has come round. The Start-a-session bundle picker
    // intersects these with each bundle's phrase ids to show its "N due" count and
    // to drive the Due today / Never practised filters — `leitner_system` itself is
    // owner-access, so the client cannot derive this on its own.
    const duePhraseIds: string[] = [];
    const now = new Date();
    if (system && system.items) {
      system.items.forEach(i => {
        phraseToBoxMap[i.phraseId.toString()] = i.boxLevel;
        if (new Date(i.nextReviewDate) <= now) duePhraseIds.push(i.phraseId.toString());
      });
    }

    const bundleCollection = await getCollection(DATABASE, BUNDLE_COLLECTION);
    // The bundles of this language only (B-09).
    const bundles = await bundleCollection.find({
      $or: [
        { refId: userId.toString() },
        { refId: userId }
      ],
      ...languageFilter(lang)
    }).select('title _id').lean();

    return {
      language: lang,
      phraseToBoxMap,
      // Additive: existing callers (the Leitner phrase picker) ignore it.
      duePhraseIds,
      bundles: (bundles || []).map((b: any) => ({ _id: b._id.toString(), title: b.title }))
    };
  }

  private static async syncScheduledJob(userId: string) {
    const key = userId.toString();
    if (this.syncedUsers.has(key)) return;

    // Claim the sync up-front. getSettings() below re-enters syncScheduledJob() in
    // the background, so without claiming first a single sync fans out into many
    // concurrent createJob() calls racing on the same `leitner-review-<userId>`
    // name. Marking it synced here turns those re-entrant calls into no-ops.
    this.syncedUsers.add(key);

    try {
      const settings = await this.getSettings(userId);
      const { reviewInterval, reviewHour } = settings;

      // Cron: 0 minute, reviewHour hour, every X days, *, *
      const cron = `0 ${reviewHour} */${reviewInterval} * *`;

      const profileCol = await getCollection(DATABASE, PROFILE_COLLECTION);
      const profile = await profileCol.findOne({ refId: userId }) as any;
      const timeZone = profile?.timeZone;

      await ScheduleService.createJob(
        `leitner-review-${userId}`,
        'leitner-review-job',
        {
          cronExpression: cron,
          args: { userId },
          jobType: 'recurrent',
          catchUp: true,
          timeZone
        }
      );
    } catch (e) {
      // Never let a schedule-sync failure bubble into the caller's request flow
      // (registration trigger, login, settings update). Release the claim so a
      // later request can retry the sync.
      this.syncedUsers.delete(key);
      console.error(`[LeitnerService] syncScheduledJob failed for ${userId}:`, e);
    }
  }

  static async resyncSchedule(userId: string) {
    this.syncedUsers.delete(userId.toString());
    await this.syncScheduledJob(userId);
  }
}

// Register global schedule job
/**
 * The daily review reminder: one job per user (the review hour is global). It refreshes the
 * review card of every language the learner studies now; paused and removed languages are
 * skipped, so they get no reminder (ADR-006 point 7).
 */
export async function runReviewReminder(userId: string): Promise<void> {
  const { studying } = await getLearnerLanguages(userId);
  for (const language of studying) {
    const dueCount = await LeitnerService.getDueCount(userId, language);
    if (dueCount > 0) {
      await BoardService.refreshActivity(
        userId,
        "leitner_review",
        { dueCount, isActive: true },
        true, // toast it!
        "singleton",
        undefined,
        true, // persistent
        language
      );
    }
  }
}

ScheduleService.register('leitner-review-job', async (args: { userId: string, expectedTime?: Date, executedTime?: Date }) => {
  await runReviewReminder(args.userId);
});
