import { DatabaseTrigger } from "@modular-rest/server";
import { LeitnerService } from "../leitner_box/service";
import {
  isUserOnFreemium,
  updateFreemiumAllocation,
} from "../subscription/service";

export const phraseBundleTriggers = [
  // When a phrase bundle is created,
  // we need to update the freemium allocation
  new DatabaseTrigger("insert-one", async (context) => {
    const { doc } = context;
    const user_id = doc?.refId;
    const isFreemium = await isUserOnFreemium(user_id);

    if (isFreemium) {
      await updateFreemiumAllocation({
        userId: user_id,
        increment: {
          allowed_save_words_used: 1,
        },
      });
    }

    // When a new phrase is created, add it to the Leitner system (if autoEntry is enabled)
    if (doc && doc.phrase && doc.translation && doc.refId) {
      try {
        const settings = await LeitnerService.getSettings(doc.refId);
        if (settings && settings.autoEntry) {
          await LeitnerService.addPhraseToBox(doc.refId, doc._id, 1);
        }
      } catch (e) {
        console.error("Failed to add phrase to Leitner system", e);
      }
    }
  }),

  new DatabaseTrigger("insert-many", async (context) => {
    const { docs } = context;
    if (!docs || docs.length === 0) return;

    // 1. Update Freemium Allocation
    // Assuming all docs belong to the same user if inserted in batch? 
    // Usually yes for client-side bundle creation, but modular-rest batch insert might mix? 
    // Safest is to group by user or iterate. 
    // Given the request context "phrase bundle", typically one user creates a bundle.
    // However, robust code should handle mixed.

    // Group by user for efficiency
    const userIncrements: Record<string, number> = {};
    const leitnerAdditions: { userId: string; docId: string }[] = [];

    for (const doc of docs) {
      const user_id = doc.refId; // Owner ID
      if (user_id) {
        userIncrements[user_id] = (userIncrements[user_id] || 0) + 1;

        if (doc.phrase && doc.translation) {
          leitnerAdditions.push({ userId: user_id, docId: doc._id });
        }
      }
    }

    // Process Freemium Allocations
    for (const [userId, count] of Object.entries(userIncrements)) {
      const isFreemium = await isUserOnFreemium(userId);
      if (isFreemium) {
        await updateFreemiumAllocation({
          userId,
          increment: { allowed_save_words_used: count }
        });
      }
    }

    // Process Leitner Additions
    const userSettingsCache: Record<string, any> = {};

    for (const item of leitnerAdditions) {
      try {
        if (!userSettingsCache[item.userId]) {
          userSettingsCache[item.userId] = await LeitnerService.getSettings(item.userId);
        }
        const settings = userSettingsCache[item.userId];

        if (settings && settings.autoEntry) {
          await LeitnerService.addPhraseToBox(item.userId, item.docId, 1);
        }
      } catch (e) {
        console.error("Failed to add phrase to Leitner system", e);
      }
    }
  }),

  // When a phrase bundle is deleted,
  // we need to update the freemium allocation
  new DatabaseTrigger("remove-one", async (context) => {
    const { query } = context;
    const user_id = query?.refId;
    const phrase_id = query?._id;

    if (user_id) {
      const isFreemium = await isUserOnFreemium(user_id);
      if (isFreemium) {
        await updateFreemiumAllocation({
          userId: user_id,
          increment: { allowed_save_words_used: -1 },
        });
      }

      if (phrase_id) {
        try {
          await LeitnerService.removePhraseFromBox(user_id, phrase_id.toString());
        } catch (e) {
          console.error("Failed to remove phrase from Leitner box", e);
        }
      }
    }
  }),

  new DatabaseTrigger("find-one-and-delete", async (context) => {
    const { query } = context;
    const user_id = query?.refId;
    const phrase_id = query?._id;

    if (user_id && phrase_id) {
      try {
        await LeitnerService.removePhraseFromBox(user_id, phrase_id.toString());
      } catch (e) {
        console.error("Failed to remove phrase from Leitner box (find-one-and-delete)", e);
      }
    }
  }),
];
