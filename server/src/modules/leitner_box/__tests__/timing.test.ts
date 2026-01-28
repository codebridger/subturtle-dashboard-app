import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { LeitnerService } from "../service";
import { getCollection } from "@modular-rest/server";

// Mock modular-rest/server
jest.mock("@modular-rest/server", () => ({
	getCollection: jest.fn(),
	Schema: class { },
	defineCollection: jest.fn(),
	Permission: class { },
	schemas: { file: {} },
}));

// Mock BoardService
import { BoardService } from "../../board/service";
jest.mock("../../board/service", () => ({
	BoardService: {
		refreshActivity: jest.fn(),
	},
}));

describe("LeitnerService Timing Tests", () => {
	let mockSystemCollection: any;
	let mockPhraseCollection: any;
	const userId = "user_123";

	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date("2026-01-28T10:00:00Z"));
		jest.clearAllMocks();

		mockSystemCollection = {
			findOne: jest.fn(),
			create: jest.fn(),
			updateOne: jest.fn(),
		};

		mockPhraseCollection = {
			find: jest.fn().mockReturnValue({
				_id: "phrase_1",
				content: "Hello",
			}),
		};

		(getCollection as any).mockImplementation((db: string, col: string) => {
			if (col === "leitner_system") return Promise.resolve(mockSystemCollection);
			if (col === "phrase") return Promise.resolve(mockPhraseCollection);
			return Promise.resolve({});
		});
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("Case 1: Initial State Verification - should return empty for a fresh user", async () => {
		mockSystemCollection.findOne.mockResolvedValue(null);

		const items = await LeitnerService.getDueItems(userId);

		expect(items).toEqual([]);
		expect(mockSystemCollection.findOne).toHaveBeenCalledWith({ userId });
	});

	it("Case 2: Phrase Addition - should make a newly added phrase immediately due", async () => {
		const phraseId = "phrase_1";
		// Setup system
		const system = {
			_id: "sys_1",
			userId,
			settings: LeitnerService.DEFAULT_SETTINGS,
			items: [] as any[]
		};
		mockSystemCollection.findOne.mockResolvedValue(system);

		// Add phrase
		mockSystemCollection.findOne
			.mockResolvedValueOnce(system) // For the initial check in addPhraseToBox
			.mockResolvedValue({ // For the subsequent getDueCount call
				...system,
				items: [{
					phraseId,
					boxLevel: 1,
					nextReviewDate: new Date("2026-01-28T10:00:00Z"),
					lastAttemptDate: new Date("2026-01-28T10:00:00Z"),
					consecutiveIncorrect: 0
				}]
			});

		await LeitnerService.addPhraseToBox(userId, phraseId);

		// Verify updateOne was called with current time
		expect(mockSystemCollection.updateOne).toHaveBeenCalledWith(
			{ _id: "sys_1" },
			expect.objectContaining({
				$push: {
					items: expect.objectContaining({
						phraseId,
						boxLevel: 1,
						nextReviewDate: new Date("2026-01-28T10:00:00Z"),
					})
				}
			})
		);


		mockPhraseCollection.find.mockResolvedValue([{ _id: phraseId, content: "Hello" }]);

		const dueItems = await LeitnerService.getDueItems(userId);
		expect(dueItems.length).toBe(1);
		expect(dueItems[0].phraseId).toBe(phraseId);


		expect(BoardService.refreshActivity).toHaveBeenCalledWith(
			userId,
			"leitner_review",
			expect.objectContaining({ dueCount: 1, isActive: true }),
			true,
			"singleton",
			undefined,
			true
		);
	});

	it("Case 3: Promotion Timing - should schedule next review according to Box 2 interval", async () => {
		const phraseId = "phrase_1";
		const system = {
			_id: "sys_1",
			userId,
			settings: {
				...LeitnerService.DEFAULT_SETTINGS,
				boxIntervals: [1, 2, 4, 8, 16] // Box 1: 1 day, Box 2: 2 days...
			},
			items: [{
				phraseId,
				boxLevel: 1,
				nextReviewDate: new Date("2026-01-28T10:00:00Z"),
				lastAttemptDate: new Date("2026-01-27T10:00:00Z"),
				consecutiveIncorrect: 0
			}]
		};
		mockSystemCollection.findOne.mockResolvedValue(system);

		// Submit correct review
		await LeitnerService.submitReview(userId, phraseId, true);

		// Box 2 interval is 2 days. 2026-01-28 + 2 days = 2026-01-30
		const expectedDate = new Date("2026-01-30T10:00:00Z");

		expect(mockSystemCollection.updateOne).toHaveBeenCalledWith(
			{ _id: "sys_1" },
			expect.objectContaining({
				$set: expect.objectContaining({
					"items.0.boxLevel": 2,
					"items.0.nextReviewDate": expectedDate,
				})
			})
		);
	});

	it("Case 4: Overdue Logic - should stay due even if time passes far beyond the interval", async () => {
		const phraseId = "phrase_1";
		const nextReviewDate = new Date("2026-01-20T10:00:00Z"); // Way in the past
		const system = {
			_id: "sys_1",
			userId,
			settings: LeitnerService.DEFAULT_SETTINGS,
			items: [{
				phraseId,
				boxLevel: 1,
				nextReviewDate: nextReviewDate,
				lastAttemptDate: new Date("2026-01-19T10:00:00Z"),
				consecutiveIncorrect: 0
			}]
		};
		mockSystemCollection.findOne.mockResolvedValue(system);
		mockPhraseCollection.find.mockResolvedValue([{ _id: phraseId, content: "Hello" }]);

		// Current time is 2026-01-28
		const dueItems = await LeitnerService.getDueItems(userId);
		expect(dueItems.length).toBe(1);
		expect(dueItems[0].phraseId).toBe(phraseId);
	});

	it("Case 5: Demotion Timing - should move down one box and schedule correctly on first failure", async () => {
		const phraseId = "phrase_1";
		const system = {
			_id: "sys_1",
			userId,
			settings: {
				...LeitnerService.DEFAULT_SETTINGS,
				boxIntervals: [1, 2, 4, 8, 16]
			},
			items: [{
				phraseId,
				boxLevel: 3,
				nextReviewDate: new Date("2026-01-28T10:00:00Z"),
				lastAttemptDate: new Date("2016-01-24T10:00:00Z"),
				consecutiveIncorrect: 0
			}]
		};
		mockSystemCollection.findOne.mockResolvedValue(system);

		// Submit incorrect review
		await LeitnerService.submitReview(userId, phraseId, false);

		// Box 2 interval is 2 days. 2026-01-28 + 2 days = 2026-01-30
		const expectedDate = new Date("2026-01-30T10:00:00Z");

		expect(mockSystemCollection.updateOne).toHaveBeenCalledWith(
			{ _id: "sys_1" },
			expect.objectContaining({
				$set: expect.objectContaining({
					"items.0.boxLevel": 2, // Demoted from 3 to 2
					"items.0.nextReviewDate": expectedDate,
					"items.0.consecutiveIncorrect": 1
				})
			})
		);
	});

	it("Case 6: Consecutive Failures - should reset to Box 1 on second consecutive failure", async () => {
		const phraseId = "phrase_1";
		const system = {
			_id: "sys_1",
			userId,
			settings: {
				...LeitnerService.DEFAULT_SETTINGS,
				boxIntervals: [1, 2, 4, 8, 16]
			},
			items: [{
				phraseId,
				boxLevel: 2,
				nextReviewDate: new Date("2026-01-28T10:00:00Z"),
				lastAttemptDate: new Date("2026-01-26T10:00:00Z"),
				consecutiveIncorrect: 1 // Already failed once
			}]
		};
		mockSystemCollection.findOne.mockResolvedValue(system);

		// Submit second incorrect review
		await LeitnerService.submitReview(userId, phraseId, false);

		// Box 1 interval is 1 day. 2026-01-28 + 1 day = 2026-01-29
		const expectedDate = new Date("2026-01-29T10:00:00Z");

		expect(mockSystemCollection.updateOne).toHaveBeenCalledWith(
			{ _id: "sys_1" },
			expect.objectContaining({
				$set: expect.objectContaining({
					"items.0.boxLevel": 1, // Reset to 1
					"items.0.nextReviewDate": expectedDate,
					"items.0.consecutiveIncorrect": 2
				})
			})
		);
	});

	it("Case 7: Quota Enforcement - should respect per-box quotas when multiple items are due", async () => {
		const system = {
			_id: "sys_1",
			userId,
			settings: {
				...LeitnerService.DEFAULT_SETTINGS,
				boxQuotas: [1, 1, 1, 1, 1] // Max 1 per box
			},
			items: [
				{ phraseId: "p1", boxLevel: 1, nextReviewDate: new Date("2026-01-20T10:00:00Z"), lastAttemptDate: new Date(), consecutiveIncorrect: 0 },
				{ phraseId: "p2", boxLevel: 1, nextReviewDate: new Date("2026-01-21T10:00:00Z"), lastAttemptDate: new Date(), consecutiveIncorrect: 0 },
				{ phraseId: "p3", boxLevel: 2, nextReviewDate: new Date("2026-01-20T10:00:00Z"), lastAttemptDate: new Date(), consecutiveIncorrect: 0 },
			]
		};
		mockSystemCollection.findOne.mockResolvedValue(system);
		mockPhraseCollection.find.mockImplementation(({ _id: { $in: ids } }: any) => {
			return Promise.resolve(ids.map((id: string) => ({ _id: id, content: "text" })));
		});

		const dueItems = await LeitnerService.getDueItems(userId);

		// Should get 1 from Box 1 (most overdue) and 1 from Box 2
		expect(dueItems.length).toBe(2);
		expect(dueItems.some((i: any) => i.phraseId === "p1")).toBe(true);
		expect(dueItems.some((i: any) => i.phraseId === "p2")).toBe(false); // Quota hit for Box 1
		expect(dueItems.some((i: any) => i.phraseId === "p3")).toBe(true);
	});

	it("Case 8: Sorting - should return most overdue items first when quotas are hit", async () => {
		const system = {
			_id: "sys_1",
			userId,
			settings: {
				...LeitnerService.DEFAULT_SETTINGS,
				boxQuotas: [2, 0, 0, 0, 0] // Only Box 1, quota 2
			},
			items: [
				{ phraseId: "p1", boxLevel: 1, nextReviewDate: new Date("2026-01-25T10:00:00Z"), lastAttemptDate: new Date(), consecutiveIncorrect: 0 },
				{ phraseId: "p2", boxLevel: 1, nextReviewDate: new Date("2026-01-21T10:00:00Z"), lastAttemptDate: new Date(), consecutiveIncorrect: 0 },
				{ phraseId: "p3", boxLevel: 1, nextReviewDate: new Date("2026-01-23T10:00:00Z"), lastAttemptDate: new Date(), consecutiveIncorrect: 0 },
			]
		};
		mockSystemCollection.findOne.mockResolvedValue(system);
		mockPhraseCollection.find.mockImplementation(({ _id: { $in: ids } }: any) => {
			return Promise.resolve(ids.map((id: string) => ({ _id: id, content: "text" })));
		});

		const dueItems = await LeitnerService.getDueItems(userId);

		expect(dueItems.length).toBe(2);
		// Sorted by overdue: p2 (21st), p3 (23rd), p1 (25th). Top 2: p2, p3.
		expect(dueItems.some((i: any) => i.phraseId === "p2")).toBe(true);
		expect(dueItems.some((i: any) => i.phraseId === "p3")).toBe(true);
		expect(dueItems.some((i: any) => i.phraseId === "p1")).toBe(false);
	});

	it("Case 9: Interval Settings Change - should affect subsequent review timings", async () => {
		const phraseId = "phrase_1";
		const system = {
			_id: "sys_1",
			userId,
			settings: {
				...LeitnerService.DEFAULT_SETTINGS,
				boxIntervals: [1, 2, 4, 8, 16]
			},
			items: [{
				phraseId,
				boxLevel: 1,
				nextReviewDate: new Date("2026-01-28T10:00:00Z"),
				lastAttemptDate: new Date("2026-01-27T10:00:00Z"),
				consecutiveIncorrect: 0
			}]
		};
		mockSystemCollection.findOne.mockResolvedValue(system);

		// Update settings: Box 2 now takes 10 days instead of 2
		await LeitnerService.updateSettings(userId, { boxIntervals: [1, 10, 4, 8, 16] });

		// Mock re-fetch in submitReview (Wait, submitReview fetches again?) 
		// Actually LeitnerService.submitReview calls getSystem(userId)
		// Let's mock findings after update
		mockSystemCollection.findOne.mockResolvedValue({
			...system,
			settings: {
				...system.settings,
				boxIntervals: [1, 10, 4, 8, 16]
			}
		});

		await LeitnerService.submitReview(userId, phraseId, true);

		// 2026-01-28 + 10 days = 2026-02-07
		const expectedDate = new Date("2026-02-07T10:00:00Z");

		expect(mockSystemCollection.updateOne).toHaveBeenCalledWith(
			{ _id: "sys_1" },
			expect.objectContaining({
				$set: expect.objectContaining({
					"items.0.boxLevel": 2,
					"items.0.nextReviewDate": expectedDate,
				})
			})
		);
	});

	it("Case 10: Board Sync Logic - should not toast if no items are due", async () => {
		const system = {
			_id: "sys_1",
			userId,
			settings: LeitnerService.DEFAULT_SETTINGS,
			items: []
		};
		mockSystemCollection.findOne.mockResolvedValue(system);

		await LeitnerService.resetSystem(userId);

		expect(BoardService.refreshActivity).toHaveBeenCalledWith(
			userId,
			"leitner_review",
			expect.objectContaining({ dueCount: 0, isActive: false }),
			false, // shouldToast is false when dueCount is 0
			"singleton",
			undefined,
			true // persistent
		);
	});
});
