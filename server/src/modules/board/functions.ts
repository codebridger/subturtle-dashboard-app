import { defineFunction } from "@modular-rest/server";
import { BoardService } from "./service";

const getBoard = defineFunction({
	name: "get-board", // modular-rest prefers kebab-case often
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const { userId } = context;
		if (!userId) throw new Error("Unauthorized");
		return BoardService.getBoard(userId);
	},
});

const consumeActivity = defineFunction({
	name: "consume-activity",
	permissionTypes: ["user_access"],
	callback: async (context) => {
		const { type, refId, userId } = context;

		if (!userId) throw new Error("Unauthorized");
		if (!type) throw new Error("Type is required");

		await BoardService.consumeActivity(userId, type, refId);
		return { success: true };
	},
});

module.exports.functions = [getBoard, consumeActivity];
