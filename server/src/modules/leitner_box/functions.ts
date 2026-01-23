import { defineFunction } from "@modular-rest/server";
import { LeitnerService } from "./service";
import { BoardService } from "../board/service";

// Frontend API: Get items to review
const getReviewSession = defineFunction({
  name: "get-review-session",
  permissionTypes: ["user"],
  callback: async (context) => {
    if (!context.user) throw new Error("Unauthorized");
    const { limit } = context.params;

    // Ensure initialized (lazy init)
    await LeitnerService.ensureInitialized(context.user._id);

    const items = await LeitnerService.getDueItems(context.user._id, limit ? parseInt(limit) : 20);
    return items;
  },
});

// Frontend API: Submit a review result
const submitReview = defineFunction({
  name: "submit-review",
  permissionTypes: ["user"],
  callback: async (context) => {
    if (!context.user) throw new Error("Unauthorized");
    const { phraseId, isCorrect } = context.params;

    if (!phraseId) throw new Error("Phrase ID is required");
    if (typeof isCorrect !== "boolean") throw new Error("isCorrect boolean is required");

    // Submit review (also triggers init if needed)
    await LeitnerService.submitReview(context.user._id, phraseId, isCorrect);

    return { success: true };
  },
});

// Internal/Cron API: Check status and update board
const refreshBoardStatus = defineFunction({
  name: "refresh-board-status",
  permissionTypes: ["admin", "system"],
  callback: async (context) => {
    const { userId } = context.params;
    if (!userId) {
      if (context.user) {
        await _syncUser(context.user._id);
        return { success: true };
      }
      throw new Error("UserId required for refresh-board-status");
    }

    await _syncUser(userId);
    return { success: true };
  },
});

async function _syncUser(userId: string) {
  const dueCount = await LeitnerService.getDueCount(userId);
  await BoardService.refreshActivity(
    userId,
    "leitner_review",
    { dueCount },
    dueCount > 0,
    "singleton"
  );
}

// Admin/System API: Initialize for a user
const initLeitner = defineFunction({
  name: "init-leitner",
  permissionTypes: ["admin", "system", "user"],
  callback: async (context) => {
    const userId = context.params.userId || (context.user ? context.user._id : null);
    if (!userId) throw new Error("UserId required");

    await LeitnerService.ensureInitialized(userId);
    return { success: true };
  }
});

const getStats = defineFunction({
  name: "get-stats",
  permissionTypes: ["user"],
  callback: async (context) => {
    if (!context.user) throw new Error("Unauthorized");
    return LeitnerService.getStats(context.user._id);
  }
});

const updateSettings = defineFunction({
  name: "update-settings",
  permissionTypes: ["user"],
  callback: async (context) => {
    if (!context.user) throw new Error("Unauthorized");
    const { settings } = context.params;
    await LeitnerService.updateSettings(context.user._id, settings);
    return { success: true };
  }
});

module.exports.functions = [getReviewSession, submitReview, refreshBoardStatus, initLeitner, getStats, updateSettings];
