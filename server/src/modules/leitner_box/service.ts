import { LeitnerItem } from "./db";
import { DATABASE, PHRASE_COLLECTION, DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION, BUNDLE_COLLECTION } from "../../config";
import { getCollection } from "@modular-rest/server";
import { Document } from "mongoose";
import { BoardService } from "../board/service";
import { ScheduleService } from "../schedule/service";

// Helper type since modular-rest types are opaque sometimes
type LeitnerSystemDoc = Document & {
  userId: string;
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

export class LeitnerService {
  private static syncedUsers = new Set<string>();

  private static async getSystem(userId: string): Promise<LeitnerSystemDoc | null> {
    const col = await getCollection(DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION);
    return (await col.findOne({ userId })) as unknown as LeitnerSystemDoc;
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

  static async getSettings(userId: string) {
    const system = await this.getSystem(userId);
    const settings = system?.settings || this.DEFAULT_SETTINGS;

    // Proactive sync: if we are here and it's initialized but job might be missing 
    // (e.g. after upgrade), we can trigger a sync.
    // To avoid too many writes, we only do it if the user is authorized and we just loaded them.
    // However, syncScheduledJob is idempotent.
    if (system) {
      // Run in background to avoid blocking
      this.syncScheduledJob(userId).catch(e => console.error(`[LeitnerService] Async job sync failed for ${userId}:`, e));
    }

    return settings;
  }

  static async ensureInitialized(userId: string) {
    const existing = await this.getSystem(userId);
    if (!existing) {
      const col = await getCollection(DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION);
      await col.create({
        userId,
        settings: this.DEFAULT_SETTINGS,
        items: [],
      });
      await this.syncScheduledJob(userId);
    }
  }

  static async getDueItems(userId: string, _limit: number = 20) {
    const system = await this.getSystem(userId);
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
    return selectedItems.map((item: LeitnerItem) => {
      const phrase = phrases.find((p: any) => p._id.toString() === item.phraseId.toString());
      return {
        ...item,
        phrase
      }
    }).filter((item: any) => item.phrase);
  }

  static async getCustomReviewItems(userId: string, phraseIds: string[]) {
    const system = await this.getSystem(userId);
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
      .map((item: LeitnerItem) => {
        const phrase = phrases.find((p: any) => p._id.toString() === item.phraseId.toString());
        return {
          ...item,
          phrase,
        };
      })
      .filter((item: any) => item.phrase);
  }

  static async getDueCount(userId: string): Promise<number> {
    const system = await this.getSystem(userId);
    if (!system) return 0;
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    const count = system.items.filter((item: LeitnerItem) => new Date(item.nextReviewDate) <= now).length;
    const dueCount = Math.min(count, system.settings.dailyLimit || 20);
    return dueCount;
  }

  static async submitReview(userId: string, phraseId: string, isCorrect: boolean): Promise<void> {
    const system = await this.getSystem(userId);
    if (!system) {
      await this.ensureInitialized(userId);
      await this.submitReview(userId, phraseId, isCorrect);
      return;
    }

    const col = await getCollection(DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION);
    const itemIndex = system.items.findIndex((i: LeitnerItem) => i.phraseId.toString() === phraseId.toString());
    const item = itemIndex >= 0 ? system.items[itemIndex] : null;

    let newItem: LeitnerItem;
    const now = new Date();

    if (!item) {
      const nextBox = isCorrect ? 2 : 1;
      const nextDate = this.calculateNextDate(nextBox, system.settings.boxIntervals);

      newItem = {
        phraseId,
        boxLevel: nextBox,
        nextReviewDate: nextDate,
        lastAttemptDate: now,
        consecutiveIncorrect: isCorrect ? 0 : 1
      };

      await col.updateOne(
        { _id: system._id },
        { $push: { items: newItem } }
      );
    } else {
      let nextBox = item.boxLevel;
      let nextConsecutiveIncorrect = item.consecutiveIncorrect || 0;

      if (isCorrect) {
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

    // Sync Board State after review
    const dueCount = await this.getDueCount(userId);
    await BoardService.refreshActivity(
      userId,
      "leitner_review",
      { dueCount, isActive: dueCount > 0 },
      false, // don't re-toast during session
      "singleton",
      undefined,
      true // persistent
    );
  }

  private static calculateNextDate(boxLevel: number, intervals: number[]): Date {
    const now = new Date();
    // Use interval from settings (0-indexed array vs 1-indexed box)
    // Fallback to 1 day if undefined or 0
    const days = intervals && intervals[boxLevel - 1] ? intervals[boxLevel - 1] : 1;
    now.setDate(now.getDate() + days);
    return now;
  }

  static async getStats(userId: string) {
    const system = await this.getSystem(userId);
    if (!system) return null;

    // Distribution
    const distribution: Record<number, number> = {};
    system.items.forEach((item) => {
      distribution[item.boxLevel] = (distribution[item.boxLevel] || 0) + 1;
    });

    if (system) {
      this.syncScheduledJob(userId).catch(e => console.error(`[LeitnerService] Async job sync failed for ${userId}:`, e));
    }

    return {
      settings: system.settings,
      distribution,
      totalItems: system.items.length
    };
  }

  static async updateSettings(userId: string, settings: { dailyLimit?: number; totalBoxes?: number; boxIntervals?: number[]; boxQuotas?: number[]; autoEntry?: boolean; reviewInterval?: number; reviewHour?: number }): Promise<void> {
    const system = await this.getSystem(userId);
    if (!system) {
      await this.ensureInitialized(userId);
      return this.updateSettings(userId, settings);
    }

    const col = await getCollection(DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION);

    const updatePayload: any = {};
    if (settings.dailyLimit) updatePayload["settings.dailyLimit"] = settings.dailyLimit;
    if (settings.totalBoxes) updatePayload["settings.totalBoxes"] = settings.totalBoxes;
    if (settings.boxIntervals) updatePayload["settings.boxIntervals"] = settings.boxIntervals;
    if (settings.boxQuotas) updatePayload["settings.boxQuotas"] = settings.boxQuotas;
    if (typeof settings.autoEntry === "boolean") updatePayload["settings.autoEntry"] = settings.autoEntry;
    updatePayload["settings.reviewInterval"] = settings.reviewInterval || system.settings.reviewInterval || 1;
    updatePayload["settings.reviewHour"] = settings.reviewHour !== undefined ? settings.reviewHour : (system.settings.reviewHour !== undefined ? system.settings.reviewHour : 9);

    await col.updateOne({ _id: system._id }, { $set: updatePayload });

    // Sync schedule if interval or hour changed
    if (settings.reviewInterval || settings.reviewHour !== undefined) {
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

      const updatedSystem = await this.getSystem(userId); // reload
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

  static async resetSystem(userId: string): Promise<void> {
    const system = await this.getSystem(userId);
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
      true // persistent
    );
  }

  static async addPhraseToBox(userId: string, phraseId: string, initialBox: number = 1): Promise<void> {
    const system = await this.getSystem(userId);
    if (!system) {
      await this.ensureInitialized(userId);
      return this.addPhraseToBox(userId, phraseId, initialBox);
    }

    const col = await getCollection(DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION);
    const itemIndex = system.items.findIndex(i => i.phraseId.toString() === phraseId.toString());

    const now = new Date();

    if (itemIndex >= 0) {
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
        consecutiveIncorrect: 0
      };

      await col.updateOne(
        { _id: system._id },
        { $push: { items: newItem } }
      );
    }

    // Sync Board State
    // We can assume at least 1 is due now (the one we just added)
    // plus any others.
    const dueCount = await this.getDueCount(userId);
    await BoardService.refreshActivity(
      userId,
      "leitner_review",
      { dueCount, isActive: dueCount > 0 },
      dueCount > 0,
      "singleton",
      undefined,
      true // persistent
    );
  }

  static async removePhraseFromBox(userId: string, phraseId: string): Promise<void> {
    const system = await this.getSystem(userId);
    if (!system) return;

    const col = await getCollection(DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION);

    // Pull the item from the items array
    await col.updateOne(
      { _id: system._id },
      { $pull: { items: { phraseId: phraseId } } }
    );

    // Sync Board State
    const dueCount = await this.getDueCount(userId);
    await BoardService.refreshActivity(
      userId,
      "leitner_review",
      { dueCount },
      dueCount > 0,
      "singleton"
    );
  }

  static async getPhraseManagementInfo(userId: string) {
    console.log('[PhraseManagementInfo] Getting info for userId:', userId);
    const system = await this.getSystem(userId);
    const phraseToBoxMap: Record<string, number> = {};
    if (system && system.items) {
      system.items.forEach(i => {
        phraseToBoxMap[i.phraseId.toString()] = i.boxLevel;
      });
    }

    const bundleCollection = await getCollection(DATABASE, BUNDLE_COLLECTION);
    const bundles = await bundleCollection.find({
      $or: [
        { refId: userId.toString() },
        { refId: userId }
      ]
    }).select('title _id').lean();

    console.log('[PhraseManagementInfo] Bundles found for', userId, ':', bundles.length);

    return {
      phraseToBoxMap,
      bundles: (bundles || []).map((b: any) => ({ _id: b._id.toString(), title: b.title }))
    };
  }

  private static async syncScheduledJob(userId: string) {
    if (this.syncedUsers.has(userId.toString())) return;

    const settings = await this.getSettings(userId);
    const { reviewInterval, reviewHour } = settings;

    // Cron: 0 minute, reviewHour hour, every X days, *, *
    const cron = `0 ${reviewHour} */${reviewInterval} * *`;

    await ScheduleService.createJob(
      `leitner-review-${userId}`,
      'leitner-review-job',
      {
        cronExpression: cron,
        args: { userId },
        jobType: 'recurrent',
        catchUp: true
      }
    );

    this.syncedUsers.add(userId.toString());
  }
}

// Register global schedule job
ScheduleService.register('leitner-review-job', async (args: { userId: string, expectedTime?: Date, executedTime?: Date }) => {
  const { userId, expectedTime, executedTime } = args;
  const dueCount = await LeitnerService.getDueCount(userId);
  if (dueCount > 0) {
    await BoardService.refreshActivity(
      userId,
      "leitner_review",
      { dueCount, isActive: true },
      true, // toast it!
      "singleton",
      undefined,
      true // persistent
    );
  }
});
