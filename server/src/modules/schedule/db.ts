import { Schema, defineCollection, Permission } from "@modular-rest/server";
import { DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION } from "../../config";

interface ScheduleJobSchema {
  name: string;
  cronExpression?: string;
  runAt?: Date;
  functionId: string;
  args?: any;
  executionType: "Immediate" | "normal";
  jobType: "recurrent" | "once";
  lastRun?: Date;
  state: "scheduled" | "queued" | "executing" | "executed" | "failed";
  catchUp?: boolean;
}

const scheduleJobSchema = new Schema<ScheduleJobSchema>(
  {
    name: { type: String, required: true, unique: true },
    cronExpression: { type: String },
    runAt: { type: Date },
    functionId: { type: String, required: true },
    args: { type: Schema.Types.Mixed, default: {} },
    executionType: {
      type: String,
      enum: ["Immediate", "normal"],
      default: "normal"
    },
    jobType: {
      type: String,
      enum: ["recurrent", "once"],
      default: "recurrent"
    },
    lastRun: Date,
    state: {
      type: String,
      enum: ["scheduled", "queued", "executing", "executed", "failed"],
      default: "scheduled",
    },
    catchUp: { type: Boolean, default: false },
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
