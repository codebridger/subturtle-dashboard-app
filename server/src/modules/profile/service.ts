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
	} else if (timeZone && !(isExist as any).timeZone) {
		// Only set timezone if it's not already set (ignore browser timezone on subsequent logins)
		await profileCollection.updateOne({ refId }, { $set: { timeZone } });
	}
}; 