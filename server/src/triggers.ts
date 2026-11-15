import { CmsTrigger, getCollection } from "@modular-rest/server";
import { DATABASE, PROFILE_COLLECTION } from "./config";

export const authTriggers: CmsTrigger[] = [
  new CmsTrigger("insert-one", async (context) => {
    const userId = String(context.queryResult._id);

    // First run (B-07, Q11): no English seed at sign-up. A new account picks its language
    // first; that language's starter pack is offered once it is added. Accounts from before
    // multilingual have no onboardingState and read as English (LanguageService).
    await getCollection(DATABASE, PROFILE_COLLECTION).updateOne(
      { refId: userId },
      { $set: { onboardingState: "needs_language" }, $setOnInsert: { refId: userId } },
      { upsert: true }
    );
    // No Leitner document yet: add-language creates the one for the language picked.
  }),
];
