import { Schema, defineCollection, Permission } from "@modular-rest/server";
import { DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION } from "../../config";

interface ScheduleJobSchema {
  name: string;
  cronExpression: string;
  routePath: string;
  method: string;
  lastRun?: Date;
  status: "active" | "inactive" | "failed";
}

const scheduleJobSchema = new Schema<ScheduleJobSchema>(
  {
    name: { type: String, required: true, unique: true },
    cronExpression: { type: String, required: true },
    routePath: { type: String, required: true },
    method: { type: String, default: "POST" },
    lastRun: Date,
    status: {
      type: String,
      enum: ["active", "inactive", "failed"],
      default: "active",
    },
  },
  { timestamps: true }
);

const scheduleJobCollection = defineCollection({
  database: DATABASE_SCHEDULE,
  collection: SCHEDULE_JOB_COLLECTION,
  schema: scheduleJobSchema,
  permissions: [
    new Permission({
      accessType: "public_access", // Internal service, but let's secure it later if needed. For now admin usage.
      read: true,
      write: true,
    }),
  ],
});

module.exports = [scheduleJobCollection];
