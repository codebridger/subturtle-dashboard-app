import { BoardActivity } from "./db";
import { getCollection } from "@modular-rest/server";
import { DATABASE_BOARD, BOARD_ACTIVITY_COLLECTION } from "../../config";
import { Document } from "mongoose";
import { LangCode, langOf, toCode, DEFAULT_LANGUAGE } from "../../languages/helper";
import { resolveLanguage } from "../../languages/learner";
import { getOrCreate } from "../../utils/get-or-create";
import { boardPlan, findLanguageDocs, resolveLanguageDoc, withoutRefId } from "../../languages/language-docs";

type BoardActivityDoc = BoardActivity & Document;

/**
 * The Today board. Each activity belongs to one learning language (ADR-006 point 3, work
 * list B-12): its key is `(userId, type, language)`. Every method takes an optional
 * `language`; without one it works on the learner's active language. Rows from before
 * multilingual have no `language` and are English. Rows are found in code
 * (`language-docs.ts`), not with one language filter, so old rows are found on every
 * database; an old row is adopted and duplicate rows are merged when one is refreshed.
 */
export class BoardService {
	/**
	 * Refreshes the state of a specific activity type for a user.
	 * This is typically called by a scheduled job or an event hook.
	 * @param userId The user ID
	 * @param type The activity type (e.g., 'leitner_review')
	 * @param meta The updated metadata (e.g., dueCount). If null, implies no update needed.
	 * @param shouldToast Whether this update should trigger a 'toasted' state.
	 * @param language The learning language; missing means the active one.
	 */
	static async refreshActivity(
		userId: string,
		type: string,
		meta: any,
		shouldToast: boolean,
		toastType: "singleton" | "unique" = "singleton",
		refId?: string,
		persistent: boolean = false,
		language?: LangCode
	) {
		const col = await getCollection(DATABASE_BOARD, BOARD_ACTIVITY_COLLECTION);
		const lang = await resolveLanguage(userId, language);
		const base: any = { userId, type };
		if (toastType === "unique" && refId) {
			base.refId = refId;
		}

		// A singleton row has no refId; rows of other refIds are never folded into it.
		const accept = base.refId ? undefined : withoutRefId;
		const existing = (await resolveLanguageDoc(col as any, base, lang, boardPlan, accept)) as BoardActivityDoc | null;

		if (existing) {
			// Update existing activity
			const updateData: Partial<BoardActivity> = {
				lastUpdated: new Date(),
				meta: { ...existing.meta, ...meta },
				persistent: persistent || existing.persistent,
			};

			// Only re-toast if explicitly requested.
			// E.g., if it was 'idle' and now we have new due items, toast it.
			// If it was already 'toasted', we just update meta (silent update).
			if (shouldToast && existing.state === "idle") {
				updateData.state = "toasted";
			}

			// If it's toasted but now meta says it's not active anymore, move back to idle
			if (existing.state === "toasted" && meta?.isActive === false) {
				updateData.state = "idle";
			}

			await col.updateOne({ _id: existing._id }, { $set: updateData });
		} else if (shouldToast || persistent) {
			// Create new activity if it should toast OR if it's persistent. An upsert, so two
			// refreshes at once leave one row (ADR-006 point 3).
			await getOrCreate(col, { ...base, language: lang }, {
				userId,
				type,
				language: lang,
				toastType,
				refId,
				state: shouldToast ? "toasted" : "idle",
				persistent,
				lastUpdated: new Date(),
				meta,
			});
		}
	}

	/**
	 * consumes an activity (sets it to idle)
	 * @param userId
	 * @param type
	 * @param refId
	 * @param language The learning language; missing means the active one.
	 */
	static async consumeActivity(userId: string, type: string, refId?: string, language?: LangCode) {
		const col = await getCollection(DATABASE_BOARD, BOARD_ACTIVITY_COLLECTION);
		const lang = await resolveLanguage(userId, language);
		const base: any = { userId, type };
		if (refId) {
			base.refId = refId;
		}

		// The rows of this language, found in code (an old row has no `language`). Every copy
		// is set idle (an old row and a new one), so none stays on the board. Without a refId
		// the singleton rows are meant; if there are none, the first row (as before).
		const rows = await findLanguageDocs(col as any, base, lang);
		const singletons = refId ? rows : rows.filter(withoutRefId);
		const targets = singletons.length > 0 ? singletons : rows.slice(0, 1);
		if (targets.length === 0) return;
		await col.updateMany({ _id: { $in: targets.map((row: any) => row._id) } }, {
			$set: { state: "idle", lastUpdated: new Date() },
		});
	}

	/**
	 * Get all active activities for a user in one language.
	 * Returns activities that are 'toasted' OR (persistent AND meta.isActive)
	 */
	static async getBoard(userId: string, language?: LangCode) {
		const col = await getCollection(DATABASE_BOARD, BOARD_ACTIVITY_COLLECTION);
		const lang = await resolveLanguage(userId, language);
		const code = toCode(lang) ?? DEFAULT_LANGUAGE;
		const rows = await col.find({
			userId,
			$or: [
				{ state: "toasted" },
				{ persistent: true, "meta.isActive": true }
			]
		});
		// The language is picked in code: an old row has no `language` and is English. While an
		// old row and a new copy both exist, only the latest of each (type, refId) is shown.
		const latest = new Map<string, any>();
		for (const row of (rows || []) as any[]) {
			if (langOf(row) !== code) continue;
			const key = `${row.type}|${row.refId ?? ""}`;
			const kept = latest.get(key);
			if (!kept || new Date(row.lastUpdated || 0).getTime() > new Date(kept.lastUpdated || 0).getTime()) latest.set(key, row);
		}
		return [...latest.values()];
	}
}
