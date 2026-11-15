import { defineFunction } from "@modular-rest/server";
import { getLanguageCapabilities } from "../../languages/registry";
import { LanguageService } from "./service";

/**
 * The language module's functions, as `docs/tech/multilingual-api.md` section 2 names them.
 * The level test (`start-level-test`, `answer-level-test`, `finish-level-test`) and the
 * starter pack (`get-starter-pack`, `complete-starter-pack-items`, `skip-starter-pack`) are
 * built in their own files on top of LanguageService (`getLanguageProfile`, `getState`,
 * `onLanguageAdded`).
 *
 * Every user function takes `userId`, which functionCallerGuard pins to the signed-in user.
 * Errors are `<code>: <details JSON>`, for example
 * `upgrade_needed: {"plan":"starter","maxLanguages":1}`.
 */

/**
 * The capability register (B-02): learning languages with their feature flags, and every
 * own language with whether a teacher checked the Coach's explanations in it. Public, so
 * the sign-in and first-run screens can show the pickers before a token exists.
 */
const getLanguageCapabilitiesFn = defineFunction({
  name: "get-language-capabilities",
  permissionTypes: ["anonymous_access"],
  callback: async () => getLanguageCapabilities(),
});

const getLanguageState = defineFunction({
  name: "get-language-state",
  permissionTypes: ["user_access"],
  callback: async ({ userId }: { userId: string }) => LanguageService.getState(userId),
});

const addLanguage = defineFunction({
  name: "add-language",
  permissionTypes: ["user_access"],
  callback: async ({ userId, ...args }: { userId: string; language: string; startLevel?: string; startLevelSource?: string; goals?: string[] }) =>
    LanguageService.addLanguage(userId, args),
});

const setActiveLanguage = defineFunction({
  name: "set-active-language",
  permissionTypes: ["user_access"],
  callback: async ({ userId, language }: { userId: string; language: string }) => LanguageService.setActiveLanguage(userId, language),
});

const removeLanguage = defineFunction({
  name: "remove-language",
  permissionTypes: ["user_access"],
  callback: async ({ userId, language }: { userId: string; language: string }) => LanguageService.removeLanguage(userId, language),
});

const pauseLanguages = defineFunction({
  name: "pause-languages",
  permissionTypes: ["user_access"],
  callback: async ({ userId, keep }: { userId: string; keep: string[] }) => LanguageService.pauseLanguages(userId, keep),
});

const updateLanguageSettings = defineFunction({
  name: "update-language-settings",
  permissionTypes: ["user_access"],
  callback: async ({ userId, ...args }: { userId: string; language: string; [key: string]: unknown }) =>
    LanguageService.updateLanguageSettings(userId, args),
});

const setTranslationLanguage = defineFunction({
  name: "set-translation-language",
  permissionTypes: ["user_access"],
  callback: async ({ userId, language }: { userId: string; language: string }) => LanguageService.setTranslationLanguage(userId, language),
});

const setLanguageInterest = defineFunction({
  name: "set-language-interest",
  permissionTypes: ["user_access"],
  callback: async ({ userId, language, on }: { userId: string; language: string; on: boolean }) =>
    LanguageService.setLanguageInterest(userId, language, on),
});

/** "Tell me" counts per language, for the team (B-06). Administrators only. */
const getLanguageInterestCounts = defineFunction({
  name: "get-language-interest-counts",
  permissionTypes: ["advanced_settings"],
  callback: async () => LanguageService.languageInterestCounts(),
});

const keepPhrasePending = defineFunction({
  name: "keep-phrase-pending",
  permissionTypes: ["user_access"],
  callback: async ({ userId, phrase, language }: { userId: string; phrase: any; language: string }) =>
    LanguageService.keepPhrasePending(userId, { phrase, language }),
});

module.exports.functions = [
  getLanguageCapabilitiesFn,
  getLanguageState,
  addLanguage,
  setActiveLanguage,
  removeLanguage,
  pauseLanguages,
  updateLanguageSettings,
  setTranslationLanguage,
  setLanguageInterest,
  getLanguageInterestCounts,
  keepPhrasePending,
];
