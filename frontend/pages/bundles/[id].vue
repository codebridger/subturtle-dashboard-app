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
            <section class="flex flex-1 flex-wrap justify-end gap-2">
                <!-- Freemium Status Badge -->
                <div class="flex flex-col items-center justify-center">
                    <div
                        class="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-sm font-medium text-orange-800 dark:bg-orange-900 dark:text-orange-200"
                    >
                        <Icon name="IconLock" class="h-4 w-4" />
                        <span
                            >{{ freemiumData?.allowed_save_words_used || 0 }}/{{ freemiumData?.allowed_save_words || 0 }}
                            {{ t('freemium.limitation.free_spots_left') }}</span
                        >
                    </div>
                    <a href="#" class="text-sm font-medium text-orange-800 dark:text-orange-200">Remove limits? Click here</a>
                </div>

                <Button color="primary" @click="bundleStore.addEmptyTemporarilyPhrase()" iconName="IconFolderMinus" :label="t('bundle.add_phrase')" />
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
    import { Button } from '@codebridger/lib-vue-components/elements.ts';
    import { Modal, Pagination } from '@codebridger/lib-vue-components/complex.ts';
    import { useBundleStore } from '@/stores/bundle';
    import StartLiveSessionFormModal from '~/components/bundle/StartLiveSessionFormModal.vue';
    import type { LivePracticeSessionSetupType } from '~/types/live-session.type';

    const { t } = useI18n();
    const router = useRouter();

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
</script>
