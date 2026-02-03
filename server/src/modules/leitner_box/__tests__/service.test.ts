import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { LeitnerService } from "../service";
import { getCollection } from "@modular-rest/server";

import { ScheduleService } from "../../schedule/service";
import { DATABASE, PROFILE_COLLECTION } from "../../../config";

// Mock modular-rest/server
jest.mock("@modular-rest/server", () => ({
	getCollection: jest.fn(),
	Schema: class { },
	defineCollection: jest.fn(),
	Permission: class { },
	schemas: { file: {} },
}));

// Mock ScheduleService
jest.mock("../../schedule/service", () => ({
	ScheduleService: {
		createJob: jest.fn(),
		register: jest.fn(),
	},
}));

jest.mock("../../../config", () => ({
	DATABASE: "db",
	PROFILE_COLLECTION: "profile",
	DATABASE_LEITNER: "leitner_db",
	LEITNER_SYSTEM_COLLECTION: "leitner_col",
	PHRASE_COLLECTION: "phrase",
	BUNDLE_COLLECTION: "bundle",
}));

describe("LeitnerService", () => {
	let mockCollection: any;
	let mockProfileCollection: any;

	beforeEach(() => {
		jest.clearAllMocks();
		mockCollection = {
			findOne: jest.fn(),
			create: jest.fn(),
			updateOne: jest.fn(),
		};
		// Default mock for getCollection to return generic collection
		(getCollection as any).mockImplementation((db: string, col: string) => {
			if (col === PROFILE_COLLECTION) {
				if (!mockProfileCollection) {
					mockProfileCollection = {
						findOne: jest.fn(),
					};
				}
				return Promise.resolve(mockProfileCollection);
			}
			return Promise.resolve(mockCollection);
		});
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

	describe("syncScheduledJob (via updateSettings)", () => {
		it("should schedule job with user timezone from profile", async () => {
			const userId = "user1";
			const timeZone = "Asia/Tokyo";
			const settings = { reviewInterval: 1, reviewHour: 9 };

			// Mock existing system
			// We need to simulate the DB update: 
			// 1. First call (updateSettings -> getSystem) returns old settings.
			// 2. Second call (syncScheduledJob -> getSettings -> getSystem) should return NEW settings (reviewHour: 10).
			mockCollection.findOne
				.mockResolvedValueOnce({ _id: "sys1", userId, settings }) // First call
				.mockResolvedValueOnce({ _id: "sys1", userId, settings: { ...settings, reviewHour: 10 } }); // Second call

			// Mock profile with timezone
			mockProfileCollection = {
				findOne: jest.fn<any>().mockResolvedValue({ refId: userId, timeZone }),
			};

			// We use updateSettings to trigger syncScheduledJob since it's private
			await LeitnerService.updateSettings(userId, { reviewHour: 10 });

			expect(ScheduleService.createJob).toHaveBeenCalledWith(
				`leitner-review-${userId}`,
				"leitner-review-job",
				expect.objectContaining({
					timeZone: timeZone,
					cronExpression: expect.stringContaining("10"), // 10 from update
				})
			);
		});

		it("should use default setting if no timezone set", async () => {
			const userId = "user2";
			// Mock existing system
			mockCollection.findOne.mockResolvedValue({
				_id: "sys2",
				userId,
				settings: { reviewInterval: 1, reviewHour: 9 }
			});

			// Mock profile WITHOUT timezone
			mockProfileCollection = {
				findOne: jest.fn<any>().mockResolvedValue({ refId: userId }),
			};

			await LeitnerService.updateSettings(userId, { reviewHour: 10 });

			expect(ScheduleService.createJob).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.objectContaining({
					timeZone: undefined,
				})
			);
		});
	});
});
