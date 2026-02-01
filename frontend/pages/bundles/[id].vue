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
            <!-- Back Button -->
            <div class="mb-8">
                <Button to="/#/bundles" variant="text" iconName="IconArrowLeft" icon-pos="left"
                    class="!px-0 text-gray-500 hover:text-gray-900 dark:hover:text-white">
                    {{ t('common.back', 'Back to Bundles') }}
                </Button>
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
                            <Button :to="`#/practice/flashcards-${id}`" variant="soft" iconName="IconOpenBook"
                                :label="t('flashcard-tool.label')" />
                            <!-- <Button disabled iconName="IconListCheck" :label="t('match-tool.label')" /> -->
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
</template>

<script setup lang="ts">
import { Button } from '@codebridger/lib-vue-components/elements.ts';
import { Pagination } from '@codebridger/lib-vue-components/complex.ts';
import { useBundleStore } from '@/stores/bundle';
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
const route = useRoute();
const id = ref(route.params.id?.toString() || '');
const isBundleDetailLoading = ref(false);
const isPhraseListLoading = ref(false);
const isLiveSessionModalOpen = ref(false);

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
</script>
