import { DatabaseTrigger } from "@modular-rest/server";
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
