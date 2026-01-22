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

    // When a new phrase is created, add it to the Leitner system
    //
    // Ensure this is a phrase being inserted, not a bundle
    // We can check for specific phrase fields or just try-catch
    // But typically this trigger file is attached to phraseCollection too
    if (doc && doc.phrase && doc.translation && doc.refId) {
      try {
        await LeitnerService.addPhraseToBox(doc.refId, doc._id, 1);
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
    const isFreemium = await isUserOnFreemium(user_id);

    if (isFreemium) {
      await updateFreemiumAllocation({
        userId: user_id,
        increment: { allowed_save_words_used: -1 },
      });
    }
  }),


];
