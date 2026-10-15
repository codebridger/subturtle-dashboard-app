/**
 * The language purge job (ADR-006 point 6, work list B-05 / Q2): deletes a removed language's
 * data 30 days after the learner removed it, and kept phrases whose 30 days ran out.
 *
 * It deletes learner data and cannot be undone, so it is guarded four ways:
 * - **Off by default.** `LANGUAGE_PURGE_MODE` is `off` (default), `dry-run` (count and log
 *   what would go, delete nothing, claim nothing) or `on`. The daily job only exists while
 *   the mode is not `off`.
 * - **Claimed first.** Each language is claimed with a conditional update
 *   (`removed` → `purging` where `purgeAt` has passed); `add-language` refuses a `purging`
 *   language, so a re-add cannot race the deletes. A claim older than CLAIM_STALE_MS (the
 *   process died mid-purge) is taken again.
 * - **Profile last.** The `language_profile` document is deleted after everything else, so
 *   a crash leaves a `purging` record the next run finishes.
 * - **Capped and logged.** At most `LANGUAGE_PURGE_DAILY_CAP` languages per run (default
 *   20); every delete is logged with its counts.
 *
 * Enable `on` only after the backfill (work list "Migration and backfill") and the
 * per-language Leitner and Pool split (B-10, B-11): until then English shares the one
 * Leitner and Pool document per user, and `languageFilter("en")` also matches records with
 * no language.
 */
import { getCollection, fileService } from "@modular-rest/server";
import {
  BOARD_ACTIVITY_COLLECTION,
  BUNDLE_COLLECTION,
  DATABASE,
  DATABASE_BOARD,
  DATABASE_LEITNER,
  DATABASE_POOL,
  LANGUAGE_PROFILE_COLLECTION,
  LEITNER_SYSTEM_COLLECTION,
  LIVE_SESSION_COLLECTION,
  LIVE_SESSION_TEXT_COLLECTION,
  PHRASE_COLLECTION,
  POOL_COLLECTION,
  SAVE_ASSISTANT_SESSION_COLLECTION,
} from "../../config";
import { languageFilter } from "../../languages/helper";

export type PurgeMode = "off" | "dry-run" | "on";

export const PURGE_JOB_NAME = "language-purge";
export const PURGE_CRON = "30 3 * * *";
export const DEFAULT_DAILY_CAP = 20;
/** Expired kept phrases deleted per run, at most. */
export const PENDING_SWEEP_CAP = 5000;
/** A claim this old belongs to a run that died; the next run takes it over. */
export const CLAIM_STALE_MS = 6 * 60 * 60 * 1000;

/** One kind of per-language record the purge deletes. */
export interface PurgeTarget {
  database: string;
  collection: string;
  /** The field holding the user's id (as a string). */
  ownerField: string;
}

// Deleted in this order; phrases first so their images go with them.
const TARGETS: PurgeTarget[] = [
  { database: DATABASE, collection: PHRASE_COLLECTION, ownerField: "refId" },
  { database: DATABASE, collection: BUNDLE_COLLECTION, ownerField: "refId" },
  { database: DATABASE_LEITNER, collection: LEITNER_SYSTEM_COLLECTION, ownerField: "userId" },
  { database: DATABASE_POOL, collection: POOL_COLLECTION, ownerField: "userId" },
  { database: DATABASE_BOARD, collection: BOARD_ACTIVITY_COLLECTION, ownerField: "userId" },
  { database: DATABASE, collection: LIVE_SESSION_COLLECTION, ownerField: "refId" },
  { database: DATABASE, collection: LIVE_SESSION_TEXT_COLLECTION, ownerField: "refId" },
  { database: DATABASE, collection: SAVE_ASSISTANT_SESSION_COLLECTION, ownerField: "refId" },
];

/**
 * Add a collection whose records belong to one language, e.g. the review log (B-30) or the
 * knowledge map's events and tags (ADR-005). Its documents need `language` and the owner field.
 */
export function registerPurgeTarget(target: PurgeTarget): void {
  if (!TARGETS.some((t) => t.database === target.database && t.collection === target.collection)) TARGETS.push(target);
}

export function getPurgeTargets(): PurgeTarget[] {
  return TARGETS.map((t) => ({ ...t }));
}

export function getPurgeMode(): PurgeMode {
  const raw = (process.env.LANGUAGE_PURGE_MODE || "off").trim().toLowerCase();
  if (raw === "off" || raw === "dry-run" || raw === "on") return raw;
  console.warn(`[language-purge] LANGUAGE_PURGE_MODE="${raw}" is not off, dry-run or on; treating it as off`);
  return "off";
}

export function getDailyCap(): number {
  const value = parseInt(process.env.LANGUAGE_PURGE_DAILY_CAP || "", 10);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_DAILY_CAP;
}

export interface PurgedLanguage {
  userId: string;
  language: string;
  /** `database.collection` → documents deleted (or that would be, in dry-run). */
  deleted: Record<string, number>;
  files: number;
}

export interface PurgeReport {
  mode: PurgeMode;
  languages: PurgedLanguage[];
  expiredPendingPhrases: number;
  capReached: boolean;
}

const languageProfiles = () => getCollection<any>(DATABASE, LANGUAGE_PROFILE_COLLECTION);

function dueFilter(now: Date) {
  return {
    $or: [
      { status: "removed", purgeAt: { $lte: now } },
      { status: "purging", purgeClaimedAt: { $lte: new Date(now.getTime() - CLAIM_STALE_MS) } },
    ],
  };
}

/** Claim the next due language, or null when none is due. */
async function claimNext(now: Date): Promise<any | null> {
  return languageProfiles()
    .findOneAndUpdate(dueFilter(now), { $set: { status: "purging", purgeClaimedAt: now } }, { new: true, sort: { purgeAt: 1 } })
    .lean();
}

async function purgeLanguage(lp: any, dryRun: boolean): Promise<PurgedLanguage> {
  const { userId, language } = lp;
  const result: PurgedLanguage = { userId, language, deleted: {}, files: 0 };

  for (const target of TARGETS) {
    const collection = getCollection<any>(target.database, target.collection);
    const filter = { [target.ownerField]: userId, ...languageFilter(language) };
    const key = `${target.database}.${target.collection}`;

    if (target.collection === PHRASE_COLLECTION) {
      const withImages: any[] = await collection.find({ ...filter, "images.0": { $exists: true } }, { images: 1 }).lean();
      for (const phrase of withImages) {
        for (const image of phrase.images || []) {
          if (!image?._id) continue;
          if (dryRun) {
            result.files++;
            continue;
          }
          try {
            await fileService.removeFile(String(image._id));
            result.files++;
          } catch (error) {
            console.error(`[language-purge] Failed to remove file ${image._id} of ${userId}/${language}`, error);
          }
        }
      }
    }

    result.deleted[key] = dryRun ? await collection.countDocuments(filter) : (await collection.deleteMany(filter)).deletedCount ?? 0;
  }

  if (!dryRun) {
    // Last, so a crash above leaves a claim the next run finishes.
    await languageProfiles().deleteOne({ _id: lp._id, status: "purging" });
  }
  console.log(`[language-purge] ${dryRun ? "would delete" : "deleted"} ${userId}/${language}: ${JSON.stringify(result.deleted)}, files ${result.files}`);
  return result;
}

/** Kept phrases whose 30 days ran out (B-32). */
async function sweepExpiredPending(now: Date, dryRun: boolean): Promise<number> {
  const phrases = getCollection<any>(DATABASE, PHRASE_COLLECTION);
  const filter = { status: "pending", pendingExpiresAt: { $lte: now } };
  if (dryRun) return Math.min(await phrases.countDocuments(filter), PENDING_SWEEP_CAP);
  const ids = (await phrases.find(filter, { _id: 1 }).limit(PENDING_SWEEP_CAP).lean()).map((doc: any) => doc._id);
  if (ids.length === 0) return 0;
  // `status` again in the filter: a phrase moved into its language meanwhile stays.
  const { deletedCount } = await phrases.deleteMany({ _id: { $in: ids }, status: "pending" });
  return deletedCount ?? 0;
}

export async function runLanguagePurge(
  options: { mode?: PurgeMode; cap?: number; now?: Date } = {}
): Promise<PurgeReport> {
  const mode = options.mode ?? getPurgeMode();
  const cap = options.cap ?? getDailyCap();
  const now = options.now ?? new Date();
  const report: PurgeReport = { mode, languages: [], expiredPendingPhrases: 0, capReached: false };
  if (mode === "off") return report;
  const dryRun = mode === "dry-run";

  if (dryRun) {
    const due: any[] = await languageProfiles().find(dueFilter(now)).sort({ purgeAt: 1 }).limit(cap + 1).lean();
    report.capReached = due.length > cap;
    for (const lp of due.slice(0, cap)) report.languages.push(await purgeLanguage(lp, true));
  } else {
    while (report.languages.length < cap) {
      const lp = await claimNext(now);
      if (!lp) break;
      try {
        report.languages.push(await purgeLanguage(lp, false));
      } catch (error) {
        // Left `purging`; retried once the claim is stale.
        console.error(`[language-purge] Failed for ${lp.userId}/${lp.language}`, error);
      }
    }
    report.capReached = report.languages.length >= cap && Boolean(await languageProfiles().exists(dueFilter(now)));
  }

  report.expiredPendingPhrases = await sweepExpiredPending(now, dryRun);
  console.log(
    `[language-purge] ${mode}: ${report.languages.length} languages, ${report.expiredPendingPhrases} expired kept phrases${
      report.capReached ? ", daily cap reached" : ""
    }`
  );
  return report;
}

/**
 * Register the job with the schedule module. The daily job exists only while
 * LANGUAGE_PURGE_MODE is `dry-run` or `on`; switching it back to `off` deletes the job.
 */
export async function setupLanguagePurgeJob(ScheduleService: {
  register(id: string, callback: (args: any) => Promise<void>): void;
  createJob(name: string, functionId: string, options: any): Promise<unknown>;
  deleteJob(name: string): Promise<void>;
}): Promise<void> {
  ScheduleService.register(PURGE_JOB_NAME, async () => {
    await runLanguagePurge();
  });
  if (getPurgeMode() === "off") {
    await ScheduleService.deleteJob(PURGE_JOB_NAME);
    return;
  }
  await ScheduleService.createJob(PURGE_JOB_NAME, PURGE_JOB_NAME, { cronExpression: PURGE_CRON, jobType: "recurrent", catchUp: true });
}
