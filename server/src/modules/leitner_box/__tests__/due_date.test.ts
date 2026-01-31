import { describe, it, expect, jest, beforeEach } from "@jest/globals";
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

describe("LeitnerService Date Sensitivity", () => {
	let mockCollection: any;
	let mockPhraseCollection: any;

	beforeEach(() => {
		jest.clearAllMocks();
		mockCollection = {
			findOne: jest.fn(),
			create: jest.fn(),
			updateOne: jest.fn(),
		};
		mockPhraseCollection = {
			find: jest.fn().mockReturnThis(),
			toArray: jest.fn(),
		};
		(getCollection as any).mockImplementation((db: string, col: string) => {
			if (col === "leitner_systems") return Promise.resolve(mockCollection);
			if (col === "phrases") return Promise.resolve(mockPhraseCollection);
			return Promise.resolve({});
		});
	});

	it("should include items scheduled for later today in getDueCount", async () => {
		const now = new Date();
		const laterToday = new Date(now);
		laterToday.setHours(23, 0, 0, 0);

		const userId = "user1";
		const systemDoc = {
			userId,
			settings: { dailyLimit: 20 },
			items: [
				{ phraseId: "phrase1", nextReviewDate: laterToday, boxLevel: 1 }
			]
		};
		mockCollection.findOne.mockResolvedValue(systemDoc);

		const count = await LeitnerService.getDueCount(userId);
		expect(count).toBe(1);
	});

	it("should include items scheduled for earlier today in getDueCount", async () => {
		const now = new Date();
		const earlierToday = new Date(now);
		earlierToday.setHours(1, 0, 0, 0);

		const userId = "user1";
		const systemDoc = {
			userId,
			settings: { dailyLimit: 20 },
			items: [
				{ phraseId: "phrase1", nextReviewDate: earlierToday, boxLevel: 1 }
			]
		};
		mockCollection.findOne.mockResolvedValue(systemDoc);

		const count = await LeitnerService.getDueCount(userId);
		expect(count).toBe(1);
	});

	it("should NOT include items scheduled for tomorrow in getDueCount", async () => {
		const now = new Date();
		const tomorrow = new Date(now);
		tomorrow.setDate(now.getDate() + 1);
		tomorrow.setHours(0, 0, 0, 0);

		const userId = "user1";
		const systemDoc = {
			userId,
			settings: { dailyLimit: 20 },
			items: [
				{ phraseId: "phrase1", nextReviewDate: tomorrow, boxLevel: 1 }
			]
		};
		mockCollection.findOne.mockResolvedValue(systemDoc);

		const count = await LeitnerService.getDueCount(userId);
		expect(count).toBe(0);
	});

	it("should include items scheduled for yesterday in getDueCount", async () => {
		const now = new Date();
		const yesterday = new Date(now);
		yesterday.setDate(now.getDate() - 1);

		const userId = "user1";
		const systemDoc = {
			userId,
			settings: { dailyLimit: 20 },
			items: [
				{ phraseId: "phrase1", nextReviewDate: yesterday, boxLevel: 1 }
			]
		};
		mockCollection.findOne.mockResolvedValue(systemDoc);

		const count = await LeitnerService.getDueCount(userId);
		expect(count).toBe(1);
	});
});
