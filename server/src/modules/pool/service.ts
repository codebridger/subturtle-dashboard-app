import { getCollection } from "@modular-rest/server";
import {
  DATABASE,
  DATABASE_POOL,
  POOL_COLLECTION,
  PHRASE_COLLECTION,
} from "../../config";
import { PoolItem } from "./db";
import { pickPrimaryChunkText } from "../../utils/chunk";
import { LangCode, langOf, languageFilter, toCode } from "../../languages/helper";
import {
  getLearnerLanguages,
  isStudying,
  LearnerLanguages,
  phraseLanguages,
  resolveLanguage,
  resolvePhraseLanguage,
} from "../../languages/learner";
import { getOrCreate } from "../../utils/get-or-create";
import { poolSettings } from "../../languages/language-settings";

/**
 * The Pool: one document per `(userId, language)` (ADR-006 point 3, work list B-11). A Pool
 * from before multilingual has no `language` and is the English Pool (`languageFilter`), so
 * this works on today's data with no backfill.
 *
 * Every method takes an optional `language`. Without one, a phrase-scoped call (add,
 * remove, promote) uses the phrase's own language, and a list call uses the active language.
 */
export class PoolService {
  private static async getCollection() {
    return getCollection(DATABASE_POOL, POOL_COLLECTION);
  }

  private static async findPool(userId: string, language: LangCode) {
    const col = await this.getCollection();
    return (await col.findOne({ userId, ...languageFilter(language) })) as any;
  }

  /**
   * Add a phrase to its language's Pool with a server-set `pooled_at`. Idempotent: a
   * phrase already pooled is left untouched (its original `pooled_at` is preserved).
   */
  static async add(userId: string, phraseId: string, language?: LangCode): Promise<void> {
    const col = await this.getCollection();
    const lang = await resolvePhraseLanguage(userId, phraseId, language);
    const filter = { userId, ...languageFilter(lang) };

    await getOrCreate(col, filter, { userId, language: lang, items: [] });

    // One conditional push: a phrase already in the Pool does not match, so two adds at
    // once still leave one item.
    await col.updateOne(
      { ...filter, "items.phraseId": { $ne: String(phraseId) } },
      { $push: { items: { phraseId: String(phraseId), pooled_at: new Date(), encountered: false } } }
    );
  }

  /**
   * Remove a phrase from the user's Pool. Idempotent ($pull is a no-op if absent). With no
   * `language` it is removed from every Pool of the user (a deleted phrase has no language
   * left to read).
   */
  static async remove(userId: string, phraseId: string, language?: LangCode): Promise<void> {
    const col = await this.getCollection();
    const pull = { $pull: { items: { phraseId: String(phraseId) } } };
    if (language) {
      await col.updateOne({ userId, ...languageFilter(language) }, pull);
    } else {
      await col.updateMany({ userId, "items.phraseId": String(phraseId) }, pull);
    }
  }

  /** Raw pooled items of one language, oldest first. */
  private static async getItems(userId: string, language?: LangCode): Promise<PoolItem[]> {
    const lang = await resolveLanguage(userId, language);
    const pool = await this.findPool(userId, lang);
    const items: PoolItem[] = pool?.items || [];
    return [...items].sort((a, b) => new Date(a.pooled_at).getTime() - new Date(b.pooled_at).getTime());
  }

  /** Number of phrases currently in the user's Pool for one language. */
  static async getCount(userId: string, language?: LangCode): Promise<number> {
    const items = await this.getItems(userId, language);
    return items.length;
  }

  /**
   * Pooled items of one language joined to their phrase docs, **oldest first**, each
   * carrying the flat `confirmed_chunk` + `source_sentence` the encode cloze needs. Phrases
   * that no longer exist are dropped.
   */
  static async list(userId: string, language?: LangCode) {
    const items = await this.getItems(userId, language);
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
   *
   * `language` names the Pool and Leitner box; without it each phrase goes by its own
   * language (then the active one).
   */
  static async promote(
    userId: string,
    phraseIds: string[],
    opts: { encountered: boolean; language?: LangCode }
  ): Promise<{ phraseId: string; language: LangCode }[]> {
    if (!phraseIds || phraseIds.length === 0) return [];

    // Lazy require breaks the pool <-> leitner_box module cycle (LeitnerService
    // imports PoolService for its Forgot x2 routing). Keep this a runtime require —
    // hoisting it to a top-level import reintroduces the cycle and can break boot.
    const { LeitnerService } = require("../leitner_box/service");

    const given = toCode(opts.language);
    const stored = given ? new Map<string, LangCode>() : await phraseLanguages(userId, phraseIds);
    const fallback = given ?? (stored.size < phraseIds.length ? await resolveLanguage(userId) : undefined);
    const promoted: { phraseId: string; language: LangCode }[] = [];

    for (const phraseId of phraseIds) {
      const language = given ?? stored.get(String(phraseId)) ?? (fallback as LangCode);
      await LeitnerService.addPhraseToBox(userId, phraseId, 1, {
        onlyIfAbsent: true,
        encountered: opts.encountered,
        language,
      });

      try {
        await this.remove(userId, phraseId, language);
      } catch (e) {
        console.error(
          `[PoolService] Promoted ${phraseId} for ${userId} but failed to remove from Pool; nightly sweep will retry.`,
          e
        );
      }
      promoted.push({ phraseId: String(phraseId), language });
    }
    return promoted;
  }

  /**
   * Daily sweep: promote every pooled item older than its owner's age cut-off into
   * Leitner L1 silently (`encountered: false`). Per-pool try/catch so one bad user
   * never aborts the sweep. Safe to run more than once a day because `promote` is
   * idempotent.
   *
   * Paused and removed languages are skipped (ADR-006 point 7): their phrases wait until the
   * language comes back. The cut-off is per language (`language_profile`, then the profile).
   * Pools are read with a cursor, since there can be up to ten per user.
   */
  static async ageOutAllUsers(): Promise<void> {
    const col = await this.getCollection();
    const now = Date.now();
    const learners = new Map<string, LearnerLanguages>();

    const query: any = col.find({});
    const pools: AsyncIterable<any> | any[] = typeof query?.cursor === "function" ? query.cursor() : await query;

    for await (const pool of pools) {
      try {
        const userId = pool.userId;
        const language = langOf(pool);

        if (!learners.has(userId)) learners.set(userId, await getLearnerLanguages(userId));
        if (!isStudying(learners.get(userId)!, language)) continue;

        const { poolAgeCutoffDays } = await poolSettings(userId, language);
        const cutoffMs = poolAgeCutoffDays * 24 * 60 * 60 * 1000;

        const aged = (pool.items || []).filter(
          (i: PoolItem) => now - new Date(i.pooled_at).getTime() >= cutoffMs
        );
        if (aged.length === 0) continue;

        const phraseIds = aged.map((i: PoolItem) => i.phraseId.toString());
        await this.promote(userId, phraseIds, { encountered: false, language });
        console.log(`[PoolService] Aged out ${phraseIds.length} item(s) to L1 for ${userId} (${language}).`);
      } catch (e) {
        console.error(`[PoolService] Age-out failed for pool ${pool?._id}:`, e);
      }
    }
  }
}
