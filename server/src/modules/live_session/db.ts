import { CollectionDefinition, Permission, Schema } from "@modular-rest/server";
import { DATABASE, LIVE_SESSION_COLLECTION } from "../../config";
import type { LiveSessionRecordType } from "./types";

const liveSessionCollection = new CollectionDefinition({
	db: DATABASE,
	collection: LIVE_SESSION_COLLECTION,
	schema: new Schema<LiveSessionRecordType>(
		{
			type: { type: String, required: true },
			refId: { type: String, required: true },
			session: { type: Object, required: true },
			usage: { type: Object },
			dialogs: { type: Array<Object>, default: [] },
			metadata: { type: Object, default: {} },
		},
		{ timestamps: true }
	),
	permissions: [
		new Permission({
			type: "user_access",
			read: true,
			write: true,
			onlyOwnData: true,
			ownerIdField: "refId",
		}),
	],
});

module.exports = [liveSessionCollection];
