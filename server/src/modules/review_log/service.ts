/**
 * Writes the append-only review log (work list B-30). Called after `submit-review` and
 * `complete-pool-session` have done their work. Logging never fails the learner's request:
 * an error is logged and the answer still counts. A row whose `eventKey` is already there
 * (a retried request) is skipped by the unique `(userId, eventKey)` index.
 */
import { getCollection } from "@modular-rest/server";
import { Types } from "mongoose";
import { DATABASE, PHRASE_COLLECTION, REVIEW_LOG_COLLECTION } from "../../config";
import { LangCode } from "../../languages/helper";
import { pickPrimaryChunkText } from "../../utils/chunk";
import { isDuplicateKeyError } from "../../utils/get-or-create";
import { registerPurgeTarget } from "../language/purge";
import type { ReviewLogRow } from "./db";

// Removing a language deletes its review log after 30 days, with its other records
// (ADR-006 point 6).
registerPurgeTarget({ database: DATABASE, collection: REVIEW_LOG_COLLECTION, ownerField: "userId" });

/** A client's own idempotency key, when it is a short plain string. */
function clientKey(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() && value.length <= 200 ? value.trim() : undefined;
}

async function phrasesById(userId: string, phraseIds: string[]): Promise<Map<string, any>> {
  const ids = phraseIds.filter((id) => Types.ObjectId.isValid(id));
  const out = new Map<string, any>();
  if (ids.length === 0) return out;
  const col: any = await getCollection(DATABASE, PHRASE_COLLECTION);
  const phrases: any[] = (await col.find({ _id: { $in: ids }, refId: userId }, { chunks: 1, languageSource: 1 })) || [];
  for (const phrase of phrases) out.set(String(phrase._id), phrase);
  return out;
}

async function insertRows(rows: ReviewLogRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const col: any = await getCollection(DATABASE, REVIEW_LOG_COLLECTION);
  let written = 0;
  for (const row of rows) {
    try {
      await col.create(row);
      written++;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
  }
  return written;
}

export interface ReviewEvent {
  userId: string;
  language: LangCode;
  phraseId: string;
  result: "right" | "close" | "wrong";
  fromBox: number | null;
  toBox: number | null;
  /** The card the client showed (recognition, cloze, typed…); derived when missing. */
  cardType?: unknown;
  /** The client's idempotency key for this answer, if it sends one. */
  eventKey?: unknown;
  ts?: Date;
}

export class ReviewLogService {
  /** One row for one answer. Returns how many rows were written (0 or 1). */
  static async recordReview(event: ReviewEvent): Promise<number> {
    try {
      const ts = event.ts ?? new Date();
      const phrase = (await phrasesById(event.userId, [event.phraseId])).get(String(event.phraseId));
      const chunk = pickPrimaryChunkText(phrase?.chunks);
      // The L3+ card is the fill-in when the phrase has a chunk; otherwise recognition.
      const derived = chunk && (event.fromBox ?? 1) >= 3 ? "cloze" : "recognition";
      const cardType = typeof event.cardType === "string" && event.cardType.trim() ? event.cardType.trim().slice(0, 40) : derived;
      return await insertRows([
        {
          userId: event.userId,
          language: event.language,
          languageSource: phrase?.languageSource ?? "backfill",
          phraseId: String(event.phraseId),
          chunk,
          cardType,
          kind: "review",
          result: event.result,
          fromBox: event.fromBox,
          toBox: event.toBox,
          ts,
          eventKey: clientKey(event.eventKey) ?? `review:${event.phraseId}:${ts.getTime()}`,
        },
      ]);
    } catch (error) {
      console.error(`[review-log] could not log a review for ${event.userId}:`, error);
      return 0;
    }
  }

  /**
   * One row per phrase met in a Pool session and moved into box 1. `eventKey` (the
   * client's key for the session) makes a retried completion write nothing new.
   */
  static async recordPoolSession(
    userId: string,
    promoted: { phraseId: string; language: LangCode }[],
    opts: { eventKey?: unknown; ts?: Date } = {}
  ): Promise<number> {
    try {
      if (promoted.length === 0) return 0;
      const ts = opts.ts ?? new Date();
      const session = clientKey(opts.eventKey) ?? `pool:${ts.getTime()}`;
      const phrases = await phrasesById(userId, promoted.map((p) => p.phraseId));
      return await insertRows(
        promoted.map(({ phraseId, language }) => {
          const phrase = phrases.get(String(phraseId));
          return {
            userId,
            language,
            languageSource: phrase?.languageSource ?? "backfill",
            phraseId: String(phraseId),
            chunk: pickPrimaryChunkText(phrase?.chunks),
            cardType: "pool",
            kind: "pool" as const,
            result: "seen" as const,
            fromBox: null,
            toBox: 1,
            ts,
            eventKey: `${session}:${phraseId}`,
          };
        })
      );
    } catch (error) {
      console.error(`[review-log] could not log a Pool session for ${userId}:`, error);
      return 0;
    }
  }
}
