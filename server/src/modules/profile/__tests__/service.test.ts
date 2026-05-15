import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { updateUserProfile } from "../service";
import { getCollection } from "@modular-rest/server";

// Mock modular-rest/server
jest.mock("@modular-rest/server", () => ({
	getCollection: jest.fn(),
	Schema: class { },
	defineCollection: jest.fn(),
}));

jest.mock("../../../config", () => ({
	DATABASE: "test_db",
	PROFILE_COLLECTION: "profile_col",
}));

describe("ProfileService", () => {
	let mockCollection: any;

	beforeEach(() => {
		jest.clearAllMocks();
		mockCollection = {
			findOne: jest.fn(),
			insertMany: jest.fn(),
			updateOne: jest.fn(),
		};
		(getCollection as any).mockReturnValue(mockCollection);
	});

	describe("updateUserProfile", () => {
		const refId = "user123";
		const gPicture = "pic.jpg";
		const name = "Test User";

		it("should create a new profile with timezone if it does not exist", async () => {
			mockCollection.findOne.mockResolvedValue(null);

			await updateUserProfile({ refId, gPicture, name, timeZone: "UTC" });

			expect(mockCollection.insertMany).toHaveBeenCalledWith({
				refId,
				gPicture,
				name,
				timeZone: "UTC",
			});
		});

		it("should update profile with new timezone if full rewrite is requested", async () => {
			mockCollection.findOne.mockResolvedValue({ refId, timeZone: "Old/Zone" });

			await updateUserProfile({ refId, gPicture, name, timeZone: "New/Zone" }, true);

			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ refId },
				{ gPicture, name, timeZone: "New/Zone" }
			);
		});

		it("should set timezone if user exists but has no timezone set (login flow)", async () => {
			// simulate existing user with no timezone but same gPicture (so gPicture refresh doesn't fire)
			mockCollection.findOne.mockResolvedValue({ refId, gPicture });

			await updateUserProfile({ refId, gPicture, name, timeZone: "New/Zone" }, false);

			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ refId },
				{ $set: { timeZone: "New/Zone" } }
			);
		});

		it("should NOT update timezone if user already has one (login flow)", async () => {
			// simulate valid existing timezone and matching gPicture
			mockCollection.findOne.mockResolvedValue({ refId, gPicture, timeZone: "Existing/Zone" });

			await updateUserProfile({ refId, gPicture, name, timeZone: "New/Zone" }, false);

			// Should NOT call updateOne for timezone
			expect(mockCollection.updateOne).not.toHaveBeenCalledWith(
				{ refId },
				{ $set: { timeZone: "New/Zone" } }
			);
			expect(mockCollection.updateOne).not.toHaveBeenCalled();
		});

		it("should not update timezone if none provided", async () => {
			mockCollection.findOne.mockResolvedValue({ refId, gPicture, timeZone: "Existing/Zone" });

			await updateUserProfile({ refId, gPicture, name }, false);

			expect(mockCollection.updateOne).not.toHaveBeenCalled();
		});

		it("should update gPicture on login when Google sends a different URL", async () => {
			mockCollection.findOne.mockResolvedValue({ refId, gPicture: "old.jpg", timeZone: "Existing/Zone" });

			await updateUserProfile({ refId, gPicture: "new.jpg", name }, false);

			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ refId },
				{ $set: { gPicture: "new.jpg" } }
			);
		});

		it("should backfill gPicture on login when user has none", async () => {
			mockCollection.findOne.mockResolvedValue({ refId, timeZone: "Existing/Zone" });

			await updateUserProfile({ refId, gPicture, name }, false);

			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ refId },
				{ $set: { gPicture } }
			);
		});
	});
});
