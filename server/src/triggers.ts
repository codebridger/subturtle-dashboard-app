import { CmsTrigger, getCollection } from "@modular-rest/server";
import { LeitnerService } from "./modules/leitner_box/service";
import { DATABASE, BUNDLE_COLLECTION, PHRASE_COLLECTION } from "./config";

export const authTriggers: CmsTrigger[] = [
  new CmsTrigger("insert-one", async (context) => {
    const bundleCollection = getCollection(DATABASE, BUNDLE_COLLECTION);
    const phraseCollection = getCollection(DATABASE, PHRASE_COLLECTION);

    const userId = context.queryResult._id;

    // Create the bundles and get their IDs
    const bundleData = [
      {
        refId: userId,
        title: "Everyday English",
        phrases: [],
      },
      {
        refId: userId,
        title: "Slangs",
        phrases: [],
      },
      {
        refId: userId,
        title: "Academic English",
        phrases: [],
      },
    ];

    const insertedBundles = await bundleCollection.insertMany(bundleData);

    // Define phrases for each bundle
    const phrasesData = [
      // Everyday English phrases
      {
        bundleIndex: 0,
        phrases: [
          {
            phrase: "Likewise",
            translation: "A single, polite word to show you feel the same way.",
            translation_language: "en",
            refId: userId,
            type: "normal",
          },
          {
            phrase: "As a matter of fact",
            translation:
              "A phrase used to add emphasis to a statement or introduce a surprising detail.",
            translation_language: "en",
            refId: userId,
            type: "normal",
          },
          {
            phrase: "Eventually",
            translation:
              "A useful adverb to describe something that will happen at a later time.",
            translation_language: "en",
            refId: userId,
            type: "normal",
          },
        ],
      },
      // Slang phrases
      {
        bundleIndex: 1,
        phrases: [
          {
            phrase: "Vibe",
            translation:
              "A single word describing the overall atmosphere or feeling of a person, place, or situation.",
            translation_language: "en",
            refId: userId,
            type: "normal",
          },
          {
            phrase: "No cap",
            translation:
              'A popular phrase meaning "no lie" or "for real," used to emphasize that you are telling the truth.',
            translation_language: "en",
            refId: userId,
            type: "normal",
          },
          {
            phrase: "Low-key",
            translation:
              "An adjective or adverb used to describe something that is not obvious, modest, or done with little fanfare.",
            translation_language: "en",
            refId: userId,
            type: "normal",
          },
        ],
      },
      // Academic English phrases
      {
        bundleIndex: 2,
        phrases: [
          {
            phrase: "Crucial",
            translation:
              'A single, strong adjective meaning "extremely important" or "necessary for success."',
            translation_language: "en",
            refId: userId,
            type: "normal",
          },
          {
            phrase: "To touch base",
            translation:
              "A professional idiom that means to make contact or briefly reconnect with someone.",
            translation_language: "en",
            refId: userId,
            type: "normal",
          },
          {
            phrase: "Subsequently",
            translation:
              "A formal adverb used to describe an action that happens after something else.",
            translation_language: "en",
            refId: userId,
            type: "normal",
          },
        ],
      },
    ];

    // Create phrases and update bundles
    for (const bundleData of phrasesData) {
      const bundleId = insertedBundles[bundleData.bundleIndex]._id;

      // Insert phrases for this bundle
      const insertedPhrases = await phraseCollection.insertMany(
        bundleData.phrases
      );
      const phraseIds = insertedPhrases.map((phrase) => phrase._id);

      // Update the bundle to include the phrase IDs
      await bundleCollection.updateOne(
        { _id: bundleId },
        { $push: { phrases: { $each: phraseIds } } }
      );
    }
    
    // Initialize Leitner System (for new users)
    await LeitnerService.ensureInitialized(userId);
  }),
];
