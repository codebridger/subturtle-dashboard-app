import schedule from "node-schedule";
import { getCollection } from "@modular-rest/server";
import { DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION } from "../../config";
import parser from "cron-parser";

export class ScheduleService {
  private static registry = new Map<string, (args: any) => Promise<void>>();
  private static processingQueue = false;

  static register(id: string, callback: (args: any) => Promise<void>) {
    console.log(`[ScheduleService] Registering function: ${id}`);
    this.registry.set(id, callback);
  }

  static async init() {
    try {
      const collection = await getCollection(DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION);
      const jobs = await collection.find({});
      console.log(`[ScheduleService] Initializing ${jobs.length} jobs...`);
      for (const job of jobs) {
        // Per-job guard: one malformed/duplicate job must not abort the loop nor
        // surface as an unhandled rejection that crashes the process on boot.
        this.scheduleJobInternal(job as any).catch((error) =>
          console.error(`[ScheduleService] Failed to schedule job ${(job as any)?.name} on init`, error)
        );
      }
      // Start processing queue in case there are stuck 'queued' jobs from previous sessions
      await this.checkCatchUp(jobs);
      await this.processQueue();
    } catch (error) {
      console.error("[ScheduleService] Init failed", error);
    }
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

    const jobData = {
      name,
      cronExpression,
      runAt,
      functionId,
      args,
      executionType,
      jobType,
      state: "scheduled" as const,
      catchUp,
      timeZone,
    };

    // Idempotent upsert keyed on the unique `name` index. This replaces a racy
    // findOne-then-create: when several callers raced (e.g. the Leitner review-job
    // sync fanning out into concurrent calls) they each saw "not found" and inserted,
    // and the losers threw an E11000 that went unhandled and killed the process.
    // A duplicate-key error here just means another caller created the same job
    // first — the desired end state — so we swallow it instead of propagating.
    try {
      await collection.updateOne(
        { name },
        { $set: { cronExpression, runAt, functionId, args, executionType, jobType, state: "scheduled", catchUp, timeZone } },
        { upsert: true }
      );
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) throw error;
      console.warn(`[ScheduleService] Job ${name} already exists (concurrent create); skipping duplicate insert.`);
    }

    // Fire-and-forget: a failure to register the in-memory timer must not reject
    // createJob (and so must never bubble into a request flow as a crash).
    this.scheduleJobInternal(jobData).catch((error) =>
      console.error(`[ScheduleService] Failed to register in-memory schedule for ${name}`, error)
    );
    return jobData;
  }

  // MongoDB raises code 11000 (legacy 11001) on a unique-index violation. Mongoose
  // surfaces it unchanged on both create and upsert, so this is the single place we
  // decide "this collision is benign" vs. "this is a real error worth rethrowing".
  private static isDuplicateKeyError(error: any): boolean {
    return !!error && (error.code === 11000 || error.code === 11001 || error.codeName === "DuplicateKey");
  }

  static cancelJob(name: string) {
    const job = schedule.scheduledJobs[name];
    if (job) {
      job.cancel();
    }
  }

  static async deleteJob(name: string) {
    this.cancelJob(name);
    const collection = await getCollection(DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION);
    await collection.deleteOne({ name });
  }

  static async scheduleJobInternal(jobData: any) {
    // Cancel existing if any (safety check)
    if (schedule.scheduledJobs[jobData.name]) {
      schedule.scheduledJobs[jobData.name].cancel();
    }

    const scheduleParam = jobData.jobType === "once" ? jobData.runAt : (jobData.timeZone ? { rule: jobData.cronExpression, tz: jobData.timeZone } : jobData.cronExpression);
    if (!scheduleParam) {
      console.warn(`[ScheduleService] No schedule parameter for job: ${jobData.name}`);
      return;
    }

    schedule.scheduleJob(jobData.name, scheduleParam, async () => {
      console.log(`[ScheduleService] Triggered: ${jobData.name}`);
      const collection = await getCollection(DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION);

      // Atomic claim
      const newState = jobData.executionType === "Immediate" ? "executing" : "queued";
      const claimed = await collection.findOneAndUpdate(
        {
          name: jobData.name,
          state: { $in: ["scheduled", "executed", "failed"] }
        },
        { $set: { state: newState } },
        { returnDocument: 'after' }
      ) as any;

      if (!claimed) {
        console.log(`[ScheduleService] Job ${jobData.name} already claimed or running.`);
        return;
      }

      if (jobData.executionType === "Immediate") {
        await this.executeJob(claimed, new Date());
      } else {
        console.log(`[ScheduleService] Job ${jobData.name} queued for sequential processing.`);
        this.processQueue();
      }
    });
  }

  private static async executeJob(job: any, executedTime: Date, expectedTime?: Date) {
    console.log(`[ScheduleService] Executing: ${job.name} (${job.functionId})`);
    const collection = await getCollection(DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION);

    try {
      const callback = this.registry.get(job.functionId);
      if (callback) {
        const enhancedArgs = {
          ...job.args,
          expectedTime: expectedTime || executedTime,
          executedTime
        };
        await callback(enhancedArgs);

        const finalState = job.jobType === "once" ? "executed" : "scheduled";
        await collection.updateOne(
          { _id: job._id },
          { $set: { state: finalState, lastRun: new Date() } }
        );
        console.log(`[ScheduleService] Job ${job.name} completed.`);
      } else {
        throw new Error(`Function ${job.functionId} not registered`);
      }
    } catch (e) {
      console.error(`[ScheduleService] Job ${job.name} failed:`, e);
      await collection.updateOne(
        { _id: job._id },
        { $set: { state: "failed", lastRun: new Date() } }
      );
    }
  }

  private static async processQueue() {
    if (this.processingQueue) return;
    this.processingQueue = true;

    try {
      const collection = await getCollection(DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION);

      while (true) {
        // Find next queued job (FIFO by claim time/updatedAt)
        const job = await collection.findOneAndUpdate(
          { executionType: "normal", state: "queued" },
          { $set: { state: "executing" } },
          { sort: { updatedAt: 1 }, returnDocument: 'after' }
        ) as any;

        if (!job) break;

        await this.executeJob(job, new Date());
      }
    } catch (e) {
      console.error("[ScheduleService] Queue processing error:", e);
    } finally {
      this.processingQueue = false;
    }
  }

  private static async checkCatchUp(jobs: any[]) {
    console.log(`[ScheduleService] Checking catch-up for ${jobs.length} jobs...`);
    for (const job of jobs) {

      const shouldCatchUp = job.catchUp;

      if (job.jobType === "recurrent" && shouldCatchUp && job.cronExpression) {
        try {
          const interval = parser.parseExpression(job.cronExpression, job.timeZone ? { tz: job.timeZone } : undefined);
          const lastOccurrence = interval.prev().toDate();
          const lastRun = job.lastRun ? new Date(job.lastRun) : new Date(job.createdAt);

          if (lastRun < lastOccurrence) {
            console.log(`[ScheduleService] Catch-up triggered for ${job.name}. Last run: ${lastRun}, Last occurrence: ${lastOccurrence}`);
            const collection = await getCollection(DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION);
            const newState = job.executionType === "Immediate" ? "executing" : "queued";

            const claimed = await collection.findOneAndUpdate(
              {
                name: job.name,
                state: { $in: ["scheduled", "executed", "failed"] }
              },
              { $set: { state: newState } },
              { returnDocument: 'after' }
            ) as any;

            if (claimed) {
              if (job.executionType === "Immediate") {
                await this.executeJob(claimed, new Date(), lastOccurrence);
              }
              // If normal, processQueue in init() will pick it up
            }
          }
        } catch (error) {
          console.error(`[ScheduleService] Catch-up check failed for ${job.name}`, error);
        }
      }
    }
  }
}

