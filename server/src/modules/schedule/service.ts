import schedule from "node-schedule";
import { getCollection } from "@modular-rest/server";
import { DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION } from "../../config";

const PORT = process.env.PORT || "8080";
const BASE_URL = `http://localhost:${PORT}`;
const SYSTEM_SECRET = process.env.SYSTEM_SECRET || "default_system_secret_key";

export class ScheduleService {
  static async init() {
    try {
      const collection = await getCollection(DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION);
      const jobs = await collection.find({ status: "active" });
      console.log(`[ScheduleService] Initializing ${jobs.length} jobs...`);
      for (const job of jobs) {
        this.scheduleJobInternal(job as any);
      }
    } catch (error) {
      console.error("[ScheduleService] Init failed", error);
    }
  }

  static async createJob(
    name: string,
    cronExpression: string,
    routePath: string,
    method: string = "POST"
  ) {
    const collection = await getCollection(DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION);
    const existing = await collection.findOne({ name });

    const jobData = {
      name,
      cronExpression,
      routePath,
      method,
      status: "active" as const,
    };

    if (existing) {
      await collection.updateOne(
        { name },
        { $set: { cronExpression, routePath, method, status: "active" } }
      );
      this.cancelJob(name);
    } else {
      await collection.create(jobData);
    }

    this.scheduleJobInternal(jobData);
    return jobData;
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

  static scheduleJobInternal(jobData: {
    name: string;
    cronExpression: string;
    routePath: string;
    method: string;
  }) {
    // Cancel existing if any (safety check)
    if (schedule.scheduledJobs[jobData.name]) {
      schedule.scheduledJobs[jobData.name].cancel();
    }

    schedule.scheduleJob(jobData.name, jobData.cronExpression, async () => {
      console.log(`[ScheduleService] Triggering job: ${jobData.name}`);
      try {
        const collection = await getCollection(DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION);
        await collection.updateOne(
          { name: jobData.name },
          { $set: { lastRun: new Date() } }
        );

        // Append base url if relative path
        const url = jobData.routePath.startsWith("http")
          ? jobData.routePath
          : `${BASE_URL}${jobData.routePath}`;

        const response = await fetch(url, {
          method: jobData.method,
          headers: {
            "Content-Type": "application/json",
            "x-system-secret": SYSTEM_SECRET,
          },
          body: ["POST", "PUT", "PATCH"].includes(jobData.method.toUpperCase())
             ? JSON.stringify({ system_secret: SYSTEM_SECRET })
             : undefined
        });

        if (!response.ok) {
          console.error(
            `[ScheduleService] Job ${jobData.name} failed: ${response.status} ${response.statusText}`
          );
        } else {
            console.log(`[ScheduleService] Job ${jobData.name} executed successfully.`);
        }
      } catch (e) {
        console.error(`[ScheduleService] Job ${jobData.name} execution error`, e);
      }
    });
  }
}
