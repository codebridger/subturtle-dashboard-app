import { defineFunction } from "@modular-rest/server";
import { ScheduleService } from "./service";
import { getCollection } from "@modular-rest/server";
import { DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION } from "../../config";

const createJob = defineFunction({
  name: "create-job",
  permissionTypes: ["admin"], // Assuming admin usage
  callback: async (params: any) => {
    const {
      name,
      cronExpression,
      runAt,
      functionId,
      args,
      executionType,
      jobType
    } = params;

    await ScheduleService.createJob(
      name,
      functionId,
      {
        cronExpression,
        runAt: runAt ? new Date(runAt) : undefined,
        args: args || {},
        executionType,
        jobType
      }
    );
    return { success: true };
  },
});

const deleteJob = defineFunction({
  name: "delete-job",
  permissionTypes: ["admin"],
  callback: async (params: any) => {
    const { name } = params;
    await ScheduleService.deleteJob(name);
    return { success: true };
  },
});

const listJobs = defineFunction({
  name: "list-jobs",
  permissionTypes: ["admin"],
  callback: async () => {
    const collection = await getCollection(DATABASE_SCHEDULE, SCHEDULE_JOB_COLLECTION);
    const jobs = await collection.find({});
    return jobs;
  },
});

module.exports.functions = [createJob, deleteJob, listJobs];
