import { defineFunction } from "@modular-rest/server";
import { LeitnerService } from "./service";
import { BoardService } from "../board/service";

// Frontend API: Get items to review
const getReviewSession = defineFunction({
	name: "get-review-session",
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const { limit, userId } = context;
		if (!userId) throw new Error("Unauthorized");

		// Ensure initialized (lazy init)
		await LeitnerService.ensureInitialized(userId);

		const items = await LeitnerService.getDueItems(userId, limit ? parseInt(limit) : 20);
		return items;
	},
});

// Frontend API: Submit a review result
const submitReview = defineFunction({
	name: "submit-review",
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const { phraseId, isCorrect, userId } = context;
		if (!userId) throw new Error("Unauthorized");

		if (!phraseId) throw new Error("Phrase ID is required");
		if (typeof isCorrect !== "boolean") throw new Error("isCorrect boolean is required");

		// Submit review (also triggers init if needed)
		await LeitnerService.submitReview(userId, phraseId, isCorrect);

		return { success: true };
	},
});

// Internal/Cron API: Check status and update board
const refreshBoardStatus = defineFunction({
	name: "refresh-board-status",
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const { userId } = context;
		if (!userId) {
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
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const { userId } = context;
		if (!userId) throw new Error("UserId required");

		await LeitnerService.ensureInitialized(userId);
		return { success: true };
	}
});

const getStats = defineFunction({
	name: "get-stats",
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const { userId } = context;
		if (!userId) throw new Error("Unauthorized");
		return LeitnerService.getStats(userId);
	}
});

const updateSettings = defineFunction({
	name: "update-settings",
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const { settings, userId } = context;
		if (!userId) throw new Error("Unauthorized");
		await LeitnerService.updateSettings(userId, settings);
		return { success: true };
	}
});

const resetSystem = defineFunction({
	name: "reset-system",
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const { userId } = context;
		if (!userId) throw new Error("Unauthorized");
		await LeitnerService.resetSystem(userId);
		return { success: true };
	},
});

const addPhraseToBox = defineFunction({
	name: "add-phrase-to-box",
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const { phraseId, boxLevel, userId } = context;
		if (!userId) throw new Error("Unauthorized");
		if (!phraseId) throw new Error("phraseId is required");
		await LeitnerService.addPhraseToBox(userId, phraseId, boxLevel ? parseInt(boxLevel) : 1);
		return { success: true };
	},
});

const removePhraseFromBox = defineFunction({
	name: "remove-phrase-from-box",
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const { phraseId, userId } = context;
		if (!userId) throw new Error("Unauthorized");
		if (!phraseId) throw new Error("phraseId is required");
		await LeitnerService.removePhraseFromBox(userId, phraseId);
		return { success: true };
	},
});

const getPhraseManagementInfo = defineFunction({
	name: "get-phrase-management-info",
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const userId = context.userId || context.args?.userId;
		if (!userId) throw new Error("Unauthorized");
		return LeitnerService.getPhraseManagementInfo(userId);
	},
});

module.exports.functions = [
	getReviewSession,
	submitReview,
	refreshBoardStatus,
	initLeitner,
	getStats,
	updateSettings,
	resetSystem,
	addPhraseToBox,
	removePhraseFromBox,
	getPhraseManagementInfo,
];
