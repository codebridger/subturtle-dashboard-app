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

// Mock BoardService (referenced by the service module)
jest.mock("../../board/service", () => ({
	BoardService: {
		refreshActivity: jest.fn(),
	},
}));

describe("LeitnerService review bundle — confirmed_chunk + source_sentence", () => {
	let mockSystemCollection: any;
	let mockPhraseCollection: any;
	const userId = "user_123";
	const phraseId = "phrase_1";

	// A due item pointing at phraseId
	const dueItem = {
		phraseId,
		boxLevel: 3,
		nextReviewDate: new Date("2026-01-28T10:00:00Z"),
		lastAttemptDate: new Date("2026-01-27T10:00:00Z"),
		consecutiveIncorrect: 0,
	};

	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date("2026-01-28T10:00:00Z"));
		jest.clearAllMocks();

		mockSystemCollection = {
			findOne: jest.fn(),
			create: jest.fn(),
			updateOne: jest.fn(),
		};
		// Access through the `any`-typed var so the mock isn't concretely typed to `never`.
		mockSystemCollection.findOne.mockResolvedValue({
			_id: "sys_1",
			userId,
			settings: LeitnerService.DEFAULT_SETTINGS,
			items: [dueItem],
		});

		mockPhraseCollection = { find: jest.fn() };

		(getCollection as any).mockImplementation((_db: string, col: string) => {
			if (col === "leitner_system") return Promise.resolve(mockSystemCollection);
			if (col === "phrase") return Promise.resolve(mockPhraseCollection);
			return Promise.resolve({});
		});
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("picks the highest-confidence chunk's text and mirrors context into source_sentence", async () => {
		mockPhraseCollection.find.mockResolvedValue([
			{
				_id: phraseId,
				type: "linguistic",
				phrase: "hit the sack",
				context: "I'm exhausted, I think I'll hit the sack now.",
				chunks: [
					{ text: "I think", type: "discourse_marker", confidence: 0.4 },
					{ text: "hit the sack", type: "idiom", confidence: 0.95 },
				],
			},
		]);

		const items = await LeitnerService.getDueItems(userId);

		expect(items).toHaveLength(1);
		expect(items[0].confirmed_chunk).toBe("hit the sack");
		expect(items[0].source_sentence).toBe("I'm exhausted, I think I'll hit the sack now.");
	});

	it("tie-breaks equal confidence by earliest chunk", async () => {
		mockPhraseCollection.find.mockResolvedValue([
			{
				_id: phraseId,
				type: "linguistic",
				context: "some sentence",
				chunks: [
					{ text: "first", type: "other", confidence: 0.8 },
					{ text: "second", type: "other", confidence: 0.8 },
				],
			},
		]);

		const items = await LeitnerService.getDueItems(userId);

		expect(items[0].confirmed_chunk).toBe("first");
	});

	it("returns null confirmed_chunk when the phrase has no chunks", async () => {
		mockPhraseCollection.find.mockResolvedValue([
			{ _id: phraseId, type: "normal", phrase: "cat", translation: "gato" },
		]);

		const items = await LeitnerService.getDueItems(userId);

		expect(items[0].confirmed_chunk).toBeNull();
		// normal phrases carry no context → source_sentence is null
		expect(items[0].source_sentence).toBeNull();
	});

	it("returns null confirmed_chunk for an empty chunks array", async () => {
		mockPhraseCollection.find.mockResolvedValue([
			{ _id: phraseId, type: "linguistic", context: "ctx", chunks: [] },
		]);

		const items = await LeitnerService.getDueItems(userId);

		expect(items[0].confirmed_chunk).toBeNull();
		expect(items[0].source_sentence).toBe("ctx");
	});
});
