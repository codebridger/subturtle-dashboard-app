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
		it("creates a pool doc with a server-set pooled_at and encountered:false", async () => {
			mockPoolCollection.findOne.mockResolvedValue(null);

			await PoolService.add(userId, "p1");

			expect(mockPoolCollection.create).toHaveBeenCalledTimes(1);
			const arg = mockPoolCollection.create.mock.calls[0][0];
			expect(arg.userId).toBe(userId);
			expect(arg.items[0].phraseId).toBe("p1");
			expect(arg.items[0].encountered).toBe(false);
			expect(new Date(arg.items[0].pooled_at).toISOString()).toBe("2026-07-03T10:00:00.000Z");
		});

		it("is idempotent — a phrase already pooled is not pushed again", async () => {
			mockPoolCollection.findOne.mockResolvedValue({
				_id: "pool_1",
				userId,
				items: [{ phraseId: "p1", pooled_at: new Date("2026-07-01T00:00:00Z"), encountered: false }],
			});

			await PoolService.add(userId, "p1");

			expect(mockPoolCollection.create).not.toHaveBeenCalled();
			expect(mockPoolCollection.updateOne).not.toHaveBeenCalled();
		});
	});

	describe("promote", () => {
		it("adds to L1 (onlyIfAbsent) then removes from the pool", async () => {
			mockPoolCollection.updateOne.mockResolvedValue({});

			await PoolService.promote(userId, ["p1"], { encountered: true });

			expect(LeitnerService.addPhraseToBox).toHaveBeenCalledWith(userId, "p1", 1, {
				onlyIfAbsent: true,
				encountered: true,
			});
			// remove -> $pull on the pool collection
			expect(mockPoolCollection.updateOne).toHaveBeenCalledWith(
				{ userId },
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
			});
		});
	});
});
