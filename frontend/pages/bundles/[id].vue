<template>
    <div class="relative min-h-screen">
        <!-- Decorative Background Elements -->
        <div
            class="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px] pointer-events-none">
        </div>
        <div
            class="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/5 rounded-full blur-[120px] pointer-events-none">
        </div>

        <!-- Standard Container -->
        <div class="container relative mx-auto px-6 py-12 max-w-7xl">
            <!-- Breadcrumbs -->
            <div class="mb-8">
                <Breadcrumb
                    :items="[{ label: t('bundle.list_title', 'Your bundles'), to: '/bundles' }, { label: bundleStore.bundleDetail?.title || '...' }]" />
            </div>

            <!-- Bundle Info Card -->
            <div class="mb-10">
                <BundleDetailCard v-if="bundleStore.bundleDetail" :bundle-detail="bundleStore.bundleDetail" />
            </div>

            <!-- Practice Features Toolbar -->
            <section
                class="mb-12 rounded-2xl border border-white/20 bg-white/40 p-4 shadow-sm backdrop-blur-md dark:bg-gray-800/40">
                <div class="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                    <!-- Left: Practice Tools -->
                    <div class="flex w-full flex-col gap-4 md:w-auto md:flex-row md:items-center">
                        <h3 class="text-xs font-bold uppercase tracking-widest text-gray-500">Practice Tools:</h3>
                        <div class="flex flex-wrap gap-3">
                            <StartLiveSessionFormModal v-model="isLiveSessionModalOpen"
                                @start="handleStartLiveSession" />
                            <Button @click="openReviewModal" variant="soft" iconName="IconOpenBook"
                                :label="t('flashcard-tool.label')" />

                        </div>
                    </div>

                    <!-- Right: Add Content -->
                    <div class="flex w-full flex-col items-end justify-end md:w-auto md:flex-row">
                        <!-- Freemium: Combined Limitation + Add Phrase in Beautiful Gradient Wrapper -->
                        <div v-if="profileStore.isFreemium" class="w-full md:w-auto">
                            <FreemiumLimitationModal :modal-title="t('freemium.limitation.title')"
                                :main-message="t('freemium.limitation.no_free_spots_left')"
                                :sub-message="t('freemium.limitation.upgrade_to_pro_message')"
                                :primary-button-label="t('freemium.limitation.go_pro')"
                                :secondary-button-label="t('freemium.limitation.continue_with_limits')"
                                auto-redirect-on-upgrade>
                                <template #trigger="{ toggleModal }">
                                    <FreemiumLimitCard type="phrase" @action="handleFreemiumAddPhrase"
                                        @upgrade-needed="toggleModal(true)" />
                                </template>
                            </FreemiumLimitationModal>
                        </div>

                        <!-- Premium: Simple Add Phrase Button -->
                        <div v-else class="w-full md:w-auto">
                            <Button color="primary" size="md" @click="bundleStore.addEmptyTemporarilyPhrase()"
                                iconName="IconPlus" label="Add New Phrase"
                                class="w-full shadow-lg shadow-primary/20 hover:shadow-primary/40 md:w-auto" />
                        </div>
                    </div>
                </div>
            </section>

            <!-- Phrase List Section -->
            <section>
                <div class="mb-6 flex items-center gap-3">
                    <div class="h-1.5 w-1.5 rounded-full bg-secondary"></div>
                    <h2
                        class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
                        Phrases in this Bundle
                    </h2>
                </div>

                <!-- Empty State -->
                <div v-if="!isPhraseListLoading && !bundleStore.phrases.length && !bundleStore.tempPhrases.length">
                    <div
                        class="rounded-3xl border border-dashed border-gray-200 bg-gray-50/50 py-16 text-center dark:border-gray-700 dark:bg-gray-800/20">
                        <div
                            class="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                            <div class="text-4xl">📭</div>
                        </div>
                        <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100">No Phrases Yet</h3>
                        <p class="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                            This bundle is currently empty. Start adding phrases to build your collection!
                        </p>
                    </div>
                </div>

                <!-- Phrases List -->
                <div v-else class="space-y-4">
                    <TransitionGroup name="list">
                        <template v-for="tempPhrase in bundleStore.tempPhrases" :key="tempPhrase.id">
                            <BundlePhraseCard :newPhrase="tempPhrase" />
                        </template>

                        <template v-for="phrase in bundleStore.phrases" :key="phrase._id">
                            <BundlePhraseCard v-if="phrase" :phrase="phrase"
                                :number="bundleStore.getPhraseNumber(phrase._id)" />
                        </template>
                    </TransitionGroup>

                    <!-- Pagination -->
                    <div class="mt-10 flex justify-center">
                        <Pagination v-if="bundleStore.phrasePagination" v-model="bundleStore.phrasePagination.page"
                            :totalPages="bundleStore.phrasePagination.pages" @change-page="fetchPhraseList($event)" />
                    </div>
                </div>
            </section>
        </div>
    </div>

    <!-- Review Selection Modal -->
    <Modal v-model="isReviewModalOpen" :title="t('review.select_phrases')" size="lg">
        <div class="p-6">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold">Select phrases to review</h3>
                <div class="flex gap-2">
                    <Button size="sm" variant="soft" @click="selectAllPhrases">Select All</Button>
                    <Button size="sm" variant="soft" @click="deselectAllPhrases">Deselect All</Button>
                </div>
            </div>

            <div class="max-h-[60vh] overflow-y-auto space-y-2 border rounded-lg p-2 bg-gray-50/50 dark:bg-gray-800/20">
                <div v-if="loadingAllPhrases" class="flex justify-center p-8">
                    <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent">
                    </div>
                </div>

                <div v-else-if="allBundlePhrases.length === 0"
                    class="flex flex-col items-center justify-center p-8 text-gray-500">
                    <div class="text-2xl mb-2">📭</div>
                    <p class="text-sm">No phrases found in this bundle.</p>
                </div>

                <div v-else v-for="phrase in allBundlePhrases" :key="phrase._id"
                    class="group flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-primary/30 dark:hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer"
                    @click="togglePhraseSelection(phrase._id)">
                    <div class="relative flex items-center justify-center">
                        <input type="checkbox" :checked="selectedPhraseIds.includes(phrase._id)"
                            class="peer h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary transition-colors cursor-pointer" />
                    </div>
                    <div class="flex-1 min-w-0">
                        <div
                            class="font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-primary transition-colors">
                            {{ phrase.phrase }}</div>
                        <div class="text-sm text-gray-500 truncate">{{ phrase.translation }}</div>
                    </div>
                </div>
            </div>

            <div class="mt-6 flex justify-end gap-3">
                <Button variant="soft" @click="isReviewModalOpen = false">Cancel</Button>
                <Button color="primary" @click="startReview" :disabled="selectedPhraseIds.length === 0">
                    Start Review ({{ selectedPhraseIds.length }})
                </Button>
            </div>
        </div>
    </Modal>
</template>

<script setup lang="ts">
import { Button } from '@codebridger/lib-vue-components/elements.ts';
import { Pagination, Modal } from '@codebridger/lib-vue-components/complex.ts';
import Breadcrumb from '~/components/common/Breadcrumb.vue';
import { useBundleStore } from '@/stores/bundle';
import { useLeitnerStore } from '@/stores/leitner';
import StartLiveSessionFormModal from '~/components/bundle/StartLiveSessionFormModal.vue';
import type { LivePracticeSessionSetupType } from '~/types/live-session.type';
import { useProfileStore } from '~/stores/profile';
import FreemiumLimitCard from '~/components/freemium_alerts/FreemiumLimitCard.vue';
import FreemiumLimitationModal from '~/components/freemium_alerts/LimitationModal.vue';

const { t } = useI18n();
const router = useRouter();
const profileStore = useProfileStore();

definePageMeta({
    layout: 'default',
    title: () => t('bundle.detail'),
    // @ts-ignore
    middleware: ['auth'],
});

const bundleStore = useBundleStore();
const leitnerStore = useLeitnerStore();
const route = useRoute();
const id = ref(route.params.id?.toString() || '');
const isBundleDetailLoading = ref(false);
const isPhraseListLoading = ref(false);
const isLiveSessionModalOpen = ref(false);

// Review Modal State
const isReviewModalOpen = ref(false);
const selectedPhraseIds = ref<string[]>([]);
const allBundlePhrases = ref<any[]>([]);
const loadingAllPhrases = ref(false);

onMounted(() => {
    if (id.value) {
        isBundleDetailLoading.value = true;
        bundleStore
            .fetchBundleDetail(id.value)
            .then(() => {
                // useRoute().meta.title = bundleStore.bundleDetail?.title;
            })
            .finally(() => {
                isBundleDetailLoading.value = false;
                fetchPhraseList(1);
            });
    }
});

onBeforeRouteLeave(() => {
    bundleStore.clear();
});

function fetchPhraseList(page: number = 1) {
    isPhraseListLoading.value = true;

    bundleStore.fetchPhrases(page).finally(() => {
        isPhraseListLoading.value = false;
    });
}

function handleStartLiveSession(sessionData: LivePracticeSessionSetupType) {
    // convert sessionData to base64
    const sessionDataBase64 = btoa(JSON.stringify(sessionData));

    // Uerl should not be include # at the beginning
    const url = `/practice/live-session-${id.value}?sessionData=${sessionDataBase64}`;
    router.push(url);
}

function handleFreemiumAddPhrase() {
    // User is not at limit yet, so add the phrase
    bundleStore.addEmptyTemporarilyPhrase();
}

async function openReviewModal() {
    isReviewModalOpen.value = true;
    loadingAllPhrases.value = true;

    // Fetch all phrases for the bundle (not just paginated) for selection
    // Note: bundleStore.fetchPhrases updates store state. 
    // If we want ALL phrases, we might need a separate call or handle pagination manually.
    // For now, assuming bundle items are reasonable count, or we use store's logic.
    // Ideally backend supports "getAll" or we iterate. 
    // Given current store logic, let's use what we have or add a helper.
    // If we just need IDs for this modal, maybe we can fetch IDs?

    // Current workaround: Fetch all (assuming small bundle) or just use current page + option to fetch more?
    // User requirement: "All option".
    // We should probably fetch all phrases for this bundle.
    // Since bundleStore.fetchPhrases sets pagination, maybe we can fetch with big limit?
    // Or add a specialized store action.
    // Let's assume for now we can fetch with page 1 and large limit using the store's underlying logic, 
    // OR just use existing store items if fully loaded.

    // Let's implement a quick fetch for *all* phrases just for this modal.
    try {
        if (!bundleStore.bundleDetail) {
            console.error("Bundle detail not loaded");
            return;
        }

        const phraseIds = bundleStore.bundleDetail.phrases;

        if (phraseIds.length === 0) {
            allBundlePhrases.value = [];
            selectedPhraseIds.value = [];
            return;
        }

        // Fetch details for all phrases using dataProvider
        const { dataProvider } = await import('@modular-rest/client');
        const { COLLECTIONS, DATABASE } = await import('~/types/database.type');

        const phrases = await dataProvider.findByIds<any>({
            database: DATABASE.USER_CONTENT,
            collection: COLLECTIONS.PHRASE,
            ids: phraseIds,
            accessQuery: {
                refId: profileStore.userDetail?._id || profileStore.userDetail?.refId, // robust access
            },
        });

        allBundlePhrases.value = phrases;
        selectedPhraseIds.value = allBundlePhrases.value.map(p => p._id);

    } catch (e) {
        console.error("Failed to load bundle phrases for review:", e);
    } finally {
        loadingAllPhrases.value = false;
    }
}

function selectAllPhrases() {
    selectedPhraseIds.value = allBundlePhrases.value.map(p => p._id);
}

function deselectAllPhrases() {
    selectedPhraseIds.value = [];
}

function togglePhraseSelection(phraseId: string) {
    if (selectedPhraseIds.value.includes(phraseId)) {
        selectedPhraseIds.value = selectedPhraseIds.value.filter(id => id !== phraseId);
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
