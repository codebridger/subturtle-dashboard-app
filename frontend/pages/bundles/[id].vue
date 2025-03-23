<template>
    <div class="p-4">
        <BundleDetailCard v-if="bundleStore.bundleDetail" :bundle-detail="bundleStore.bundleDetail" @changed="bundleStore.updateBundleDetail(id, $event)" />

        <!-- Practice Features -->
        <section class="flex flex-wrap items-start justify-between">
            <section class="my-4 flex flex-1 flex-wrap gap-2">
                <StartLiveSessionForm v-model="isLiveSessionModalOpen" @start="handleStartLiveSession" />
                <Button :to="`/practice/flashcards-${id}`" iconName="IconOpenBook" :label="t('flashcard-tool.label')" />

                <!-- <Button disabled iconName="IconListCheck" :label="t('match-tool.label')" /> -->
            </section>

            <Button class="mt-4" color="primary" @click="bundleStore.addEmptyTemporarilyPhrase()" iconName="IconFolderMinus" :label="t('bundle.add_phrase')" />
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
    import StartLiveSessionForm from '@/components/bundle/StartLiveSessionForm.vue';
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
        console.log('Live session data:', sessionData);
        router.push(`/practice/live-session-${id.value}?sessionData=${sessionDataBase64}`);
    }
</script>
