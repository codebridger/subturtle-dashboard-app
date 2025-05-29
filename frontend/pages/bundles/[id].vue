<template>
    <div class="p-4">
        <BundleDetailCard v-if="bundleStore.bundleDetail" :bundle-detail="bundleStore.bundleDetail" @changed="bundleStore.updateBundleDetail(id, $event)" />

        <!-- Practice Features -->
        <section class="my-4 flex flex-wrap items-start justify-between">
            <section class="flex flex-1 flex-wrap gap-2">
                <StartLiveSessionFormModal v-model="isLiveSessionModalOpen" @start="handleStartLiveSession" />
                <Button :to="`#/practice/flashcards-${id}`" iconName="IconOpenBook" :label="t('flashcard-tool.label')" />

                <!-- <Button disabled iconName="IconListCheck" :label="t('match-tool.label')" /> -->
            </section>

            <section class="flex flex-1 flex-wrap items-start justify-end gap-2">
                <!-- Freemium: Combined Limitation + Add Phrase in Beautiful Gradient Wrapper -->
                <div v-if="profileStore.isFreemium">
                    <Card
                        class="border border-pink-200/50 bg-gradient-to-r from-pink-100 via-purple-50 to-blue-100 shadow-lg shadow-purple-200/30 backdrop-blur-sm transition-all duration-300 dark:border-purple-500/30 dark:from-pink-900/20 dark:via-purple-900/30 dark:to-blue-900/20 dark:shadow-purple-800/20"
                    >
                        <div class="flex items-center gap-4">
                            <!-- Limitation Info Section -->
                            <div class="flex flex-1 items-center gap-3">
                                <div
                                    class="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-pink-200 to-purple-300 shadow-inner dark:from-pink-800 dark:to-purple-700"
                                >
                                    <Icon name="IconLockDots" class="h-4 w-4 text-purple-700 dark:text-purple-200" />
                                </div>
                                <div class="flex-1">
                                    <div
                                        class="bg-gradient-to-r from-purple-700 to-blue-600 bg-clip-text text-sm font-semibold text-transparent dark:from-purple-300 dark:to-blue-300"
                                    >
                                        {{ freemiumAllocation?.allowed_save_words_used || 0 }}/{{ freemiumAllocation?.allowed_save_words || 50 }} Words
                                    </div>
                                    <div class="text-xs text-purple-600 dark:text-purple-300">Free spots left to save phrases</div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <!-- Compact Progress Bar -->
                                    <div class="h-2 w-12 rounded-full bg-purple-200/60 shadow-inner dark:bg-purple-800/60">
                                        <div
                                            class="h-full rounded-full bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 shadow-sm transition-all duration-500 ease-out"
                                            :style="{
                                                width: `${
                                                    ((freemiumAllocation?.allowed_save_words_used || 1) / (freemiumAllocation?.allowed_save_words || 50)) * 100
                                                }%`,
                                            }"
                                        ></div>
                                    </div>
                                </div>
                            </div>

                            <!-- Divider -->
                            <div class="h-8 w-px bg-purple-200 dark:bg-purple-700"></div>

                            <!-- Context-Aware Button Section -->
                            <div class="flex items-center">
                                <Button
                                    color="primary"
                                    size="md"
                                    @click="isAtLimit ? goToUpgrade() : bundleStore.addEmptyTemporarilyPhrase()"
                                    :iconName="isAtLimit ? 'IconCrown' : 'IconPlus'"
                                    :label="isAtLimit ? 'Upgrade Now' : 'Add Phrase'"
                                    class="border-none bg-gradient-to-r from-pink-500 to-purple-600 shadow-md transition-all duration-300 hover:from-pink-600 hover:to-purple-700 hover:shadow-lg"
                                />
                            </div>
                        </div>
                    </Card>
                </div>

                <!-- Premium: Simple Add Phrase Button -->
                <div v-else class="flex items-start">
                    <Button
                        color="primary"
                        size="md"
                        @click="bundleStore.addEmptyTemporarilyPhrase()"
                        iconName="IconPlus"
                        label="Add Phrase"
                        class="min-w-[140px]"
                    />
                </div>
            </section>
        </section>

        <!-- Phrase List -->
        <section class="mt-8">
            <!-- Empty State -->
            <div v-if="!isPhraseListLoading && !bundleStore.phrases.length && !bundleStore.tempPhrases.length">
                <div class="py-12 text-center">
                    <img
                        class="mx-auto h-48 w-auto dark:hidden"
                        src="/assets/images/illustrations/placeholders/flat/placeholder-search-3.svg"
                        alt="No phrases available"
                    />
                    <img
                        class="mx-auto hidden h-48 w-auto dark:block"
                        src="/assets/images/illustrations/placeholders/flat/placeholder-search-3-dark.svg"
                        alt="No phrases available"
                    />
                    <h3 class="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">No Phrases Available</h3>
                    <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        Looks like we couldn't find any phrases in this bundle. Try to add some phrases first.
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
                        <BundlePhraseCard v-if="phrase" :phrase="phrase" :number="bundleStore.getPhraseNumber(phrase._id)" />
                    </template>
                </TransitionGroup>

                <!-- Pagination -->
                <div class="mt-6">
                    <Pagination
                        v-if="bundleStore.phrasePagination"
                        v-model="bundleStore.phrasePagination.page"
                        :totalPages="bundleStore.phrasePagination.pages"
                        @change-page="fetchPhraseList($event)"
                    />
                </div>
            </div>
        </section>
    </div>
</template>

<script setup lang="ts">
    import { Button, Card, Icon } from '@codebridger/lib-vue-components/elements.ts';
    import { Modal, Pagination } from '@codebridger/lib-vue-components/complex.ts';
    import { useBundleStore } from '@/stores/bundle';
    import StartLiveSessionFormModal from '~/components/bundle/StartLiveSessionFormModal.vue';
    import type { LivePracticeSessionSetupType } from '~/types/live-session.type';
    import { useProfileStore } from '~/stores/profile';

    const { t } = useI18n();
    const router = useRouter();
    const profileStore = useProfileStore();

    const freemiumAllocation = computed(() => profileStore.freemiumAllocation);

    const usagePercentage = computed(() => {
        const used = freemiumAllocation.value?.allowed_save_words_used || 0;
        const total = freemiumAllocation.value?.allowed_save_words || 1;
        return Math.round((used / total) * 100);
    });

    const isAtLimit = computed(() => {
        if (!profileStore.isFreemium) return false;
        const used = freemiumAllocation.value?.allowed_save_words_used || 0;
        const total = freemiumAllocation.value?.allowed_save_words || 0;
        return used >= total;
    });

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

    function goToUpgrade() {
        router.push('/settings/subscription');
    }
</script>
