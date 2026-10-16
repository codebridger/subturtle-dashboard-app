import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { findFromFindOne } from "../../../test-utils/find-from-find-one";
import { BoardService } from "../service";
import { getCollection } from "@modular-rest/server";

// Mock modular-rest/server
jest.mock("@modular-rest/server", () => ({
	getCollection: jest.fn(),
	Schema: class { },
	defineCollection: jest.fn(),
	Permission: class { },
}));

// A request with no language works on the active language; these profiles have none, so
// English. A new row is created with the plain code; old rows are found in code.
const EN = { language: "en" };

describe("BoardService Tests", () => {
	let mockCollection: any;
	const userId = "user_123";

	beforeEach(() => {
		jest.clearAllMocks();

		mockCollection = findFromFindOne({
			findOne: jest.fn(),
			create: jest.fn(),
			updateOne: jest.fn(),
			find: jest.fn(),
		});

		(getCollection as any).mockResolvedValue(mockCollection);
	});

	describe("refreshActivity", () => {
		it("should create a toasted activity when it doesn't exist and shouldToast is true", async () => {
			mockCollection.findOne.mockResolvedValue(null);

			await BoardService.refreshActivity(userId, "test_type", { count: 1 }, true);

			// Get-or-create is one upsert (ADR-006 point 3), keyed by user, type and language.
			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ userId, type: "test_type", ...EN },
				{ $setOnInsert: expect.objectContaining({
					state: "toasted",
					persistent: false,
					meta: { count: 1 }
				}) },
				{ upsert: true }
			);
			expect(mockCollection.create).not.toHaveBeenCalled();
		});

		it("should create an idle persistent activity when it doesn't exist and persistent is true but shouldToast is false", async () => {
			mockCollection.findOne.mockResolvedValue(null);

			await BoardService.refreshActivity(userId, "test_type", { isActive: true }, false, "singleton", undefined, true);

			// Get-or-create is one upsert (ADR-006 point 3), keyed by user, type and language.
			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ userId, type: "test_type", ...EN },
				{ $setOnInsert: expect.objectContaining({
					state: "idle",
					persistent: true,
					meta: { isActive: true }
				}) },
				{ upsert: true }
			);
			expect(mockCollection.create).not.toHaveBeenCalled();
		});

		it("should update an existing activity and preserve persistence", async () => {
			const existing = { _id: "act_1", state: "idle", persistent: true, meta: { isActive: false } };
			mockCollection.findOne.mockResolvedValue(existing);

			await BoardService.refreshActivity(userId, "test_type", { isActive: true }, false);

			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ _id: "act_1" },
				expect.objectContaining({
					$set: expect.objectContaining({
						persistent: true,
						meta: expect.objectContaining({ isActive: true })
					})
				})
			);
		});

		it("should upgrade an existing activity to persistent if requested", async () => {
			const existing = { _id: "act_1", state: "idle", persistent: false, meta: {} };
			mockCollection.findOne.mockResolvedValue(existing);

			await BoardService.refreshActivity(userId, "test_type", { isActive: true }, false, "singleton", undefined, true);

			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ _id: "act_1" },
				expect.objectContaining({
					$set: expect.objectContaining({
						persistent: true
					})
				})
			);
		});

		// Use-case: A user finishes a review session. The activity card was "toasted" (showing as due),
		// but now that due items are zero, meta.isActive becomes false. 
		// The card should move to "idle" so it's hidden from the board.
		it("should clear toasted state if isActive is explicitly false", async () => {
			const existing = { _id: "act_1", state: "toasted", persistent: true, meta: { isActive: true } };
			mockCollection.findOne.mockResolvedValue(existing);

			await BoardService.refreshActivity(userId, "test_type", { isActive: false }, false);

			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ _id: "act_1" },
				expect.objectContaining({
					$set: expect.objectContaining({
						state: "idle",
						meta: expect.objectContaining({ isActive: false })
					})
				})
			);
		});
	});

	describe("getBoard", () => {
		it("should query for either toasted or (persistent and active) activities", async () => {
			await BoardService.getBoard(userId);

			// The language is picked in code, so the query has none.
			expect(mockCollection.find).toHaveBeenCalledWith({
				userId,
				$or: [
					{ state: "toasted" },
					{ persistent: true, "meta.isActive": true }
				]
			});
		});
	});

	describe("consumeActivity", () => {
		it("should set state to idle", async () => {
			mockCollection.findOne.mockResolvedValue({ _id: "act_1", type: "test_type", state: "toasted" });
			mockCollection.updateMany = jest.fn();
			await BoardService.consumeActivity(userId, "test_type");

			expect(mockCollection.updateMany).toHaveBeenCalledWith(
				{ _id: { $in: ["act_1"] } },
				expect.objectContaining({
					$set: expect.objectContaining({ state: "idle" })
				})
			);
		});
	});
});
