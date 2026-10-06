import { DatabaseTrigger } from "@modular-rest/server";
import { LeitnerService } from "../leitner_box/service";
import { PoolService } from "../pool/service";

// The free-tier saved-words counter (`allowed_save_words_used`) is NOT kept here.
// These triggers are Mongoose post-hooks, so they also fire for the inserts and
// deletes `createPhrase` / `removePhrase` make themselves, and those RPCs already
// count each genuinely new phrase and each real deletion once (next to the cap
// check). Counting here as well made every save cost two of the free 200.
export const phraseBundleTriggers = [
  new DatabaseTrigger("insert-one", async (context) => {
    const { doc } = context;

    // When a new phrase is created, route it into the Pool for a first-encounter
    // (encode) step instead of straight into Leitner L1 (if autoEntry is enabled).
    // The Pool session, or the 7-day age-out, later promotes it to L1.
    if (doc && doc.phrase && doc.translation && doc.refId) {
      try {
        const settings = await LeitnerService.getSettings(doc.refId);
        if (settings && settings.autoEntry) {
          await PoolService.add(doc.refId, doc._id);
        }
      } catch (e) {
        console.error("Failed to add phrase to Pool", e);
      }
    }
  }),

  new DatabaseTrigger("insert-many", async (context) => {
    const { docs } = context;
    if (!docs || docs.length === 0) return;

    const leitnerAdditions: { userId: string; docId: string }[] = [];

    for (const doc of docs) {
      const user_id = doc.refId; // Owner ID
      if (user_id && doc.phrase && doc.translation) {
        leitnerAdditions.push({ userId: user_id, docId: doc._id });
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
          await PoolService.add(item.userId, item.docId);
        }
      } catch (e) {
        console.error("Failed to add phrase to Pool", e);
      }
    }
  }),

  new DatabaseTrigger("remove-one", async (context) => {
    const { query } = context;
    const user_id = query?.refId;
    const phrase_id = query?._id;

    if (user_id && phrase_id) {
      try {
        await LeitnerService.removePhraseFromBox(user_id, phrase_id.toString());
      } catch (e) {
        console.error("Failed to remove phrase from Leitner box", e);
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
