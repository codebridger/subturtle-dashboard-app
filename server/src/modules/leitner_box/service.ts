import { getCollection, defineFunction } from "@modular-rest/server";
import { DATABASE as USER_DB, PHRASE_COLLECTION, DATABASE_GENERATIVE, LEITNER_REVIEW_BUNDLE_COLLECTION, LEITNER_SYSTEM_COLLECTION } from "../../config";

export class LeitnerService {
  static async ensureInitialized(userId: string) {
    const leitnerSystem = await getCollection(
      DATABASE_GENERATIVE,
      LEITNER_SYSTEM_COLLECTION
    );
    const existing = await leitnerSystem.findOne({ refId: userId });

    if (!existing) {
      await leitnerSystem.create({
        refId: userId,
        settings: { dailyLimit: 20, totalBoxes: 5 },
        items: [],
      });
    }
  }

  static async getReviewBundle(userId: string) {
    await this.ensureInitialized(userId);
    const reviewBundle = await getCollection(DATABASE_GENERATIVE, LEITNER_REVIEW_BUNDLE_COLLECTION);
    // Find pending bundle
    // Sort by createdAt desc to get latest?
    const pending = await reviewBundle.findOne(
      { refId: userId, status: "pending" },
      null,
      { sort: { createdAt: -1 } }
    ) as any;

    if (!pending) return null;

    // Populate phrases logic
    // We have phraseIds. We need to fetch phrase details from USER_DB.
    const phraseCollection = await getCollection(USER_DB, PHRASE_COLLECTION);
    const phraseIds = pending.items.map((i: any) => i.phraseId);
    
    // Manual pseudo-population
    // Assuming phraseId is the _id of the phrase doc
    const phrases = await phraseCollection.find({ _id: { $in: phraseIds } });
    
    // Map phrases back to items
    const populatedItems = pending.items.map((item: any) => {
        const phraseParams = phrases.find((p: any) => String(p._id) === String(item.phraseId));
        return {
            ...item,
            phrase: phraseParams
        };
    });

    return {
        ...pending.toJSON(),
        items: populatedItems
    };
  }

  static async addPhraseToBox(
    userId: string,
    phraseId: string,
    boxLevel: number = 1
  ) {
    const leitnerSystem = await getCollection(
      DATABASE_GENERATIVE,
      LEITNER_SYSTEM_COLLECTION
    );
    await this.ensureInitialized(userId);

    const doc = await leitnerSystem.findOne({ refId: userId }) as any;
    const exists = doc.items.find((i: any) => i.phraseId === phraseId);

    if (exists) {
      if (boxLevel === 1) {
        // Reset logic
        await leitnerSystem.updateOne(
          { refId: userId, "items.phraseId": phraseId },
          {
            $set: {
              "items.$.boxLevel": 1,
              "items.$.nextReviewDate": new Date(),
              "items.$.consecutiveFailures": 0,
            },
          }
        );
      }
    } else {
      await leitnerSystem.updateOne(
        { refId: userId },
        {
          $push: {
            items: {
              phraseId,
              boxLevel,
              nextReviewDate: new Date(),
              lastAttemptDate: null,
              consecutiveFailures: 0,
            },
          },
        }
      );
    }
  }

  static async submitReviewResult(
    userId: string,
    results: { phraseId: string; correct: boolean }[]
  ) {
    const leitnerSystem = await getCollection(
      DATABASE_GENERATIVE,
      LEITNER_SYSTEM_COLLECTION
    );
    const doc = await leitnerSystem.findOne({ refId: userId }) as any;

    if (!doc) return; // Should not happen if initialized

    const updates = [];

    for (const res of results) {
      let item = doc.items.find((i: any) => i.phraseId === res.phraseId);
      
      let currentBox = item ? item.boxLevel : 1;
      let consecutiveFailures = item ? item.consecutiveFailures || 0 : 0;
      let newBox = currentBox;
      let newFailures = 0;
      let nextDate = new Date();

      if (res.correct) {
        newBox = Math.min(doc.settings.totalBoxes, currentBox + 1);
        newFailures = 0;
        const days = Math.pow(2, newBox - 1);
        nextDate.setDate(nextDate.getDate() + days);
      } else {
        if (consecutiveFailures > 0) {
          newBox = 1;
          newFailures = 0;
        } else {
          newBox = Math.max(1, currentBox - 1);
          newFailures = 1;
        }
        // Review ASAP (tomorrow?) or same logic? 
        // Logic: "Move phrase to previous box".
        // Implicitly it adopts the schedule of the new box.
        const days = Math.pow(2, newBox - 1);
         nextDate.setDate(nextDate.getDate() + days);
      }

      if (item) {
        await leitnerSystem.updateOne(
          { refId: userId, "items.phraseId": res.phraseId },
          {
            $set: {
              "items.$.boxLevel": newBox,
              "items.$.consecutiveFailures": newFailures,
              "items.$.nextReviewDate": nextDate,
              "items.$.lastAttemptDate": new Date(),
            },
          }
        );
      } else {
        await leitnerSystem.updateOne(
          { refId: userId },
          {
            $push: {
              items: {
                phraseId: res.phraseId,
                boxLevel: newBox,
                consecutiveFailures: newFailures,
                nextReviewDate: nextDate,
                lastAttemptDate: new Date(),
              },
            },
          }
        );
      }
    }
    
    // Complete the pending bundle if any
    const reviewBundle = await getCollection(DATABASE_GENERATIVE, LEITNER_REVIEW_BUNDLE_COLLECTION);
    await reviewBundle.updateOne(
        { refId: userId, status: 'pending' },
        { $set: { status: 'completed' } }
    );
  }

  static async generateDailyBundles() {
    // Iterate all leitner systems
    const leitnerSystem = await getCollection(
      DATABASE_GENERATIVE,
      LEITNER_SYSTEM_COLLECTION
    );
    const reviewBundle = await getCollection(DATABASE_GENERATIVE, LEITNER_REVIEW_BUNDLE_COLLECTION);
    
    // This might be heavy if many users. For now, find all.
    const allSystems = await leitnerSystem.find({}) as any[];

    for (const sys of allSystems) {
        const userId = sys.refId;
        const limit = sys.settings.dailyLimit;
        const now = new Date();
        
        // Find items due
        const dueItems = sys.items.filter((i: any) => new Date(i.nextReviewDate) <= now);
        
        // Requirements: "Creates a ReviewBundle... Limit: MaxBundles (e.g. 3)"
        // Check existing pending bundles
        const pendingCount = await reviewBundle.countDocuments({ refId: userId, status: 'pending' });
        if (pendingCount >= 3) {
            // "Oldest unstarted bundle is replaced"
            // Wait, "unstarted". status 'pending' implies unstarted?
            // "In-progress bundles are kept". We don't distinguish pending vs in-progress in schema yet.
            // Using 'pending' as unstarted.
            const oldest = await reviewBundle.find({ refId: userId, status: 'pending' }, null, { sort: { createdAt: 1 }, limit: 1 });
            if (oldest.length > 0) {
                await reviewBundle.deleteOne({ _id: oldest[0]._id });
            }
        }

        if (dueItems.length === 0) continue;

        const selection = dueItems.slice(0, limit);
        
        const bundleItems = selection.map((i: any) => ({
            phraseId: i.phraseId,
            boxLevelAtGeneration: i.boxLevel
        }));

        await reviewBundle.create({
            refId: userId,
            type: 'daily',
            status: 'pending',
            items: bundleItems,
            createdAt: new Date() // Schema has timestamps but explicit is fine
        });
    }
    return { success: true };
  }

  static async getStats(userId: string) {
    await this.ensureInitialized(userId);
    const leitnerSystem = await getCollection(
      DATABASE_GENERATIVE,
      LEITNER_SYSTEM_COLLECTION
    );
    const doc = await leitnerSystem.findOne({ refId: userId }) as any;
    if (!doc) return { boxes: {} };

    const boxes: Record<number, number> = {};
    // Initialize standard boxes 1-5 (or doc.settings.totalBoxes)
    for (let i = 1; i <= (doc.settings?.totalBoxes || 5); i++) {
        boxes[i] = 0;
    }

    doc.items.forEach((item: any) => {
        const box = item.boxLevel || 1;
        boxes[box] = (boxes[box] || 0) + 1;
    });

    return { boxes, totalPhrases: doc.items.length, settings: doc.settings };
  }

  static async updateSettings(userId: string, settings: { dailyLimit?: number, totalBoxes?: number }) {
    await this.ensureInitialized(userId);
    const leitnerSystem = await getCollection(DATABASE_GENERATIVE, LEITNER_SYSTEM_COLLECTION);
    const doc = await leitnerSystem.findOne({ refId: userId }) as any;
    
    if (!doc) return { success: false };

    const newSettings = { ...doc.settings, ...settings };
    
    // Logic for reducing totalBoxes
    if (settings.totalBoxes && settings.totalBoxes < doc.settings.totalBoxes) {
        const newMax = settings.totalBoxes;
        
        await leitnerSystem.updateMany(
            { refId: userId, "items.boxLevel": { $gt: newMax } },
            { $set: { "items.$[elem].boxLevel": newMax } },
            { arrayFilters: [{ "elem.boxLevel": { $gt: newMax } }] }
        );
    }

    await leitnerSystem.updateOne(
        { refId: userId },
        { $set: { settings: newSettings } }
    );
    
    return { success: true };
  }
}

