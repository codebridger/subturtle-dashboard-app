import { describe, it, expect, jest, afterEach } from "@jest/globals";
import triggers from "../triggers";
import { LeitnerService } from "../../leitner_box/service";

// Mock LeitnerService
jest.mock("../../leitner_box/service", () => ({
	LeitnerService: {
		resyncSchedule: jest.fn(),
	},
}));

// Mock DatabaseTrigger class since triggers.ts imports it
jest.mock("@modular-rest/server", () => ({
	DatabaseTrigger: class {
		constructor(public operation: string, public callback: (context: any) => void) { }
	},
}));

describe("Profile Triggers", () => {
	afterEach(() => {
		jest.clearAllMocks();
	});

	it("should trigger resyncSchedule when timeZone is updated in context.update (updateOne scenario)", async () => {
		const updateOneTrigger = triggers.find((t: any) => t.operation === "update-one");
		expect(updateOneTrigger).toBeDefined();

		const mockContext = {
			query: { refId: "user123_q" },
			update: { $set: { timeZone: "New/Zone" } },
			queryResult: { modifiedCount: 1 }
		};

		await (updateOneTrigger as any).callback(mockContext);

		expect(LeitnerService.resyncSchedule).toHaveBeenCalledWith("user123_q");
	});

	it("should NOT trigger resyncSchedule when timeZone is NOT updated (updateOne scenario)", async () => {
		const updateOneTrigger = triggers.find((t: any) => t.operation === "update-one");

		const mockContext = {
			query: { refId: "user123_no_sync" },
			update: { $set: { name: "New Name" } }, // Timezone not touched
			queryResult: { modifiedCount: 1 }
		};

		await (updateOneTrigger as any).callback(mockContext);

		expect(LeitnerService.resyncSchedule).not.toHaveBeenCalledWith("user123_no_sync");
	});

	it("should trigger resyncSchedule when timeZone is updated directly (flat update object)", async () => {
		const updateOneTrigger = triggers.find((t: any) => t.operation === "update-one");

		const mockContext = {
			query: { refId: "user123_flat" },
			update: { timeZone: "New/Zone" },
			queryResult: { modifiedCount: 1 }
		};

		await (updateOneTrigger as any).callback(mockContext);

		expect(LeitnerService.resyncSchedule).toHaveBeenCalledWith("user123_flat");
	});

	it("should trigger resyncSchedule for find-one-and-update when timezone changes", async () => {
		const findTrigger = triggers.find((t: any) => t.operation === "find-one-and-update");
		expect(findTrigger).toBeDefined();

		const mockContext = {
			update: { $set: { timeZone: "New/Zone" } },
			queryResult: { refId: "user789" }
		};

		await (findTrigger as any).callback(mockContext);

		expect(LeitnerService.resyncSchedule).toHaveBeenCalledWith("user789");
	});

	it("should NOT trigger resyncSchedule for find-one-and-update if timezone not changed", async () => {
		const findTrigger = triggers.find((t: any) => t.operation === "find-one-and-update");

		const mockContext = {
			update: { $set: { name: "Other" } },
			queryResult: { refId: "user789_no" }
		};

		await (findTrigger as any).callback(mockContext);

		expect(LeitnerService.resyncSchedule).not.toHaveBeenCalledWith("user789_no");
	});
});
