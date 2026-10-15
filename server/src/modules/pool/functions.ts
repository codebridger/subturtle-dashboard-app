import { defineFunction } from "@modular-rest/server";
import { PoolService } from "./service";

// Frontend API: the user's pooled phrases of one language (`language`, else the active
// one), oldest first, joined to phrase docs (each carries `confirmed_chunk` +
// `source_sentence` for the encode cloze).
const getPool = defineFunction({
  name: "get-pool",
  permissionTypes: ["user_access"],
  callback: async (context) => {
    const { userId, language } = context;
    if (!userId) throw new Error("Unauthorized");
    return PoolService.list(userId, language);
  },
});

// Frontend API: finish an encode session — promote the reviewed phrases into
// Leitner L1 (a real first encounter → `encountered: true`) and clear them from
// the Pool. With no `language` each phrase goes by its own language.
const completePoolSession = defineFunction({
  name: "complete-pool-session",
  permissionTypes: ["user_access"],
  callback: async (context) => {
    const { phraseIds, userId, language } = context;
    if (!userId) throw new Error("Unauthorized");
    if (!Array.isArray(phraseIds)) throw new Error("phraseIds must be an array");

    await PoolService.promote(userId, phraseIds as string[], { encountered: true, language });
    return { success: true };
  },
});

module.exports.functions = [getPool, completePoolSession];
