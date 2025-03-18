const { defineFunction, getCollection } = require("@modular-rest/server");
const {
  DATABASE,
  PHRASE_COLLECTION,
  BUNDLE_COLLECTION,
} = require("../../config");

const removeBundle = defineFunction({
  name: "removeBundle",
  permissionTypes: ["user_access"],
  callback: async ({ _id, refId }) => {
    const phraseBundleCollection = getCollection(DATABASE, BUNDLE_COLLECTION);
    const phraseCollection = getCollection(DATABASE, PHRASE_COLLECTION);

    // remove bundle
    const bundle = await phraseBundleCollection.findOne({ _id });

    if (!bundle) {
      throw new Error("Bundle not found");
    }

    for (const phraseId of bundle.phrases) {
      // check if phrase is used in other bundles
      const otherBundle = await phraseBundleCollection.countDocuments({
        phrases: { $in: [phraseId] },
        refId: refId,
      });

      if (otherBundle > 1) {
        continue;
      }

      // remove phrase
      await phraseCollection.deleteOne({ _id: phraseId });
    }

    await phraseBundleCollection.deleteOne({ _id });
  },
});

module.exports.functions = [removeBundle];
