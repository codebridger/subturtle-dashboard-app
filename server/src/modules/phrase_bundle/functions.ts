import { defineFunction, getCollection } from "@modular-rest/server";
import { DATABASE, PHRASE_COLLECTION, BUNDLE_COLLECTION } from "../../config";
import {
  isUserOnFreemium,
  updateFreemiumAllocation,
} from "../subscription/service";

interface RemoveBundleParams {
  _id: string;
  refId: string;
}

interface RemovePhraseParams {
  phraseId: string;
  bundleId: string;
  refId: string;
}

interface CreatePhraseParams {
  phrase: string;
  translation: string;
  translation_language?: string;
  bundleIds: string[];
  refId: string;
}

interface UpdatePhraseParams {
  phraseId: string;
  refId: string;
  update: { [key: string]: any };
}

const removeBundle = defineFunction({
  name: "removeBundle",
  permissionTypes: ["user_access"],
  callback: async ({ _id, refId }: RemoveBundleParams): Promise<void> => {
    const phraseBundleCollection = getCollection<any>(
      DATABASE,
      BUNDLE_COLLECTION
    );
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

const removePhrase = defineFunction({
  name: "removePhrase",
  permissionTypes: ["user_access"],
  callback: async ({
    phraseId,
    bundleId,
    refId,
  }: RemovePhraseParams): Promise<void> => {
    const phraseBundleCollection = getCollection<any>(
      DATABASE,
      BUNDLE_COLLECTION
    );
    const phraseCollection = getCollection(DATABASE, PHRASE_COLLECTION);

    // Verify bundle exists and user has access
    const bundle = await phraseBundleCollection.findOne({
      _id: bundleId,
      refId: refId,
    });

    if (!bundle) {
      throw new Error("Bundle not found or access denied");
    }

    // Verify phrase exists and user has access
    const phrase = await phraseCollection.findOne({
      _id: phraseId,
      refId: refId,
    });

    if (!phrase) {
      throw new Error("Phrase not found or access denied");
    }

    // Remove phrase from bundle
    await phraseBundleCollection.updateOne(
      { _id: bundleId, refId: refId },
      { $pull: { phrases: phraseId } }
    );

    // Check if phrase is used in other bundles
    const otherBundlesCount = await phraseBundleCollection.countDocuments({
      phrases: { $in: [phraseId] },
      refId: refId,
    });

    // If phrase is not used in any other bundles, delete it
    if (otherBundlesCount === 0) {
      await phraseCollection.deleteOne({ _id: phraseId, refId: refId });

      // update freemium allocation
      const user_id = refId;
      const isFreemium = await isUserOnFreemium(user_id);

      if (isFreemium) {
        await updateFreemiumAllocation({
          userId: user_id,
          increment: { allowed_save_words_used: -1 },
        });
      }
    }
  },
});

const createPhrase = defineFunction({
  name: "createPhrase",
  permissionTypes: ["user_access"],
  callback: async ({
    phrase,
    translation,
    translation_language,
    bundleIds,
    refId,
  }: CreatePhraseParams): Promise<any> => {
    const phraseBundleCollection = getCollection<any>(
      DATABASE,
      BUNDLE_COLLECTION
    );
    const phraseCollection = getCollection(DATABASE, PHRASE_COLLECTION);

    // Verify all bundles exist and user has access
    const bundlesCount = await phraseBundleCollection.countDocuments({
      _id: { $in: bundleIds },
      refId: refId,
    });

    if (bundlesCount !== bundleIds.length) {
      throw new Error("One or more bundles not found or access denied");
    }

    // Check if phrase already exists
    const existingPhrase = await phraseCollection.findOne({
      refId: refId,
      phrase: phrase.trim(),
      translation: translation.trim(),
    });

    let phraseId: string;
    let isNewPhrase = false;

    if (existingPhrase) {
      // Use existing phrase
      phraseId = existingPhrase._id;
    } else {
      // Create new phrase document
      const newPhraseDoc = {
        phrase: phrase.trim(),
        translation: translation.trim(),
        translation_language: translation_language?.trim(),
        refId,
      };

      // Insert new phrase
      const insertedPhrases = await phraseCollection.insertMany([newPhraseDoc]);

      if (!insertedPhrases || insertedPhrases.length === 0) {
        throw new Error("Failed to create phrase");
      }

      phraseId = insertedPhrases[0]._id;
      isNewPhrase = true;

      // Update freemium allocation only for new phrases
      const user_id = refId;
      const isFreemium = await isUserOnFreemium(user_id);

      if (isFreemium) {
        await updateFreemiumAllocation({
          userId: user_id,
          increment: { allowed_save_words_used: 1 },
        });
      }
    }

    // Update all bundles to include the phrase (if not already present)
    await Promise.all(
      bundleIds.map((bundleId) =>
        phraseBundleCollection.updateOne(
          {
            _id: bundleId,
            refId: refId,
            phrases: { $ne: phraseId }, // Only add if not already present
          },
          { $push: { phrases: phraseId } }
        )
      )
    );

    // Return the phrase (either existing or newly created)
    return (
      existingPhrase || {
        _id: phraseId,
        phrase: phrase.trim(),
        translation: translation.trim(),
        translation_language: translation_language?.trim(),
        refId,
      }
    );
  },
});

const updatePhrase = defineFunction({
  name: "updatePhrase",
  permissionTypes: ["user_access"],
  callback: async ({
    phraseId,
    refId,
    update,
  }: UpdatePhraseParams): Promise<void> => {
    const phraseCollection = getCollection(DATABASE, PHRASE_COLLECTION);

    // Verify phrase exists and user has access
    const phrase = await phraseCollection.findOne({
      _id: phraseId,
      refId: refId,
    });

    if (!phrase) {
      throw new Error("Phrase not found or access denied");
    }

    // Update the phrase
    await phraseCollection.updateOne(
      { _id: phraseId, refId: refId },
      { $set: update }
    );
  },
});

module.exports.functions = [
  removeBundle,
  removePhrase,
  createPhrase,
  updatePhrase,
];
