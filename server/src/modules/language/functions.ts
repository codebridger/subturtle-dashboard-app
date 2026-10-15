import { defineFunction } from "@modular-rest/server";
import { getLanguageCapabilities } from "../../languages/registry";

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

module.exports.functions = [getLanguageCapabilitiesFn];
