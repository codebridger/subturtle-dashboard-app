import Router from "koa-router";
import { ScheduleService, getScheduleDriver } from "./service";
import { verifyTickRequest } from "./tick-auth";

const name = "schedule";
const scheduleRouter = new Router();

// Entry point for the external scheduler when SCHEDULE_DRIVER=http (see service.ts).
// It answers only after the drain finishes: Cloud Run throttles an instance's CPU once
// its response is sent, so background work after replying would stall.
scheduleRouter.post("/tick", async (ctx: any) => {
  if (getScheduleDriver() !== "http") {
    ctx.status = 404;
    ctx.body = { error: "The tick endpoint is enabled only when SCHEDULE_DRIVER=http" };
    return;
  }

  const refusal = await verifyTickRequest(ctx.get("Authorization"));
  if (refusal) {
    ctx.status = refusal.status;
    ctx.body = { error: refusal.message };
    return;
  }

  ctx.body = await ScheduleService.runDueJobs();
});

export { name };
export const main = scheduleRouter;
