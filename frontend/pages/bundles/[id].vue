<template>
    <div class="flex flex-col gap-[22px]">
        <StPageHeader :title="bundleTitle" :overline="t('bundle.collection_label')" :subtitle="subtitle">
            <template #actions>
                <StButton variant="outline" color="neutral" pill icon="solar:microphone-3-bold-duotone" :disabled="!phraseCount" @click="goToLiveSession">
                    {{ t('bundle.detail.live_session') }}
                </StButton>
                <StButton variant="outline" color="neutral" pill :disabled="!phraseCount" @click="openReviewModal">
                    {{ t('bundle.detail.flashcards') }}
                </StButton>
                <StIconButton
                    v-if="bundleStore.bundleDetail"
                    icon="solar:menu-dots-bold"
                    variant="ghost"
                    color="neutral"
                    :aria-label="t('bundle.settings.title')"
                    @click="isSettingsOpen = true"
                />
            </template>
        </StPageHeader>

        <!-- Saves allowance + the primary "add a phrase" action. At the freemium cap the card's
             button becomes the upgrade path, which opens the shared limitation modal. -->
        <FreemiumLimitationModal
            v-if="profileStore.isFreemium"
            :modal-title="t('subscription.save-cap.title')"
            :main-message="t('subscription.save-cap.message')"
            :sub-message="t('subscription.save-cap.sub-message')"
            :primary-button-label="t('subscription.save-cap.primary')"
            :secondary-button-label="t('subscription.save-cap.secondary')"
            auto-redirect-on-upgrade
            @secondary="snoozeSaveCap"
        >
            <template #trigger="{ toggleModal }">
                <BundleSaveQuotaCard @add="bundleStore.addEmptyTemporarilyPhrase()" @upgrade-needed="onSaveCapUpgradeNeeded(toggleModal)" />
            </template>
        </FreemiumLimitationModal>

        <BundleSaveQuotaCard v-else @add="bundleStore.addEmptyTemporarilyPhrase()" />

        <section class="flex flex-col gap-3.5">
            <div class="flex flex-wrap items-baseline justify-between gap-3">
                <h2 class="font-st-display text-st-lg font-black tracking-st-tight text-st-strong">{{ t('bundle.detail.phrases_title') }}</h2>
                <span v-if="phraseCount" class="text-st-sm font-semibold text-st-faint">
                    {{ t('bundle.showing_count', { shown: bundleStore.phrases.length, total: phraseCount }) }}
                </span>
            </div>

            <!-- Loading: four card placeholders, so the column keeps its shape while the first page lands. -->
            <div v-if="isPhraseListLoading && !bundleStore.phrases.length" class="flex flex-col gap-3.5">
                <StSkeleton v-for="n in 4" :key="n" class="h-[164px]" />
            </div>

            <StCard v-else-if="!bundleStore.phrases.length && !bundleStore.tempPhrases.length" padding="none">
                <StEmptyState
                    icon="solar:notebook-bold-duotone"
                    color="neutral"
                    :title="t('bundle.detail.no_phrases')"
                    :description="t('bundle.detail.no_phrases_description')"
                >
                    <template #action>
                        <StButton variant="outline" color="primary" icon="solar:add-circle-bold" @click="bundleStore.addEmptyTemporarilyPhrase()">
                            {{ t('bundle.add_phrase') }}
                        </StButton>
                    </template>
                </StEmptyState>
            </StCard>

            <template v-else>
                <TransitionGroup name="list" tag="div" class="flex flex-col gap-3.5">
                    <BundlePhraseCard v-for="tempPhrase in bundleStore.tempPhrases" :key="tempPhrase.id" :new-phrase="tempPhrase" />

                    <BundlePhraseCard v-for="phrase in savedPhrases" :key="phrase._id" :phrase="phrase" :number="bundleStore.getPhraseNumber(phrase._id)" />
                </TransitionGroup>

                <StPagination
                    v-if="(bundleStore.phrasePagination?.pages ?? 1) > 1"
                    v-model="currentPage"
                    :total-pages="bundleStore.phrasePagination!.pages"
                    :label="t('bundle.detail.phrases_title')"
                    @change-page="fetchPhraseList($event)"
                />
            </template>
        </section>

        <BundleSettingsModal v-if="bundleStore.bundleDetail" :open="isSettingsOpen" :bundle="bundleStore.bundleDetail" @close="isSettingsOpen = false" />

        <!-- Flashcards run over a chosen subset, so the picker is the step between the button
             and /practice/bundle-review. -->
        <StModal
            :open="isReviewModalOpen"
            size="lg"
            :title="t('bundle.detail.review_title')"
            :description="t('bundle.detail.review_description')"
            @close="isReviewModalOpen = false"
        >
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span class="text-st-sm font-bold text-st-muted">{{ t('bundle.detail.selected_count', { n: selectedPhraseIds.length }) }}</span>
                <div class="flex gap-2">
                    <StButton variant="outline" color="neutral" size="sm" :disabled="loadingAllPhrases" @click="selectAllPhrases">
                        {{ t('bundle.detail.select_all') }}
                    </StButton>
                    <StButton variant="outline" color="neutral" size="sm" :disabled="loadingAllPhrases" @click="deselectAllPhrases">
                        {{ t('bundle.detail.deselect_all') }}
                    </StButton>
                </div>
            </div>

            <div class="max-h-[52vh] overflow-y-auto rounded-st-md border border-st-line bg-st-sunken p-2">
                <div v-if="loadingAllPhrases" class="flex flex-col gap-2">
                    <StSkeleton v-for="n in 5" :key="n" class="h-[52px]" />
                </div>

                <p v-else-if="!allBundlePhrases.length" class="p-6 text-center text-st-sm font-semibold text-st-muted">
                    {{ t('bundle.detail.no_phrases') }}
                </p>

                <div v-else class="flex flex-col gap-1.5">
                    <button
                        v-for="phrase in allBundlePhrases"
                        :key="phrase._id"
                        type="button"
                        class="st-focus-ring flex items-center gap-3 rounded-st-md border bg-st-card p-2.5 text-left transition duration-200 ease-out"
                        :class="selectedPhraseIds.includes(phrase._id) ? 'border-st-primary bg-st-primary-tint' : 'border-st-line hover:border-st-ink-300'"
                        :aria-pressed="selectedPhraseIds.includes(phrase._id)"
                        @click="togglePhraseSelection(phrase._id)"
                    >
                        <!-- Checkbox in the design system's language: the ring is always there,
                             the mark only when the phrase is in the review. -->
                        <span
                            class="flex h-5 w-5 flex-none items-center justify-center rounded-st-pill border-[1.5px]"
                            :class="selectedPhraseIds.includes(phrase._id) ? 'border-st-primary text-st-primary' : 'border-st-ink-300 text-transparent'"
                        >
                            <StIcon name="solar:check-circle-bold" :size="16" />
                        </span>
                        <span class="min-w-0 flex-1">
                            <span class="block truncate text-st-sm font-extrabold text-st-strong">{{ phrase.phrase }}</span>
                            <span class="mt-0.5 block truncate text-st-sm font-semibold text-st-muted">{{ phrase.translation }}</span>
                        </span>
                    </button>
                </div>
            </div>

            <template #actions>
                <StButton variant="ghost" color="neutral" @click="isReviewModalOpen = false">{{ t('cancel') }}</StButton>
                <StButton color="primary" icon="solar:play-bold" :disabled="!selectedPhraseIds.length" @click="startReview">
                    {{ t('bundle.detail.start_review', { n: selectedPhraseIds.length }) }}
                </StButton>
            </template>
        </StModal>
    </div>
</template>

<script setup lang="ts">
    import { StButton, StCard, StEmptyState, StIcon, StIconButton, StModal, StSkeleton } from 'subturtle-ui';
    import StPageHeader from '~/components/common/StPageHeader.vue';
    import StPagination from '~/components/common/StPagination.vue';
    import BundleSaveQuotaCard from '~/components/bundle/SaveQuotaCard.vue';
    import BundleSettingsModal from '~/components/bundle/SettingsModal.vue';
    import { useBundleStore } from '~/stores/bundle';
    import { useLeitnerStore } from '~/stores/leitner';
    import { useProfileStore } from '~/stores/profile';
    import FreemiumLimitationModal from '~/components/freemium_alerts/LimitationModal.vue';
    import { usePageCrumb } from '~/composables/usePageCrumb';
    import { analytic } from '~/plugins/mixpanel';
    import { ANALYTICS_EVENTS } from '~/constants/analyticsEvents';
    import type { PhraseType } from '~/types/database.type';

    const { t } = useI18n();
    const router = useRouter();
    const profileStore = useProfileStore();

    definePageMeta({
        layout: 'default',
        title: () => t('bundle.detail.title'),
        // @ts-ignore
        middleware: ['auth'],
    });

    const bundleStore = useBundleStore();
    const leitnerStore = useLeitnerStore();
    const route = useRoute();
    const id = ref(route.params.id?.toString() || '');
    const isPhraseListLoading = ref(true);
    const isSettingsOpen = ref(false);
    const currentPage = ref(1);

    // Review Modal State
    const isReviewModalOpen = ref(false);
    const selectedPhraseIds = ref<string[]>([]);
    const allBundlePhrases = ref<PhraseType[]>([]);
    const loadingAllPhrases = ref(false);

    const bundleTitle = computed(() => bundleStore.bundleDetail?.title || '…');

    // The store can hold a null where a phrase id no longer resolves to a document; the list
    // renders documents, so those are dropped rather than guarded at every use site.
    const savedPhrases = computed(() => bundleStore.phrases.filter(Boolean));
    const phraseCount = computed(() => bundleStore.bundleDetail?.phrases.length ?? 0);

    /**
     * "42 phrases · Spanish → English · <the bundle's own description>". Each clause is dropped
     * when its data is missing — bundles carry no language of their own, so the pair is read off
     * the phrases inside them and is simply absent until they load (or for a hand-typed bundle).
     */
    const subtitle = computed(() => {
        const parts = [t('live-session.pick-bundle.phrase-count', phraseCount.value)];

        const withLanguages = bundleStore.phrases.find((p) => p.language_info?.source && (p.language_info?.target || p.translation_language));
        if (withLanguages) {
            const source = withLanguages.language_info!.source;
            const target = withLanguages.language_info!.target || withLanguages.translation_language;
            parts.push(`${source} → ${target}`);
        }

        if (bundleStore.bundleDetail?.desc) parts.push(bundleStore.bundleDetail.desc);

        return parts.join(' · ');
    });

    // The topbar's nav-derived crumb ("Practice › Phrase bundles") says nothing on a detail
    // route; the design names the bundle there instead, with its size as a chip.
    usePageCrumb(() =>
        bundleStore.bundleDetail
            ? {
                  section: t('bundle.collection_label'),
                  label: bundleStore.bundleDetail.title,
                  badge: t('live-session.pick-bundle.phrase-count', phraseCount.value),
              }
            : null
    );

    onMounted(() => {
        if (!id.value) return;

        isPhraseListLoading.value = true;
        bundleStore
            .fetchBundleDetail(id.value)
            .then(() => fetchPhraseList(1))
            .catch((error) => {
                console.error('Failed to load bundle:', error);
                isPhraseListLoading.value = false;
            });
    });

    onBeforeRouteLeave(() => {
        bundleStore.clear();
    });

    function fetchPhraseList(page: number = 1) {
        isPhraseListLoading.value = true;
        currentPage.value = page;

        return bundleStore.fetchPhrases(page).finally(() => {
            isPhraseListLoading.value = false;
        });
    }

    /**
     * The session setup — coach, phrase range, mode — lives on /sessions/new, which takes the
     * bundle as a query parameter and preselects it. Sending the user there keeps one setup
     * form instead of a second copy of it in a modal on this page.
     */
    function goToLiveSession() {
        router.push({ path: '/sessions/new', query: { bundle: id.value } });
    }

    // 200-save cap modal: "Maybe later" snoozes the modal for 24h; it never shows
    // twice in the same session. Once snoozed/shown, a further click on the
    // at-limit card skips the interstitial and goes straight to the plans page.
    const SAVE_CAP_SNOOZE_KEY = 'subturtle_save_cap_snooze_until';
    const saveCapShownThisSession = ref(false);

    function onSaveCapUpgradeNeeded(toggleModal: (value: boolean) => void) {
        const snoozedUntil = Number(localStorage.getItem(SAVE_CAP_SNOOZE_KEY) || 0);
        if (saveCapShownThisSession.value || Date.now() < snoozedUntil) {
            router.push('/settings/subscription');
            return;
        }
        saveCapShownThisSession.value = true;
        analytic.track(ANALYTICS_EVENTS.CAP_HIT, { cap: 'save_words' });
        toggleModal(true);
    }

    function snoozeSaveCap() {
        localStorage.setItem(SAVE_CAP_SNOOZE_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
    }

    async function openReviewModal() {
        isReviewModalOpen.value = true;
        loadingAllPhrases.value = true;

        // The list is paginated, but a review runs over the whole bundle — so the picker
        // fetches every phrase by id rather than reusing the current page.
        try {
            const phraseIds = bundleStore.bundleDetail?.phrases ?? [];

            if (!phraseIds.length) {
                allBundlePhrases.value = [];
                selectedPhraseIds.value = [];
                return;
            }

            const { dataProvider } = await import('@modular-rest/client');
            const { COLLECTIONS, DATABASE } = await import('~/types/database.type');

            allBundlePhrases.value = await dataProvider.findByIds<PhraseType>({
                database: DATABASE.USER_CONTENT,
                collection: COLLECTIONS.PHRASE,
                ids: phraseIds,
                accessQuery: {
                    refId: authUser.value?.id,
                },
            });

            selectedPhraseIds.value = allBundlePhrases.value.map((p) => p._id);
        } catch (e) {
            console.error('Failed to load bundle phrases for review:', e);
        } finally {
            loadingAllPhrases.value = false;
        }
    }

    function selectAllPhrases() {
        selectedPhraseIds.value = allBundlePhrases.value.map((p) => p._id);
    }

    function deselectAllPhrases() {
        selectedPhraseIds.value = [];
    }

    function togglePhraseSelection(phraseId: string) {
        if (selectedPhraseIds.value.includes(phraseId)) {
            selectedPhraseIds.value = selectedPhraseIds.value.filter((selected) => selected !== phraseId);
        } else {
            selectedPhraseIds.value.push(phraseId);
        }
    }

    function startReview() {
        leitnerStore.setPendingBundleReview(selectedPhraseIds.value);
        router.push('/practice/bundle-review');
        isReviewModalOpen.value = false;
    }
</script>
