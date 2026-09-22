import { defineFunction } from "@modular-rest/server";
import { PoolService } from "./service";

// Frontend API: the user's pooled phrases, oldest first, joined to phrase docs
// (each carries `confirmed_chunk` + `source_sentence` for the encode cloze).
const getPool = defineFunction({
  name: "get-pool",
  permissionTypes: ["user_access"],
  callback: async (context) => {
    const { userId } = context;
    if (!userId) throw new Error("Unauthorized");
    return PoolService.list(userId);
  },
});

// Frontend API: finish an encode session — promote the reviewed phrases into
// Leitner L1 (a real first encounter → `encountered: true`) and clear them from
// the Pool.
const completePoolSession = defineFunction({
  name: "complete-pool-session",
  permissionTypes: ["user_access"],
  callback: async (context) => {
    const { phraseIds, userId } = context;
    if (!userId) throw new Error("Unauthorized");
    if (!Array.isArray(phraseIds)) throw new Error("phraseIds must be an array");

    await PoolService.promote(userId, phraseIds as string[], { encountered: true });
    return { success: true };
  },
});

module.exports.functions = [getPool, completePoolSession];
