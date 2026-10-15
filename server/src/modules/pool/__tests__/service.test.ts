import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { PoolService } from "../service";
import { getCollection } from "@modular-rest/server";
import { LeitnerService } from "../../leitner_box/service";

jest.mock("@modular-rest/server", () => ({
	getCollection: jest.fn(),
	Schema: class {},
	defineCollection: jest.fn(),
	Permission: class {},
	schemas: { file: {} },
}));

// PoolService.promote lazily require()s LeitnerService — mock it here.
jest.mock("../../leitner_box/service", () => ({
	LeitnerService: {
		addPhraseToBox: jest.fn(),
	},
}));

describe("PoolService", () => {
	let mockPoolCollection: any;
	let mockProfileCollection: any;
	const userId = "user_123";

	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date("2026-07-03T10:00:00Z"));
		jest.clearAllMocks();

		mockPoolCollection = {
			findOne: jest.fn(),
			create: jest.fn(),
			updateOne: jest.fn(),
			find: jest.fn(),
		};
		mockProfileCollection = { findOne: jest.fn() };

		(getCollection as any).mockImplementation((_db: string, col: string) => {
			if (col === "pool") return Promise.resolve(mockPoolCollection);
			if (col === "profile") return Promise.resolve(mockProfileCollection);
			if (col === "phrase") return Promise.resolve({ find: jest.fn(() => []) });
			return Promise.resolve({});
		});
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe("add", () => {
		// The real idempotency (a second add pushes nothing) runs against MongoDB in
		// language.test.ts; here we check the shape of the two writes.
		it("gets-or-creates the language's pool, then pushes with a server-set pooled_at", async () => {
			await PoolService.add(userId, "p1");

			expect(mockPoolCollection.create).not.toHaveBeenCalled();
			const [upsert, push] = mockPoolCollection.updateOne.mock.calls;
			expect(upsert).toEqual([
				{ userId, language: { $in: ["en", null] } },
				{ $setOnInsert: { language: "en", items: [] } },
				{ upsert: true },
			]);
			expect(push[0]).toEqual({ userId, language: { $in: ["en", null] }, "items.phraseId": { $ne: "p1" } });
			const item = push[1].$push.items;
			expect(item.phraseId).toBe("p1");
			expect(item.encountered).toBe(false);
			expect(new Date(item.pooled_at).toISOString()).toBe("2026-07-03T10:00:00.000Z");
		});

		it("only pushes when the phrase is not in the pool yet (conditional push)", async () => {
			await PoolService.add(userId, "p1", "de");

			const push = mockPoolCollection.updateOne.mock.calls[1];
			expect(push[0]).toEqual({ userId, language: "de", "items.phraseId": { $ne: "p1" } });
		});
	});

	describe("promote", () => {
		it("adds to L1 (onlyIfAbsent) then removes from the pool", async () => {
			mockPoolCollection.updateOne.mockResolvedValue({});

			await PoolService.promote(userId, ["p1"], { encountered: true });

			expect(LeitnerService.addPhraseToBox).toHaveBeenCalledWith(userId, "p1", 1, {
				onlyIfAbsent: true,
				encountered: true,
				language: "en",
			});
			// remove -> $pull on the pool collection
			expect(mockPoolCollection.updateOne).toHaveBeenCalledWith(
				{ userId, language: { $in: ["en", null] } },
				{ $pull: { items: { phraseId: "p1" } } }
			);
		});
	});

	describe("ageOutAllUsers", () => {
		it("promotes only items older than the cut-off, encountered:false", async () => {
			mockPoolCollection.find.mockResolvedValue([
				{
					_id: "pool_1",
					userId,
					items: [
						{ phraseId: "old", pooled_at: new Date("2026-06-20T00:00:00Z"), encountered: false }, // >7d
						{ phraseId: "fresh", pooled_at: new Date("2026-07-02T00:00:00Z"), encountered: false }, // <7d
					],
				},
			]);
			mockProfileCollection.findOne.mockResolvedValue({ poolAgeCutoffDays: 7 });
			mockPoolCollection.updateOne.mockResolvedValue({});

			await PoolService.ageOutAllUsers();

			expect(LeitnerService.addPhraseToBox).toHaveBeenCalledTimes(1);
			expect(LeitnerService.addPhraseToBox).toHaveBeenCalledWith(userId, "old", 1, {
				onlyIfAbsent: true,
				encountered: false,
				language: "en",
			});
		});
	});
});
