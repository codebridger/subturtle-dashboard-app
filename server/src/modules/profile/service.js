const { getCollection } = require("@modular-rest/server/src");
const { DATABASE, PROFILE_COLLECTION } = require("../../config");

module.exports.updateUserProfile = async (
  { refId, gPicture, name },
  rewrite = false
) => {
  const profileCollection = getCollection(DATABASE, PROFILE_COLLECTION);

  const isExist = await profileCollection.findOne({ refId });

  if (!isExist) {
    return profileCollection.insertMany({ refId, gPicture, name });
  }

  if (rewrite) {
    return profileCollection.updateOne({ refId }, { gPicture, name });
  }
};
