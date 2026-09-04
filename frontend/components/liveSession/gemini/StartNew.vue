<template>
    <!-- Loading: the two columns keep their shape while the first bundle page lands. -->
    <div v-if="isLoadingBundles" class="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_374px]">
        <div class="flex flex-col gap-5">
            <StSkeleton class="h-[380px]" />
            <StSkeleton class="h-[440px]" />
        </div>
        <StSkeleton class="h-[500px]" />
    </div>

    <!-- Nothing to practise from. A session runs on a bundle, so this replaces the whole form. -->
    <StCard v-else-if="!bundleList.length" padding="none">
        <StEmptyState
            icon="solar:notebook-bold-duotone"
            color="neutral"
            :title="t('live-session.no-bundles.title')"
            :description="t('live-session.no-bundles.description')"
        >
            <template #action>
                <StButton color="primary" icon="solar:add-circle-bold" @click="goToBundles">{{ t('bundle.add_new.action_add_new') }}</StButton>
            </template>
        </StEmptyState>
    </StCard>

    <div v-else class="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_374px]">
        <!-- Left: pick a bundle, then set the coach up. -->
        <div class="flex min-w-0 flex-col gap-5">
            <StCard padding="lg" class="!rounded-st-xl">
                <div class="mb-4 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 class="font-st-display text-st-lg font-black tracking-st-tight text-st-strong">{{ t('live-session.pick-bundle.title') }}</h2>
                        <p class="mt-1 text-st-base font-semibold text-st-muted">{{ t('live-session.pick-bundle.subtitle') }}</p>
                    </div>
                    <StInput
                        v-model="filter"
                        :placeholder="t('live-session.pick-bundle.search', { count: bundleList.length })"
                        icon="solar:magnifer-linear"
                        class="w-[272px] max-w-full"
                    />
                </div>

                <div class="mb-4 flex flex-wrap gap-2.5">
                    <button
                        v-for="chip in scopeChips"
                        :key="chip.value"
                        type="button"
                        :aria-pressed="scope === chip.value"
                        class="st-focus-ring rounded-st-pill border px-4 py-2 text-st-sm font-bold transition duration-150 ease-out"
                        :class="
                            scope === chip.value
                                ? 'border-st-primary bg-st-primary-soft text-st-primary'
                                : 'border-transparent bg-st-ink-100 text-st-muted hover:bg-st-ink-150 hover:text-st-body'
                        "
                        @click="scope = chip.value"
                    >
                        {{ chip.label }}
                    </button>
                </div>

                <div v-if="visibleBundles.length" class="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                    <button
                        v-for="bundle in visibleBundles"
                        :key="bundle._id"
                        type="button"
                        :aria-pressed="formData.bundleId === bundle._id"
                        class="st-focus-ring flex items-center gap-3.5 rounded-st-lg border-[1.5px] p-3.5 text-left transition duration-200 ease-out"
                        :class="
                            formData.bundleId === bundle._id
                                ? 'border-st-primary bg-st-primary-soft'
                                : 'border-st-line bg-st-card hover:border-st-ink-300 hover:shadow-st-xs'
                        "
                        @click="formData.bundleId = bundle._id"
                    >
                        <BundleGlyph :seed="bundle._id" />
                        <span class="min-w-0 flex-1">
                            <span class="block truncate text-st-base font-extrabold text-st-strong">{{ bundle.title }}</span>
                            <span class="mt-0.5 block text-st-sm font-semibold text-st-muted">{{ bundleMeta(bundle) }}</span>
                        </span>
                        <StIcon v-if="formData.bundleId === bundle._id" name="solar:check-circle-bold" :size="22" class="flex-none text-st-primary" />
                    </button>
                </div>

                <!-- The active chip or the search matched nothing. -->
                <StEmptyState
                    v-else
                    compact
                    icon="solar:magnifer-linear"
                    color="neutral"
                    :title="t('live-session.pick-bundle.no-matches')"
                    :description="t('live-session.pick-bundle.no-matches-description')"
                >
                    <template #action>
                        <StButton variant="outline" color="primary" size="sm" @click="resetFilters">{{ t('bundle.clear_filter') }}</StButton>
                    </template>
                </StEmptyState>
            </StCard>

            <!-- Inert until a bundle is chosen — there is nothing to configure a session over yet. -->
            <StCard padding="lg" class="!rounded-st-xl" :class="formData.bundleId ? '' : 'pointer-events-none opacity-50'">
                <StartLiveSessionForm ref="formRef" v-model="formData" :voice-options="voiceOptions" @start="handleStartLiveSession" />
            </StCard>
        </div>

        <!-- Right: what is about to happen, the budget it spends, and the button that starts it. -->
        <StCard padding="lg" class="!rounded-st-xl xl:sticky xl:top-4">
            <div class="st-overline mb-4">{{ t('live-session.summary.title') }}</div>

            <div v-if="selectedBundle" class="flex items-center gap-3.5">
                <BundleGlyph :seed="selectedBundle._id" />
                <div class="min-w-0">
                    <div class="truncate font-st-display text-st-md font-black tracking-st-tight text-st-strong">{{ selectedBundle.title }}</div>
                    <div class="mt-0.5 truncate text-st-sm font-semibold text-st-muted">{{ summaryBundleMeta }}</div>
                </div>
            </div>
            <p v-else class="text-st-base font-semibold text-st-muted">{{ t('live-session.summary.pick-first') }}</p>

            <div class="my-4 h-px bg-st-line" />

            <dl class="flex flex-col gap-3">
                <div v-for="row in summaryRows" :key="row.label" class="flex items-baseline justify-between gap-3">
                    <dt class="flex-none text-st-base font-semibold text-st-muted">{{ row.label }}</dt>
                    <dd class="min-w-0 truncate text-st-base font-extrabold text-st-strong">{{ row.value }}</dd>
                </div>
            </dl>

            <div class="my-4 h-px bg-st-line" />

            <!-- The budget the chosen mode actually spends: voice minutes, or the freemium
                 session / text-chat allowance. -->
            <div class="mb-5">
                <div class="mb-2.5 flex items-baseline justify-between gap-3">
                    <span class="text-st-base font-bold text-st-strong">{{ budget.label }}</span>
                    <span class="text-st-base font-extrabold text-st-strong">{{ budget.value }}</span>
                </div>
                <StProgressBar :value="budget.used" :max="budget.total || 1" :color="budget.color" size="sm" :aria-label="budget.label" />
                <p v-if="budget.note" class="mt-2.5 text-st-sm font-semibold leading-[1.45] text-st-muted [text-wrap:pretty]">{{ budget.note }}</p>
            </div>

            <!-- At the freemium cap the CTA becomes the upgrade path, which still opens the
                 shared limitation modal. -->
            <FreemiumLimitationModal
                v-if="profileStore.isFreemium"
                :modal-title="t('freemium.limitation.title')"
                :main-message="t('freemium.limitation.no_free_spots_left')"
                :sub-message="t('freemium.limitation.upgrade_to_pro_message')"
                :primary-button-label="t('freemium.limitation.go_pro')"
                :secondary-button-label="t('freemium.limitation.continue_with_limits')"
                @upgrade="handleConfirmUpgrade"
            >
                <template #trigger="{ toggleModal }">
                    <StButton v-if="budget.atLimit" color="primary" size="lg" icon="solar:crown-bold" block @click="toggleModal(true)">
                        {{ t('freemium.limitation.upgrade_now') }}
                    </StButton>
                    <StButton v-else color="primary" size="lg" icon="solar:play-bold" block :disabled="!canStart" @click="startSession">
                        {{ t('live-session.start-session') }}
                    </StButton>
                </template>
            </FreemiumLimitationModal>

            <StButton v-else color="primary" size="lg" icon="solar:play-bold" block :disabled="!canStart" @click="startSession">
                {{ t('live-session.start-session') }}
            </StButton>
        </StCard>
    </div>
</template>

<script setup lang="ts">
    // Standalone "start a new session" entry point bound to the Gemini practice page.
    import { StButton, StCard, StEmptyState, StIcon, StInput, StProgressBar, StSkeleton } from 'subturtle-ui';
    import type { LivePracticeSessionSetupType } from '~/types/live-session.type';
    import type { LiveSessionRequest } from '~/types/live-session-request';
    import { pickPhraseIds, encodeSessionRequest } from '~/utils/livePractice';
    import { bundlePhraseIds, dueCountFor, isNeverPractised } from '~/utils/bundleReviewState';
    import { dataProvider, functionProvider } from '@modular-rest/client';
    import { COLLECTIONS, DATABASE, type PhraseBundleType } from '~/types/database.type';
    import StartLiveSessionForm from '~/components/bundle/StartLiveSessionForm.vue';
    import BundleGlyph from '~/components/bundle/BundleGlyph.vue';
    import FreemiumLimitationModal from '~/components/freemium_alerts/LimitationModal.vue';
    import { useProfileStore } from '~/stores/profile';
    import { useVoiceBalance } from '~/composables/useVoiceBalance';
    import { useLiveSessionVoices } from '~/composables/useLiveSessionVoices';
    import { openVoiceCapModal } from '~/composables/useVoiceCapModal';
    import { rememberLastSession } from '~/composables/useLastSession';

    /** Offline fallback. The server list is the same eight voices plus the one-line
     *  descriptions the coach cards show, so it wins whenever it has loaded. */
    const GEMINI_VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr'];

    /** How many of the newest bundles the "Recent" chip keeps. */
    const RECENT_COUNT = 6;

    const router = useRouter();
    const { t } = useI18n();
    const profileStore = useProfileStore();
    const { voices: serverVoices, ensureLoaded: ensureVoicesLoaded } = useLiveSessionVoices();
    const voiceOptions = computed(() => (serverVoices.value.length ? serverVoices.value : GEMINI_VOICES));

    const { base: voiceBase, baseRemaining: voiceLeft, used: voiceUsed, remaining: voiceRemaining, renewalDate } = useVoiceBalance();

    const bundleList = ref<PhraseBundleType[]>([]);
    const filter = ref('');
    const isLoadingBundles = ref(true);
    const scope = ref<'recent' | 'due' | 'new' | 'all'>('recent');

    // Leitner state for the picker's "N due" counts and its Due today / Never practised
    // filters. `leitner_system` is owner-access, so this comes from the RPC.
    const duePhraseIds = ref<Set<string>>(new Set());
    const practisedPhraseIds = ref<Set<string>>(new Set());

    const controller = dataProvider.list<PhraseBundleType>(
        {
            database: DATABASE.USER_CONTENT,
            collection: COLLECTIONS.PHRASE_BUNDLE,
            query: {
                refId: authUser.value?.id,
                title: { $regex: filter.value, $options: 'i' },
            },
            options: { sort: { _id: -1 } },
        },
        {
            limit: 50,
            page: 1,
            onFetched: (data) => {
                bundleList.value = data;
            },
        }
    );

    onMounted(async () => {
        ensureVoicesLoaded();

        try {
            await controller.updatePagination();
            await controller.fetchPage(1);
        } catch (error) {
            console.error(error);
        } finally {
            isLoadingBundles.value = false;
        }

        // Best-effort: the picker still works without it, just without due counts.
        try {
            const info = await functionProvider.run<{ duePhraseIds?: string[]; phraseToBoxMap?: Record<string, number> }>({
                name: 'get-phrase-management-info',
                args: { userId: authUser.value?.id },
            });
            duePhraseIds.value = new Set(info?.duePhraseIds ?? []);
            practisedPhraseIds.value = new Set(Object.keys(info?.phraseToBoxMap ?? {}));
        } catch (error) {
            console.error('Failed to load review state for bundle counts:', error);
        }
    });

    const formRef = ref<InstanceType<typeof StartLiveSessionForm> | null>(null);

    const formData = reactive({
        bundleId: '',
        aiCharacter: 'Kore',
        selectionMode: 'selection' as 'selection' | 'random',
        fromPhrase: '1',
        toPhrase: '10',
        totalPhrases: '10',
        nativeLanguage: 'auto',
        mode: 'voice' as 'voice' | 'text',
    });

    const isFormValid = computed(() => {
        if (!formRef.value) return false;
        return formData.selectionMode === 'selection' ? !formRef.value.selectionError : !formRef.value.randomError;
    });

    const dueCountOf = (bundle: any) => dueCountFor(bundle, duePhraseIds.value);
    const neverPractised = (bundle: any) => isNeverPractised(bundle, practisedPhraseIds.value);

    function bundleMeta(bundle: any) {
        const phrases = t('live-session.pick-bundle.phrase-count', bundle.phrases?.length ?? 0);
        const due = dueCountOf(bundle);
        return due > 0 ? `${phrases} · ${t('live-session.pick-bundle.due-count', { n: due })}` : phrases;
    }

    const scopeChips = computed(() => [
        { value: 'recent' as const, label: t('live-session.pick-bundle.scope-recent') },
        { value: 'due' as const, label: t('live-session.pick-bundle.scope-due') },
        { value: 'new' as const, label: t('live-session.pick-bundle.scope-new') },
        { value: 'all' as const, label: t('live-session.pick-bundle.scope-all', { count: bundleList.value.length }) },
    ]);

    // The controller's query captures `filter` once at setup (it is built a single time), so
    // the search box narrows the fetched page in memory instead — which is also what the
    // design's instant filtering wants, and costs no request per keystroke.
    const filteredBundles = computed(() => {
        const needle = filter.value.trim().toLowerCase();
        return needle ? bundleList.value.filter((b) => (b.title || '').toLowerCase().includes(needle)) : bundleList.value;
    });

    const visibleBundles = computed(() => {
        const list = filteredBundles.value;
        if (scope.value === 'recent') return list.slice(0, RECENT_COUNT);
        if (scope.value === 'due') return list.filter((b) => dueCountOf(b) > 0);
        if (scope.value === 'new') return list.filter(neverPractised);
        return list;
    });

    const selectedBundle = computed(() => bundleList.value.find((b) => b._id === formData.bundleId) || null);

    // "42 phrases · ES → EN". The bundle list carries phrase ids only, so the language pair
    // comes from one phrase of the chosen bundle; it is dropped when that phrase does not
    // record one (older `normal` phrases often do not).
    const languagePair = ref('');
    watch(
        () => formData.bundleId,
        async (id) => {
            languagePair.value = '';
            const ids = bundlePhraseIds(selectedBundle.value);
            if (!id || !ids.length) return;
            try {
                const phrase = await dataProvider.findOne<any>({
                    database: DATABASE.USER_CONTENT,
                    collection: COLLECTIONS.PHRASE,
                    query: { _id: ids[0] },
                });
                const info = phrase?.language_info;
                if (info?.source && info?.target) languagePair.value = `${short(info.source)} → ${short(info.target)}`;
            } catch (error) {
                console.error('Failed to resolve bundle language pair:', error);
            }
        }
    );

    /** "Spanish" → "ES"; an already-short code is passed through. */
    function short(language: string) {
        const trimmed = String(language || '').trim();
        if (!trimmed) return '';
        if (trimmed.length <= 3) return trimmed.toUpperCase();
        return trimmed.slice(0, 2).toUpperCase();
    }

    const summaryBundleMeta = computed(() => {
        const phrases = t('live-session.pick-bundle.phrase-count', selectedBundle.value?.phrases?.length ?? 0);
        return languagePair.value ? `${phrases} · ${languagePair.value}` : phrases;
    });

    const summaryRows = computed(() => [
        { label: t('live-session.summary.mode'), value: formData.mode === 'text' ? t('live-practice.mode.text') : t('live-practice.mode.voice') },
        ...(formData.mode === 'text' ? [] : [{ label: t('live-session.summary.coach-voice'), value: formData.aiCharacter }]),
        {
            label: t('live-session.summary.fallback'),
            value: formData.nativeLanguage === 'auto' ? t('live-session.summary.fallback-auto') : formData.nativeLanguage,
        },
        {
            label: t('live-session.summary.phrases'),
            value:
                formData.selectionMode === 'random'
                    ? t('live-session.summary.random-count', { n: formData.totalPhrases })
                    : `${formData.fromPhrase}–${formData.toPhrase}`,
        },
    ]);

    const canStart = computed(() => isFormValid.value && !!formData.bundleId);

    /**
     * The meter under the summary. A text session spends no voice minutes, so in text mode it
     * shows the allowance that mode actually consumes: the freemium text-chat count, or (for a
     * paid tier with unlimited text) nothing worth a bar.
     */
    const budget = computed(() => {
        const allocation = profileStore.freemiumAllocation as any;
        const sub = profileStore.activeSubscription as any;

        // Text mode spends no voice minutes, so it shows the allowance it does spend.
        if (formData.mode === 'text') {
            const used = (profileStore.isFreemium ? allocation?.allowed_text_chats_used : sub?.allowed_text_chats_used) ?? 0;
            const total = (profileStore.isFreemium ? allocation?.allowed_text_chats : sub?.allowed_text_chats) ?? 0;
            const pct = total > 0 ? (used / total) * 100 : 0;
            return {
                label: t('live-session.summary.text-chats'),
                value: total > 0 ? t('live-session.summary.n-of-m-left', { left: Math.max(0, total - used), total }) : t('live-session.summary.unlimited'),
                used,
                total,
                atLimit: profileStore.isFreemium && total > 0 && used >= total,
                note: resetNote.value,
                color: pct >= 100 ? ('danger' as const) : pct >= 80 ? ('warning' as const) : ('primary' as const),
            };
        }

        // Voice minutes, for every tier — the freemium allocation carries them too.
        const pct = voiceBase.value > 0 ? (voiceUsed.value / voiceBase.value) * 100 : 0;
        const sessionsUsed = allocation?.allowed_lived_sessions_used ?? 0;
        const sessionsTotal = allocation?.allowed_lived_sessions ?? 0;
        return {
            label: t('live-session.summary.voice-minutes'),
            value: t('live-session.summary.n-of-m-left', { left: voiceLeft.value, total: voiceBase.value }),
            used: voiceUsed.value,
            total: voiceBase.value,
            // On the free tier it is the session count, not the minutes, that blocks a start.
            atLimit: profileStore.isFreemium && sessionsTotal > 0 && sessionsUsed >= sessionsTotal,
            note: [resetNote.value, t('live-session.summary.text-no-minutes')].filter(Boolean).join(' '),
            color: pct >= 100 ? ('danger' as const) : pct >= 80 ? ('warning' as const) : ('primary' as const),
        };
    });

    const resetNote = computed(() => {
        const raw = renewalDate.value;
        if (!raw) return '';
        try {
            const date = new Date(raw);
            if (Number.isNaN(date.getTime())) return '';
            return t('live-session.summary.resets-on', { date: date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) });
        } catch {
            return '';
        }
    });

    function resetFilters() {
        filter.value = '';
        scope.value = 'all';
    }

    function goToBundles() {
        router.push('/bundles');
    }

    function startSession() {
        if (!isFormValid.value || !formData.bundleId) return;

        // Council 004: a paid user out of voice minutes gets the dedicated voice-cap
        // modal (top-up / use text chat) — voice mode only, never for a text session.
        if (!profileStore.isFreemium && formData.mode !== 'text' && voiceRemaining.value <= 0) {
            openVoiceCapModal();
            return;
        }

        const sessionData: LivePracticeSessionSetupType = {
            aiCharacter: formData.aiCharacter,
            selectionMode: formData.selectionMode,
            nativeLanguage: formData.nativeLanguage,
        };

        if (formData.selectionMode === 'selection') {
            sessionData.fromPhrase = parseInt(formData.fromPhrase);
            sessionData.toPhrase = parseInt(formData.toPhrase);
        } else {
            sessionData.totalPhrases = parseInt(formData.totalPhrases);
        }

        handleStartLiveSession(sessionData);
    }

    function handleStartLiveSession(sessionData: LivePracticeSessionSetupType) {
        // Build the unified request the /practice/live-session dispatcher consumes:
        // resolve the selection to concrete phrase ids from the chosen bundle and carry
        // the practice mode, then route through the gate. The old `live-session-<id>`
        // path matched no route (404) and dropped the mode field entirely. [B2]
        const bundle = bundleList.value.find((b) => b._id === formData.bundleId);
        const request: LiveSessionRequest = {
            aiCharacter: sessionData.aiCharacter,
            nativeLanguage: sessionData.nativeLanguage,
            mode: formData.mode,
            title: bundle?.title,
            source: { phraseIds: pickPhraseIds(bundle?.phrases ?? [], sessionData) },
            returnTo: '/sessions/new',
        };

        // Feeds the header's "Repeat your last session". Stored here rather than read back
        // from session history, which is a Learner+ RPC that throws for the free tier.
        rememberLastSession({ bundleId: formData.bundleId, mode: formData.mode, setup: sessionData, title: bundle?.title });

        const session = encodeSessionRequest(request);
        router.push(`/practice/live-session?session=${encodeURIComponent(session)}`);
    }

    function handleConfirmUpgrade() {
        router.push('/settings/subscription');
    }

    /** Re-applies the last session's setup to the form; the page's own Start does the rest. */
    function applyLastSession(last: { bundleId: string; mode: 'voice' | 'text'; setup: LivePracticeSessionSetupType }) {
        if (!bundleList.value.some((b) => b._id === last.bundleId)) return false;
        formData.bundleId = last.bundleId;
        formData.mode = last.mode;
        formData.aiCharacter = last.setup.aiCharacter;
        formData.nativeLanguage = last.setup.nativeLanguage ?? 'auto';
        formData.selectionMode = last.setup.selectionMode;
        if (last.setup.selectionMode === 'random') {
            formData.totalPhrases = String(last.setup.totalPhrases ?? 10);
        } else {
            formData.fromPhrase = String(last.setup.fromPhrase ?? 1);
            formData.toPhrase = String(last.setup.toPhrase ?? 10);
        }
        return true;
    }

    defineExpose({ applyLastSession });
</script>
