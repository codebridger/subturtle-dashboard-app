import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";
import mongoose, { Connection, Model } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// The scheduler's guarantees (atomic claims, leases, upsert semantics) are database
// behaviour, so these tests run ScheduleService against a real in-memory MongoDB.
let mockJobModel: Model<any>;
jest.mock("@modular-rest/server", () => ({
  ...(jest.requireActual("@modular-rest/server") as object),
  getCollection: jest.fn(() => mockJobModel),
}));

import {
  ScheduleService,
  CLAIM_LEASE_MS,
  MISSED_RUN_GRACE_MS,
  computeNextRunAt,
  getScheduleDriver,
} from "../service";

const scheduleJobDefinition = require("../db")[0];

const MINUTE = 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms);
const fromNow = (ms: number) => new Date(Date.now() + ms);

let mongo: MongoMemoryServer;
let connection: Connection;

async function insertJob(fields: Record<string, unknown>) {
  const doc = await mockJobModel.create({
    functionId: "work",
    jobType: "recurrent",
    cronExpression: "0 3 * * *",
    catchUp: true,
    state: "scheduled",
    ...fields,
  });
  return doc._id;
}

const findJob = (name: string) => mockJobModel.findOne({ name }).lean() as Promise<any>;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  connection = await mongoose.createConnection(mongo.getUri()).asPromise();
  mockJobModel = connection.model("scheduled_job", scheduleJobDefinition.schema);
  await mockJobModel.init();
});

afterAll(async () => {
  ScheduleService.stop();
  await connection.close();
  await mongo.stop();
});

beforeEach(async () => {
  await mockJobModel.deleteMany({});
  (ScheduleService as any).registry = new Map();
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  ScheduleService.stop();
  jest.restoreAllMocks();
});

describe("computeNextRunAt", () => {
  it("applies the job's time zone to its cron expression", () => {
    // 09:00 in Tokyo is 00:00 UTC.
    const next = computeNextRunAt(
      { jobType: "recurrent", cronExpression: "0 9 * * *", timeZone: "Asia/Tokyo" },
      new Date("2026-01-01T00:30:00Z")
    );
    expect(next?.toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });

  it("uses runAt for once-jobs and null when nothing can run", () => {
    const runAt = new Date("2026-05-01T10:00:00Z");
    expect(computeNextRunAt({ jobType: "once", runAt }, new Date())).toEqual(runAt);
    expect(computeNextRunAt({ jobType: "recurrent", cronExpression: null }, new Date())).toBeNull();
  });
});

describe("createJob", () => {
  it("stores a new job due at its next occurrence", async () => {
    const before = new Date();
    await ScheduleService.createJob("daily", "work", { cronExpression: "0 3 * * *", catchUp: true });

    const job = await findJob("daily");
    expect(job.state).toBe("scheduled");
    expect(job.nextRunAt).toEqual(computeNextRunAt({ jobType: "recurrent", cronExpression: "0 3 * * *" }, before));
  });

  it("keeps a due nextRunAt when the job is re-created unchanged, as every boot does", async () => {
    // On a scale-to-zero host the boot that re-creates the job can be the very tick that
    // should run it; resetting nextRunAt to the next occurrence would skip that run.
    await ScheduleService.createJob("daily", "work", { cronExpression: "0 3 * * *", catchUp: true });
    const due = ago(MINUTE);
    await mockJobModel.updateOne({ name: "daily" }, { $set: { nextRunAt: due } });

    await ScheduleService.createJob("daily", "work", { cronExpression: "0 3 * * *", catchUp: true });
    expect((await findJob("daily")).nextRunAt).toEqual(due);

    const work = jest.fn(async () => undefined);
    ScheduleService.register("work", work);
    await ScheduleService.runDueJobs();
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("reschedules when the cron expression or time zone changes", async () => {
    await ScheduleService.createJob("review", "work", { cronExpression: "0 3 * * *" });
    await mockJobModel.updateOne({ name: "review" }, { $set: { nextRunAt: ago(MINUTE) } });

    await ScheduleService.createJob("review", "work", { cronExpression: "0 9 * * *", timeZone: "Asia/Tokyo" });

    const job = await findJob("review");
    expect(job.nextRunAt.getTime()).toBeGreaterThan(Date.now());
    expect(job.nextRunAt.getUTCHours()).toBe(0);
  });

  it("clears a time zone the caller no longer passes", async () => {
    await ScheduleService.createJob("review", "work", { cronExpression: "0 9 * * *", timeZone: "Asia/Tokyo" });
    await ScheduleService.createJob("review", "work", { cronExpression: "0 9 * * *" });

    expect((await findJob("review")).timeZone).toBeNull();
  });

  it("gives a job stored without nextRunAt one when re-created", async () => {
    await mockJobModel.collection.insertOne({ name: "legacy", functionId: "work", cronExpression: "0 3 * * *" });

    await ScheduleService.createJob("legacy", "work", { cronExpression: "0 3 * * *" });

    expect((await findJob("legacy")).nextRunAt).toBeInstanceOf(Date);
  });

  it("converges concurrent creates on one document without throwing", async () => {
    await Promise.all(
      Array.from({ length: 5 }, () => ScheduleService.createJob("race", "work", { cronExpression: "0 3 * * *" }))
    );

    expect(await mockJobModel.countDocuments({ name: "race" })).toBe(1);
  });

  it("rejects an invalid cron expression without storing anything", async () => {
    await expect(ScheduleService.createJob("broken", "work", { cronExpression: "not a cron" })).rejects.toThrow();
    expect(await mockJobModel.countDocuments({})).toBe(0);
  });
});

describe("runDueJobs", () => {
  it("runs a due job once and schedules its next occurrence", async () => {
    const due = ago(MINUTE);
    await insertJob({ name: "daily", nextRunAt: due, args: { userId: "u1" } });
    const work = jest.fn(async (_args: any) => undefined);
    ScheduleService.register("work", work);

    const summary = await ScheduleService.runDueJobs();

    expect(summary).toMatchObject({ claimed: 1, succeeded: 1, failed: 0, skipped: 0, unknownDue: 0 });
    expect(work).toHaveBeenCalledTimes(1);
    expect(work.mock.calls[0][0]).toMatchObject({ userId: "u1", expectedTime: due });
    const job = await findJob("daily");
    expect(job.state).toBe("scheduled");
    expect(job.lastRun).toBeInstanceOf(Date);
    expect(job.claimedAt).toBeUndefined();
    expect(job.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("leaves jobs that are not due", async () => {
    await insertJob({ name: "later", nextRunAt: fromNow(60 * MINUTE) });
    const work = jest.fn(async () => undefined);
    ScheduleService.register("work", work);

    expect((await ScheduleService.runDueJobs()).claimed).toBe(0);
    expect(work).not.toHaveBeenCalled();
  });

  it("runs every due job exactly once across concurrent drains", async () => {
    for (let i = 0; i < 10; i++) await insertJob({ name: `job-${i}`, nextRunAt: ago(MINUTE), args: { id: `job-${i}` } });
    const runs: Record<string, number> = {};
    ScheduleService.register("work", async (args: any) => {
      runs[args.id] = (runs[args.id] || 0) + 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
    });

    const summaries = await Promise.all([1, 2, 3].map(() => ScheduleService.runDueJobs()));

    expect(summaries.reduce((sum, s) => sum + s.succeeded, 0)).toBe(10);
    expect(Object.keys(runs)).toHaveLength(10);
    expect(Object.values(runs).every((count) => count === 1)).toBe(true);
  });

  it("marks a once-job executed and never runs it again", async () => {
    await insertJob({ name: "once", jobType: "once", runAt: ago(MINUTE), nextRunAt: ago(MINUTE), cronExpression: null });
    const work = jest.fn(async () => undefined);
    ScheduleService.register("work", work);

    await ScheduleService.runDueJobs();
    await ScheduleService.runDueJobs();

    expect(work).toHaveBeenCalledTimes(1);
    expect(await findJob("once")).toMatchObject({ state: "executed", nextRunAt: null });
  });

  it("records a failure and still schedules the next run", async () => {
    await insertJob({ name: "flaky", nextRunAt: ago(MINUTE) });
    ScheduleService.register("work", async () => {
      throw new Error("boom");
    });

    const summary = await ScheduleService.runDueJobs();

    expect(summary).toMatchObject({ claimed: 1, failed: 1 });
    const job = await findJob("flaky");
    expect(job.state).toBe("failed");
    expect(job.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("re-claims a job whose claim outlived the lease, but not a live claim", async () => {
    await insertJob({ name: "abandoned", nextRunAt: ago(60 * MINUTE), state: "executing", claimedAt: ago(CLAIM_LEASE_MS + MINUTE) });
    await insertJob({ name: "running", nextRunAt: ago(60 * MINUTE), state: "executing", claimedAt: ago(MINUTE) });
    const work = jest.fn(async (_args: any) => undefined);
    ScheduleService.register("work", work);

    const summary = await ScheduleService.runDueJobs();

    expect(summary.succeeded).toBe(1);
    expect((await findJob("abandoned")).state).toBe("scheduled");
    expect((await findJob("running")).state).toBe("executing");
  });

  it("recovers a job the old scheduler left queued without a claim", async () => {
    await insertJob({ name: "stuck", nextRunAt: ago(MINUTE), state: "queued" });
    const work = jest.fn(async () => undefined);
    ScheduleService.register("work", work);

    await ScheduleService.runDueJobs();

    expect(work).toHaveBeenCalledTimes(1);
  });

  it("leaves a job whose function this process does not have", async () => {
    await insertJob({ name: "newer", functionId: "added-in-next-release", nextRunAt: ago(MINUTE) });
    ScheduleService.register("work", async () => undefined);

    const summary = await ScheduleService.runDueJobs();

    expect(summary).toMatchObject({ claimed: 0, unknownDue: 1 });
    expect((await findJob("newer")).state).toBe("scheduled");
  });

  it("skips a badly overdue run when catch-up is off, and runs it when on", async () => {
    const overdue = ago(MISSED_RUN_GRACE_MS + 5 * MINUTE);
    await insertJob({ name: "no-catch-up", nextRunAt: overdue, catchUp: false, args: { name: "no-catch-up" } });
    await insertJob({ name: "catch-up", nextRunAt: overdue, catchUp: true, args: { name: "catch-up" } });
    const ran: string[] = [];
    ScheduleService.register("work", async (args: any) => {
      ran.push(args.name);
    });

    const summary = await ScheduleService.runDueJobs();

    expect(summary).toMatchObject({ succeeded: 1, skipped: 1 });
    expect(ran).toEqual(["catch-up"]);
    const skipped = await findJob("no-catch-up");
    expect(skipped.state).toBe("scheduled");
    expect(skipped.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("disables a job whose stored schedule cannot be parsed", async () => {
    await mockJobModel.collection.insertOne({
      name: "corrupt",
      functionId: "work",
      jobType: "recurrent",
      cronExpression: "not a cron",
      state: "scheduled",
      nextRunAt: ago(MINUTE),
    });
    const work = jest.fn(async () => undefined);
    ScheduleService.register("work", work);

    await ScheduleService.runDueJobs();

    expect(work).not.toHaveBeenCalled();
    expect(await findJob("corrupt")).toMatchObject({ state: "failed", nextRunAt: null });
  });

  it("stops claiming once its time budget is spent", async () => {
    await insertJob({ name: "due", nextRunAt: ago(MINUTE) });
    ScheduleService.register("work", async () => undefined);

    expect(await ScheduleService.runDueJobs({ budgetMs: 0 })).toMatchObject({ claimed: 0, budgetExhausted: true });
  });
});

describe("init", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it("backfills nextRunAt on jobs stored by the old scheduler", async () => {
    process.env.SCHEDULE_DRIVER = "http";
    process.env.SCHEDULE_TICK_AUDIENCE = "https://api.example";
    process.env.SCHEDULE_TICK_INVOKER = "scheduler@example.iam.gserviceaccount.com";
    const twoDaysAgo = ago(48 * 60 * MINUTE);
    await mockJobModel.collection.insertMany([
      { name: "missed-catch-up", functionId: "work", jobType: "recurrent", cronExpression: "0 3 * * *", catchUp: true, lastRun: twoDaysAgo, state: "scheduled" },
      { name: "no-catch-up", functionId: "work", jobType: "recurrent", cronExpression: "0 3 * * *", catchUp: false, lastRun: twoDaysAgo, state: "scheduled" },
      { name: "once-done", functionId: "work", jobType: "once", runAt: twoDaysAgo, state: "executed" },
      { name: "once-pending", functionId: "work", jobType: "once", runAt: fromNow(MINUTE), state: "scheduled" },
    ]);

    await ScheduleService.init();

    expect((await findJob("missed-catch-up")).nextRunAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect((await findJob("no-catch-up")).nextRunAt.getTime()).toBeGreaterThan(Date.now());
    expect((await findJob("once-done")).nextRunAt).toBeNull();
    expect((await findJob("once-pending")).nextRunAt).toBeInstanceOf(Date);
  });

  it("rejects the http driver without tick authentication settings", async () => {
    process.env.SCHEDULE_DRIVER = "http";
    delete process.env.SCHEDULE_TICK_AUDIENCE;
    delete process.env.SCHEDULE_TICK_INVOKER;

    await expect(ScheduleService.init()).rejects.toThrow(/SCHEDULE_TICK_AUDIENCE/);
  });

  it("drains in-process with the default interval driver", async () => {
    delete process.env.SCHEDULE_DRIVER;
    await insertJob({ name: "due", nextRunAt: ago(MINUTE) });
    const work = jest.fn(async () => undefined);
    ScheduleService.register("work", work);

    await ScheduleService.init();
    // The first drain starts immediately; wait for it to run the job and release it.
    for (let i = 0; i < 50 && !(await findJob("due")).lastRun; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(work).toHaveBeenCalledTimes(1);
  });

  it("rejects an unknown driver", () => {
    process.env.SCHEDULE_DRIVER = "cron";
    expect(() => getScheduleDriver()).toThrow(/SCHEDULE_DRIVER/);
  });
});
