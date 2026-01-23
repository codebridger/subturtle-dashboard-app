import { LeitnerItem } from "./db";
import { DATABASE, PHRASE_COLLECTION, DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION } from "../../config";
import { getCollection } from "@modular-rest/server";
import { Document } from "mongoose";
import { BoardService } from "../board/service";

// Helper type since modular-rest types are opaque sometimes
type LeitnerSystemDoc = Document & {
  userId: string;
  settings: {
    dailyLimit: number;
    totalBoxes: number;
  };
  items: LeitnerItem[];
};

export class LeitnerService {
  private static async getSystem(userId: string): Promise<LeitnerSystemDoc | null> {
    const col = await getCollection(DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION);
    return (await col.findOne({ userId })) as unknown as LeitnerSystemDoc;
  }

  static async ensureInitialized(userId: string) {
    const existing = await this.getSystem(userId);
    if (!existing) {
      const col = await getCollection(DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION);
      await col.create({
        userId,
        settings: {
          dailyLimit: 20,
          totalBoxes: 5,
        },
        items: [],
      });
    }
  }

  static async getDueItems(userId: string, limit: number = 20) {
    const system = await this.getSystem(userId);
    if (!system) return [];

    const now = new Date();

    // Sort items (in-memory)
    let dueItems = system.items.filter((item: LeitnerItem) => new Date(item.nextReviewDate) <= now);
    dueItems.sort((a: LeitnerItem, b: LeitnerItem) => new Date(a.nextReviewDate).getTime() - new Date(b.nextReviewDate).getTime());

    const selectedItems = dueItems.slice(0, limit);

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

  static async getDueCount(userId: string): Promise<number> {
    const system = await this.getSystem(userId);
    if (!system) return 0;
    const now = new Date();
    return system.items.filter((item: LeitnerItem) => new Date(item.nextReviewDate) <= now).length;
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
      const nextDate = this.calculateNextDate(nextBox);

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

      const nextDate = this.calculateNextDate(nextBox);

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
      { dueCount },
      dueCount > 0, // only toast if items remain
      "singleton"
    );
  }

  private static calculateNextDate(boxLevel: number): Date {
    const now = new Date();
    const days = Math.pow(2, boxLevel - 1);
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

    return {
      settings: system.settings,
      distribution,
      totalItems: system.items.length
    };
  }

  static async updateSettings(userId: string, settings: { dailyLimit?: number; totalBoxes?: number }): Promise<void> {
    const system = await this.getSystem(userId);
    if (!system) {
      await this.ensureInitialized(userId);
      return this.updateSettings(userId, settings);
    }

    const col = await getCollection(DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION);

    const updatePayload: any = {};
    if (settings.dailyLimit) updatePayload["settings.dailyLimit"] = settings.dailyLimit;
    if (settings.totalBoxes) updatePayload["settings.totalBoxes"] = settings.totalBoxes;

    await col.updateOne({ _id: system._id }, { $set: updatePayload });

    // If totalBoxes reduced, we might need to clamp items
    if (settings.totalBoxes && settings.totalBoxes < system.settings.totalBoxes) {
      // Clamp logic: Items in box > newTotal -> newTotal
      // This is complex to do atomically with one update if items are just an array.
      // We might need to iterate or use array filters if possible.
      // For MVF, we can leave them "stranded" or lazily correct them on next review.
      // "Lazy correction" in submitReview handles it: Math.min(item.boxLevel + 1, system.settings.totalBoxes)
      // But what if it's currently 5 and max becomes 3? 
      // When reviewed, it will use new max. 
      // But `nextReviewDate` calculation logic might differ. 
      // It's acceptable for now.
    }
  }

  static async addPhraseToBox(userId: string, phraseId: string, initialBox: number = 1): Promise<void> {
    const system = await this.getSystem(userId);
    if (!system) {
      await this.ensureInitialized(userId);
      return this.addPhraseToBox(userId, phraseId, initialBox);
    }

    const col = await getCollection(DATABASE_LEITNER, LEITNER_SYSTEM_COLLECTION);
    const exists = system.items.some(i => i.phraseId.toString() === phraseId.toString());

    if (exists) return; // Idempotent

    const now = new Date();

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

    // Sync Board State
    // We can assume at least 1 is due now (the one we just added)
    // plus any others.
    const dueCount = await this.getDueCount(userId);
    await BoardService.refreshActivity(
      userId,
      "leitner_review",
      { dueCount },
      dueCount > 0,
      "singleton"
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
}
