import { defineFunction } from "@modular-rest/server";
import { LeitnerService, toReviewResult } from "./service";
import { ReviewLogService } from "../review_log/service";
import { BoardService } from "../board/service";
import { LangCode } from "../../languages/helper";
import { resolveLanguage } from "../../languages/learner";

// Every function here takes an optional `language` (contract section 3). Without one it
// works on the learner's active language, or for a single card on that card's language.

// Frontend API: Get items to review
const getReviewSession = defineFunction({
	name: "get-review-session",
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const { limit, userId, language } = context;
		if (!userId) throw new Error("Unauthorized");

		// Ensure initialized (lazy init)
		const lang = await LeitnerService.ensureInitialized(userId, language);

		const items = await LeitnerService.getDueItems(userId, limit ? parseInt(limit) : 20, lang);
		return items;
	},
});

// Frontend API: Submit a review result. `result` is right / close / wrong; old clients send
// `isCorrect` (true = right, false = wrong). Close keeps the card in its box (Q4).
const submitReview = defineFunction({
	name: "submit-review",
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const { phraseId, isCorrect, result, userId, language, cardType, eventKey } = context;
		if (!userId) throw new Error("Unauthorized");

		if (!phraseId) throw new Error("Phrase ID is required");
		const outcome = toReviewResult(result, isCorrect);
		if (!outcome) throw new Error("result (right, close or wrong) or isCorrect boolean is required");

		// Submit review (also triggers init if needed)
		const review = await LeitnerService.submitReview(userId, phraseId, outcome, language);
		// Append-only history for the knowledge map (B-30); never fails the answer.
		await ReviewLogService.recordReview({
			userId,
			language: review.language,
			phraseId,
			result: outcome,
			fromBox: review.fromBox,
			toBox: review.boxLevel,
			cardType,
			eventKey,
		});

		return { success: true, language: review.language, result: outcome };
	},
});

// Internal/Cron API: Check status and update board
const refreshBoardStatus = defineFunction({
	name: "refresh-board-status",
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const { userId, language } = context;
		if (!userId) {
			throw new Error("UserId required for refresh-board-status");
		}

		await _syncUser(userId, await resolveLanguage(userId, language));
		return { success: true };
	},
});

async function _syncUser(userId: string, language: LangCode) {
	const dueCount = await LeitnerService.getDueCount(userId, language);
	await BoardService.refreshActivity(
		userId,
		"leitner_review",
		{ dueCount, isActive: dueCount > 0 },
		dueCount > 0,
		"singleton",
		undefined,
		true, // persistent
		language
	);
}

const getStats = defineFunction({
	name: "get-stats",
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const { userId, language } = context;
		if (!userId) throw new Error("Unauthorized");
		return LeitnerService.getStats(userId, language);
	}
});

const updateSettings = defineFunction({
	name: "update-settings",
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const { settings, userId, language } = context;
		if (!userId) throw new Error("Unauthorized");
		await LeitnerService.updateSettings(userId, settings, language);
		return { success: true };
	}
});

const resetSystem = defineFunction({
	name: "reset-system",
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const { userId, language } = context;
		if (!userId) throw new Error("Unauthorized");
		await LeitnerService.resetSystem(userId, language);
		return { success: true };
	},
});

const addPhraseToBox = defineFunction({
	name: "add-phrase-to-box",
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const { phraseId, boxLevel, userId, language } = context;
		if (!userId) throw new Error("Unauthorized");
		if (!phraseId) throw new Error("phraseId is required");
		await LeitnerService.addPhraseToBox(userId, phraseId, boxLevel ? parseInt(boxLevel) : 1, { language });
		return { success: true };
	},
});

const removePhraseFromBox = defineFunction({
	name: "remove-phrase-from-box",
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const { phraseId, userId, language } = context;
		if (!userId) throw new Error("Unauthorized");
		if (!phraseId) throw new Error("phraseId is required");
		await LeitnerService.removePhraseFromBox(userId, phraseId, language);
		return { success: true };
	},
});

const getPhraseManagementInfo = defineFunction({
	name: "get-phrase-management-info",
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const userId = context.userId || context.args?.userId;
		if (!userId) throw new Error("Unauthorized");
		return LeitnerService.getPhraseManagementInfo(userId, context.language ?? context.args?.language);
	},
});

const getCustomReviewSession = defineFunction({
	name: "get-custom-review-session",
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const { phraseIds, userId, language } = context;
		if (!userId) throw new Error("Unauthorized");
		if (!Array.isArray(phraseIds)) throw new Error("phraseIds must be an array");

		const lang = await LeitnerService.ensureInitialized(userId, language);

		return LeitnerService.getCustomReviewItems(userId, phraseIds as string[], lang);
	},
});

module.exports.functions = [
	getReviewSession,
	submitReview,
	refreshBoardStatus,
	getStats,
	updateSettings,
	resetSystem,
	addPhraseToBox,
	removePhraseFromBox,
	getPhraseManagementInfo,
	getCustomReviewSession,
];
