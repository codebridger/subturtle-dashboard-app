import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { LeitnerService } from "../service";
import { getCollection } from "@modular-rest/server";
import { PoolService } from "../../pool/service";

jest.mock("@modular-rest/server", () => ({
	getCollection: jest.fn(),
	Schema: class {},
	defineCollection: jest.fn(),
	Permission: class {},
	schemas: { file: {} },
}));

jest.mock("../../board/service", () => ({
	BoardService: { refreshActivity: jest.fn() },
}));

// submitReview lazily require()s PoolService for the Forgot x2 routing.
jest.mock("../../pool/service", () => ({
	PoolService: { add: jest.fn() },
}));

describe("LeitnerService.submitReview — Forgot x2 at L1 -> Pool", () => {
	let mockSystemCollection: any;
	const userId = "user_123";
	const phraseId = "p1";

	function seedSystem(item: any) {
		mockSystemCollection.findOne.mockResolvedValue({
			_id: "sys_1",
			userId,
			settings: LeitnerService.DEFAULT_SETTINGS,
			items: [item],
		});
	}

	function setPayloads() {
		return mockSystemCollection.updateOne.mock.calls.map((c: any[]) => c[1]);
	}

	beforeEach(() => {
		jest.clearAllMocks();
		mockSystemCollection = {
			findOne: jest.fn(),
			create: jest.fn(),
			updateOne: jest.fn(),
		};
		mockSystemCollection.updateOne.mockResolvedValue({});
		(getCollection as any).mockImplementation((_db: string, col: string) => {
			if (col === "leitner_system") return Promise.resolve(mockSystemCollection);
			if (col === "profile") return Promise.resolve({ findOne: jest.fn(() => Promise.resolve(null)) });
			return Promise.resolve({});
		});
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it("routes to the Pool on the 2nd consecutive Forgot at L1", async () => {
		seedSystem({ phraseId, boxLevel: 1, nextReviewDate: new Date(), lastAttemptDate: new Date(), consecutiveIncorrect: 1 });

		await LeitnerService.submitReview(userId, phraseId, false);

		expect(PoolService.add).toHaveBeenCalledWith(userId, phraseId);
		// The item is $pull-ed, and no box $set (demote) is written.
		const payloads = setPayloads();
		expect(payloads.some((p: any) => p.$pull)).toBe(true);
		expect(payloads.some((p: any) => p.$set && Object.keys(p.$set).some((k) => k.endsWith(".boxLevel")))).toBe(false);
	});

	it("does NOT route on the 1st Forgot at L1 (healthy struggle)", async () => {
		seedSystem({ phraseId, boxLevel: 1, nextReviewDate: new Date(), lastAttemptDate: new Date(), consecutiveIncorrect: 0 });

		await LeitnerService.submitReview(userId, phraseId, false);

		expect(PoolService.add).not.toHaveBeenCalled();
		const payloads = setPayloads();
		expect(payloads.some((p: any) => p.$set && Object.keys(p.$set).some((k) => k.endsWith(".boxLevel")))).toBe(true);
	});

	it("does NOT route a double-wrong at L3 (demotes normally)", async () => {
		seedSystem({ phraseId, boxLevel: 3, nextReviewDate: new Date(), lastAttemptDate: new Date(), consecutiveIncorrect: 1 });

		await LeitnerService.submitReview(userId, phraseId, false);

		expect(PoolService.add).not.toHaveBeenCalled();
		const payloads = setPayloads();
		expect(payloads.some((p: any) => p.$set && Object.keys(p.$set).some((k) => k.endsWith(".boxLevel")))).toBe(true);
	});
});
