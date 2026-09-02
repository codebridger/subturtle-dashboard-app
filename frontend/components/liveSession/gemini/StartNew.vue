<template>
    <!-- Loading: the two columns keep their shape while the first bundle page lands. -->
    <div v-if="isLoadingBundles" class="grid grid-cols-1 gap-[14px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div class="flex flex-col gap-[14px]">
            <StSkeleton class="h-[260px]" />
            <StSkeleton class="h-[420px]" />
        </div>
        <StSkeleton class="h-[380px]" />
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

    <div v-else class="grid grid-cols-1 items-start gap-[14px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <!-- Left: pick a bundle, then set the coach up. -->
        <div class="flex min-w-0 flex-col gap-[14px]">
            <StCard padding="lg">
                <div class="mb-[14px] flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 class="font-st-display text-st-lg font-black tracking-st-tight text-st-strong">{{ t('live-session.pick-bundle.title') }}</h2>
                        <p class="mt-1 text-st-sm font-semibold text-st-muted">{{ t('live-session.pick-bundle.subtitle') }}</p>
                    </div>
                    <StInput v-model="filter" :placeholder="t('bundle.filter_bundles')" icon="solar:magnifer-linear" class="w-[220px]" />
                </div>

                <!-- Recent / All only. The design also offers "Due today" and "Never practised",
                     and neither has a data source: Leitner due-counts live per phrase in another
                     database, and a bundle carries no last-practised marker. -->
                <div class="mb-[14px] flex flex-wrap gap-2">
                    <button
                        v-for="chip in scopeChips"
                        :key="chip.value"
                        type="button"
                        :aria-pressed="scope === chip.value"
                        class="st-focus-ring rounded-st-pill px-[13px] py-[5px] text-st-xs font-extrabold transition duration-150 ease-out"
                        :class="
                            scope === chip.value
                                ? 'bg-st-primary text-white shadow-st-sm'
                                : 'bg-st-ink-100 text-st-muted hover:bg-st-ink-150 hover:text-st-body'
                        "
                        @click="scope = chip.value"
                    >
                        {{ chip.label }}
                    </button>
                </div>

                <div v-if="visibleBundles.length" class="grid grid-cols-1 gap-[10px] sm:grid-cols-2">
                    <button
                        v-for="bundle in visibleBundles"
                        :key="bundle._id"
                        type="button"
                        :aria-pressed="formData.bundleId === bundle._id"
                        class="st-focus-ring flex items-center gap-3 rounded-st-md border-[1.5px] p-3 text-left transition duration-200 ease-out"
                        :class="
                            formData.bundleId === bundle._id
                                ? 'border-st-primary bg-st-primary-soft shadow-st-sm'
                                : 'border-st-line bg-st-card hover:border-st-ink-300 hover:shadow-st-xs'
                        "
                        @click="formData.bundleId = bundle._id"
                    >
                        <span
                            class="flex h-10 w-10 flex-none items-center justify-center rounded-st-sm"
                            :class="formData.bundleId === bundle._id ? 'bg-st-primary text-white' : 'bg-st-ink-100 text-st-muted'"
                        >
                            <StIcon name="solar:notebook-bold-duotone" :size="20" />
                        </span>
                        <span class="min-w-0 flex-1">
                            <span class="block truncate text-st-sm font-extrabold text-st-strong">{{ bundle.title }}</span>
                            <span class="mt-0.5 block text-st-xs font-semibold text-st-muted">
                                {{ t('live-session.pick-bundle.phrase-count', bundle.phrases?.length ?? 0) }}
                            </span>
                        </span>
                        <StIcon v-if="formData.bundleId === bundle._id" name="solar:check-circle-bold" :size="18" class="flex-none text-st-primary" />
                    </button>
                </div>

                <!-- Filter matched nothing. The fix is to clear the filter, not to make a bundle. -->
                <StEmptyState
                    v-else
                    compact
                    icon="solar:magnifer-linear"
                    color="neutral"
                    :title="t('bundle.no-matches', { filter })"
                    :description="t('bundle.no-matches-description')"
                >
                    <template #action>
                        <StButton variant="outline" color="primary" size="sm" @click="filter = ''">{{ t('bundle.clear_filter') }}</StButton>
                    </template>
                </StEmptyState>
            </StCard>

            <!-- Inert until a bundle is chosen — there is nothing to configure a session over yet. -->
            <StCard padding="lg" :class="formData.bundleId ? '' : 'pointer-events-none opacity-50'">
                <StartLiveSessionForm ref="formRef" v-model="formData" :voice-options="GEMINI_VOICES" @start="handleStartLiveSession" />
            </StCard>
        </div>

        <!-- Right: what is about to happen, the budget it spends, and the button that starts it. -->
        <StCard padding="lg" class="xl:sticky xl:top-4">
            <h2 class="font-st-display text-st-md font-black tracking-st-tight text-st-strong">{{ t('live-session.summary.title') }}</h2>

            <dl class="mt-[14px] flex flex-col gap-2.5">
                <div v-for="row in summaryRows" :key="row.label" class="flex items-baseline justify-between gap-3">
                    <dt class="flex-none text-st-xs font-bold uppercase tracking-st-caps text-st-faint">{{ row.label }}</dt>
                    <dd class="min-w-0 truncate text-st-sm font-extrabold text-st-strong">{{ row.value }}</dd>
                </div>
            </dl>

            <div class="my-[18px] h-px bg-st-ink-150" />

            <!-- Freemium: the session / text-chat allowance, with voice minutes as a sub-line in
                 voice mode — FreemiumLimitCard's content folded into the panel. At the cap the
                 CTA becomes the upgrade path, which still opens the shared limitation modal. -->
            <template v-if="profileStore.isFreemium">
                <div class="mb-[14px]">
                    <div class="mb-1.5 flex items-baseline justify-between gap-2">
                        <span class="text-st-sm font-bold text-st-body">{{ freemium.label }}</span>
                        <span class="text-st-sm font-extrabold text-st-strong">{{ freemium.used }}/{{ freemium.total }}</span>
                    </div>
                    <StProgressBar :value="freemium.used" :max="freemium.total || 1" :color="freemium.color" size="sm" :aria-label="freemium.label" />
                    <p v-if="formData.mode !== 'text'" class="mt-1.5 text-st-xs font-semibold text-st-muted">{{ voiceLeftLabel }}</p>
                </div>

                <FreemiumLimitationModal
                    :modal-title="t('freemium.limitation.title')"
                    :main-message="t('freemium.limitation.no_free_spots_left')"
                    :sub-message="t('freemium.limitation.upgrade_to_pro_message')"
                    :primary-button-label="t('freemium.limitation.go_pro')"
                    :secondary-button-label="t('freemium.limitation.continue_with_limits')"
                    @upgrade="handleConfirmUpgrade"
                >
                    <template #trigger="{ toggleModal }">
                        <StButton v-if="freemium.atLimit" color="primary" icon="solar:crown-bold" block @click="toggleModal(true)">
                            {{ t('freemium.limitation.upgrade_now') }}
                        </StButton>
                        <StButton v-else color="primary" icon="solar:play-bold" block :disabled="!canStart" @click="startSession">
                            {{ t('live-practice.start') }}
                        </StButton>
                    </template>
                </FreemiumLimitationModal>
            </template>

            <!-- Paid: the voice-minute meter (or the Reader text-chat counter), then start. -->
            <template v-else>
                <div class="mb-[14px]">
                    <VoiceMeter v-if="formData.mode !== 'text'" size="sm" />
                    <TextChatCounter v-else />
                </div>
                <StButton color="primary" icon="solar:play-bold" block :disabled="!canStart" @click="startSession">{{ t('live-practice.start') }}</StButton>
            </template>

            <p v-if="!formData.bundleId" class="mt-2.5 text-center text-st-xs font-semibold text-st-muted">{{ t('live-session.summary.pick-first') }}</p>
        </StCard>
    </div>
</template>

<script setup lang="ts">
    // Standalone "start a new session" entry point bound to the Gemini practice page.
    import { StButton, StCard, StEmptyState, StIcon, StInput, StProgressBar, StSkeleton } from 'subturtle-ui';
    import type { LivePracticeSessionSetupType } from '~/types/live-session.type';
    import type { LiveSessionRequest } from '~/types/live-session-request';
    import { pickPhraseIds, encodeSessionRequest } from '~/utils/livePractice';
    import { dataProvider } from '@modular-rest/client';
    import { COLLECTIONS, DATABASE, type PhraseBundleType } from '~/types/database.type';
    import StartLiveSessionForm from '~/components/bundle/StartLiveSessionForm.vue';
    import FreemiumLimitationModal from '~/components/freemium_alerts/LimitationModal.vue';
    import VoiceMeter from '~/components/VoiceMeter.vue';
    import TextChatCounter from '~/components/TextChatCounter.vue';
    import { useProfileStore } from '~/stores/profile';
    import { useVoiceBalance } from '~/composables/useVoiceBalance';
    import { openVoiceCapModal } from '~/composables/useVoiceCapModal';

    const GEMINI_VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr'];

    /** How many of the newest bundles the "Recent" chip keeps. */
    const RECENT_COUNT = 6;

    const router = useRouter();
    const { t } = useI18n();
    const profileStore = useProfileStore();
    const { remaining: voiceRemaining, leftLabel: voiceLeftLabel } = useVoiceBalance();

    const bundleList = ref<PhraseBundleType[]>([]);
    const filter = ref('');
    const isLoadingBundles = ref(true);
    const scope = ref<'recent' | 'all'>('recent');

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
        try {
            await controller.updatePagination();
            await controller.fetchPage(1);
        } catch (error) {
            console.error(error);
        } finally {
            isLoadingBundles.value = false;
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

    const scopeChips = computed(() => [
        { value: 'recent' as const, label: t('live-session.pick-bundle.scope-recent') },
        { value: 'all' as const, label: t('live-session.pick-bundle.scope-all') },
    ]);

    // The controller's query captures `filter` once at setup (it is built a single time), so
    // the search box narrows the fetched page in memory instead — which is also what the
    // design's instant filtering wants, and costs no request per keystroke.
    const filteredBundles = computed(() => {
        const needle = filter.value.trim().toLowerCase();
        return needle ? bundleList.value.filter((b) => (b.title || '').toLowerCase().includes(needle)) : bundleList.value;
    });
    const visibleBundles = computed(() => (scope.value === 'recent' ? filteredBundles.value.slice(0, RECENT_COUNT) : filteredBundles.value));

    const selectedBundle = computed(() => bundleList.value.find((b) => b._id === formData.bundleId) || null);

    const summaryRows = computed(() => [
        { label: t('live-session.summary.bundle'), value: selectedBundle.value?.title || '—' },
        { label: t('live-practice.mode.label'), value: formData.mode === 'text' ? t('live-practice.mode.text') : t('live-practice.mode.voice') },
        ...(formData.mode === 'text' ? [] : [{ label: t('live-practice.ai-character'), value: formData.aiCharacter }]),
        {
            label: t('live-session.summary.fallback'),
            value: formData.nativeLanguage === 'auto' ? t('live-practice.native-language-auto') : formData.nativeLanguage,
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

    // The freemium allowance behind the summary meter: sessions in voice mode, text chats in
    // text mode — the same split FreemiumLimitCard made, in the panel the design asks for.
    const freemium = computed(() => {
        const allocation = profileStore.freemiumAllocation as any;
        const isText = formData.mode === 'text';
        const used = (isText ? allocation?.allowed_text_chats_used : allocation?.allowed_lived_sessions_used) ?? 0;
        const total = (isText ? allocation?.allowed_text_chats : allocation?.allowed_lived_sessions) ?? 0;
        const pct = total > 0 ? (used / total) * 100 : 0;
        return {
            label: isText ? t('live-session.summary.free-chats') : t('live-session.summary.free-sessions'),
            used,
            total,
            atLimit: total > 0 && used >= total,
            color: pct >= 100 ? ('danger' as const) : pct >= 80 ? ('warning' as const) : ('primary' as const),
        };
    });

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
        const session = encodeSessionRequest(request);
        router.push(`/practice/live-session?session=${encodeURIComponent(session)}`);
    }

    function handleConfirmUpgrade() {
        router.push('/settings/subscription');
    }
</script>
