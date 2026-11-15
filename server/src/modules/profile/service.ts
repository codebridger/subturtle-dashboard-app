import { getCollection } from "@modular-rest/server";
import { DATABASE, PROFILE_COLLECTION } from "../../config";

interface UserProfile {
	refId: string;
	gPicture?: string;
	name?: string;
	timeZone?: string;
}

export const updateUserProfile = async (
	{ refId, gPicture, name, timeZone }: UserProfile,
	rewrite = false
): Promise<void> => {
	const profileCollection = getCollection(DATABASE, PROFILE_COLLECTION);

	const isExist = await profileCollection.findOne({ refId });

	if (!isExist) {
		await profileCollection.insertMany({ refId, gPicture, name, timeZone });
		return;
	}

	if (rewrite) {
		await profileCollection.updateOne({ refId }, { gPicture, name, timeZone });
		return;
	}

	const existing = isExist as { timeZone?: string; gPicture?: string; name?: string };
	const updates: Record<string, string> = {};

	// Always refresh gPicture when Google sends a new/different URL — covers both
	// the never-set backfill and the user-changed-their-Google-avatar case.
	if (gPicture && gPicture !== existing.gPicture) {
		updates.gPicture = gPicture;
	}

	// The sign-up trigger creates the profile first (to mark first run, see triggers.ts), so
	// a new account's name arrives here as an update.
	if (name && !existing.name) {
		updates.name = name;
	}

	// Only set timezone if it's not already set (ignore browser timezone on subsequent logins)
	if (timeZone && !existing.timeZone) {
		updates.timeZone = timeZone;
	}

	if (Object.keys(updates).length > 0) {
		await profileCollection.updateOne({ refId }, { $set: updates });
	}
}; 