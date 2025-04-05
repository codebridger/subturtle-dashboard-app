import Router from "koa-router";
import { reply } from "@modular-rest/server";
import { checkDailyAllocation } from "./service";

const name = "subscription";
const subscription = new Router();

// Get current user's subscription status
subscription.get("/subscription/status", async (ctx: any) => {
  try {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = reply.create("f", { error: "Authentication required" });
      return;
    }

    const userId = ctx.state.user._id;
    const status = await checkDailyAllocation(userId);

    ctx.body = reply.create("s", status);
  } catch (error: any) {
    ctx.status = 500;
    ctx.body = reply.create("f", {
      error: error.message || "Failed to get subscription status",
    });
  }
});

export { name };
export const main = subscription;
