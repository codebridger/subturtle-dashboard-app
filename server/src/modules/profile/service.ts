import { getCollection } from "@modular-rest/server";
import { DATABASE, PROFILE_COLLECTION } from "../../config";

interface UserProfile {
	refId: string;
	gPicture?: string;
	name?: string;
}

export const updateUserProfile = async (
	{ refId, gPicture, name }: UserProfile,
	rewrite = false
): Promise<void> => {
	const profileCollection = getCollection(DATABASE, PROFILE_COLLECTION);

	const isExist = await profileCollection.findOne({ refId });

	if (!isExist) {
		await profileCollection.insertMany({ refId, gPicture, name });
		return;
	}

	if (rewrite) {
		await profileCollection.updateOne({ refId }, { gPicture, name });
	}
}; 