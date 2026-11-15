import { defineFunction, getCollection } from "@modular-rest/server";
import { BoardService } from "./service";
import { DATABASE, PHRASE_COLLECTION } from "../../config";
import { LangCode, languageFilter, toCode } from "../../languages/helper";
import { resolveLanguage } from "../../languages/learner";

/** True when the learner has saved no phrase in this language yet (kept phrases do not count). */
async function isNewLanguage(userId: string, language: LangCode): Promise<boolean> {
	const phrases = getCollection(DATABASE, PHRASE_COLLECTION);
	const found = await phrases.findOne({ refId: userId, status: { $ne: "pending" }, ...languageFilter(language) }, { _id: 1 });
	return !found;
}

/**
 * The Today board of one language (B-12). A 2.0 client sends `language` and gets
 * `{ language, newLanguage, activities }`; `newLanguage` is true when the language has no
 * phrases yet, so the board can say "Save your first German phrase". An old client sends no
 * `language` and keeps getting the plain list of activities of the active language.
 */
const getBoard = defineFunction({
	name: "get-board", // modular-rest prefers kebab-case often
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const { userId, language } = context;
		if (!userId) throw new Error("Unauthorized");
		if (!toCode(language)) return BoardService.getBoard(userId);

		const lang = await resolveLanguage(userId, language);
		const [activities, newLanguage] = await Promise.all([BoardService.getBoard(userId, lang), isNewLanguage(userId, lang)]);
		return { language: lang, newLanguage, activities };
	},
});

const consumeActivity = defineFunction({
	name: "consume-activity",
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const { type, refId, userId, language } = context;

		if (!userId) throw new Error("Unauthorized");
		if (!type) throw new Error("Type is required");

		await BoardService.consumeActivity(userId, type, refId, language);
		return { success: true };
	},
});

module.exports.functions = [getBoard, consumeActivity];
