import { defineFunction } from "@modular-rest/server";
import { LeitnerService } from "./service";

const SYSTEM_SECRET = process.env.SYSTEM_SECRET || "default_system_secret_key";

const getReviewBundle = defineFunction({
  name: "get-review-bundle",
  permissionTypes: ["user_access"],
  callback: async (params: any) => {
    // Assuming params contains userId if user_access is enabled/injected
    // or we might need to rely on the fact that for user_access, the caller should pass userId?
    // Actually, secure way is ctx.user. 
    // If modular-rest injects user into params, we use it.
    // Based on profile/functions.ts, it uses { userId } = params.
    const { userId } = params;
    return await LeitnerService.getReviewBundle(userId);
  },
});

const submitReviewResult = defineFunction({
  name: "submit-review-result",
  permissionTypes: ["user_access"],
  callback: async (params: any) => {
    const { userId, results } = params;
    await LeitnerService.submitReviewResult(userId, results);
    return { success: true };
  },
});

const generateDailyBundles = defineFunction({
  name: "generate-daily-bundles",
  permissionTypes: ["anonymous_access"], // Cron triggers this
  callback: async (params: any) => {
    // Security check
    const { system_secret } = params;
    if (system_secret !== SYSTEM_SECRET) {
       throw new Error("Unauthorized system call");
    }
    
    await LeitnerService.generateDailyBundles();
    return { success: true };
  },
});

const getStats = defineFunction({
  name: "get-stats",
  permissionTypes: ["user_access"],
  callback: async (params: any) => {
     const { userId } = params;
     return await LeitnerService.getStats(userId);
  }
});

const updateSettings = defineFunction({
  name: "update-settings",
  permissionTypes: ["user_access"],
  callback: async (params: any) => {
     const { userId, settings } = params;
     // settings: { dailyLimit, totalBoxes }
     await LeitnerService.updateSettings(userId, settings);
     return { success: true };
  }
});

module.exports.functions = [getReviewBundle, submitReviewResult, generateDailyBundles, getStats, updateSettings];
