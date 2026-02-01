<template>
    <div class="relative min-h-screen">
        <!-- Decorative Background Elements -->
        <div
            class="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px] pointer-events-none"
        ></div>
        <div
            class="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/5 rounded-full blur-[120px] pointer-events-none"
        ></div>

        <!-- Standard Container -->
        <div class="container relative mx-auto px-6 py-16 max-w-7xl">
            <!-- Standard Header Block -->
            <div class="mb-14 flex flex-col md:flex-row justify-between gap-6">
                <div class="flex flex-col gap-3">
                    <!-- Overline Label -->
                    <div class="flex items-center gap-2">
                        <div class="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
                        <span class="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">
                            {{ t('bundle.collection_label', 'LIBRARY') }}
                        </span>
                    </div>

                    <!-- Main Title - often with gradient -->
                    <h1
                        class="text-5xl font-black text-gray-900 dark:text-white tracking-tight leading-none bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400"
                    >
                        {{ t('bundle.list_title', 'Your bundles') }}
                    </h1>

                    <!-- Subtitle -->
                    <p class="text-lg text-gray-500 dark:text-gray-400 font-medium max-w-md">
                        {{ t('bundle.list_subtitle', 'Manage and practice your language collections.') }}
                    </p>
                </div>

                <!-- Right-side Actions/Status (Filter + Add) -->
                <div class="flex flex-col items-end gap-4 md:flex-row md:items-end">
                    <div class="w-full md:w-64">
                        <Input
                            iconName="IconSearch"
                            v-model="filter"
                            :placeholder="t('bundle.filter_bundles')"
                            :error="!!error"
                            :error-message="error || ''"
                            class="bg-white/50 backdrop-blur-sm"
                        />
                    </div>
                    <div>
                        <BundleAddNew />
                    </div>
                </div>
            </div>

            <!-- Empty State -->
            <div v-if="isEmptyState" class="flex flex-1 flex-col items-center justify-center py-20">
                <div
                    class="relative flex max-w-xl flex-col items-center justify-center rounded-3xl border border-white/20 bg-white/40 p-12 text-center shadow-xl backdrop-blur-md dark:bg-gray-800/40"
                >
                    <!-- Decorative blob for empty state -->
                    <div
                        class="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 blur-2xl"
                    ></div>

                    <img
                        class="mx-auto h-48 w-auto dark:hidden"
                        src="/assets/images/illustrations/placeholders/flat/placeholder-search-3.svg"
                        alt="No bundles available"
                    />
                    <img
                        class="mx-auto hidden h-48 w-auto dark:block"
                        src="/assets/images/illustrations/placeholders/flat/placeholder-search-3-dark.svg"
                        alt="No bundles available"
                    />
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
                <Pagination
                    v-model="controller.pagination.page"
                    :totalPages="controller.pagination.pages"
                    @change-page="controller.fetchPage($event)"
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { Input } from '@codebridger/lib-vue-components/elements.ts';
    import { Pagination } from '@codebridger/lib-vue-components/complex.ts';
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
