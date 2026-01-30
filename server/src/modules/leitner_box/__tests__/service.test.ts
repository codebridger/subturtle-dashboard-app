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

describe("LeitnerService", () => {
	let mockCollection: any;

	beforeEach(() => {
		jest.clearAllMocks();
		mockCollection = {
			findOne: jest.fn(),
			create: jest.fn(),
			updateOne: jest.fn(),
		};
		(getCollection as any).mockResolvedValue(mockCollection);
	});

	describe("getSettings", () => {
		it("should return default settings for a new user (no system doc)", async () => {
			mockCollection.findOne.mockResolvedValue(null);

			const settings = await LeitnerService.getSettings("user1");

			expect(settings).toEqual(LeitnerService.DEFAULT_SETTINGS);
		});

		it("should return stored settings for an existing user", async () => {
			const storedSettings = {
				dailyLimit: 10,
				totalBoxes: 3,
				boxIntervals: [1, 2, 3],
				boxQuotas: [10, 10, 10],
				autoEntry: false,
			};
			mockCollection.findOne.mockResolvedValue({ settings: storedSettings });

			const settings = await LeitnerService.getSettings("user1");

			expect(settings).toEqual(storedSettings);
		});
	});

	describe("ensureInitialized", () => {
		it("should create a new system doc if none exists", async () => {
			mockCollection.findOne.mockResolvedValue(null);

			await LeitnerService.ensureInitialized("user1");

			expect(mockCollection.create).toHaveBeenCalledWith(expect.objectContaining({
				userId: "user1",
				settings: expect.objectContaining({ autoEntry: true }),
				items: [],
			}));
		});

		it("should not create a new system doc if one already exists", async () => {
			mockCollection.findOne.mockResolvedValue({ userId: "user1" });

			await LeitnerService.ensureInitialized("user1");

			expect(mockCollection.create).not.toHaveBeenCalled();
		});
	});
});
