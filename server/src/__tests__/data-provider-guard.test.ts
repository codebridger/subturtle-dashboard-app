import { describe, it, expect, jest } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { Schema, Types } from "mongoose";
import { CollectionInfo, collectionPolicy, createDataProviderGuard } from "../data-provider-guard";

// An unsigned token is enough: the guard only decodes, the router verifies afterwards.
function token(claims: Record<string, unknown>) {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part(claims)}.signature`;
}

const U1 = "64b000000000000000000001";
const U2 = "64b000000000000000000002";
const USER = token({ id: U1, permissionGroup: { title: "end-user" } });
const ADMIN = token({ id: "a1", permissionGroup: { title: "administrator" } });
const ANONYMOUS = token({ id: "anon", permissionGroup: { title: "anonymous" }, type: "anonymous" });

const owned = (ownerIdField: string, write = true) => [
  { accessType: "user_access", read: true, write, onlyOwnData: true, ownerIdField },
];

// Stand-ins for the collections the modules define, covering each kind of rule.
const COLLECTIONS: Record<string, CollectionInfo> = {
  "user_content.profile": {
    permissions: owned("refId"),
    schema: new Schema({ refId: String, name: String, timeZone: String }),
  },
  "user_content.phrase": {
    permissions: owned("refId"),
    schema: new Schema({ refId: String, phrase: String }),
  },
  "user_content.phrase_bundle": {
    permissions: owned("refId"),
    schema: new Schema({
      refId: String,
      title: String,
      phrases: [{ type: Schema.Types.ObjectId, ref: "phrase" }],
      owner_profile: { type: Schema.Types.ObjectId, ref: "profile" },
      auth: { type: Schema.Types.ObjectId, ref: "auth" },
    }),
  },
  "user_content.subscription": {
    permissions: owned("user_id"),
    schema: new Schema({ user_id: { type: Schema.Types.ObjectId, ref: "user_content.users" }, credits: Number }),
  },
  // Writable by its permission, read-only by the guard's billing rule.
  "user_content.free_credit": {
    permissions: owned("user_id"),
    schema: new Schema({ user_id: String }),
  },
  "user_content.payment": {
    permissions: owned("user_id", false),
    schema: new Schema({ user_id: String, amount: Number }),
  },
  // Readable by every user, owned by no one.
  "user_content.catalog": {
    permissions: [{ accessType: "user_access", read: true, write: true }],
    schema: new Schema({ title: String }),
  },
  // user_access without onlyOwnData, but with an owner field in the schema.
  "user_content.notes": {
    permissions: [{ accessType: "user_access", read: true, write: true }],
    schema: new Schema({ userId: String, text: String }),
  },
  "cms.file": {
    permissions: [
      { accessType: "upload_file_access", read: true, write: true, onlyOwnData: false },
      { accessType: "remove_file_access", read: true, write: true, onlyOwnData: false },
    ],
    schema: new Schema({ owner: String, fileName: String }),
  },
  "cms.auth": {
    permissions: [{ accessType: "advanced_settings", read: true, write: true }],
    schema: new Schema({ email: String, password: String }),
  },
};

const guard = createDataProviderGuard((database, collection) => COLLECTIONS[`${database}.${collection}`]);

interface CallOptions {
  authorization?: string;
  path?: string;
  method?: string;
  // What the router would answer, for checking the guard's handling of the result.
  routerBody?: unknown;
}

async function call(op: string, body: any, options: CallOptions = {}) {
  const { path, method = "POST", routerBody } = options;
  // An explicit `authorization: undefined` means no token at all.
  const authorization = "authorization" in options ? options.authorization : USER;
  const ctx: any = {
    method,
    path: path ?? `/data-provider/${op}`,
    headers: { authorization },
    request: { body },
    status: 404,
    body: undefined,
  };
  const next = jest.fn(async () => {
    if (routerBody !== undefined) ctx.body = routerBody;
  });
  await guard(ctx, next);
  return { passed: next.mock.calls.length === 1, status: ctx.status, body: ctx.request.body, response: ctx.body };
}

const at = (collection: string, extra: Record<string, unknown> = {}, database = "user_content") => ({
  database,
  collection,
  ...extra,
});

describe("dataProviderGuard reads", () => {
  for (const op of ["find", "find-one", "count"]) {
    it(`${op}: pins the query to the caller`, async () => {
      const own = await call(op, at("phrase", { query: { refId: U1, phrase: "on the fence" } }));
      expect(own.passed).toBe(true);
      expect(own.body.query).toEqual({ refId: U1, phrase: "on the fence" });

      const other = await call(op, at("phrase", { query: { refId: U2 } }));
      expect(other.passed).toBe(true);
      expect(other.body.query).toEqual({ refId: U1 });

      const none = await call(op, at("phrase", { query: { _id: "p1" } }));
      expect(none.body.query).toEqual({ _id: "p1", refId: U1 });

      const missing = await call(op, at("phrase"));
      expect(missing.body.query).toEqual({ refId: U1 });
    });
  }

  it("keeps $or and $and inside the caller's documents", async () => {
    const { body } = await call("find", at("phrase", { query: { $or: [{ refId: U2 }, { refId: { $ne: U1 } }] } }));
    expect(body.query).toEqual({ $or: [{ refId: U2 }, { refId: { $ne: U1 } }], refId: U1 });
  });

  it("refuses a query that isn't an object", async () => {
    expect((await call("find", at("phrase", { query: ["refId"] }))).status).toBe(400);
    expect((await call("count", at("phrase", { query: "refId" }))).status).toBe(400);
  });

  it("uses each collection's owner field", async () => {
    expect((await call("find", at("payment", { query: { user_id: U2 } }))).body.query).toEqual({ user_id: U1 });
    expect((await call("find", at("file", { query: { owner: U2 } }, "cms"))).body.query).toEqual({ owner: U1 });
    expect((await call("find", at("notes", { query: {} }))).body.query).toEqual({ userId: U1 });
  });

  it("leaves shared collections unfiltered", async () => {
    const { passed, body } = await call("find", at("catalog", { query: { title: "x" } }));
    expect(passed).toBe(true);
    expect(body.query).toEqual({ title: "x" });
  });

  it("allows paging options and refuses query methods", async () => {
    const paged = await call("find", at("phrase", { query: {}, options: { sort: "-_id", limit: 10, skip: 20, select: "phrase" } }));
    expect(paged.passed).toBe(true);
    for (const options of [{ setQuery: {} }, { deleteMany: {} }, { populate: "phrases" }, { merge: {} }, { where: {} }]) {
      expect((await call("find", at("phrase", { query: {}, options }))).status).toBe(403);
      expect((await call("find-one", at("phrase", { query: {}, options }))).status).toBe(403);
    }
    expect((await call("find", at("phrase", { query: {}, options: "sort" }))).status).toBe(400);
  });

  it("ignores the options the client sends to count, which the router never reads", async () => {
    expect((await call("count", at("phrase_bundle", { query: {}, options: { sort: { _id: -1 } } }))).passed).toBe(true);
  });

  it("refuses types, which the router applies after the guard", async () => {
    const body = at("phrase", { query: {}, bodyKey: "query", types: { a: { path: "refId", type: "ObjectId" } } });
    expect((await call("find", body)).status).toBe(403);
  });
});

describe("dataProviderGuard populates", () => {
  it("pins populated documents to the caller", async () => {
    const { passed, body } = await call("find-one", at("phrase_bundle", { query: { _id: "b1" }, populates: ["phrases"] }));
    expect(passed).toBe(true);
    expect(body.populates).toEqual([{ path: "phrases", match: { refId: U1 } }]);
  });

  it("keeps a select and splits space-separated paths", async () => {
    const { body } = await call(
      "find",
      at("phrase_bundle", { query: {}, populates: [{ path: "phrases owner_profile", select: "phrase" }] })
    );
    expect(body.populates).toEqual([
      { path: "phrases", select: "phrase", match: { refId: U1 } },
      { path: "owner_profile", select: "phrase", match: { refId: U1 } },
    ]);
  });

  it("refuses paths that aren't references to a collection clients can read", async () => {
    for (const populates of [["title"], ["missing"], ["auth"], "phrases"]) {
      const { passed, status } = await call("find", at("phrase_bundle", { query: {}, populates }));
      expect(passed).toBe(false);
      expect([400, 403]).toContain(status);
    }
  });

  it("refuses populate options that could escape the owner match", async () => {
    for (const extra of [{ model: "auth" }, { match: {} }, { populate: "x" }, { options: {} }]) {
      const populates = [{ path: "phrases", ...extra }];
      expect((await call("find", at("phrase_bundle", { query: {}, populates }))).status).toBe(403);
    }
  });
});

describe("dataProviderGuard aggregate", () => {
  it("starts the pipeline with the caller's documents", async () => {
    const pipelines = [{ $group: { _id: "$type", n: { $sum: 1 } } }];
    const { passed, body } = await call("aggregate", at("phrase", { pipelines, accessQuery: {} }));
    expect(passed).toBe(true);
    expect(body.pipelines).toEqual([{ $match: { refId: U1 } }, ...pipelines]);
  });

  it("casts the caller's id where the owner field is an ObjectId", async () => {
    const { body } = await call("aggregate", at("subscription", { pipelines: [], accessQuery: {} }));
    const owner = body.pipelines[0].$match.user_id;
    expect(owner).toBeInstanceOf(Types.ObjectId);
    expect(String(owner)).toBe(U1);
  });

  it("refuses stages that read other collections or write", async () => {
    const stages = [
      { $lookup: { from: "profile", localField: "refId", foreignField: "refId", as: "p" } },
      { $unionWith: "profile" },
      { $graphLookup: { from: "phrase" } },
      { $out: "stolen" },
      { $merge: "stolen" },
      { $documents: [{}] },
      { $collStats: {} },
      { $facet: { a: [{ $lookup: { from: "profile", pipeline: [], as: "p" } }] } },
      { $facet: { a: [{ $unionWith: { coll: "profile" } }] } },
      { $addFields: { x: { $function: { body: "function(){}", args: [], lang: "js" } } } },
    ];
    for (const stage of stages) {
      expect((await call("aggregate", at("phrase", { pipelines: [stage], accessQuery: {} }))).status).toBe(403);
    }
  });

  it("refuses a pipeline that isn't a list of single-operator stages", async () => {
    expect((await call("aggregate", at("phrase", { pipelines: { $match: {} } }))).status).toBe(400);
    expect((await call("aggregate", at("phrase", { pipelines: [{ $match: {}, $limit: 1 }] }))).status).toBe(400);
  });
});

describe("dataProviderGuard findByIds", () => {
  it("drops other users' documents from the result", async () => {
    const routerBody = {
      data: [
        { _id: "p1", refId: U1 },
        { _id: "p2", refId: U2 },
        { _id: "p3" },
      ],
    };
    const { passed, response } = await call("findByIds", at("phrase", { ids: ["p1", "p2", "p3"], accessQuery: { refId: U1 } }), {
      routerBody,
    });
    expect(passed).toBe(true);
    expect(response).toEqual({ data: [{ _id: "p1", refId: U1 }] });
  });

  it("matches ObjectId owners by their string form", async () => {
    const routerBody = { data: [{ user_id: new Types.ObjectId(U1) }, { user_id: new Types.ObjectId(U2) }] };
    const { response } = await call("findByIds", at("subscription", { ids: ["s1", "s2"] }), { routerBody });
    expect(response.data).toHaveLength(1);
  });

  it("leaves error responses alone", async () => {
    const { response } = await call("findByIds", at("phrase", { ids: [] }), { routerBody: "boom" });
    expect(response).toBe("boom");
  });
});

describe("dataProviderGuard writes", () => {
  it("insert-one: forces the owner into the document", async () => {
    const own = await call("insert-one", at("phrase_bundle", { doc: { title: "t", refId: U1 } }));
    expect(own.passed).toBe(true);
    expect(own.body.doc).toEqual({ title: "t", refId: U1 });

    const other = await call("insert-one", at("phrase_bundle", { doc: { title: "t", refId: U2 } }));
    expect(other.body.doc).toEqual({ title: "t", refId: U1 });

    const none = await call("insert-one", at("phrase", { doc: { phrase: "p" } }));
    expect(none.body.doc).toEqual({ phrase: "p", refId: U1 });

    expect((await call("insert-one", at("phrase", { doc: [{ phrase: "p" }] }))).status).toBe(400);
  });

  it("update-one: pins the query and allows ordinary updates", async () => {
    const plain = await call("update-one", at("profile", { query: { refId: U2 }, update: { name: "Sara" } }));
    expect(plain.passed).toBe(true);
    expect(plain.body.query).toEqual({ refId: U1 });

    const push = await call("update-one", at("phrase_bundle", { query: { _id: "b1" }, update: { $push: { phrases: "p1" } } }));
    expect(push.passed).toBe(true);
    expect(push.body.query).toEqual({ _id: "b1", refId: U1 });
  });

  it("update-one: refuses changes to the owner field", async () => {
    const updates = [
      { refId: U2 },
      { $set: { refId: U2 } },
      { $set: { "refId.0": "x" } },
      { $unset: { refId: "" } },
      { $rename: { title: "refId" } },
      { $rename: { refId: "old" } },
      { $setOnInsert: { refId: U2 } },
    ];
    for (const update of updates) {
      expect((await call("update-one", at("phrase_bundle", { query: {}, update }))).status).toBe(403);
    }
  });

  it("update-one: refuses update pipelines, malformed operators and upserts", async () => {
    expect((await call("update-one", at("phrase", { query: {}, update: [{ $set: { phrase: "x" } }] }))).status).toBe(400);
    expect((await call("update-one", at("phrase", { query: {}, update: { $set: "x" } }))).status).toBe(400);
    expect((await call("update-one", at("phrase", { query: {}, update: {}, options: { upsert: true } }))).status).toBe(403);
    expect((await call("update-one", at("phrase", { query: {}, update: {}, options: { arrayFilters: [] } }))).passed).toBe(true);
  });

  it("remove-one: pins the query to the caller", async () => {
    const { passed, body } = await call("remove-one", at("phrase", { query: { _id: "p2", refId: U2 } }));
    expect(passed).toBe(true);
    expect(body.query).toEqual({ _id: "p2", refId: U1 });
  });

  it("refuses every write to collections clients may only read", async () => {
    const targets = [at("payment"), at("subscription"), at("free_credit"), at("catalog"), at("notes"), at("file", {}, "cms")];
    for (const target of targets) {
      expect((await call("insert-one", { ...target, doc: {} })).status).toBe(403);
      expect((await call("update-one", { ...target, query: {}, update: { $set: { amount: 0 } } })).status).toBe(403);
      expect((await call("remove-one", { ...target, query: {} })).status).toBe(403);
    }
  });
});

describe("dataProviderGuard server-owned fields", () => {
  const fields = ["translationLanguage", "learningLanguage", "learningLanguages", "pausedLanguages", "onboardingState", "knowledgeMapEnabled"];

  it("refuses them in profile inserts and updates", async () => {
    for (const field of fields) {
      expect((await call("insert-one", at("profile", { doc: { [field]: "x" } }))).status).toBe(403);
      expect((await call("update-one", at("profile", { query: {}, update: { [field]: "x" } }))).status).toBe(403);
      expect((await call("update-one", at("profile", { query: {}, update: { $set: { [`${field}.0`]: "x" } } }))).status).toBe(403);
      expect((await call("update-one", at("profile", { query: {}, update: { $unset: { [field]: "" } } }))).status).toBe(403);
    }
  });

  it("only applies to the profile", async () => {
    expect((await call("update-one", at("phrase", { query: {}, update: { learningLanguage: "fr" } }))).passed).toBe(true);
  });
});

describe("dataProviderGuard callers", () => {
  it("lets an administrator through untouched", async () => {
    const body = at("phrase", { query: { refId: U2 }, options: { setQuery: {} }, populates: [{ path: "x", model: "auth" }] });
    const before = JSON.stringify(body);
    const result = await call("find", body, { authorization: ADMIN });
    expect(result.passed).toBe(true);
    expect(JSON.stringify(result.body)).toBe(before);
    expect((await call("insert-one", at("payment", { doc: { user_id: U2 } }), { authorization: ADMIN })).passed).toBe(true);
    expect((await call("aggregate", at("phrase", { pipelines: [{ $out: "x" }] }), { authorization: ADMIN })).passed).toBe(true);
  });

  it("refuses requests without a usable token", async () => {
    for (const authorization of [undefined, "not-a-jwt", token({ email: "x@example.com" })]) {
      const result = await call("find", at("phrase", { query: { refId: U2 } }), { authorization });
      expect(result).toMatchObject({ passed: false, status: 401 });
    }
  });

  it("pins an anonymous caller to its own id, which owns nothing", async () => {
    const { body } = await call("find", at("phrase", { query: { refId: U2 } }), { authorization: ANONYMOUS });
    expect(body.query).toEqual({ refId: "anon" });
  });

  it("refuses a database or collection that isn't a string", async () => {
    expect((await call("find", { database: "user_content", collection: ["profile"], query: {} })).status).toBe(400);
    expect((await call("find", { database: ["user_content"], collection: "profile", query: {} })).status).toBe(400);
    expect((await call("find", ["profile"])).status).toBe(400);
  });

  it("leaves collections clients can't reach to the router, which refuses them", async () => {
    const auth = await call("find", at("auth", { query: { email: "x" } }, "cms"));
    expect(auth.passed).toBe(true);
    expect(auth.body.query).toEqual({ email: "x" });
    expect((await call("find", at("nothing", { query: {} }))).passed).toBe(true);
  });
});

describe("dataProviderGuard paths", () => {
  it("guards every path spelling the router accepts, and more", async () => {
    const spellings = [
      "/Data-Provider/Find",
      "/data-provider/FIND/",
      "//data-provider//find",
      "/data%2Dprovider/find",
      "/data-provider/fin%64",
    ];
    for (const path of spellings) {
      const { body } = await call("find", at("phrase", { query: { refId: U2 } }), { path });
      expect(body.query).toEqual({ refId: U1 });
    }
    const { response } = await call("x", at("phrase", { ids: [] }), {
      path: "/data-provider/FindByIds",
      routerBody: { data: [{ refId: U2 }] },
    });
    expect(response).toEqual({ data: [] });
  });

  it("guards the route whatever the method", async () => {
    expect((await call("find", at("phrase", { query: { refId: U2 } }), { method: "PUT" })).body.query).toEqual({ refId: U1 });
  });

  it("leaves other routes alone", async () => {
    for (const path of ["/function/run", "/data-provider", "/data-provider/unknown", "/user/login", "/data-provider-x/find"]) {
      const body = at("phrase", { query: { refId: U2 } });
      const result = await call("find", body, { path });
      expect(result.passed).toBe(true);
      expect(result.body.query).toEqual({ refId: U2 });
    }
  });
});

describe("collectionPolicy for the real collections", () => {
  // Loads every db.ts under modules/ (modular-rest loads nested ones too, e.g.
  // live_session/coach/db.ts) so a new collection can't skip the guard unnoticed.
  const modulesDir = path.join(__dirname, "..", "modules");
  const dbFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "__tests__" ? [] : dbFiles(full);
      return entry.name === "db.ts" ? [full] : [];
    });
  const definitions: any[] = dbFiles(modulesDir).flatMap((file) => require(file));

  const table = Object.fromEntries(
    definitions.map((definition) => [
      `${definition.database}.${definition.collection}`,
      collectionPolicy(definition.database, definition.collection, definition),
    ])
  );
  const policy = (ownerField: string, writable: boolean, ownerIsObjectId = false, serverOwnedFields: string[] = []) => ({
    ownerField,
    writable,
    ownerIsObjectId,
    serverOwnedFields,
  });

  it("treats each collection as documented in the B-34 PR", () => {
    expect(table).toEqual({
      "user_content.profile": policy("refId", true, false, [
        "translationLanguage",
        "learningLanguage",
        "learningLanguages",
        "pausedLanguages",
        "onboardingState",
        "knowledgeMapEnabled",
      ]),
      "user_content.phrase": policy("refId", true),
      "user_content.phrase_bundle": policy("refId", true),
      "user_content.live_session": policy("refId", true),
      "user_content.live_session_text": policy("refId", true),
      "user_content.save_assistant_session": policy("refId", true),
      "user_content.level_test": policy("userId", false), // clients read their own tests (B-31)
      "user_content.subscription": policy("user_id", false, true),
      "user_content.usage": policy("user_id", false, true),
      "user_content.free_credit": policy("user_id", false, true),
      "user_content.fluent_waitlist": policy("user_id", true, true),
      "user_content.payment": policy("user_id", false),
      "user_content.payment_session": policy("user_id", false, true),
      "user_content.stripe_customer": policy("user_id", false),
      // Written only by the language functions (ADR-006); clients read their own.
      "user_content.language_profile": policy("userId", false),
      "user_content.language_interest": policy("userId", false),
      // Their permission types belong to no client group: the router refuses clients.
      "user_content.leitner_system": null,
      "user_content.board_activity": null,
      "user_content.coach_explanation_flag": null, // server-only Coach flags (B-19)
      "user_content.pool": null,
      "cms.legacy_usage": null, // server-only counters of old field names (B-17)
      "cms.scheduled_job": null,
    });
  });

  it("covers modular-rest's own upload records", () => {
    const fileDefinition = require("@modular-rest/server/dist/services/file/db.js")[0];
    expect(collectionPolicy("cms", "file", fileDefinition)).toEqual(policy("owner", false));
  });
});
