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
        <div class="container relative mx-auto px-6 py-16 max-w-7xl">
            <!-- Standard Header Block -->
            <PageHeader :overline="t('bundle.collection_label', 'LIBRARY')"
                :title="t('bundle.list_title', 'Your bundles')"
                :subtitle="t('bundle.list_subtitle', 'Manage and practice your language collections.')">
                <template #actions>
                    <div class="w-full md:w-64">
                        <Input iconName="IconSearch" v-model="filter" :placeholder="t('bundle.filter_bundles')"
                            :error="!!error" :error-message="error || ''" class="bg-white/50 backdrop-blur-sm" />
                    </div>
                    <div>
                        <BundleAddNew />
                    </div>
                </template>
            </PageHeader>

            <!-- Empty State -->
            <div v-if="isEmptyState" class="flex flex-1 flex-col items-center justify-center py-20">
                <div
                    class="relative flex max-w-xl flex-col items-center justify-center rounded-3xl border border-white/20 bg-white/40 p-12 text-center shadow-xl backdrop-blur-md dark:bg-gray-800/40">
                    <!-- Decorative blob for empty state -->
                    <div
                        class="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 blur-2xl">
                    </div>

                    <img class="mx-auto h-48 w-auto dark:hidden"
                        src="/assets/images/illustrations/placeholders/flat/placeholder-search-3.svg"
                        alt="No bundles available" />
                    <img class="mx-auto hidden h-48 w-auto dark:block"
                        src="/assets/images/illustrations/placeholders/flat/placeholder-search-3-dark.svg"
                        alt="No bundles available" />
                    <h3 class="mt-6 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                        {{ t('bundle.no-bundles') }}
                    </h3>
                    <p class="mt-3 text-base text-gray-500 dark:text-gray-400">
                        {{ t('bundle.no-bundles-description') }}
                    </p>
                    <div class="mt-8">
                        <BundleAddNew />
                    </div>
                </div>
            </div>

            <!-- Grid section -->
            <section v-else class="grid w-full grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                <template v-for="bundle of bundleList" :key="bundle._id">
                    <BundleGenerativeCard :bundle="bundle" />
                </template>
            </section>

            <!-- Pagination -->
            <div v-if="pagination && !isEmptyState" class="mt-12 flex justify-center">
                <Pagination v-model="controller.pagination.page" :totalPages="controller.pagination.pages"
                    @change-page="controller.fetchPage($event)" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { Input } from '@codebridger/lib-vue-components/elements.ts';
import { Pagination } from '@codebridger/lib-vue-components/complex.ts';
import PageHeader from '~/components/common/PageHeader.vue';
import { dataProvider } from '@modular-rest/client';
import type { PaginationType } from '@modular-rest/client/dist/types/types';
import { COLLECTIONS, DATABASE, type PhraseBundleType } from '~/types/database.type';

const { t } = useI18n();

const error = ref<string | null>(null);

definePageMeta({
    layout: 'default',
    title: () => t('bundle.list'),
    // @ts-ignore
    middleware: ['auth'],
});

const filter = ref('');
const perPage = ref(20);
const bundleList = ref<PhraseBundleType[]>([]);
const pagination = ref<PaginationType | null>(null);
const isLoading = ref(false);
const isEmptyState = computed(() => !bundleList.value.length && !isLoading.value);

const controller = dataProvider.list<PhraseBundleType>(
    {
        database: DATABASE.USER_CONTENT,
        collection: COLLECTIONS.PHRASE_BUNDLE,
        query: {
            refId: authUser.value?.id,
            title: {
                $regex: filter.value,
                $options: 'i',
            },
        },
        options: {
            sort: {
                _id: -1,
            },
        },
    },
    {
        limit: perPage.value,
        page: 1,
        onFetched: (data) => {
            bundleList.value = data;
            pagination.value = controller.pagination;
        },
    }
);

onMounted(async () => {
    isLoading.value = true;

    try {
        // update pagination
        await controller.updatePagination();
        // fetch first page
        await controller.fetchPage(1);
    } catch (error) {
        isLoading.value = false;
    }
});
</script>
