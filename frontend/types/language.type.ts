/**
 * Types of the multilingual API contract, round 1 (docs repo: docs/tech/multilingual-api.md,
 * section 1). Field names match the contract exactly; do not rename them here.
 */

export type LangCode = string;
export type CefrStart = 'A1' | 'A2' | 'B1' | 'B2';
export type LanguageStatus = 'active' | 'paused' | 'removed' | 'purging';
export type ReviewResult = 'right' | 'close' | 'wrong';
export type Plan = 'starter' | 'reader' | 'learner' | 'coach';

export interface LanguageFeatures {
    save: boolean;
    review: boolean;
    cloze: boolean;
    coachText: boolean;
    coachVoice: boolean;
    levelTest: boolean;
    starterPack: boolean;
    map: boolean;
}

export interface LearningLanguageCaps {
    code: LangCode;
    name: string;
    nativeName: string;
    rtl: boolean;
    ttsVoice: string;
    /** Switched on for learners. A language with `enabled: false` is "coming later". */
    enabled: boolean;
    features: LanguageFeatures;
}

export interface OwnLanguage {
    code: LangCode;
    name: string;
    nativeName: string;
    rtl: boolean;
    explanationReviewed: 'teacher' | 'ai';
}

export interface LanguageCapabilities {
    learning: LearningLanguageCaps[];
    own: OwnLanguage[];
}

export type StarterPackState = 'none' | 'offered' | 'in_progress' | 'done' | 'skipped';

export interface LanguageSummary {
    code: LangCode;
    status: LanguageStatus;
    startLevel: CefrStart;
    startLevelSource: 'test' | 'default';
    dueCount: number;
    phraseCount: number;
    explanationLanguage: LangCode;
    starterPack: { state: StarterPackState; heard: number; total: number };
    /** ISO date, when status = removed. */
    purgeAt?: string;
}

export interface PendingPhrases {
    language: LangCode;
    count: number;
    expiresAt: string;
}

export interface LanguageState {
    /** The learner's own language (L1). */
    translationLanguage: LangCode | null;
    /** Active learning language; null before first run. */
    learningLanguage: LangCode | null;
    /** active + paused + removed (not purging). */
    languages: LanguageSummary[];
    onboardingState: 'needs_language' | 'done';
    plan: Plan;
    /** Starter 1, Reader 3, Learner/Coach 10. */
    maxLanguages: number;
    /** Kept phrases waiting for a language not added yet. */
    pending: PendingPhrases[];
}

export interface AddLanguageArgs {
    language: LangCode;
    startLevel?: CefrStart;
    startLevelSource?: 'test' | 'default';
    goals?: string[];
}

export interface LevelTestTurn {
    ai: string;
    /** In the learner's own language. */
    help?: string;
}

export interface LevelTestStart {
    testId: string;
    turn: LevelTestTurn;
    index: number;
    total: number;
}

export interface LevelTestAnswer {
    turn?: LevelTestTurn;
    index: number;
    total: number;
    done: boolean;
    result?: { startLevel: CefrStart; reason: string };
}

export interface StarterPackItem {
    id: string;
    text: string;
    translation: string;
    audioUrl?: string;
    band: 1 | 2 | 3;
    group: string;
}

export interface StarterPack {
    items: StarterPackItem[];
    heard: string[];
}

export interface LanguageSettingsArgs {
    language: LangCode;
    explanationLanguage?: LangCode;
    newPhrasesPerDay?: number;
    poolChunkSize?: number;
    poolAgeCutoffDays?: number;
    goals?: string[];
}
