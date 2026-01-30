import { Schema, defineCollection, Permission } from "@modular-rest/server";
import { DATABASE_BOARD, BOARD_ACTIVITY_COLLECTION } from "../../config";

export interface BoardActivity {
	_id?: string;
	userId: string;
	type: string; // 'leitner_review' | 'ai_lecture' | 'ai_practice'
	toastType: "singleton" | "unique";
	refId?: string; // e.g. lecture ID
	state: "idle" | "toasted";
	persistent: boolean;
	lastUpdated: Date;
	meta: any;
}

const boardActivitySchema = new Schema<BoardActivity>(
	{
		userId: { type: String, required: true, index: true },
		type: { type: String, required: true },
		toastType: { type: String, required: true, enum: ["singleton", "unique"] },
		refId: { type: String },
		state: { type: String, required: true, enum: ["idle", "toasted"] },
		persistent: { type: Boolean, default: false },
		lastUpdated: { type: Date, default: Date.now },
		meta: { type: Schema.Types.Mixed }, // Meta can be anything
	},
	{ timestamps: true }
);

export const boardActivityCollection = defineCollection({
	database: DATABASE_BOARD,
	collection: BOARD_ACTIVITY_COLLECTION,
	schema: boardActivitySchema,
	permissions: [
		new Permission({
			accessType: "owner",
			read: true,
			write: true, // User 'consumes' activity
		}),
		new Permission({
			accessType: "admin",
			read: true,
			write: true,
		})
	],
});

module.exports = [boardActivityCollection];
