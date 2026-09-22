import { getCollection } from "@modular-rest/server";
import {
  DATABASE,
  DATABASE_POOL,
  POOL_COLLECTION,
  PHRASE_COLLECTION,
  PROFILE_COLLECTION,
} from "../../config";
import { PoolItem } from "./db";
import { pickPrimaryChunkText } from "../../utils/chunk";

// Default age cut-off (days) when the user has no `poolAgeCutoffDays` on their profile.
const DEFAULT_AGE_CUTOFF_DAYS = 7;

export class PoolService {
  private static async getCollection() {
    return getCollection(DATABASE_POOL, POOL_COLLECTION);
  }

  /**
   * Add a phrase to the user's Pool with a server-set `pooled_at`. Idempotent: a
   * phrase already pooled is left untouched (its original `pooled_at` is preserved).
   */
  static async add(userId: string, phraseId: string): Promise<void> {
    const col = await this.getCollection();
    const pool = (await col.findOne({ userId })) as any;

    if (!pool) {
      await col.create({
        userId,
        items: [{ phraseId, pooled_at: new Date(), encountered: false }],
      });
      return;
    }

    const already = (pool.items || []).some((i: PoolItem) => i.phraseId.toString() === phraseId.toString());
    if (already) return;

    await col.updateOne(
      { _id: pool._id },
      { $push: { items: { phraseId, pooled_at: new Date(), encountered: false } } }
    );
  }

  /** Remove a phrase from the user's Pool. Idempotent ($pull is a no-op if absent). */
  static async remove(userId: string, phraseId: string): Promise<void> {
    const col = await this.getCollection();
    await col.updateOne({ userId }, { $pull: { items: { phraseId: phraseId } } });
  }

  /** Raw pooled items for a user, oldest first. */
  private static async getItems(userId: string): Promise<PoolItem[]> {
    const col = await this.getCollection();
    const pool = (await col.findOne({ userId })) as any;
    const items: PoolItem[] = pool?.items || [];
    return [...items].sort((a, b) => new Date(a.pooled_at).getTime() - new Date(b.pooled_at).getTime());
  }

  /** Number of phrases currently in the user's Pool. */
  static async getCount(userId: string): Promise<number> {
    const items = await this.getItems(userId);
    return items.length;
  }

  /**
   * Pooled items joined to their phrase docs, **oldest first**, each carrying the
   * flat `confirmed_chunk` + `source_sentence` the encode cloze needs. Phrases that
   * no longer exist are dropped.
   */
  static async list(userId: string) {
    const items = await this.getItems(userId);
    const phraseIds = items.map((i) => i.phraseId);
    if (phraseIds.length === 0) return [];

    const phraseCollection = await getCollection(DATABASE, PHRASE_COLLECTION);
    const phrases = await phraseCollection.find({ _id: { $in: phraseIds } });

    return items
      .map((item) => {
        const phrase: any = phrases.find((p: any) => p._id.toString() === item.phraseId.toString());
        return {
          phraseId: item.phraseId,
          pooled_at: item.pooled_at,
          encountered: item.encountered,
          phrase,
          confirmed_chunk: pickPrimaryChunkText(phrase?.chunks),
          source_sentence: phrase?.context ?? null,
        };
      })
      .filter((item) => item.phrase);
  }

  /**
   * Promote pooled phrases into Leitner L1 and remove them from the Pool.
   *
   * Crash-safe: add-to-Leitner runs first with `onlyIfAbsent` (a no-op if the card
   * is already in L1), THEN remove-from-Pool. If a process dies between the two, the
   * item is left in BOTH places — a harmless duplicate that the next nightly sweep
   * re-promotes idempotently — never lost. The reverse order could lose a saved
   * word, which is the one outcome we refuse. A failed remove is logged loudly so
   * the retry is visible.
   *
   * `encountered` records HOW the promotion happened: `true` for a real encode
   * session (`complete-pool-session`), `false` for the silent age-out.
   */
  static async promote(userId: string, phraseIds: string[], opts: { encountered: boolean }): Promise<void> {
    if (!phraseIds || phraseIds.length === 0) return;

    // Lazy require breaks the pool <-> leitner_box module cycle (LeitnerService
    // imports PoolService for its Forgot x2 routing). Keep this a runtime require —
    // hoisting it to a top-level import reintroduces the cycle and can break boot.
    const { LeitnerService } = require("../leitner_box/service");

    for (const phraseId of phraseIds) {
      await LeitnerService.addPhraseToBox(userId, phraseId, 1, {
        onlyIfAbsent: true,
        encountered: opts.encountered,
      });

      try {
        await this.remove(userId, phraseId);
      } catch (e) {
        console.error(
          `[PoolService] Promoted ${phraseId} for ${userId} but failed to remove from Pool; nightly sweep will retry.`,
          e
        );
      }
    }
  }

  /**
   * Daily sweep: promote every pooled item older than its owner's age cut-off into
   * Leitner L1 silently (`encountered: false`). Per-user try/catch so one bad user
   * never aborts the sweep. Safe to run more than once a day because `promote` is
   * idempotent.
   */
  static async ageOutAllUsers(): Promise<void> {
    const col = await this.getCollection();
    const pools = (await col.find({})) as any[];
    const profileCol = await getCollection(DATABASE, PROFILE_COLLECTION);
    const now = Date.now();

    for (const pool of pools) {
      try {
        const userId = pool.userId;
        const profile = (await profileCol.findOne({ refId: userId })) as any;
        const cutoffDays = profile?.poolAgeCutoffDays ?? DEFAULT_AGE_CUTOFF_DAYS;
        const cutoffMs = cutoffDays * 24 * 60 * 60 * 1000;

        const aged = (pool.items || []).filter(
          (i: PoolItem) => now - new Date(i.pooled_at).getTime() >= cutoffMs
        );
        if (aged.length === 0) continue;

        const phraseIds = aged.map((i: PoolItem) => i.phraseId.toString());
        await this.promote(userId, phraseIds, { encountered: false });
        console.log(`[PoolService] Aged out ${phraseIds.length} item(s) to L1 for ${userId}.`);
      } catch (e) {
        console.error(`[PoolService] Age-out failed for pool ${pool?._id}:`, e);
      }
    }
  }
}
