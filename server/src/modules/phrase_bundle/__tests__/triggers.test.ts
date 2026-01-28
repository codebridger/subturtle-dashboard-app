import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { phraseBundleTriggers } from "../triggers";
import { LeitnerService } from "../../leitner_box/service";
import { isUserOnFreemium } from "../../subscription/service";

// Mock modular-rest/server
jest.mock("@modular-rest/server", () => ({
	DatabaseTrigger: class {
		public type: string;
		public callback: Function;
		constructor(type: string, callback: Function) {
			this.type = type;
			this.callback = callback;
		}
	},
}));

// Mock LeitnerService
jest.mock("../../leitner_box/service", () => ({
	LeitnerService: {
		getSettings: jest.fn(),
		addPhraseToBox: jest.fn(),
	},
}));

// Mock Subscription Service
jest.mock("../../subscription/service", () => ({
	isUserOnFreemium: jest.fn(),
	updateFreemiumAllocation: jest.fn(),
}));

describe("phraseBundleTriggers", () => {
	const insertOneTrigger = phraseBundleTriggers.find(t => (t as any).type === "insert-one") as any;
	const insertManyTrigger = phraseBundleTriggers.find(t => (t as any).type === "insert-many") as any;

	beforeEach(() => {
		jest.clearAllMocks();
		(isUserOnFreemium as jest.Mock<any>).mockResolvedValue(false);
	});

	describe("insert-one", () => {
		it("should add phrase to Leitner if autoEntry is true", async () => {
			const doc = { _id: "p1", refId: "u1", phrase: "hello", translation: "ahlo" };
			(LeitnerService.getSettings as jest.Mock<any>).mockResolvedValue({ autoEntry: true });

			await insertOneTrigger!.callback({ doc, queryResult: {} });

			expect(LeitnerService.getSettings).toHaveBeenCalledWith("u1");
			expect(LeitnerService.addPhraseToBox).toHaveBeenCalledWith("u1", "p1", 1);
		});

		it("should NOT add phrase to Leitner if autoEntry is false", async () => {
			const doc = { _id: "p1", refId: "u1", phrase: "hello", translation: "ahlo" };
			(LeitnerService.getSettings as jest.Mock<any>).mockResolvedValue({ autoEntry: false });

			await insertOneTrigger!.callback({ doc, queryResult: {} });

			expect(LeitnerService.addPhraseToBox).not.toHaveBeenCalled();
		});
	});

	describe("insert-many", () => {
		it("should respect autoEntry and cache settings per user (ensuring u2 is skipped)", async () => {
			const docs = [
				{ _id: "p1", refId: "u1", phrase: "p1", translation: "t1" },
				{ _id: "p2", refId: "u1", phrase: "p2", translation: "t2" },
				{ _id: "p3", refId: "u2", phrase: "p3", translation: "t3" },
				{ _id: "p4", refId: "u2", phrase: "p4", translation: "t4" },
			];

			(LeitnerService.getSettings as jest.Mock<any>)
				.mockResolvedValueOnce({ autoEntry: true })  // for u1
				.mockResolvedValueOnce({ autoEntry: false }); // for u2

			await insertManyTrigger!.callback({ docs, queryResult: [] });

			// Should call getSettings once for u1 and once for u2 (caching works)
			expect(LeitnerService.getSettings).toHaveBeenCalledTimes(2);
			expect(LeitnerService.getSettings).toHaveBeenCalledWith("u1");
			expect(LeitnerService.getSettings).toHaveBeenCalledWith("u2");

			// Should add p1, p2 (u1) but NOT p3, p4 (u2)
			expect(LeitnerService.addPhraseToBox).toHaveBeenCalledTimes(2);
			expect(LeitnerService.addPhraseToBox).toHaveBeenCalledWith("u1", "p1", 1);
			expect(LeitnerService.addPhraseToBox).toHaveBeenCalledWith("u1", "p2", 1);
			expect(LeitnerService.addPhraseToBox).not.toHaveBeenCalledWith("u2", expect.any(String), expect.any(Number));
		});
	});
});
