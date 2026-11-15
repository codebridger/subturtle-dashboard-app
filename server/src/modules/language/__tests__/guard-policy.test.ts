/**
 * The data-provider guard's view of the language collections: clients read their own
 * language profiles and interests, and cannot write them (only the language functions do).
 */
import { describe, it, expect } from "@jest/globals";
import { collectionPolicy } from "../../../data-provider-guard";

const [languageProfile, languageInterest] = require("../db");

describe("language collections behind the data-provider guard", () => {
  for (const definition of [languageProfile, languageInterest]) {
    it(`${definition.collection}: owner-pinned reads, no client writes`, () => {
      const policy = collectionPolicy(definition.database, definition.collection, definition);
      expect(policy).toMatchObject({ ownerField: "userId", ownerIsObjectId: false, writable: false });
    });
  }
});
