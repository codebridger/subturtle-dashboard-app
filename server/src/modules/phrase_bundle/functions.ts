import { defineFunction, getCollection } from "@modular-rest/server";
import { DATABASE, PHRASE_COLLECTION, BUNDLE_COLLECTION } from "../../config";
import {
  isUserOnFreemium,
  updateFreemiumAllocation,
} from "../subscription/service";

// Import the PhraseSchema type from the database module
import { PhraseSchema } from "./db";
import { normaliseSourceUrl } from "../translation/url-normalise";
import { openRouter } from "../../utils/openrouter";
import { TRANSLATION_MODELS } from "../../utils/openrouter-models";
import { z } from "zod";

interface RemoveBundleParams {
  _id: string;
  refId: string;
}

interface RemovePhraseParams {
  phraseId: string;
  bundleId: string;
  refId: string;
}

// Use PhraseSchema type and add bundleIds for the function parameters
interface CreatePhraseParams extends Omit<PhraseSchema, "refId"> {
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
    type = "normal", // Default to normal type
    context,
    direction,
    language_info,
    linguistic_data,
    chunks,
    sourceUrl,
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

    // Check if phrase already exists. Match by phrase + type (+ owner) only:
    // the translation can vary between AI calls, so including it would create
    // duplicate phrase docs for the same saved text.
    const existingPhrase = await phraseCollection.findOne({
      refId: refId,
      phrase: phrase.trim(),
      type: type,
    });

    let phraseId: string;
    let isNewPhrase = false;

    if (existingPhrase) {
      // Use existing phrase
      phraseId = existingPhrase._id;
    } else {
      // Create new phrase document based on type
      const newPhraseDoc: any = {
        phrase: phrase.trim(),
        translation: translation.trim(),
        translation_language: translation_language?.trim(),
        refId,
        type,
      };

      // Add linguistic-specific fields if type is linguistic
      if (type === "linguistic") {
        if (context) newPhraseDoc.context = context;
        if (direction) newPhraseDoc.direction = direction;
        if (language_info) newPhraseDoc.language_info = language_info;
        if (linguistic_data) newPhraseDoc.linguistic_data = linguistic_data;
        if (chunks && chunks.length) newPhraseDoc.chunks = chunks;
        if (sourceUrl) newPhraseDoc.sourceUrl = normaliseSourceUrl(sourceUrl);
      }

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
        type,
        ...(type === "linguistic" && {
          context,
          direction,
          language_info,
          linguistic_data,
        }),
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

interface BundleSuggestionParams {
  refId: string;
  pageTitle?: string;
  pageUrl?: string;
}

const BundleNameSchema = z.object({
  bundle_name: z
    .string()
    .describe(
      "A short, clean bundle name derived from the page title, generalised so multiple episodes/chapters/articles from the same source group together (e.g. 'Stranger Things S2E5 — Netflix' -> 'Stranger Things S2')."
    ),
});

/**
 * Suggest which bundle the save modal should default to for a given page+user.
 * Called once per page (first time the word detail opens) for logged-in users.
 *
 * - If the user already saved a phrase from this page (matched by normalised
 *   source URL), returns that bundle and no AI call is made.
 * - Otherwise asks the model for a short bundle name derived from the title.
 */
const getBundleSuggestionForPage = defineFunction({
  name: "getBundleSuggestionForPage",
  permissionTypes: ["user_access"],
  callback: async ({
    refId,
    pageTitle,
    pageUrl,
  }: BundleSuggestionParams): Promise<{
    matchedBundle: { _id: string; title: string } | null;
    suggestedName: string | null;
  }> => {
    const phraseCollection = getCollection<any>(DATABASE, PHRASE_COLLECTION);
    const phraseBundleCollection = getCollection<any>(
      DATABASE,
      BUNDLE_COLLECTION
    );

    // 1. Existing bundle from this same page (matched by normalised URL).
    const sourceUrl = normaliseSourceUrl(pageUrl || "");
    if (sourceUrl) {
      const phrases = await phraseCollection.find(
        { refId, sourceUrl },
        { _id: 1 }
      );
      const phraseIds = (phrases || []).map((p: any) => p._id);

      if (phraseIds.length) {
        const bundle = await phraseBundleCollection.findOne(
          { refId, phrases: { $in: phraseIds } },
          {},
          { sort: { _id: -1 } }
        );
        if (bundle) {
          return {
            matchedBundle: { _id: String(bundle._id), title: bundle.title },
            suggestedName: null,
          };
        }
      }
    }

    // 2. No existing bundle: ask the model for a short, generalised name.
    if (!pageTitle || !pageTitle.trim()) {
      return { matchedBundle: null, suggestedName: null };
    }

    try {
      const result = await openRouter.createStructuredOutputWithZod<{
        bundle_name: string;
      }>({
        options: {
          models: TRANSLATION_MODELS,
          messages: [
            {
              role: "system",
              content:
                "You name vocabulary bundles. Given a web page title, produce a short, clean bundle name that generalises across multiple episodes/chapters/articles from the same source. Drop site suffixes, episode numbers and noise.",
            },
            { role: "user", content: `Page title: "${pageTitle}"` },
          ],
          temperature: 0,
          max_tokens: 60,
        },
        zodSchema: BundleNameSchema,
        schemaName: "bundle_name",
        strict: true,
      });

      const name = result.bundle_name?.trim();
      if (!name) return { matchedBundle: null, suggestedName: null };

      // If a bundle with this exact name already exists, return it as a match
      // so the client preselects it instead of trying to re-create it.
      const existingByName = await phraseBundleCollection.findOne({
        refId,
        title: name,
      });
      if (existingByName) {
        return {
          matchedBundle: {
            _id: String(existingByName._id),
            title: existingByName.title,
          },
          suggestedName: null,
        };
      }

      return { matchedBundle: null, suggestedName: name };
    } catch (error: unknown) {
      console.error("Bundle suggestion error:", error);
      // Naming is best-effort; never block the save flow.
      return { matchedBundle: null, suggestedName: null };
    }
  },
});

module.exports.functions = [
  removeBundle,
  removePhrase,
  createPhrase,
  updatePhrase,
  getBundleSuggestionForPage,
];
