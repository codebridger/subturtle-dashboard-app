/**
 * Save-assistant conversations (the mobile "Save a phrase" chat).
 *
 * The server owns the history: the client sends only the new message, or the
 * candidate phrase it picked. Translation work reuses the shared translation
 * service (`getDetailedTranslation`, `getTranslationAdvice`).
 *
 * Every AI call is gated by `checkCreditAllocation` and billed with
 * `recordUsage`, like `live_session_text`. A call that fails at the provider
 * stores nothing and bills nothing.
 *
 * Functions (all `user_access`): createSaveSession, saveSessionTurn,
 * attachSavedPhrase, listSaveSessions, getSaveSession, deleteSaveSession.
 * See readme.md for inputs and outputs.
 */
import { defineFunction, getCollection } from "@modular-rest/server";
import { Types } from "mongoose";
import {
  checkCreditAllocation,
  getTextChatMessageCap,
  recordUsage,
} from "../subscription/service";
import { EntitlementLimitError } from "../subscription/enforcement";
import { AI_CREDIT_EXHAUSTED_CODE } from "../subscription/config";
import {
  getDetailedTranslation,
  getTranslationAdvice,
} from "../translation/service";
import type { DetailedPhraseDataType } from "../translation/types";
import {
  BUNDLE_COLLECTION,
  DATABASE,
  PHRASE_COLLECTION,
  SAVE_ASSISTANT_SESSION_COLLECTION,
} from "../../config";
import {
  ADVICE_PROMPT_OVERHEAD_TOKENS,
  DEFAULT_MESSAGE_CAP,
  DETAILED_PROMPT_OVERHEAD_TOKENS,
  ESTIMATE_MODEL,
  LIST_DEFAULT_LIMIT,
  LIST_MAX_LIMIT,
  SAVE_ASSISTANT_SERVICE_TYPE,
  SAVE_ASSISTANT_UNAVAILABLE_CODE,
  WRAP_UP_BUFFER,
} from "./config";
import {
  buildCandidates,
  costInputs,
  escapeRegex,
  estimateUsage,
  findCandidate,
  makeMessage,
  makeTitle,
  mergeCandidates,
  usageIncrement,
} from "./utils";
import type {
  SaveSessionCandidate,
  SaveSessionRecordType,
  SaveSessionSource,
  SaveSessionUsage,
} from "./types";

const sessions = () =>
  getCollection<SaveSessionRecordType>(
    DATABASE,
    SAVE_ASSISTANT_SESSION_COLLECTION
  );

/**
 * The caller guard pins `userId` to the token only when the client sends it.
 * Without it every owner filter below would match nothing (or worse), so stop.
 */
function requireUser(userId: unknown): string {
  if (typeof userId !== "string" || !userId) {
    throw new Error("userId is required");
  }
  return userId;
}

function requireText(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

/** Load a session the user owns. Another user's session reads as "not found". */
async function loadSession(
  sessionId: unknown,
  userId: string
): Promise<SaveSessionRecordType> {
  if (typeof sessionId !== "string" || !Types.ObjectId.isValid(sessionId)) {
    throw new Error("Save session not found");
  }
  const record = await sessions()
    .findOne({ _id: sessionId, refId: userId } as any)
    .lean();
  if (!record) throw new Error("Save session not found");
  return record as unknown as SaveSessionRecordType;
}

/** Same gate and message as live_session_text. "Credit" stays inside the code. */
async function assertBudget(userId: string) {
  const { allowedToProceed } = await checkCreditAllocation({
    userId,
    minCredits: 1,
  });
  if (!allowedToProceed) {
    throw new Error(
      `${AI_CREDIT_EXHAUSTED_CODE}: AI features are paused — this month's AI budget is used up.`
    );
  }
}

/** Run an AI call; a provider failure becomes SAVE_ASSISTANT_UNAVAILABLE. */
async function callProvider<T>(label: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err: any) {
    console.error(
      `[save_assistant] ${SAVE_ASSISTANT_UNAVAILABLE_CODE} in ${label}: ${
        err?.message || err
      }`
    );
    const error: any = new Error(
      `${SAVE_ASSISTANT_UNAVAILABLE_CODE}: the assistant could not answer. Please try again.`
    );
    error.code = SAVE_ASSISTANT_UNAVAILABLE_CODE;
    throw error;
  }
}

async function bill(userId: string, usage: SaveSessionUsage, details: any) {
  await recordUsage({
    userId,
    serviceType: SAVE_ASSISTANT_SERVICE_TYPE,
    costInputs: costInputs(usage),
    modelUsed: ESTIMATE_MODEL.id,
    details: { ...details, estimated: true },
  });
}

/**
 * Block a new user message at the cap and say when to wrap up. The cap is the
 * tier's text-chat message cap, or DEFAULT_MESSAGE_CAP when the tier has none.
 */
async function checkMessageCap(
  userId: string,
  record: SaveSessionRecordType
): Promise<boolean> {
  const cap = (await getTextChatMessageCap(userId)) ?? DEFAULT_MESSAGE_CAP;
  const used = (record.messages || []).filter((m) => m.role === "user").length;
  if (used >= cap) {
    throw new EntitlementLimitError("text_chat_messages_per_chat", cap, used);
  }
  return used + 1 >= cap - WRAP_UP_BUFFER;
}

/** The text the conversation is about: the user's first message. */
function originalText(record: SaveSessionRecordType): string {
  return (
    (record.messages || []).find((m) => m.role === "user")?.text ||
    record.title ||
    ""
  );
}

const createSaveSession = defineFunction({
  name: "createSaveSession",
  permissionTypes: ["user_access"],
  callback: async function (context: {
    userId: string;
    message: string;
    source?: SaveSessionSource;
    sourceLanguage?: string;
    targetLanguage: string;
  }) {
    const userId = requireUser(context.userId);
    const message = requireText(context.message, "message");
    const targetLanguage = requireText(context.targetLanguage, "targetLanguage");
    // "" lets the model detect the language, as translateWithContext does for "auto".
    let sourceLanguage = (context.sourceLanguage || "").trim();
    if (sourceLanguage.toLowerCase() === "auto") sourceLanguage = "";

    await assertBudget(userId);

    const translation = await callProvider("createSaveSession", () =>
      getDetailedTranslation({
        phrase: message,
        context: message,
        sourceLanguage,
        targetLanguage,
      })
    );

    const usage = estimateUsage(
      DETAILED_PROMPT_OVERHEAD_TOKENS,
      [message, message],
      translation
    );
    await bill(userId, usage, { action: "create" });

    const candidates = buildCandidates(message, translation);
    const userMessage = makeMessage({ role: "user", kind: "text", text: message });
    const translationMessage = makeMessage({
      role: "assistant",
      kind: "translation",
      text: candidates[0].text,
      payload: translation,
    });

    const record = await sessions().create({
      refId: userId,
      title: makeTitle(message),
      source: context.source,
      sourceLanguage: sourceLanguage || translation.language_info?.source,
      targetLanguage,
      messages: [userMessage, translationMessage],
      candidates,
      savedPhraseIds: [],
      savedPhrases: [],
      savedCount: 0,
      lastMessageAt: translationMessage.createdAt,
      usage,
    } as any);

    return {
      sessionId: String(record._id),
      candidates,
      translation,
      messageId: translationMessage.id,
    };
  },
});

const saveSessionTurn = defineFunction({
  name: "saveSessionTurn",
  permissionTypes: ["user_access"],
  callback: async function (context: {
    userId: string;
    sessionId: string;
    message?: string;
    pick?: string;
  }) {
    const userId = requireUser(context.userId);
    const hasMessage = context.message !== undefined;
    const hasPick = context.pick !== undefined;
    if (hasMessage === hasPick) {
      throw new Error("Send either message or pick");
    }

    const record = await loadSession(context.sessionId, userId);
    const wrapUp = await checkMessageCap(userId, record);
    const filter = { _id: record._id, refId: userId } as any;
    const original = originalText(record);
    const sourceLanguage = record.sourceLanguage || "";
    const targetLanguage = record.targetLanguage;

    if (hasPick) {
      const pick = requireText(context.pick, "pick");
      const candidate = findCandidate(record.candidates || [], pick);
      if (!candidate) throw new Error("Pick one of the offered phrases");

      // Reuse a translation already fetched for this phrase in this session.
      const cached = [...(record.messages || [])]
        .reverse()
        .find(
          (m) =>
            m.kind === "translation" &&
            (m.text || "").trim().toLowerCase() ===
              candidate.text.trim().toLowerCase()
        );

      let translation: DetailedPhraseDataType;
      let usage: SaveSessionUsage | undefined;
      if (cached) {
        translation = cached.payload as DetailedPhraseDataType;
      } else {
        await assertBudget(userId);
        translation = await callProvider("saveSessionTurn:pick", () =>
          getDetailedTranslation({
            phrase: candidate.text,
            context: original,
            sourceLanguage,
            targetLanguage,
          })
        );
        usage = estimateUsage(
          DETAILED_PROMPT_OVERHEAD_TOKENS,
          [candidate.text, original],
          translation
        );
        await bill(userId, usage, { action: "pick", sessionId: String(record._id) });
      }

      const userMessage = makeMessage({ role: "user", kind: "text", text: candidate.text });
      const reply = makeMessage({
        role: "assistant",
        kind: "translation",
        text: candidate.text,
        payload: translation,
      });
      const update: any = {
        $push: { messages: { $each: [userMessage, reply] } },
        $set: { lastMessageAt: reply.createdAt },
      };
      if (usage) update.$inc = usageIncrement(usage);
      await sessions().updateOne(filter, update);

      return { translation, messageId: reply.id, cached: !!cached, wrapUp };
    }

    const message = requireText(context.message, "message");
    await assertBudget(userId);

    // The phrase in focus is the one whose translation was shown last.
    const focus = [...(record.messages || [])]
      .reverse()
      .find((m) => m.kind === "translation");
    const focusPayload = focus?.payload as DetailedPhraseDataType | undefined;
    const history = (record.messages || [])
      .filter((m) => m.kind === "text" && m.text)
      .map((m) => ({ role: m.role, text: m.text as string }));

    const advice = await callProvider("saveSessionTurn:message", () =>
      getTranslationAdvice({
        phrase: focus?.text || original,
        context: original,
        message,
        currentChunks: focusPayload?.chunks || [],
        history,
        sourceLanguage,
        targetLanguage,
      })
    );

    const usage = estimateUsage(
      ADVICE_PROMPT_OVERHEAD_TOKENS,
      [original, original, focusPayload?.chunks || [], history, message],
      advice
    );
    await bill(userId, usage, { action: "message", sessionId: String(record._id) });

    // The advisor may suggest new patterns; offer them as extra candidates.
    let candidates: SaveSessionCandidate[] | undefined;
    if (advice.chunks && advice.chunks.length) {
      const merged = mergeCandidates(record.candidates || [], advice.chunks);
      if (merged.length !== (record.candidates || []).length) candidates = merged;
    }

    const replyText = advice.reply || "";
    const userMessage = makeMessage({ role: "user", kind: "text", text: message });
    const reply = makeMessage({ role: "assistant", kind: "text", text: replyText });
    const set: any = { lastMessageAt: reply.createdAt };
    if (candidates) set.candidates = candidates;
    await sessions().updateOne(filter, {
      $push: { messages: { $each: [userMessage, reply] } },
      $set: set,
      $inc: usageIncrement(usage),
    } as any);

    return {
      reply: replyText,
      messageId: reply.id,
      wrapUp,
      ...(candidates ? { candidates } : {}),
    };
  },
});

const attachSavedPhrase = defineFunction({
  name: "attachSavedPhrase",
  permissionTypes: ["user_access"],
  callback: async function (context: {
    userId: string;
    sessionId: string;
    phraseId: string;
    bundleId?: string;
  }) {
    const userId = requireUser(context.userId);
    const record = await loadSession(context.sessionId, userId);

    const { phraseId, bundleId } = context;
    if (typeof phraseId !== "string" || !Types.ObjectId.isValid(phraseId)) {
      throw new Error("Phrase not found");
    }
    const phrase: any = await getCollection(DATABASE, PHRASE_COLLECTION)
      .findOne({ _id: phraseId, refId: userId } as any)
      .lean();
    if (!phrase) throw new Error("Phrase not found");

    // Use the bundle the client names, if it is the user's; otherwise look up
    // a bundle of the user's that holds the phrase.
    const bundles = getCollection(DATABASE, BUNDLE_COLLECTION);
    let resolvedBundleId: string | undefined;
    if (bundleId !== undefined) {
      const bundle =
        typeof bundleId === "string" && Types.ObjectId.isValid(bundleId)
          ? await bundles.findOne({ _id: bundleId, refId: userId } as any).lean()
          : null;
      if (!bundle) throw new Error("Bundle not found");
      resolvedBundleId = bundleId;
    } else {
      const bundle: any = await bundles
        .findOne({ refId: userId, phrases: phraseId } as any)
        .lean();
      if (bundle) resolvedBundleId = String(bundle._id);
    }

    const savedMessage = makeMessage({
      role: "assistant",
      kind: "saved",
      payload: {
        phraseId,
        phrase: phrase.phrase,
        ...(resolvedBundleId ? { bundleId: resolvedBundleId } : {}),
      },
    });

    // The `$ne` guard makes this idempotent: attaching twice changes nothing.
    const result: any = await sessions().updateOne(
      { _id: record._id, refId: userId, savedPhraseIds: { $ne: phraseId } } as any,
      {
        $push: {
          savedPhraseIds: phraseId,
          savedPhrases: phrase.phrase,
          messages: savedMessage,
        },
        $inc: { savedCount: 1 },
        $set: { lastMessageAt: savedMessage.createdAt },
      } as any
    );

    if (!result?.modifiedCount) {
      return { attached: false, savedCount: record.savedCount || 0 };
    }
    return {
      attached: true,
      messageId: savedMessage.id,
      savedCount: (record.savedCount || 0) + 1,
    };
  },
});

const listSaveSessions = defineFunction({
  name: "listSaveSessions",
  permissionTypes: ["user_access"],
  callback: async function (context: {
    userId: string;
    query?: string;
    onlySaved?: boolean;
    limit?: number;
    before?: string | Date;
  }) {
    const userId = requireUser(context.userId);
    const filter: any = { refId: userId };

    if (context.onlySaved) filter.savedCount = { $gt: 0 };

    const query = typeof context.query === "string" ? context.query.trim() : "";
    if (query) {
      const pattern = new RegExp(escapeRegex(query.slice(0, 200)), "i");
      filter.$or = [{ title: pattern }, { "messages.text": pattern }];
    }

    if (context.before !== undefined && context.before !== null) {
      const before = new Date(context.before as any);
      if (isNaN(before.getTime())) throw new Error("before must be a date");
      filter.lastMessageAt = { $lt: before };
    }

    const requested = Number(context.limit);
    const limit =
      Number.isFinite(requested) && requested > 0
        ? Math.min(Math.floor(requested), LIST_MAX_LIMIT)
        : LIST_DEFAULT_LIMIT;

    const docs: any[] = await sessions()
      .find(filter, { title: 1, savedCount: 1, savedPhrases: 1, lastMessageAt: 1 })
      .sort({ lastMessageAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    return docs.map((d) => ({
      sessionId: String(d._id),
      title: d.title,
      savedCount: d.savedCount || 0,
      savedPhrases: d.savedPhrases || [],
      lastMessageAt: d.lastMessageAt,
    }));
  },
});

const getSaveSession = defineFunction({
  name: "getSaveSession",
  permissionTypes: ["user_access"],
  callback: async function (context: { userId: string; sessionId: string }) {
    const userId = requireUser(context.userId);
    const { _id, __v, ...rest } = (await loadSession(
      context.sessionId,
      userId
    )) as any;
    return { sessionId: String(_id), ...rest };
  },
});

const deleteSaveSession = defineFunction({
  name: "deleteSaveSession",
  permissionTypes: ["user_access"],
  callback: async function (context: {
    userId: string;
    sessionId?: string;
    all?: boolean;
  }) {
    const userId = requireUser(context.userId);

    // Only the conversations go; the phrases saved from them stay.
    if (context.all === true) {
      const result: any = await sessions().deleteMany({ refId: userId } as any);
      return { deleted: result?.deletedCount || 0 };
    }

    const { sessionId } = context;
    if (typeof sessionId !== "string" || !Types.ObjectId.isValid(sessionId)) {
      throw new Error("Send sessionId or all: true");
    }
    const result: any = await sessions().deleteOne({
      _id: sessionId,
      refId: userId,
    } as any);
    return { deleted: result?.deletedCount || 0 };
  },
});

module.exports.functions = [
  createSaveSession,
  saveSessionTurn,
  attachSavedPhrase,
  listSaveSessions,
  getSaveSession,
  deleteSaveSession,
];
