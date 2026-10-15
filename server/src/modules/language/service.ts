/**
 * The learner's languages (ADR-006, work list B-04 to B-07, B-32, B-33).
 *
 * `language_profile` (one per user and language) is the source of truth. The profile keeps
 * a copy for fast reads (`learningLanguage`, `learningLanguages`, `pausedLanguages`,
 * `onboardingState`); `syncProfile` repairs that copy and applies the plan limit, and every
 * write here ends by calling it through `getState`.
 *
 * Firestore has no multi-document transactions (ADR-005), so:
 * - the plan limit is one conditional update on the profile (ADR-006 point 8): push the
 *   language only where it is absent and the array is shorter than the limit, so of two
 *   parallel adds only one wins; then the language profile is upserted, and the push is
 *   undone if that fails;
 * - status changes are conditional on the status read, so a remove, a restore and the
 *   purge job's claim never overwrite each other.
 *
 * Errors carry a stable code as the message prefix (`upgrade_needed: {...}`), the only part
 * of an error the function router returns to clients.
 */
import { getCollection } from "@modular-rest/server";
import {
  BUNDLE_COLLECTION,
  DATABASE,
  LANGUAGE_INTEREST_COLLECTION,
  LANGUAGE_PROFILE_COLLECTION,
  PHRASE_COLLECTION,
  PROFILE_COLLECTION,
} from "../../config";
import { DEFAULT_LANGUAGE, LangCode, languageFilter, toCode, toTitle } from "../../languages/helper";
import { getLearningLanguage, getOwnLanguage } from "../../languages/registry";
import {
  DEFAULT_NEW_PHRASES_PER_DAY,
  DEFAULT_POOL_AGE_CUTOFF_DAYS,
  DEFAULT_POOL_CHUNK_SIZE,
  positive,
} from "../../languages/language-settings";
import { normaliseSourceUrl } from "../translation/url-normalise";
import { isUserOnFreemium, updateFreemiumAllocation } from "../subscription/service";
import { LeitnerService } from "../leitner_box/service";
import { PoolService } from "../pool/service";
import { CEFR_STARTS, CefrStart, LanguageProfile, LanguageStatus, StarterPackState } from "./types";
import { getLanguagePlan, LanguagePlan, Plan } from "./plan";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A removed language comes back with everything if re-added within this many days (Q2). */
export const REMOVE_GRACE_DAYS = 30;
/** A kept phrase waits this long for its language (Q6). */
export const PENDING_DAYS = 30;
/** Kept phrases one learner may hold at once; a guard against unbounded storage. */
export const MAX_PENDING_PHRASES = 1000;

/** How long `syncProfile` treats a language with no language profile yet as an add in flight. */
const IN_FLIGHT_MS = 2 * 60 * 1000;

/** Repair passes before `syncProfile` gives up on a profile other calls keep changing. */
const SYNC_ATTEMPTS = 5;

const MAX_GOALS = 10;
const MAX_GOAL_LENGTH = 60;

// --- errors ---------------------------------------------------------------------------

export type LanguageErrorCode =
  | "upgrade_needed"
  | "not_available"
  | "purging"
  | "not_found"
  | "not_active"
  | "invalid_argument"
  | "pending_limit";

export class LanguageError extends Error {
  readonly code: LanguageErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: LanguageErrorCode, details?: Record<string, unknown>, explanation?: string) {
    const suffix = details ? ` ${JSON.stringify(details)}` : explanation ? ` ${explanation}` : "";
    super(`${code}:${suffix}`.replace(/:$/, ""));
    this.name = "LanguageError";
    this.code = code;
    this.details = details;
  }
}

const invalid = (explanation: string) => new LanguageError("invalid_argument", undefined, explanation);

// --- contract types (docs/tech/multilingual-api.md, section 1) --------------------------

export interface LanguageSummary {
  code: LangCode;
  status: LanguageStatus;
  startLevel: CefrStart;
  startLevelSource: "test" | "default";
  dueCount: number;
  phraseCount: number;
  explanationLanguage: LangCode;
  newPhrasesPerDay: number;
  poolChunkSize: number;
  poolAgeCutoffDays: number;
  goals: string[];
  starterPack: { state: StarterPackState; heard: number; total: number };
  purgeAt?: string;
}

export interface LanguageState {
  translationLanguage: LangCode | null;
  learningLanguage: LangCode | null;
  languages: LanguageSummary[];
  onboardingState: "needs_language" | "done";
  plan: Plan;
  maxLanguages: number;
  pending: { language: LangCode; count: number; expiresAt: string }[];
}

// --- extension points ---------------------------------------------------------------------

export interface LanguageAddedEvent {
  userId: string;
  language: LangCode;
  /** True when a removed or paused language came back with its data. */
  restored: boolean;
  languageProfile: LanguageProfile;
}

type LanguageAddedHook = (event: LanguageAddedEvent) => Promise<void> | void;
const languageAddedHooks: LanguageAddedHook[] = [];

/**
 * Run code after a language is added or restored, e.g. to prepare its starter pack (B-21).
 * A failing hook is logged and does not fail the add.
 */
export function onLanguageAdded(hook: LanguageAddedHook): void {
  languageAddedHooks.push(hook);
}

// --- collections ----------------------------------------------------------------------------

const profiles = () => getCollection<any>(DATABASE, PROFILE_COLLECTION);
const languageProfiles = () => getCollection<any>(DATABASE, LANGUAGE_PROFILE_COLLECTION);
const interests = () => getCollection<any>(DATABASE, LANGUAGE_INTEREST_COLLECTION);
const phrases = () => getCollection<any>(DATABASE, PHRASE_COLLECTION);
const bundles = () => getCollection<any>(DATABASE, BUNDLE_COLLECTION);

function isDuplicateKeyError(error: any): boolean {
  return !!error && (error.code === 11000 || error.code === 11001 || error.codeName === "DuplicateKey");
}

function requireUser(userId: unknown): string {
  if (!userId || typeof userId !== "string") throw new Error("User ID is required");
  return userId;
}

/** A learning language code that is in the register and switched on. */
function requireLearningLanguage(value: unknown) {
  const caps = getLearningLanguage(value);
  if (!caps || !caps.enabled) throw new LanguageError("not_available", { language: toCode(value) ?? String(value ?? "") });
  return caps;
}

function validateInt(value: unknown, min: number, max: number, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw invalid(`${name} must be a whole number from ${min} to ${max}`);
  }
  return value;
}

function validateGoals(goals: unknown): string[] {
  if (!Array.isArray(goals) || goals.length > MAX_GOALS) throw invalid(`goals must be a list of up to ${MAX_GOALS}`);
  return goals.map((goal) => {
    if (typeof goal !== "string" || !goal.trim() || goal.length > MAX_GOAL_LENGTH) {
      throw invalid(`each goal must be text of up to ${MAX_GOAL_LENGTH} characters`);
    }
    return goal.trim();
  });
}

const byAddedAt = (a: LanguageProfile, b: LanguageProfile) =>
  new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();

const sameList = (a: unknown, b: string[]) =>
  Array.isArray(a) && a.length === b.length && a.every((value, i) => value === b[i]);

export class LanguageService {
  // --- reads -----------------------------------------------------------------------------

  static async getLanguageProfile(userId: string, language: LangCode): Promise<LanguageProfile | null> {
    return (await languageProfiles().findOne({ userId, language }).lean()) as LanguageProfile | null;
  }

  /** The full state for the switcher, the Languages page and first run (B-05). */
  static async getState(userId: string): Promise<LanguageState> {
    requireUser(userId);
    const plan = await getLanguagePlan(userId);
    const { profile, languages } = await this.syncProfile(userId, plan);

    const visible = languages.filter((lp) => lp.status !== "purging");
    const own = toCode(profile.translationLanguage) ?? null;
    const summaries = await Promise.all(visible.map((lp) => this.summarise(userId, lp, own, profile)));

    return {
      translationLanguage: own,
      learningLanguage: toCode(profile.learningLanguage) ?? null,
      languages: summaries,
      onboardingState: profile.onboardingState === "needs_language" ? "needs_language" : "done",
      plan: plan.plan,
      maxLanguages: plan.maxLanguages,
      pending: await this.pendingSummary(userId),
    };
  }

  private static async summarise(userId: string, lp: LanguageProfile, own: LangCode | null, profile: any): Promise<LanguageSummary> {
    const [dueCount, phraseCount] = await Promise.all([this.dueCount(userId, lp.language), this.phraseCount(userId, lp.language)]);
    return {
      code: lp.language,
      status: lp.status,
      startLevel: lp.startLevel ?? "A1",
      startLevelSource: lp.startLevelSource ?? "default",
      dueCount,
      phraseCount,
      explanationLanguage: toCode(lp.explanationLanguage) ?? own ?? DEFAULT_LANGUAGE,
      // The values in effect: the language's own, else (Pool) the profile's from before
      // they moved per language, else the defaults, as languages/language-settings.ts reads them.
      newPhrasesPerDay: positive(lp.newPhrasesPerDay) ?? DEFAULT_NEW_PHRASES_PER_DAY,
      poolChunkSize: positive(lp.poolChunkSize) ?? positive(profile?.poolChunkSize) ?? DEFAULT_POOL_CHUNK_SIZE,
      poolAgeCutoffDays: positive(lp.poolAgeCutoffDays) ?? positive(profile?.poolAgeCutoffDays) ?? DEFAULT_POOL_AGE_CUTOFF_DAYS,
      goals: Array.isArray(lp.goals) ? lp.goals : [],
      starterPack: {
        state: lp.starterPack?.state ?? "none",
        heard: lp.starterPack?.heard?.length ?? 0,
        total: lp.starterPack?.total ?? 0,
      },
      ...(lp.status === "removed" && lp.purgeAt ? { purgeAt: new Date(lp.purgeAt).toISOString() } : {}),
    };
  }

  /** Cards due today in one language, as the review reminder and the board count them. */
  static async dueCount(userId: string, language: LangCode): Promise<number> {
    return LeitnerService.getDueCount(userId, language);
  }

  /** Saved phrases in one language, kept phrases not included. */
  static async phraseCount(userId: string, language: LangCode): Promise<number> {
    return phrases().countDocuments({ refId: userId, status: { $ne: "pending" }, ...languageFilter(language) });
  }

  /** Kept phrases per language that has not been added: "3 phrases waiting for German". */
  private static async pendingSummary(userId: string): Promise<LanguageState["pending"]> {
    const rows: any[] = await phrases().aggregate([
      { $match: { refId: userId, status: "pending", pendingExpiresAt: { $gt: new Date() } } },
      { $group: { _id: "$language", count: { $sum: 1 }, expiresAt: { $min: "$pendingExpiresAt" } } },
      { $sort: { _id: 1 } },
    ]);
    return rows
      .filter((row) => toCode(row._id))
      .map((row) => ({ language: toCode(row._id) as string, count: row.count, expiresAt: new Date(row.expiresAt).toISOString() }));
  }

  // --- the profile copy ------------------------------------------------------------------

  /**
   * Accounts from before multilingual study English: give them an English language profile
   * and mark onboarding done, once, so they never see the first-run steps (B-07, D-20). A
   * new account has `onboardingState: "needs_language"` from sign-up, so it is skipped.
   */
  private static async adoptLegacyAccount(userId: string, profile: any): Promise<any> {
    if (profile?.onboardingState) return profile;
    if (await languageProfiles().exists({ userId })) return profile;

    try {
      await languageProfiles().updateOne(
        { userId, language: DEFAULT_LANGUAGE },
        {
          $setOnInsert: {
            userId,
            language: DEFAULT_LANGUAGE,
            status: "active",
            startLevel: "A1",
            startLevelSource: "default",
            goals: [],
            starterPack: { state: "none", heard: [], total: 0 },
            addedAt: profile?.createdAt ? new Date(profile.createdAt) : new Date(),
          },
        },
        { upsert: true }
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }

    const set: Record<string, unknown> = { onboardingState: "done" };
    if (!profile?.learningLanguage) set.learningLanguage = DEFAULT_LANGUAGE;
    if (!profile?.translationLanguage) {
      const guess = await this.guessOwnLanguage(userId);
      if (guess) set.translationLanguage = guess;
    }
    await profiles().updateOne(
      { refId: userId, onboardingState: { $exists: false } },
      { $set: set, $setOnInsert: { refId: userId } },
      { upsert: !profile }
    );
    return profiles().findOne({ refId: userId }).lean();
  }

  /** The own language an existing learner translated into most, from their recent phrases. */
  private static async guessOwnLanguage(userId: string): Promise<LangCode | undefined> {
    const rows: any[] = await phrases().aggregate([
      { $match: { refId: userId } },
      { $sort: { createdAt: -1 } },
      { $limit: 200 },
      { $group: { _id: { $ifNull: ["$language_info.target", "$translation_language"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    for (const row of rows) {
      const code = toCode(row._id);
      if (code && getOwnLanguage(code)) return code;
    }
    return undefined;
  }

  /**
   * Repair the profile copy from `language_profile` and apply the plan limit
   * (ADR-006 points 7 and 8, B-33). Active and paused languages are ranked: `preferred`
   * first (the learner's choice in `pause-languages`), then the active language, then the
   * other active ones and then the paused ones, oldest first. The first `maxLanguages` are
   * active, the rest paused: going down a plan pauses the extras, going up brings them back.
   */
  static async syncProfile(
    userId: string,
    plan: LanguagePlan,
    preferred: LangCode[] = []
  ): Promise<{ profile: any; languages: LanguageProfile[] }> {
    for (let attempt = 1; ; attempt++) {
      const result = await this.syncOnce(userId, plan, preferred);
      if (result.settled || attempt >= SYNC_ATTEMPTS) return result;
    }
  }

  /**
   * One repair pass. The profile write is conditional on the two arrays still holding what
   * this pass read: a parallel `add-language` may have pushed its language in between, and
   * an unconditional `$set` would erase that push and free its slot (a lost update). A
   * pass that loses that race reports `settled: false` and the caller runs another.
   */
  private static async syncOnce(
    userId: string,
    plan: LanguagePlan,
    preferred: LangCode[]
  ): Promise<{ profile: any; languages: LanguageProfile[]; settled: boolean }> {
    let profile: any = await profiles().findOne({ refId: userId }).lean();
    profile = await this.adoptLegacyAccount(userId, profile);
    let languages = (await languageProfiles().find({ userId }).lean()) as unknown as LanguageProfile[];

    const studied = languages.filter((lp) => lp.status === "active" || lp.status === "paused");
    const current = toCode(profile?.learningLanguage);
    const ranked: LanguageProfile[] = [];
    const take = (lp?: LanguageProfile) => lp && !ranked.includes(lp) && ranked.push(lp);
    for (const code of preferred) take(studied.find((lp) => lp.language === code));
    take(studied.find((lp) => lp.language === current && lp.status === "active"));
    studied.filter((lp) => lp.status === "active").sort(byAddedAt).forEach(take);
    studied.filter((lp) => lp.status === "paused").sort(byAddedAt).forEach(take);

    // An add in flight has pushed its language here (its slot) but not yet written the
    // language profile. Dropping it would free the slot for a parallel add and break the
    // limit, so it is kept while the profile write is recent. An entry left by an add that
    // failed outright is dropped once that write is old.
    const recent = profile?.updatedAt && Date.now() - new Date(profile.updatedAt).getTime() < IN_FLIGHT_MS;
    const inFlight: LangCode[] = recent
      ? (profile.learningLanguages || []).filter((code: string) => !languages.some((lp) => lp.language === code))
      : [];

    const active = ranked.slice(0, Math.max(plan.maxLanguages - inFlight.length, 0));
    const paused = ranked.slice(active.length);

    let changed = false;
    for (const lp of ranked) {
      const want: LanguageStatus = active.includes(lp) ? "active" : "paused";
      if (lp.status === want) continue;
      const result = await languageProfiles().updateOne({ _id: lp._id, status: lp.status }, { $set: { status: want } });
      if (result.modifiedCount) {
        lp.status = want;
        changed = true;
      }
    }
    if (changed) languages = (await languageProfiles().find({ userId }).lean()) as unknown as LanguageProfile[];

    const activeCodes = [...active.filter((lp) => lp.status === "active").map((lp) => lp.language), ...inFlight];
    const pausedCodes = paused.filter((lp) => lp.status === "paused").map((lp) => lp.language);
    const learningLanguage = current && activeCodes.includes(current) ? current : activeCodes[0] ?? null;
    const onboardingState = activeCodes.length > 0 ? "done" : "needs_language";

    const set: Record<string, unknown> = {};
    if (!sameList(profile?.learningLanguages, activeCodes)) set.learningLanguages = activeCodes;
    if (!sameList(profile?.pausedLanguages, pausedCodes)) set.pausedLanguages = pausedCodes;
    if ((profile?.learningLanguage ?? null) !== learningLanguage) set.learningLanguage = learningLanguage;
    if (profile?.onboardingState !== onboardingState) set.onboardingState = onboardingState;
    if (Object.keys(set).length === 0) return { profile, languages, settled: true };

    const unchanged = (field: string) => (Array.isArray(profile?.[field]) ? { [field]: profile[field] } : { [field]: { $exists: false } });
    const result = profile
      ? await profiles().updateOne({ refId: userId, ...unchanged("learningLanguages"), ...unchanged("pausedLanguages") }, { $set: set })
      : await profiles().updateOne({ refId: userId }, { $set: set, $setOnInsert: { refId: userId } }, { upsert: true });
    if (profile && !result.matchedCount) return { profile, languages, settled: false };
    return { profile: { ...(profile || { refId: userId }), ...set }, languages, settled: true };
  }

  // --- writes ----------------------------------------------------------------------------

  /**
   * Add a language, or bring back a removed or paused one with all its data (B-05, B-33).
   * Makes it the active language, moves kept phrases in (B-32), and offers the starter
   * pack for a new A1 language that has one (B-07).
   */
  static async addLanguage(
    userId: string,
    args: { language?: unknown; startLevel?: unknown; startLevelSource?: unknown; goals?: unknown }
  ): Promise<{ state: LanguageState }> {
    requireUser(userId);
    const caps = requireLearningLanguage(args.language);
    const language = caps.code;

    const startLevel = (args.startLevel ?? "A1") as CefrStart;
    if (!CEFR_STARTS.includes(startLevel)) throw invalid(`startLevel must be one of ${CEFR_STARTS.join(", ")}`);
    const startLevelSource = args.startLevelSource ?? "default";
    if (startLevelSource !== "test" && startLevelSource !== "default") throw invalid('startLevelSource must be "test" or "default"');
    const goals = args.goals === undefined ? undefined : validateGoals(args.goals);

    const plan = await getLanguagePlan(userId);
    const { profile } = await this.syncProfile(userId, plan);
    const existing = await this.getLanguageProfile(userId, language);

    if (existing?.status === "purging") throw new LanguageError("purging", { language });

    if (existing?.status !== "active") {
      await this.claimSlot(userId, language, plan);
      try {
        if (existing) await this.restore(existing);
        else await this.create(userId, language, { startLevel, startLevelSource, goals, own: toCode(profile?.translationLanguage) });
      } catch (error) {
        await profiles().updateOne({ refId: userId }, { $pull: { learningLanguages: language } });
        throw error;
      }
    }

    await profiles().updateOne({ refId: userId }, { $set: { learningLanguage: language, onboardingState: "done" } });
    // The language's Leitner document and the review reminder (B-10); before the kept
    // phrases move in, so their Pool entries see its settings.
    try {
      await LeitnerService.ensureInitialized(userId, language);
    } catch (error) {
      console.error(`[language] Could not set up review for ${userId}/${language}`, error);
    }
    await this.movePendingIn(userId, language);

    if (existing?.status !== "active") {
      const languageProfile = (await this.getLanguageProfile(userId, language)) as LanguageProfile;
      for (const hook of languageAddedHooks) {
        try {
          await hook({ userId, language, restored: Boolean(existing), languageProfile });
        } catch (error) {
          console.error(`[language] onLanguageAdded hook failed for ${userId}/${language}`, error);
        }
      }
    }

    return { state: await this.getState(userId) };
  }

  /**
   * The plan limit as one conditional update (ADR-006 point 8): push the language only where
   * it is not there yet and the array has fewer than `maxLanguages` entries. Of two parallel
   * calls at the limit, exactly one matches.
   */
  private static async claimSlot(userId: string, language: LangCode, plan: LanguagePlan): Promise<void> {
    const result = await profiles().updateOne(
      {
        refId: userId,
        learningLanguages: { $ne: language },
        [`learningLanguages.${plan.maxLanguages - 1}`]: { $exists: false },
      },
      { $push: { learningLanguages: language }, $pull: { pausedLanguages: language } }
    );
    if (result.modifiedCount) return;

    const profile: any = await profiles().findOne({ refId: userId }, { learningLanguages: 1 }).lean();
    // A parallel add of the same language got there first: the slot is ours too.
    if (profile?.learningLanguages?.includes(language)) return;
    throw new LanguageError("upgrade_needed", { plan: plan.plan, maxLanguages: plan.maxLanguages });
  }

  private static async create(
    userId: string,
    language: LangCode,
    options: { startLevel: CefrStart; startLevelSource: "test" | "default"; goals?: string[]; own?: LangCode }
  ): Promise<void> {
    const hasPack = getLearningLanguage(language)?.features.starterPack === true;
    try {
      await languageProfiles().updateOne(
        { userId, language },
        {
          $setOnInsert: {
            userId,
            language,
            status: "active",
            startLevel: options.startLevel,
            startLevelSource: options.startLevelSource,
            goals: options.goals ?? [],
            ...(options.own ? { explanationLanguage: options.own } : {}),
            starterPack: { state: options.startLevel === "A1" && hasPack ? "offered" : "none", heard: [], total: 0 },
            addedAt: new Date(),
          },
        },
        { upsert: true }
      );
    } catch (error) {
      // A parallel add of the same language created it first.
      if (!isDuplicateKeyError(error)) throw error;
    }
  }

  /** Removed or paused → active, with every setting and record it had. */
  private static async restore(existing: LanguageProfile): Promise<void> {
    const result = await languageProfiles().updateOne(
      { _id: existing._id, status: existing.status },
      { $set: { status: "active" }, $unset: { removedAt: 1, purgeAt: 1 } }
    );
    if (result.modifiedCount) return;
    const now: any = await languageProfiles().findOne({ _id: existing._id }, { status: 1 }).lean();
    if (now?.status === "active") return;
    if (!now || now.status === "purging") throw new LanguageError("purging", { language: existing.language });
    throw new Error(`Language ${existing.language} changed while it was being restored; try again`);
  }

  static async setActiveLanguage(userId: string, language: unknown): Promise<{ state: LanguageState }> {
    requireUser(userId);
    const code = toCode(language);
    const lp = code ? await this.getLanguageProfile(userId, code) : null;
    if (!lp || lp.status !== "active") throw new LanguageError("not_active", { language: code ?? String(language ?? "") });
    await profiles().updateOne({ refId: userId }, { $set: { learningLanguage: code } });
    return { state: await this.getState(userId) };
  }

  /**
   * Hide a language now and delete its data after 30 days (Q2, B-05). If it was the active
   * language, the next one becomes active; with none left the learner goes back to first run.
   */
  static async removeLanguage(userId: string, language: unknown): Promise<{ state: LanguageState; purgeAt: string }> {
    requireUser(userId);
    const code = toCode(language);
    const lp = code ? await this.getLanguageProfile(userId, code) : null;
    if (!lp || lp.status === "purging") throw new LanguageError("not_found", { language: code ?? String(language ?? "") });

    let purgeAt = lp.purgeAt ? new Date(lp.purgeAt) : null;
    if (lp.status !== "removed") {
      const now = new Date();
      purgeAt = new Date(now.getTime() + REMOVE_GRACE_DAYS * DAY_MS);
      const result = await languageProfiles().updateOne(
        { _id: lp._id, status: lp.status },
        { $set: { status: "removed", removedAt: now, purgeAt } }
      );
      if (!result.modifiedCount) throw new Error(`Language ${code} changed while it was being removed; try again`);
    }
    await profiles().updateOne({ refId: userId }, { $pull: { learningLanguages: code, pausedLanguages: code } });

    return { state: await this.getState(userId), purgeAt: (purgeAt as Date).toISOString() };
  }

  /**
   * After a downgrade the learner picks the languages that stay active (B-33); the others
   * are paused with their data kept. Spare room under the limit is filled as `syncProfile`
   * always does, so `keep` is "these stay active", not "only these".
   */
  static async pauseLanguages(userId: string, keep: unknown): Promise<{ state: LanguageState }> {
    requireUser(userId);
    if (!Array.isArray(keep) || keep.length === 0) throw invalid("keep must list at least one language");
    const codes = [...new Set(keep.map((value) => toCode(value)))];
    if (codes.some((code) => !code)) throw invalid("keep has a value that is not a language");

    const plan = await getLanguagePlan(userId);
    if (codes.length > plan.maxLanguages) throw new LanguageError("upgrade_needed", { plan: plan.plan, maxLanguages: plan.maxLanguages });

    const studied = await languageProfiles()
      .find({ userId, language: { $in: codes }, status: { $in: ["active", "paused"] } }, { language: 1 })
      .lean();
    const missing = codes.filter((code) => !studied.some((lp: any) => lp.language === code));
    if (missing.length) throw new LanguageError("not_found", { language: missing[0] });

    const { profile } = await this.syncProfile(userId, plan, codes as string[]);
    if (!codes.includes(toCode(profile.learningLanguage))) {
      await profiles().updateOne({ refId: userId }, { $set: { learningLanguage: codes[0] } });
    }
    return { state: await this.getState(userId) };
  }

  /** Per-language settings (B-05): Coach language, intake, Pool, goals. */
  static async updateLanguageSettings(
    userId: string,
    args: {
      language?: unknown;
      explanationLanguage?: unknown;
      newPhrasesPerDay?: unknown;
      poolChunkSize?: unknown;
      poolAgeCutoffDays?: unknown;
      goals?: unknown;
    }
  ): Promise<{ state: LanguageState }> {
    requireUser(userId);
    const code = toCode(args.language);
    const set: Record<string, unknown> = {};
    if (args.explanationLanguage !== undefined) {
      const own = getOwnLanguage(args.explanationLanguage);
      if (!own) throw new LanguageError("not_available", { language: String(args.explanationLanguage) });
      set.explanationLanguage = own.code;
    }
    if (args.newPhrasesPerDay !== undefined) set.newPhrasesPerDay = validateInt(args.newPhrasesPerDay, 1, 100, "newPhrasesPerDay");
    if (args.poolChunkSize !== undefined) set.poolChunkSize = validateInt(args.poolChunkSize, 1, 100, "poolChunkSize");
    if (args.poolAgeCutoffDays !== undefined) set.poolAgeCutoffDays = validateInt(args.poolAgeCutoffDays, 1, 90, "poolAgeCutoffDays");
    if (args.goals !== undefined) set.goals = validateGoals(args.goals);

    const filter = { userId, language: code, status: { $in: ["active", "paused"] } };
    const found = code
      ? Object.keys(set).length
        ? (await languageProfiles().updateOne(filter, { $set: set })).matchedCount > 0
        : Boolean(await languageProfiles().exists(filter))
      : false;
    if (!found) throw new LanguageError("not_found", { language: code ?? String(args.language ?? "") });
    return { state: await this.getState(userId) };
  }

  /** The learner's own language (B-05, D-08): any language in the register's own list. */
  static async setTranslationLanguage(userId: string, language: unknown): Promise<{ state: LanguageState }> {
    requireUser(userId);
    const own = getOwnLanguage(language);
    if (!own) throw new LanguageError("not_available", { language: String(language ?? "") });
    await profiles().updateOne({ refId: userId }, { $set: { translationLanguage: own.code }, $setOnInsert: { refId: userId } }, { upsert: true });
    return { state: await this.getState(userId) };
  }

  /** "Tell me" for a language we do not offer yet (B-06). Set and undo; idempotent. */
  static async setLanguageInterest(userId: string, language: unknown, on: unknown): Promise<{ on: boolean }> {
    requireUser(userId);
    const code = toCode(language);
    if (!code) throw invalid("language is not a language we know");
    if (typeof on !== "boolean") throw invalid("on must be true or false");
    if (on) {
      try {
        await interests().updateOne({ userId, language: code }, { $setOnInsert: { userId, language: code } }, { upsert: true });
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
      }
    } else {
      await interests().deleteOne({ userId, language: code });
    }
    return { on };
  }

  /** How many learners asked for each language, for the team. */
  static async languageInterestCounts(): Promise<{ language: LangCode; count: number }[]> {
    const rows: any[] = await interests().aggregate([{ $group: { _id: "$language", count: { $sum: 1 } } }, { $sort: { count: -1 } }]);
    return rows.map((row) => ({ language: row._id, count: row.count }));
  }

  /**
   * Keep a phrase for a language the learner has not added (B-32, Q6): a phrase document with
   * `status: "pending"`, no bundle, out of review and the save count, deleted after 30 days
   * unless the language is added. Saving the same text again refreshes the 30 days.
   */
  static async keepPhrasePending(userId: string, args: { phrase?: any; language?: unknown }): Promise<{ phraseId: string; expiresAt: string }> {
    requireUser(userId);
    const caps = requireLearningLanguage(args.language);
    if (!caps.features.save) throw new LanguageError("not_available", { language: caps.code });
    const language = caps.code;

    const input = args.phrase;
    if (!input || typeof input !== "object") throw invalid("phrase is required");
    const text = typeof input.phrase === "string" ? input.phrase.trim() : "";
    const translation = typeof input.translation === "string" ? input.translation.trim() : "";
    if (!text || !translation) throw invalid("phrase and translation are required");
    const type = input.type === "linguistic" ? "linguistic" : "normal";

    const expiresAt = new Date(Date.now() + PENDING_DAYS * DAY_MS);
    const existing: any = await phrases().findOne({ refId: userId, phrase: text, type, language, status: "pending" }, { _id: 1 }).lean();

    let phraseId: string;
    if (existing) {
      await phrases().updateOne({ _id: existing._id }, { $set: { pendingExpiresAt: expiresAt } });
      phraseId = String(existing._id);
    } else {
      const waiting = await phrases().countDocuments({ refId: userId, status: "pending" });
      if (waiting >= MAX_PENDING_PHRASES) throw new LanguageError("pending_limit", { max: MAX_PENDING_PHRASES });

      const doc: Record<string, unknown> = {
        phrase: text,
        translation,
        translation_language: typeof input.translation_language === "string" ? input.translation_language.trim() : undefined,
        refId: userId,
        type,
        language,
        languageSource: "user",
        status: "pending",
        pendingExpiresAt: expiresAt,
      };
      if (type === "linguistic") {
        for (const field of ["context", "direction", "language_info", "linguistic_data"]) {
          if (input[field] !== undefined) doc[field] = input[field];
        }
        if (Array.isArray(input.chunks) && input.chunks.length) doc.chunks = input.chunks;
        if (typeof input.sourceUrl === "string" && input.sourceUrl) doc.sourceUrl = normaliseSourceUrl(input.sourceUrl);
      }
      const [inserted] = await phrases().insertMany([doc]);
      phraseId = String(inserted._id);
    }

    // Kept for a language the learner already studies (a stale client): it joins at once.
    const lp = await this.getLanguageProfile(userId, language);
    if (lp?.status === "active") await this.movePendingIn(userId, language);

    return { phraseId, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Move a language's kept phrases into its first bundle (B-32), creating "<Language>
   * phrases" when it has none. They now count as saves and enter the Pool like any new
   * phrase. Returns how many moved.
   */
  static async movePendingIn(userId: string, language: LangCode): Promise<number> {
    const waiting: any[] = await phrases()
      .find({ refId: userId, status: "pending", language, pendingExpiresAt: { $gt: new Date() } }, { _id: 1 })
      .lean();
    if (waiting.length === 0) return 0;

    const bundleId = await this.firstBundle(userId, language);
    const ids = waiting.map((doc) => doc._id);
    const moved: any = await phrases().updateMany(
      { _id: { $in: ids }, status: "pending" },
      { $unset: { status: 1, pendingExpiresAt: 1 } }
    );
    await bundles().updateOne({ _id: bundleId, refId: userId }, { $addToSet: { phrases: { $each: ids } } });

    const count = moved.modifiedCount ?? ids.length;
    try {
      if (count > 0 && (await isUserOnFreemium(userId))) {
        await updateFreemiumAllocation({ userId, increment: { allowed_save_words_used: count } });
      }
      const settings = await LeitnerService.getSettings(userId, language);
      if (settings?.autoEntry) {
        for (const id of ids) await PoolService.add(userId, String(id), language);
      }
    } catch (error) {
      console.error(`[language] Moved ${count} kept phrases for ${userId}/${language}, but the follow-up failed`, error);
    }
    return count;
  }

  /** The oldest bundle of a language, or a new "<Language> phrases" bundle. */
  private static async firstBundle(userId: string, language: LangCode): Promise<any> {
    const found: any = await bundles()
      .findOne({ refId: userId, ...languageFilter(language) }, { _id: 1 })
      .sort({ createdAt: 1 })
      .lean();
    if (found) return found._id;

    const base = `${toTitle(language)} phrases`;
    for (let attempt = 1; attempt <= 5; attempt++) {
      const title = attempt === 1 ? base : `${base} (${attempt})`;
      try {
        const [created] = await bundles().insertMany([{ refId: userId, language, title, phrases: [] }]);
        return created._id;
      } catch (error) {
        // Bundle titles are unique per learner: an older bundle (another language) has it.
        if (!isDuplicateKeyError(error)) throw error;
        const same: any = await bundles().findOne({ refId: userId, title, language }, { _id: 1 }).lean();
        if (same) return same._id;
      }
    }
    throw new Error(`Could not create a bundle for ${language}`);
  }
}
