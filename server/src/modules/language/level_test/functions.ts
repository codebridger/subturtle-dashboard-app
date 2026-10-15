/**
 * The AI level chat test (B-31), as `docs/tech/multilingual-api.md` section 2 names it.
 * Built on LanguageService (srv-core); its own folder so the language module's files stay
 * with srv-core. modular-rest loads every `functions.ts` under `modules/`.
 *
 * - `start-level-test { language }` → `{ testId, turn: { ai, help? }, index: 1, total: 6 }`
 * - `answer-level-test { testId, text }` → `{ turn?, index, total, done, result? }`
 * - `finish-level-test { testId, accept }` → `{ state, result, applied, language }`
 */
import { defineFunction } from "@modular-rest/server";
import { answerTest, finishTest, startTest } from "./service";

function requireUser(userId: unknown): string {
  if (typeof userId !== "string" || !userId) throw new Error("User ID is required");
  return userId;
}

const startLevelTest = defineFunction({
  name: "start-level-test",
  permissionTypes: ["user_access"],
  callback: async (args: { userId: string; language: string }) => startTest(requireUser(args?.userId), args),
});

const answerLevelTest = defineFunction({
  name: "answer-level-test",
  permissionTypes: ["user_access"],
  callback: async (args: { userId: string; testId: string; text: string }) => answerTest(requireUser(args?.userId), args),
});

const finishLevelTest = defineFunction({
  name: "finish-level-test",
  permissionTypes: ["user_access"],
  callback: async (args: { userId: string; testId: string; accept: boolean }) => finishTest(requireUser(args?.userId), args),
});

module.exports.functions = [startLevelTest, answerLevelTest, finishLevelTest];
