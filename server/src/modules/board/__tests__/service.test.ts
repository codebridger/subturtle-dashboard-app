import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { BoardService } from "../service";
import { getCollection } from "@modular-rest/server";

// Mock modular-rest/server
jest.mock("@modular-rest/server", () => ({
	getCollection: jest.fn(),
	Schema: class { },
	defineCollection: jest.fn(),
	Permission: class { },
}));

describe("BoardService Tests", () => {
	let mockCollection: any;
	const userId = "user_123";

	beforeEach(() => {
		jest.clearAllMocks();

		mockCollection = {
			findOne: jest.fn(),
			create: jest.fn(),
			updateOne: jest.fn(),
			find: jest.fn(),
		};

		(getCollection as any).mockResolvedValue(mockCollection);
	});

	describe("refreshActivity", () => {
		it("should create a toasted activity when it doesn't exist and shouldToast is true", async () => {
			mockCollection.findOne.mockResolvedValue(null);

			await BoardService.refreshActivity(userId, "test_type", { count: 1 }, true);

			expect(mockCollection.create).toHaveBeenCalledWith(expect.objectContaining({
				userId,
				type: "test_type",
				state: "toasted",
				persistent: false,
				meta: { count: 1 }
			}));
		});

		it("should create an idle persistent activity when it doesn't exist and persistent is true but shouldToast is false", async () => {
			mockCollection.findOne.mockResolvedValue(null);

			await BoardService.refreshActivity(userId, "test_type", { isActive: true }, false, "singleton", undefined, true);

			expect(mockCollection.create).toHaveBeenCalledWith(expect.objectContaining({
				userId,
				type: "test_type",
				state: "idle",
				persistent: true,
				meta: { isActive: true }
			}));
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
	});

	describe("getBoard", () => {
		it("should query for either toasted or (persistent and active) activities", async () => {
			await BoardService.getBoard(userId);

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
			await BoardService.consumeActivity(userId, "test_type");

			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ userId, type: "test_type" },
				expect.objectContaining({
					$set: expect.objectContaining({ state: "idle" })
				})
			);
		});
	});
});
