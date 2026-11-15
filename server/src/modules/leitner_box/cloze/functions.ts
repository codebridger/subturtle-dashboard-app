/**
 * `check-cloze-answer` (work list B-18): the server checks a typed fill-in-the-gap answer
 * with the shared checker, so the web, the phone and the extension all agree on right,
 * close ("Almost") and wrong. The client then sends that result to `submit-review`.
 *
 * Its own folder so the Leitner module files stay untouched; modular-rest loads every
 * `functions.ts` under `modules/`.
 */
import { defineFunction, getCollection } from "@modular-rest/server";
import { Types } from "mongoose";
import { DATABASE, PHRASE_COLLECTION } from "../../../config";
import { checkClozeAnswer } from "../../../languages/cloze";
import { langOf, toCode } from "../../../languages/helper";
import { fireServerEvent, SERVER_ANALYTICS_EVENTS } from "../../../utils/analytics";

const checkClozeAnswerFn = defineFunction({
  name: "check-cloze-answer",
  permissionTypes: ["user_access"],
  callback: async (args: { userId: string; phraseId: string; answer: string; language?: string }) => {
    const { userId, phraseId } = args || ({} as any);
    if (typeof userId !== "string" || !userId) throw new Error("userId is required");
    if (typeof phraseId !== "string" || !Types.ObjectId.isValid(phraseId)) throw new Error("Phrase not found");
    if (typeof args.answer !== "string") throw new Error("answer is required");

    const phrase: any = await getCollection(DATABASE, PHRASE_COLLECTION)
      .findOne({ _id: phraseId, refId: userId } as any, { phrase: 1, chunks: 1, language: 1 })
      .lean();
    if (!phrase) throw new Error("Phrase not found");

    const { result, expected, reason } = checkClozeAnswer(phrase, args.answer.slice(0, 500), toCode(args.language));
    fireServerEvent(SERVER_ANALYTICS_EVENTS.CLOZE_RESULT, userId, { language: langOf(phrase), result });
    return { result, expected, reason };
  },
});

module.exports.functions = [checkClozeAnswerFn];
