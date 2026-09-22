import { getCollection } from "@modular-rest/server";
import { DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION } from "../../config";
import parser from "cron-parser";
import { getTickAuthConfig } from "./tick-auth";

/**
 * Database-driven job scheduler that survives scale-to-zero.
 *
 * Each job in `cms.scheduled_job` stores when it next runs (`nextRunAt`). Nothing waits
 * in memory: a driver periodically calls `runDueJobs()`, which claims due jobs one at a
 * time with an atomic findOneAndUpdate and runs them. The claim lives in the database,
 * so any number of processes — several Cloud Run instances, or an old and a new revision
 * during a rollout — can drain at once without running a job twice.
 *
 * Drivers (`SCHEDULE_DRIVER`):
 * - `interval` (default): drain in-process every `SCHEDULE_INTERVAL_SECONDS` (60).
 *   For local development and always-on hosts.
 * - `http`: an external scheduler calls `POST /schedule/tick` (see router.ts), e.g.
 *   Cloud Scheduler every 5 minutes. Needed where instances scale to zero, because an
 *   in-process timer does not run while no instance exists.
 */

type JobCallback = (args: any) => Promise<void>;
type JobOutcome = "succeeded" | "failed" | "skipped";

export type ScheduleDriver = "interval" | "http";

/** A claim older than this is treated as abandoned (its instance died mid-run) and may be re-claimed. */
export const CLAIM_LEASE_MS = 15 * 60 * 1000;
/** A recurrent job without `catchUp` that is overdue by more than this is skipped, not run late. */
export const MISSED_RUN_GRACE_MS = 30 * 60 * 1000;
/** One drain stops claiming new jobs after this long; the rest wait for the next tick. */
export const DEFAULT_DRAIN_BUDGET_MS = 4 * 60 * 1000;

export interface DrainSummary {
  claimed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  /** Due jobs whose function is not registered in this process, left for one that has it. */
  unknownDue: number;
  budgetExhausted: boolean;
}

interface JobSchedule {
  jobType?: "recurrent" | "once";
  cronExpression?: string | null;
  runAt?: Date | string | null;
  timeZone?: string | null;
}

export function getScheduleDriver(): ScheduleDriver {
  const driver = process.env.SCHEDULE_DRIVER || "interval";
  if (driver !== "interval" && driver !== "http") {
    throw new Error(`SCHEDULE_DRIVER must be "interval" or "http", got "${driver}"`);
  }
  return driver;
}

function cronAt(job: JobSchedule, currentDate: Date) {
  return parser.parseExpression(job.cronExpression as string, {
    currentDate,
    ...(job.timeZone ? { tz: job.timeZone } : {}),
  });
}

/** The next time `job` runs after `after`, or null when it never runs again. */
export function computeNextRunAt(job: JobSchedule, after: Date): Date | null {
  if (job.jobType === "once") return job.runAt ? new Date(job.runAt) : null;
  if (!job.cronExpression) return null;
  return cronAt(job, after).next().toDate();
}

function scheduleChanged(previous: JobSchedule, next: JobSchedule): boolean {
  const time = (value: Date | string | null | undefined) => (value ? new Date(value).getTime() : null);
  return (
    (previous.jobType ?? "recurrent") !== next.jobType ||
    (previous.cronExpression ?? null) !== next.cronExpression ||
    (previous.timeZone ?? null) !== next.timeZone ||
    time(previous.runAt) !== time(next.runAt)
  );
}

export class ScheduleService {
  private static registry = new Map<string, JobCallback>();
  private static intervalTimer: NodeJS.Timeout | null = null;
  private static intervalDraining = false;

  static register(id: string, callback: JobCallback) {
    console.log(`[ScheduleService] Registering function: ${id}`);
    this.registry.set(id, callback);
  }

  /**
   * Boot-time setup: give jobs stored by the old timer-based scheduler a `nextRunAt`,
   * then start the in-process driver when SCHEDULE_DRIVER=interval. Rejects on invalid
   * driver configuration, so a misconfigured deploy fails at startup.
   */
  static async init() {
    const driver = getScheduleDriver();
    if (driver === "http") getTickAuthConfig();

    try {
      await this.backfillNextRunAt(new Date());
    } catch (error) {
      console.error("[ScheduleService] nextRunAt backfill failed", error);
    }

    if (driver === "interval") this.startIntervalDriver();
  }

  static async createJob(
    name: string,
    functionId: string,
    options: {
      cronExpression?: string;
      runAt?: Date;
      args?: any;
      executionType?: "Immediate" | "normal";
      jobType?: "recurrent" | "once";
      catchUp?: boolean;
      timeZone?: string;
    }
  ) {
    const {
      cronExpression,
      runAt,
      args = {},
      executionType = "normal",
      jobType = "recurrent",
      catchUp = false,
      timeZone
    } = options;

    const collection = await getCollection(DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION);

    // Explicit nulls: Mongoose 6+ drops undefined keys from $set, so clearing a field
    // (say, a time zone the user removed) has to be written as null.
    const schedule = {
      jobType,
      cronExpression: cronExpression ?? null,
      runAt: runAt ?? null,
      timeZone: timeZone ?? null,
    };
    // Computed before writing, so an invalid cron expression or time zone is never stored.
    const nextRunAt = computeNextRunAt(schedule, new Date());

    const jobData = {
      name,
      functionId,
      args,
      executionType,
      catchUp,
      ...schedule,
      state: "scheduled" as const,
    };

    // Idempotent upsert keyed on the unique `name` index: concurrent callers (e.g. the
    // Leitner review-job sync fanning out) converge on one document. The definition is
    // refreshed on every call, but `nextRunAt` only changes when the schedule does.
    // Callers re-create their jobs at every boot, and on a scale-to-zero host that boot
    // can be the very tick that should run the job; recomputing `nextRunAt` here would
    // push the due run into the future, and a daily job would never fire.
    try {
      const previous = (await collection
        .findOneAndUpdate(
          { name },
          {
            $set: { functionId, args, executionType, catchUp, ...schedule },
            $setOnInsert: { state: "scheduled", nextRunAt },
          },
          { upsert: true, returnDocument: "before" }
        )
        .lean()) as any;

      if (previous && (previous.nextRunAt === undefined || scheduleChanged(previous, schedule))) {
        await collection.updateOne({ name }, { $set: { nextRunAt } });
      }
    } catch (error) {
      // A duplicate-key error means another caller created the same job first — the
      // desired end state — so it is swallowed instead of crashing the request.
      if (!this.isDuplicateKeyError(error)) throw error;
      console.warn(`[ScheduleService] Job ${name} already exists (concurrent create); skipping duplicate insert.`);
    }

    return jobData;
  }

  // MongoDB raises code 11000 (legacy 11001) on a unique-index violation. Mongoose
  // surfaces it unchanged on both create and upsert, so this is the single place we
  // decide "this collision is benign" vs. "this is a real error worth rethrowing".
  private static isDuplicateKeyError(error: any): boolean {
    return !!error && (error.code === 11000 || error.code === 11001 || error.codeName === "DuplicateKey");
  }

  static async deleteJob(name: string) {
    const collection = await getCollection(DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION);
    await collection.deleteOne({ name });
  }

  /**
   * Claim and run due jobs one at a time until none is due or `budgetMs` has passed.
   * Safe to call from any number of processes concurrently: each claim is atomic.
   */
  static async runDueJobs({ budgetMs = DEFAULT_DRAIN_BUDGET_MS }: { budgetMs?: number } = {}): Promise<DrainSummary> {
    const collection = await getCollection(DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION);
    const functionIds = [...this.registry.keys()];
    const startedAt = Date.now();
    const summary: DrainSummary = {
      claimed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      unknownDue: 0,
      budgetExhausted: false,
    };

    let lostClaims = 0;
    while (true) {
      if (Date.now() - startedAt >= budgetMs) {
        summary.budgetExhausted = true;
        break;
      }

      const now = new Date();
      const claimable = {
        nextRunAt: { $lte: now },
        // Only jobs this process can run: during a rollout an older revision must
        // leave job types it does not know to a newer one instead of failing them.
        functionId: { $in: functionIds },
        $or: [
          { state: { $nin: ["queued", "executing"] } },
          // The claimant died mid-run, or the job was left running by the old scheduler.
          { claimedAt: { $lt: new Date(now.getTime() - CLAIM_LEASE_MS) } },
          { claimedAt: null },
        ],
      };

      // Two steps rather than one findOneAndUpdate: on Firestore with MongoDB
      // compatibility, concurrent findOneAndUpdate calls can all get the same document
      // back, while a conditional updateOne is applied by exactly one of them. Repeating
      // the claimable condition (and the occurrence) in the update makes modifiedCount the
      // verdict on who owns the job.
      const candidate = (await collection.findOne(claimable).sort({ nextRunAt: 1 }).lean()) as any;
      if (!candidate) break;

      const claim = await collection.updateOne(
        { ...claimable, _id: candidate._id, nextRunAt: candidate.nextRunAt },
        { $set: { state: "executing", claimedAt: now } }
      );
      if (claim.modifiedCount !== 1) {
        // Another process claimed it first; move on to the next due job.
        if (++lostClaims > 50) break;
        continue;
      }

      summary.claimed++;
      summary[await this.executeJob({ ...candidate, state: "executing", claimedAt: now }, now)]++;
    }

    summary.unknownDue = await collection.countDocuments({
      nextRunAt: { $lte: new Date() },
      functionId: { $nin: functionIds },
    });
    if (summary.unknownDue) {
      console.warn(`[ScheduleService] ${summary.unknownDue} due job(s) have no registered function in this process.`);
    }

    return summary;
  }

  private static async executeJob(job: any, claimedAt: Date): Promise<JobOutcome> {
    const collection = await getCollection(DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION);
    const expectedTime = new Date(job.nextRunAt);

    // Release only our own claim: if our lease expired and another process re-claimed
    // the job, its state is no longer ours to write.
    const release = (fields: Record<string, unknown>) =>
      collection.updateOne({ _id: job._id, claimedAt }, { $set: fields, $unset: { claimedAt: 1 } });

    let nextRunAt: Date | null;
    try {
      nextRunAt = computeNextRunAt(job, claimedAt);
      // A once-job has run (or failed) for good after this attempt.
      if (job.jobType === "once") nextRunAt = null;
    } catch (error) {
      // An unparsable schedule can never run again; park the job rather than re-claim it every lease.
      console.error(`[ScheduleService] Job ${job.name} has an invalid schedule; disabling it.`, error);
      await release({ state: "failed", nextRunAt: null });
      return "failed";
    }

    // Like a timer that fired while the process was down: a job that did not opt into
    // catch-up is skipped when badly overdue (e.g. after an outage) instead of running late.
    if (
      job.jobType !== "once" &&
      !job.catchUp &&
      claimedAt.getTime() - expectedTime.getTime() > MISSED_RUN_GRACE_MS
    ) {
      console.log(`[ScheduleService] Skipping missed run of ${job.name} (due ${expectedTime.toISOString()}, catchUp off).`);
      await release({ state: "scheduled", nextRunAt });
      return "skipped";
    }

    console.log(`[ScheduleService] Executing: ${job.name} (${job.functionId})`);
    try {
      const callback = this.registry.get(job.functionId);
      if (!callback) throw new Error(`Function ${job.functionId} not registered`);

      await callback({ ...job.args, expectedTime, executedTime: claimedAt });
      await release({
        state: job.jobType === "once" ? "executed" : "scheduled",
        lastRun: new Date(),
        nextRunAt,
      });
      console.log(`[ScheduleService] Job ${job.name} completed.`);
      return "succeeded";
    } catch (error) {
      console.error(`[ScheduleService] Job ${job.name} failed:`, error);
      await release({ state: "failed", lastRun: new Date(), nextRunAt });
      return "failed";
    }
  }

  /**
   * Jobs stored by the previous timer-based scheduler have no `nextRunAt`. Derive it,
   * reproducing that scheduler's boot-time catch-up: a recurrent `catchUp` job whose
   * last run predates its latest occurrence becomes due at once.
   */
  private static async backfillNextRunAt(now: Date) {
    const collection = await getCollection(DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION);
    const legacyJobs = (await collection.find({ nextRunAt: { $exists: false } }).lean()) as any[];

    for (const job of legacyJobs) {
      try {
        let nextRunAt: Date | null;
        if (job.jobType === "once") {
          nextRunAt = job.state === "scheduled" && job.runAt ? new Date(job.runAt) : null;
        } else {
          nextRunAt = computeNextRunAt(job, now);
          if (job.catchUp && job.cronExpression) {
            const latestOccurrence = cronAt(job, now).prev().toDate();
            const lastRun = new Date(job.lastRun || job.createdAt);
            if (lastRun < latestOccurrence) nextRunAt = latestOccurrence;
          }
        }

        await collection.updateOne({ _id: job._id, nextRunAt: { $exists: false } }, { $set: { nextRunAt } });
      } catch (error) {
        console.error(`[ScheduleService] Could not backfill nextRunAt for ${job.name}`, error);
      }
    }
  }

  private static startIntervalDriver() {
    if (this.intervalTimer) return;

    const seconds = Number(process.env.SCHEDULE_INTERVAL_SECONDS || 60);
    const drain = async () => {
      if (this.intervalDraining) return;
      this.intervalDraining = true;
      try {
        await this.runDueJobs();
      } catch (error) {
        console.error("[ScheduleService] Drain failed", error);
      } finally {
        this.intervalDraining = false;
      }
    };

    this.intervalTimer = setInterval(drain, seconds * 1000);
    this.intervalTimer.unref();
    // Run once now for anything that fell due while the process was down.
    void drain();
  }

  /** Stop the in-process driver (tests, graceful shutdown). */
  static stop() {
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.intervalTimer = null;
  }
}
