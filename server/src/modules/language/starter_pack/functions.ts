/**
 * The starter pack functions (B-21, B-22), as `docs/tech/multilingual-api.md` section 2
 * names them. Built on LanguageService (srv-core); its own folder so the language module's
 * files stay with srv-core. modular-rest loads every `functions.ts` under `modules/`.
 *
 * - `get-starter-pack { language }` → `{ items: [{ id, text, translation, audioUrl?, band,
 *   group, ... }], heard: string[], state, total, groups, version }`
 * - `complete-starter-pack-items { language, itemIds }` → `{ heard, total, done, added, deferred }`
 * - `skip-starter-pack { language }` → `{ state }`
 */
import { defineFunction } from "@modular-rest/server";
import { onLanguageAdded } from "../service";
import { completeItems, getPack, onAdded, skip } from "./service";

function requireUser(userId: unknown): string {
  if (typeof userId !== "string" || !userId) throw new Error("User ID is required");
  return userId;
}

// A new language with a pack gets its size (srv-core's extension point).
onLanguageAdded(onAdded);

const getStarterPackFn = defineFunction({
  name: "get-starter-pack",
  permissionTypes: ["user_access"],
  callback: async (args: { userId: string; language?: string }) => getPack(requireUser(args?.userId), args),
});

const completeStarterPackItemsFn = defineFunction({
  name: "complete-starter-pack-items",
  permissionTypes: ["user_access"],
  callback: async (args: { userId: string; language?: string; itemIds: string[] }) => completeItems(requireUser(args?.userId), args),
});

const skipStarterPackFn = defineFunction({
  name: "skip-starter-pack",
  permissionTypes: ["user_access"],
  callback: async (args: { userId: string; language?: string }) => skip(requireUser(args?.userId), args),
});

module.exports.functions = [getStarterPackFn, completeStarterPackItemsFn, skipStarterPackFn];
