import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type {
    AddLanguageArgs,
    LangCode,
    LanguageCapabilities,
    LanguageFeatures,
    LanguageSettingsArgs,
    LanguageState,
    LanguageSummary,
    LearningLanguageCaps,
    OwnLanguage,
} from '~/types/language.type';
import { isCapabilities, isLanguageState, languageApi, LanguageApiError } from '~/utils/languageApi';
import { setLanguageScope } from '~/utils/languageScope';
import { isRtl, languageName, nativeLanguageName } from '~/utils/languages';
import { analytic, registerLanguageAnalytics } from '~/plugins/mixpanel';
import { ANALYTICS_EVENTS } from '~/constants/analyticsEvents';

/**
 * The learner's languages (D-01): capabilities, the language state, the active language and
 * the own language, loaded once in the profile store's bootstrap.
 *
 * THE FLAG. Multilingual is on only when the server answers both `get-language-capabilities`
 * (with at least one learning language) and `get-language-state`. Until then `enabled` stays
 * false, the header menu and the language screens stay hidden, `withLanguage()` adds nothing to
 * any request, and the dashboard behaves exactly as the English-only one did. A failure of
 * either call is never shown to the learner; it only keeps the flag off.
 */

/** What an English-only learner looks like while the flag is off, so screens need no null checks. */
const ENGLISH_ONLY: LanguageFeatures = {
    save: true,
    review: true,
    cloze: true,
    coachText: true,
    coachVoice: true,
    levelTest: false,
    starterPack: false,
    map: false,
};

type Status = 'idle' | 'loading' | 'ready' | 'off';

/** Callbacks run after a switch; language-scoped stores register their reset here. */
const switchListeners = new Set<() => void | Promise<void>>();

export function onLanguageSwitch(listener: () => void | Promise<void>) {
    switchListeners.add(listener);
    return () => switchListeners.delete(listener);
}

export const useLanguageStore = defineStore('language', () => {
    const capabilities = ref<LanguageCapabilities | null>(null);
    const state = ref<LanguageState | null>(null);
    const status = ref<Status>('idle');
    /** True while a switch reloads the language-scoped stores (screens show a skeleton). */
    const switching = ref(false);

    const enabled = computed(() => status.value === 'ready' && !!capabilities.value && !!state.value);

    /** The active learning language. English while the flag is off or before first run. */
    const activeLanguage = computed<LangCode>(() => (enabled.value && state.value?.learningLanguage) || 'en');
    /** The learner's own language, or null when the server does not know it yet. */
    const ownLanguage = computed<LangCode | null>(() => (enabled.value ? state.value?.translationLanguage ?? null : null));

    const learningCaps = computed<LearningLanguageCaps[]>(() => capabilities.value?.learning ?? []);
    const ownLanguages = computed<OwnLanguage[]>(() => capabilities.value?.own ?? []);

    const allSummaries = computed<LanguageSummary[]>(() => state.value?.languages ?? []);
    /** The learner's languages in the switcher: active status only (paused and removed are not). */
    const languages = computed(() => allSummaries.value.filter((l) => l.status === 'active'));
    const pausedLanguages = computed(() => allSummaries.value.filter((l) => l.status === 'paused'));
    const removedLanguages = computed(() => allSummaries.value.filter((l) => l.status === 'removed'));
    const activeSummary = computed(() => allSummaries.value.find((l) => l.code === activeLanguage.value) ?? null);

    const pending = computed(() => state.value?.pending ?? []);
    const plan = computed(() => state.value?.plan ?? 'starter');
    const maxLanguages = computed(() => state.value?.maxLanguages ?? 1);
    /** Paused languages do not count: after a downgrade they wait for an upgrade (B-33). */
    const usedCount = computed(() => languages.value.length);
    const atLimit = computed(() => usedCount.value >= maxLanguages.value);
    /** Starter has one language and no swap: adding always offers an upgrade (Q14). */
    const canAdd = computed(() => enabled.value && !atLimit.value);

    /** A learning language not added yet and switched on in the register. */
    const addable = computed(() => {
        const mine = new Set(allSummaries.value.filter((l) => l.status !== 'removed').map((l) => l.code));
        return learningCaps.value.filter((c) => c.enabled && !mine.has(c.code));
    });
    /** Learning languages the register knows but has not switched on yet ("Coming later"). */
    const comingLater = computed(() => learningCaps.value.filter((c) => !c.enabled));

    /**
     * Tell me (B-06). The server's list comes with the state (`interests`); a press on this
     * visit wins over it, so the button never flips back before the next refresh. An older
     * server sends no list: the button then starts at "Tell me" after a reload.
     */
    const interestOverrides = ref<Record<LangCode, boolean>>({});
    const savedInterests = computed(() => new Set(normalizeInterests(state.value?.interests)));

    function isInterested(code: LangCode) {
        return interestOverrides.value[code] ?? savedInterests.value.has(code);
    }

    /** Optimistic; rolls back when the server says no. Returns the final value. */
    async function setInterest(code: LangCode, on: boolean) {
        const before = isInterested(code);
        interestOverrides.value = { ...interestOverrides.value, [code]: on };
        try {
            const res = await languageApi.setLanguageInterest(code, on);
            const final = typeof res?.on === 'boolean' ? res.on : on;
            interestOverrides.value = { ...interestOverrides.value, [code]: final };
            return final;
        } catch (error) {
            interestOverrides.value = { ...interestOverrides.value, [code]: before };
            throw error;
        }
    }

    const needsLanguage = computed(() => enabled.value && state.value?.onboardingState === 'needs_language');

    function capsFor(code?: LangCode | null): LearningLanguageCaps | undefined {
        return learningCaps.value.find((c) => c.code === (code ?? activeLanguage.value));
    }

    /** What a language can do. Hide, never grey out (contract section 5). */
    function features(code?: LangCode | null): LanguageFeatures {
        if (!enabled.value) return ENGLISH_ONLY;
        return capsFor(code)?.features ?? ENGLISH_ONLY;
    }

    function summaryFor(code: LangCode) {
        return allSummaries.value.find((l) => l.code === code) ?? null;
    }

    /** English name, from the register when it has the language. */
    function nameOf(code?: LangCode | null) {
        if (!code) return '';
        return capsFor(code)?.name ?? ownLanguages.value.find((o) => o.code === code)?.name ?? languageName(code);
    }

    function nativeNameOf(code?: LangCode | null) {
        if (!code) return '';
        return capsFor(code)?.nativeName ?? ownLanguages.value.find((o) => o.code === code)?.nativeName ?? nativeLanguageName(code);
    }

    function rtlOf(code?: LangCode | null) {
        if (!code) return false;
        return capsFor(code)?.rtl ?? ownLanguages.value.find((o) => o.code === code)?.rtl ?? isRtl(code);
    }

    function applyState(next: LanguageState | null | undefined) {
        if (!isLanguageState(next)) return;
        state.value = next;
        syncScope();
    }

    function syncScope() {
        setLanguageScope(enabled.value, enabled.value ? activeLanguage.value : null);
        registerLanguageAnalytics(enabled.value ? { learning_language: activeLanguage.value, l1: ownLanguage.value } : null);
    }

    /**
     * Load capabilities and state. Never throws: any failure leaves the flag off and the
     * dashboard English-only.
     */
    async function bootstrap() {
        status.value = 'loading';
        try {
            const [caps, current] = await Promise.all([languageApi.getCapabilities(), languageApi.getState()]);
            if (isCapabilities(caps) && isLanguageState(current)) {
                capabilities.value = caps;
                state.value = current;
                status.value = 'ready';
            } else {
                status.value = 'off';
            }
        } catch (error) {
            if (!(error instanceof LanguageApiError && error.code === 'missing')) {
                console.warn('Multilingual stays off:', error);
            }
            status.value = 'off';
        }
        syncScope();
    }

    async function refreshState() {
        if (!enabled.value) return;
        try {
            applyState(await languageApi.getState());
        } catch (error) {
            console.error('Failed to refresh language state:', error);
        }
    }

    /** Run every registered reset (Leitner, Pool, bundles, Coach) after the active language changed. */
    async function reloadScopedStores() {
        switching.value = true;
        try {
            await Promise.all([...switchListeners].map((fn) => Promise.resolve(fn()).catch((e) => console.error('Language switch reset failed:', e))));
        } finally {
            switching.value = false;
        }
    }

    /**
     * Make a language active (contract section 5): one active language, then every
     * language-scoped store reloads. The caller decides where to go (Today, D-03).
     */
    async function switchLanguage(code: LangCode) {
        if (!enabled.value || code === activeLanguage.value) return;
        const from = activeLanguage.value;
        applyState(await languageApi.setActiveLanguage(code));
        await reloadScopedStores();
        trackLanguageEvent(ANALYTICS_EVENTS.LANGUAGE_SWITCHED, { from_language: from, to_language: code });
    }

    async function addLanguage(args: AddLanguageArgs) {
        const before = activeLanguage.value;
        const next = await languageApi.addLanguage(args);
        applyState(next);
        if (activeLanguage.value !== before) await reloadScopedStores();
        trackLanguageEvent(ANALYTICS_EVENTS.LANGUAGE_ADDED, { language: args.language, start_level: args.startLevel ?? 'A1', start_level_source: args.startLevelSource ?? 'default' });
        return next;
    }

    async function removeLanguage(code: LangCode) {
        const before = activeLanguage.value;
        const { state: next, purgeAt } = await languageApi.removeLanguage(code);
        applyState(next);
        if (activeLanguage.value !== before) await reloadScopedStores();
        trackLanguageEvent(ANALYTICS_EVENTS.LANGUAGE_REMOVED, { language: code });
        return { purgeAt: purgeAt ?? summaryFor(code)?.purgeAt };
    }

    async function setOwnLanguage(code: LangCode) {
        applyState(await languageApi.setTranslationLanguage(code));
    }

    async function updateSettings(args: LanguageSettingsArgs) {
        applyState(await languageApi.updateLanguageSettings(args));
    }

    /** Apply a state a level-test or starter-pack call returned. */
    function setState(next: LanguageState) {
        applyState(next);
    }

    function reset() {
        capabilities.value = null;
        state.value = null;
        interestOverrides.value = {};
        status.value = 'idle';
        syncScope();
    }

    return {
        capabilities,
        state,
        status,
        switching,
        enabled,
        activeLanguage,
        ownLanguage,
        learningCaps,
        ownLanguages,
        languages,
        pausedLanguages,
        removedLanguages,
        activeSummary,
        pending,
        plan,
        maxLanguages,
        usedCount,
        atLimit,
        canAdd,
        addable,
        comingLater,
        isInterested,
        setInterest,
        needsLanguage,
        capsFor,
        features,
        summaryFor,
        nameOf,
        nativeNameOf,
        rtlOf,
        bootstrap,
        refreshState,
        reloadScopedStores,
        switchLanguage,
        addLanguage,
        removeLanguage,
        setOwnLanguage,
        updateSettings,
        setState,
        reset,
    };
});

/**
 * `interests` from get-language-state: language codes. Tolerates `{ language }` rows and
 * anything else a server in the middle of a deploy might send (ignored).
 */
export function normalizeInterests(raw: unknown): LangCode[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((row) => (typeof row === 'string' ? row : row && typeof row === 'object' ? (row as any).language ?? (row as any).code : null))
        .filter((code): code is string => typeof code === 'string' && code.length > 0);
}

/** Fire a multilingual analytics event (D-22). Never lets analytics break a flow. */
export function trackLanguageEvent(event: string, props: Record<string, unknown> = {}) {
    try {
        analytic.track(event, props);
    } catch {
        // Mixpanel is not initialised without a token (CI, e2e) and throws — nothing to do.
    }
}
