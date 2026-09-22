/**
 * Go/no-go spike: does SubTurtle's database layer work on Firestore with MongoDB
 * compatibility?
 *
 * Runs Mongoose 8 through modular-rest in single-database mode — the code path the API
 * uses at boot — against the real database, and exercises every database feature the
 * app relies on (inventoried from server/src): connection and shared-connection mode,
 * collection and index creation (unique, compound unique, TTL), the query / update /
 * aggregation operators and options the app and its clients send, duplicate-key errors,
 * populate, cursor paging, a large Leitner-sized document, and the scheduler's atomic
 * claim (the real ScheduleService code).
 *
 * Usage — keep the connection string out of the command line and shell history:
 *   MONGO_BASE_ADDRESS="$(gcloud secrets versions access latest --secret=mongo-base-address --project=subturtle-dev)" \
 *     yarn spike:firestore [--keep]
 *
 * Also runs against plain MongoDB (e.g. mongodb://localhost:27017/spike) to check the
 * script itself. Data goes only to spike_* collections, plus spike-* jobs in the
 * scheduler's collection; everything is removed afterwards unless --keep.
 * Exit code 0 = GO, 1 = NO-GO (a gating check failed).
 */
import { defineCollection, getCollection, modelRegistry, Schema } from "@modular-rest/server";
// Not exported from the package root: the call createRest() makes for every db.ts at boot.
import { addCollectionDefinitionByList } from "@modular-rest/server/dist/services/data_provider/service";
import mongoose, { Model, Types } from "mongoose";
import { ScheduleService } from "../src/modules/schedule/service";
import { DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION } from "../src/config";

const KEEP = process.argv.includes("--keep");
const uri = process.env.MONGO_BASE_ADDRESS;

// ---------------------------------------------------------------------------- harness

type Result = { name: string; ok: boolean; gating: boolean; ms: number; detail?: string };
const results: Result[] = [];

async function check(name: string, fn: () => Promise<string | void>, { gating = true } = {}) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, gating, ms: Date.now() - started, detail: detail || undefined });
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error: any) {
    results.push({ name, ok: false, gating, ms: Date.now() - started, detail: error?.message || String(error) });
    console.log(`  ${gating ? "FAIL" : "WARN"}  ${name} — ${error?.codeName || error?.code || ""} ${error?.message || error}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, what: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

async function expectDuplicateKey(write: () => Promise<unknown>, what: string) {
  try {
    await write();
  } catch (error: any) {
    // ScheduleService.isDuplicateKeyError relies on exactly this code.
    assert(error.code === 11000 || error.code === 11001, `${what}: expected code 11000, got ${error.code} (${error.message})`);
    return;
  }
  throw new Error(`${what}: the duplicate write was accepted`);
}

// ---------------------------------------------------------------- spike collections
// Shapes mirror the app's schemas for the features under test (see server/src/modules).

const phraseSchema = new Schema(
  { refId: String, phrase: String, translation: String, type: { type: String, default: "normal" }, context: String },
  { timestamps: true }
);

const bundleSchema = new Schema(
  {
    refId: { type: String, required: true },
    title: { type: String, required: true },
    phrases: [{ type: Schema.Types.ObjectId, ref: "spike_phrase" }],
  },
  { timestamps: true }
);
bundleSchema.index({ refId: 1, title: 1 }, { unique: true });

const leitnerSchema = new Schema(
  {
    userId: { type: String, required: true },
    settings: { type: Schema.Types.Mixed, required: true },
    items: [
      {
        phraseId: { type: String, ref: "spike_phrase" },
        boxLevel: { type: Number, required: true },
        nextReviewDate: { type: Date, required: true },
        lastAttemptDate: { type: Date, required: true },
        consecutiveIncorrect: { type: Number, default: 0 },
      },
    ],
  },
  { timestamps: true }
);

const subscriptionSchema = new Schema(
  {
    user_id: { type: Types.ObjectId, required: true },
    status: String,
    end_date: Date,
    credit: { type: Number, default: 0 },
    used_credit: Number,
    payment_meta_data: { type: Object },
    top_ups: [{ session_id: String, amount: Number }],
  },
  { timestamps: true }
);

const paymentSessionSchema = new Schema(
  { user_id: String, status: String, provider_data: { type: Object } },
  { timestamps: true }
);

const sessionSchema = new Schema({ refId: String, dialogs: { type: [Object], default: [] } }, { timestamps: true });
sessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 6 * 30 * 24 * 60 * 60 });

const spike = (database: string, collection: string, schema: Schema<any>) =>
  defineCollection({ database, collection, schema, permissions: [] });

// Two logical databases, as in the app, collapsing onto the one physical database.
const definitions = [
  spike("user_content", "spike_phrase", phraseSchema),
  spike("user_content", "spike_bundle", bundleSchema),
  spike("user_content", "spike_leitner", leitnerSchema),
  spike("user_content", "spike_subscription", subscriptionSchema),
  spike("user_content", "spike_payment_session", paymentSessionSchema),
  spike("user_content", "spike_session", sessionSchema),
  // The real scheduler collection: the scheduler check runs the real ScheduleService.
  spike(DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION, require("../src/modules/schedule/db")[0].schema),
];

const model = (collection: string, database = "user_content") => getCollection<any>(database, collection) as Model<any>;

// ------------------------------------------------------------------------------- main

async function main() {
  assert(uri, "Set MONGO_BASE_ADDRESS to the connection string (database ID in its path)");
  const target = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/]+)\/([^?]+)/.exec(uri);
  assert(target, "MONGO_BASE_ADDRESS must name the database in its path: mongodb://host:port/<database>?...");
  const [, host, databaseName] = target;
  console.log(`Target: ${host} / database "${decodeURIComponent(databaseName)}"`);
  console.log(`mongoose ${mongoose.version}, mongodb driver ${require("mongodb/package.json").version}\n`);

  if (/firestore\.goog/.test(host)) {
    for (const param of ["loadBalanced=true", "tls=true", "retryWrites=false"]) {
      if (!uri.includes(param)) console.log(`  note: Firestore expects ${param} in the connection string`);
    }
  }

  const mongoOption = { mongoBaseAddress: uri, dbPrefix: "", singleDatabase: true };

  console.log("Connection and modular-rest");

  await check("connect through modular-rest's single-database mode", async () => {
    const started = Date.now();
    await addCollectionDefinitionByList({ list: definitions, mongoOption });
    return `${Date.now() - started} ms`;
  });

  const connection = modelRegistry.getConnection("user_content");
  if (!connection || connection.readyState !== 1) {
    return finish();
  }

  await check("every logical database shares one connection on the URI's database", async () => {
    assert(modelRegistry.getConnection(DATABASE_SCHEDULE) === connection, "cms and user_content use different connections");
    assertEqual(connection.db!.databaseName, decodeURIComponent(databaseName), "physical database");
  });

  await check("hello handshake", async () => {
    const hello = await connection.db!.command({ hello: 1 });
    return `maxWireVersion ${hello.maxWireVersion}, loadBalanced ${!!hello.serviceId}`;
  }, { gating: false });

  console.log("\nCollections and indexes (Mongoose autoCreate + autoIndex)");

  await check("createCollection + createIndexes for every model", async () => {
    for (const definition of definitions) await definition.model.init();
  });

  await check("index definitions as listed by the server", async () => {
    const bundleIndexes = await model("spike_bundle").listIndexes();
    const compound = bundleIndexes.find((i: any) => i.key?.refId === 1 && i.key?.title === 1);
    assert(compound?.unique, `compound unique index missing: ${JSON.stringify(bundleIndexes)}`);
    const sessionIndexes = await model("spike_session").listIndexes();
    const ttl = sessionIndexes.find((i: any) => i.key?.createdAt === 1);
    assert(ttl?.expireAfterSeconds, `TTL index missing: ${JSON.stringify(sessionIndexes)}`);
    return `bundle: ${bundleIndexes.map((i: any) => i.name).join(", ")}; session TTL ${ttl.expireAfterSeconds}s`;
  }, { gating: false });

  console.log("\nWrites, reads and operators");

  const userId = new Types.ObjectId();
  const refId = userId.toString();
  let phraseIds: Types.ObjectId[] = [];
  let bundleId: Types.ObjectId | undefined;

  await check("insertMany + create (ObjectId _id, timestamps)", async () => {
    const phrases = await model("spike_phrase").insertMany([
      { refId, phrase: "hit the sack", translation: "go to bed", context: "I'm exhausted, I'll hit the sack." },
      { refId, phrase: "Break a leg", translation: "good luck" },
      { refId, phrase: "piece of cake", translation: "easy" },
    ]);
    phraseIds = phrases.map((p: any) => p._id);
    const bundle = await model("spike_bundle").create({ refId, title: "Idioms", phrases: phraseIds.slice(0, 2) });
    bundleId = bundle._id;
    assert(bundle.createdAt instanceof Date, "timestamps not set");
  });

  await check("unique compound index rejects a duplicate with code 11000", () =>
    expectDuplicateKey(() => model("spike_bundle").create({ refId, title: "Idioms" }), "duplicate {refId, title}")
  );

  await check("$regex with $options 'i' (bundle and phrase search in the dashboard)", async () => {
    const found = await model("spike_phrase").find({ refId, phrase: { $regex: "SACK", $options: "i" } }).lean();
    assertEqual(found.map((p: any) => p.phrase), ["hit the sack"], "matches");
  });

  await check("$in, $nin, $ne, $or, $gte, $lt on scalars", async () => {
    const m = model("spike_phrase");
    assertEqual(await m.countDocuments({ _id: { $in: phraseIds.slice(0, 2) } }), 2, "$in");
    assertEqual(await m.countDocuments({ refId, _id: { $nin: phraseIds.slice(0, 2) } }), 1, "$nin");
    assertEqual(await m.countDocuments({ refId, phrase: { $ne: "piece of cake" } }), 2, "$ne");
    assertEqual(await m.countDocuments({ refId, $or: [{ phrase: "Break a leg" }, { phrase: "piece of cake" }] }), 2, "$or");
    const hourAgo = new Date(Date.now() - 3600_000);
    assertEqual(await m.countDocuments({ refId, createdAt: { $gte: hourAgo, $lt: new Date(Date.now() + 60_000) } }), 3, "$gte/$lt");
  });

  await check("array membership: { phrases: { $in: [id] } } and { phrases: { $ne: id } }", async () => {
    const m = model("spike_bundle");
    assertEqual(await m.countDocuments({ refId, phrases: { $in: [phraseIds[0]] } }), 1, "$in on array");
    assertEqual(await m.countDocuments({ refId, phrases: { $ne: phraseIds[2] } }), 1, "$ne on array");
  });

  await check("projection, select, sort, skip, limit, lean", async () => {
    const m = model("spike_phrase");
    const page = await m.find({ refId }, { phrase: 1 }).sort({ phrase: 1 }).skip(1).limit(1).lean();
    assertEqual(page.map((p: any) => p.phrase), ["hit the sack"], "sorted page");
    assert(page[0].translation === undefined, "projection returned an excluded field");
    const selected: any = await m.findOne({ _id: phraseIds[0] }).select("phrase _id").lean();
    assertEqual(Object.keys(selected).sort(), ["_id", "phrase"], "select");
  });

  await check("$push with $each, and $pull of an ObjectId", async () => {
    const m = model("spike_bundle");
    await m.updateOne({ _id: bundleId }, { $push: { phrases: { $each: [phraseIds[2]] } } });
    await m.updateOne({ _id: bundleId }, { $pull: { phrases: phraseIds[0] } });
    const bundle: any = await m.findById(bundleId).lean();
    assertEqual(bundle.phrases.map(String), [phraseIds[1], phraseIds[2]].map(String), "phrases");
  });

  await check("conditional $push guarded by $ne (add a phrase only once)", async () => {
    const m = model("spike_bundle");
    const first = await m.updateOne({ _id: bundleId, phrases: { $ne: phraseIds[0] } }, { $push: { phrases: phraseIds[0] } });
    const second = await m.updateOne({ _id: bundleId, phrases: { $ne: phraseIds[0] } }, { $push: { phrases: phraseIds[0] } });
    assertEqual([first.modifiedCount, second.modifiedCount], [1, 0], "modifiedCount");
  });

  await check("populate (bundle -> phrases)", async () => {
    const bundle: any = await model("spike_bundle").findById(bundleId).populate("phrases");
    assert(bundle.phrases.length === 3 && bundle.phrases.every((p: any) => typeof p.phrase === "string"), "phrases not populated");
  });

  const subscriptions = model("spike_subscription");
  await check("Mixed dotted paths, $inc (negative, missing field), $set null", async () => {
    const created = await subscriptions.create({
      user_id: userId,
      status: "active",
      end_date: new Date(Date.now() + 86400_000),
      payment_meta_data: { provider: "stripe", stripe: { subscription_id: "sub_1" } },
    });
    await subscriptions.updateOne(
      { user_id: userId, "payment_meta_data.provider": "stripe", "payment_meta_data.stripe.subscription_id": "sub_1" },
      { $set: { "payment_meta_data.stripe.label": "Reader", "payment_meta_data.stripe.canceled_at": null }, $inc: { credit: -150, used_credit: 5 } }
    );
    const sub: any = await subscriptions.findById(created._id).lean();
    const stripe = sub.payment_meta_data.stripe;
    assertEqual([stripe.label, stripe.canceled_at, sub.credit, sub.used_credit], ["Reader", null, -150, 5], "fields");
  });

  await check("$push + $inc in one update, guarded by $ne on a subdocument array path", async () => {
    // The shape of the app's idempotent top-up: an "active subscription" filter plus
    // "this checkout session was not applied yet".
    const filter = {
      user_id: userId,
      status: { $nin: ["canceled", "incomplete_expired"] },
      end_date: { $gte: new Date() },
      "top_ups.session_id": { $ne: "cs_1" },
    };
    const update = { $push: { top_ups: { session_id: "cs_1", amount: 500 } }, $inc: { credit: 500 } };
    const first = await subscriptions.updateOne(filter, update);
    const second = await subscriptions.updateOne(filter, update);
    assertEqual([first.matchedCount, second.matchedCount], [1, 0], "matchedCount (idempotent top-up)");
    const sub: any = await subscriptions.findOne({ user_id: userId }).lean();
    assertEqual([sub.top_ups.length, sub.credit], [1, 350], "top-up applied once");
  });

  await check("upsert whose filter path lies inside the $set object (payment_session)", async () => {
    const m = model("spike_payment_session");
    for (let i = 0; i < 2; i++) {
      await m.updateOne(
        { "provider_data.session_id": "cs_upsert" },
        { $set: { user_id: refId, status: "pending", provider_data: { session_id: "cs_upsert", mode: "subscription" } } },
        { upsert: true }
      );
    }
    assertEqual(await m.countDocuments({ "provider_data.session_id": "cs_upsert" }), 1, "documents after two upserts");
  });

  await check("updateMany with $in", async () => {
    const result = await subscriptions.updateMany({ user_id: userId, status: { $in: ["active", "trialing"] } }, { $set: { status: "canceled" } });
    assertEqual(result.modifiedCount, 1, "modifiedCount");
  });

  console.log("\nLeitner-sized document and cursors");

  const leitner = model("spike_leitner");
  await check("5,000-item Leitner document: insert, $set by array index, $push, $pull by subdocument match", async () => {
    const now = Date.now();
    const items = Array.from({ length: 5000 }, (_, i) => ({
      phraseId: new Types.ObjectId().toString(),
      boxLevel: (i % 5) + 1,
      nextReviewDate: new Date(now + i * 1000),
      lastAttemptDate: new Date(now),
    }));
    const doc = await leitner.create({ userId: refId, settings: { dailyLimit: 20, boxQuotas: [20, 10, 5, 5, 5] }, items });
    const bytes = JSON.stringify(doc.toObject()).length;
    await leitner.updateOne({ _id: doc._id }, { $set: { "items.4999.boxLevel": 9, "items.4999.consecutiveIncorrect": 1 } });
    await leitner.updateOne({ _id: doc._id }, { $push: { items: { phraseId: "extra", boxLevel: 1, nextReviewDate: new Date(), lastAttemptDate: new Date() } } });
    await leitner.updateOne({ userId: refId }, { $pull: { items: { phraseId: items[0].phraseId } } });
    const stored: any = await leitner.findById(doc._id).lean();
    assertEqual([stored.items.length, stored.items[4998].boxLevel, stored.settings.dailyLimit], [5000, 9, 20], "items/settings");
    return `~${Math.round(bytes / 1024)} KiB`;
  });

  await check("find across several batches (getMore)", async () => {
    await model("spike_phrase").insertMany(Array.from({ length: 250 }, (_, i) => ({ refId: "bulk", phrase: `p${i}` })));
    assertEqual((await model("spike_phrase").find({ refId: "bulk" }).lean()).length, 250, "documents read");
  });

  console.log("\nAggregation");

  await check("statistics pipeline: $match / $group by $dateToString / $sum / $sort", async () => {
    const pipeline = [
      { $match: { refId, createdAt: { $gte: new Date(Date.now() - 7 * 86400_000), $lt: new Date(Date.now() + 86400_000) } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ];
    const rows = await model("spike_phrase").aggregate(pipeline as any).exec();
    assertEqual(rows, [{ _id: new Date().toISOString().slice(0, 10), count: 3 }], "rows");
  });

  await check("$dateToString with a timezone (not used by the app today)", async () => {
    const [row] = await model("spike_phrase")
      .aggregate([{ $match: { _id: phraseIds[0] } }, { $project: { day: { $dateToString: { format: "%H:%M", date: new Date("2026-01-01T00:30:00Z"), timezone: "Asia/Tokyo" } } } }])
      .exec();
    assertEqual(row.day, "09:30", "Tokyo time");
  }, { gating: false });

  await check("findByIds pipeline: $match { $or: [{ _id }] }", async () => {
    const rows = await model("spike_phrase").aggregate([{ $match: { $or: phraseIds.map((_id) => ({ _id })) } }]).exec();
    assertEqual(rows.length, 3, "rows");
  });

  console.log("\nScheduler (real ScheduleService against the real collection)");

  const jobs = model(SCHEDULE_JOB_COLLECTION, DATABASE_SCHEDULE);
  const spikeJobs = { name: { $regex: "^spike-" } };
  await check("createJob upsert, duplicate-key handling and concurrent atomic claims", async () => {
    const runs = new Map<string, number>();
    ScheduleService.register("spike-fn", async (args: any) => {
      runs.set(args.id, (runs.get(args.id) || 0) + 1);
    });
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        ScheduleService.createJob(`spike-${i}`, "spike-fn", { cronExpression: "0 3 * * *", catchUp: true, args: { id: `spike-${i}` } })
      )
    );
    // Concurrent re-creates of one name must converge (duplicate key swallowed).
    await Promise.all(Array.from({ length: 3 }, () => ScheduleService.createJob("spike-0", "spike-fn", { cronExpression: "0 3 * * *", catchUp: true, args: { id: "spike-0" } })));
    assertEqual(await jobs.countDocuments(spikeJobs), 5, "job documents");
    await jobs.updateMany(spikeJobs, { $set: { nextRunAt: new Date(Date.now() - 60_000) } });

    const summaries = await Promise.all([1, 2, 3].map(() => ScheduleService.runDueJobs({ budgetMs: 60_000 })));
    assertEqual(summaries.reduce((sum, s) => sum + s.succeeded, 0), 5, "jobs run");
    assert([...runs.values()].every((count) => count === 1) && runs.size === 5, `a job ran twice: ${JSON.stringify([...runs])}`);
    const after: any[] = await jobs.find(spikeJobs).lean();
    assert(after.every((j) => j.state === "scheduled" && j.nextRunAt > new Date() && j.claimedAt === undefined), "jobs not released and rescheduled");
  });

  await check("null and missing-field semantics the scheduler relies on", async () => {
    await jobs.create({ name: "spike-null", functionId: "spike-fn", jobType: "once", state: "executed", nextRunAt: null });
    assertEqual(await jobs.countDocuments({ name: "spike-null", nextRunAt: { $lte: new Date() } }), 0, "null matched $lte");
    assertEqual(await jobs.countDocuments({ name: "spike-null", claimedAt: null }), 1, "missing field matched null");
  });

  console.log("\nDeletes and latency");

  await check("deleteOne / deleteMany report deletedCount", async () => {
    const one = await model("spike_phrase").deleteOne({ _id: phraseIds[1] });
    const many = await model("spike_phrase").deleteMany({ refId: "bulk" });
    assertEqual([one.deletedCount, many.deletedCount], [1, 250], "deletedCount");
  });

  await check("findOne by _id latency (20 sequential round trips)", async () => {
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const started = Date.now();
      await model("spike_phrase").findById(phraseIds[0]).lean();
      times.push(Date.now() - started);
    }
    times.sort((a, b) => a - b);
    return `p50 ${times[9]} ms, p95 ${times[18]} ms`;
  }, { gating: false });

  if (!KEEP) {
    await check("cleanup", async () => {
      await jobs.deleteMany(spikeJobs);
      for (const definition of definitions) {
        const name = definition.model.collection.collectionName;
        if (name.startsWith("spike_")) await connection.db!.dropCollection(name);
      }
    }, { gating: false });
  }

  return finish();
}

async function finish() {
  await modelRegistry.clear().catch(() => undefined);
  const failed = results.filter((r) => !r.ok && r.gating);
  const warned = results.filter((r) => !r.ok && !r.gating);
  console.log(`\n${results.length} checks: ${results.length - failed.length - warned.length} passed, ${failed.length} failed, ${warned.length} informational warnings`);
  console.log(failed.length === 0 && results.length > 0 ? "GO" : "NO-GO");
  // exitCode rather than exit(): exit() can cut off piped output that is still flushing.
  process.exitCode = failed.length === 0 && results.length > 0 ? 0 : 1;
}

main().catch(async (error) => {
  console.error("Spike aborted:", error);
  await finish();
});
