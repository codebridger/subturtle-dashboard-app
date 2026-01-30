import { BoardActivity } from "./db";
import { getCollection } from "@modular-rest/server";
import { DATABASE_BOARD, BOARD_ACTIVITY_COLLECTION } from "../../config";
import { Document } from "mongoose";

type BoardActivityDoc = BoardActivity & Document;

export class BoardService {
	/**
	 * Refreshes the state of a specific activity type for a user.
	 * This is typically called by a scheduled job or an event hook.
	 * @param userId The user ID
	 * @param type The activity type (e.g., 'leitner_review')
	 * @param meta The updated metadata (e.g., dueCount). If null, implies no update needed.
	 * @param shouldToast Whether this update should trigger a 'toasted' state.
	 */
	static async refreshActivity(
		userId: string,
		type: string,
		meta: any,
		shouldToast: boolean,
		toastType: "singleton" | "unique" = "singleton",
		refId?: string,
		persistent: boolean = false
	) {
		const col = await getCollection(DATABASE_BOARD, BOARD_ACTIVITY_COLLECTION);
		const query: any = { userId, type };
		if (toastType === "unique" && refId) {
			query.refId = refId;
		}

		const existing = (await col.findOne(query)) as BoardActivityDoc | null;

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
			// Create new activity if it should toast OR if it's persistent
			await col.create({
				userId,
				type,
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
	 */
	static async consumeActivity(userId: string, type: string, refId?: string) {
		const col = await getCollection(DATABASE_BOARD, BOARD_ACTIVITY_COLLECTION);
		const query: any = { userId, type };
		if (refId) {
			query.refId = refId;
		}

		// We only find "toasted" ones to save writes, but generally just set to idle.
		await col.updateOne(query, {
			$set: { state: "idle", lastUpdated: new Date() },
		});
	}

	/**
	 * Get all active activities for a user.
	 * Returns activities that are 'toasted' OR (persistent AND meta.isActive)
	 */
	static async getBoard(userId: string) {
		const col = await getCollection(DATABASE_BOARD, BOARD_ACTIVITY_COLLECTION);
		return col.find({
			userId,
			$or: [
				{ state: "toasted" },
				{ persistent: true, "meta.isActive": true }
			]
		});
	}
}
