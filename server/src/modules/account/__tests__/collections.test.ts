import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { Types } from "mongoose";
import * as config from "../../../config";

// Records which `database.collection` the account service deletes from.
const touched = new Set<string>();
jest.mock("@modular-rest/server", () => ({
  getCollection: (database: string, name: string) => {
    const key = `${database}.${name}`;
    return {
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      deleteMany: jest.fn(async () => {
        touched.add(key);
        return { deletedCount: 0 };
      }),
      deleteOne: jest.fn(async () => {
        touched.add(key);
        return { deletedCount: 0 };
      }),
    };
  },
  fileService: { removeFile: jest.fn() },
}));
jest.mock("../../gateway/adapters", () => ({
  PaymentProvider: { STRIPE: "stripe" },
  PaymentAdapterFactory: { getStripeAdapter: () => ({}) },
}));

import { deleteUserAccount } from "../service";

/**
 * Collections that hold nothing about a person, each with the reason. A collection that is
 * not deleted by `deleteUserAccount` must be listed here on purpose, so adding a collection
 * to a module forces the question "does it hold user data?" instead of silently leaking it
 * past an account deletion.
 */
const HOLDS_NO_USER_DATA: Record<string, string> = {
  "cms.legacy_usage": "daily counters per old request field name, no user id (work list B-17)",
};

const MODULES_DIR = join(__dirname, "..", "..");

function dbFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === "__tests__" ? [] : dbFiles(path);
    return entry === "db.ts" ? [path] : [];
  });
}

/** A `database:` / `collection:` value: a string literal or a constant exported by config.ts. */
function resolve(value: string): string {
  const literal = value.match(/^["'`](.+)["'`]$/);
  if (literal) return literal[1];
  const constant = (config as Record<string, unknown>)[value];
  if (typeof constant !== "string") throw new Error(`Cannot resolve "${value}" to a string; export it from config.ts or use a literal`);
  return constant;
}

/** Every `database.collection` the modules define with `defineCollection({ database, collection })`. */
function definedCollections(): { key: string; file: string }[] {
  const found: { key: string; file: string }[] = [];
  for (const file of dbFiles(MODULES_DIR)) {
    const source = readFileSync(file, "utf8");
    const pattern = /defineCollection\(\s*\{\s*database:\s*([^,\n]+?)\s*,\s*collection:\s*([^,\n]+?)\s*,/g;
    for (const match of source.matchAll(pattern)) {
      found.push({ key: `${resolve(match[1])}.${resolve(match[2])}`, file: file.slice(MODULES_DIR.length + 1) });
    }
    // A defineCollection call this scan cannot read would be skipped silently, so count them.
    const calls = (source.match(/defineCollection\(/g) || []).length;
    const read = (source.match(pattern) || []).length;
    if (calls !== read) throw new Error(`${file}: ${calls} defineCollection calls but only ${read} could be read; keep database and collection as the first two keys`);
  }
  return found;
}

describe("account deletion covers every collection", () => {
  beforeEach(() => touched.clear());

  it("finds the collections (guards against the scan going blind)", () => {
    const keys = definedCollections().map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(["user_content.phrase", "user_content.level_test", "cms.scheduled_job"]));
    expect(keys.length).toBeGreaterThanOrEqual(20);
  });

  it("deletes from, or explicitly excuses, each collection a module defines", async () => {
    await deleteUserAccount(new Types.ObjectId().toHexString());

    const uncovered = definedCollections().filter(({ key }) => !touched.has(key) && !(key in HOLDS_NO_USER_DATA));
    expect(uncovered).toEqual([]); // each entry: add it to deleteUserAccount, or to HOLDS_NO_USER_DATA with a reason
  });

  it("keeps the no-user-data list honest: no stale or contradicting entries", async () => {
    await deleteUserAccount(new Types.ObjectId().toHexString());
    const defined = new Set(definedCollections().map((c) => c.key));

    for (const key of Object.keys(HOLDS_NO_USER_DATA)) {
      expect(defined.has(key)).toBe(true); // collection was removed: drop the entry
    }
    // An excused collection the service does delete is a contradiction: pick one.
    for (const key of Object.keys(HOLDS_NO_USER_DATA)) {
      expect(touched.has(key)).toBe(false);
    }
  });

  it("deletes the per-user collections that had been missed (B-35)", async () => {
    await deleteUserAccount(new Types.ObjectId().toHexString());
    for (const key of ["user_content.level_test", "user_content.coach_explanation_flag", "user_content.save_assistant_session"]) {
      expect(touched.has(key)).toBe(true);
    }
  });
});
