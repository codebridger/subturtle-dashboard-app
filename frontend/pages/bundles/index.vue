<template>
    <div class="p-4">
        <!-- Left section -->
        <div v-if="!isEmptyState" class="mb-4 flex items-center justify-between gap-4">
            <div>
                <Input
                    iconName="IconSearch"
                    v-model="filter"
                    :placeholder="t('bundle.filter_bundles')"
                    disabled
                    :error="!!error"
                    :error-message="error || ''"
                />
            </div>

            <!-- Right section -->
            <div>
                <BundleAddNew />
            </div>
        </div>

        <!-- Empty State -->
        <div v-if="isEmptyState" class="flex flex-1 flex-col items-center justify-center">
            <div class="flex max-w-xl flex-col items-center justify-center py-12 text-center">
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
                <h3 class="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">{{ t('bundle.no-bundles') }}</h3>
                <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    {{ t('bundle.no-bundles-description') }}
                </p>
                <div class="mt-6">
                    <BundleAddNew />
                </div>
            </div>
        </div>

        <!-- Grid section -->
        <section v-else class="tablet:grid-cols-2 grid w-full grid-cols-1 gap-4 lg:grid-cols-3">
            <template v-for="bundle of bundleList">
                <BundleGenerativeCard :bundle="bundle" />
            </template>
        </section>

        <!-- Pagination -->
        <div v-if="pagination && !isEmptyState" class="mt-6">
            <Pagination v-model="controller.pagination.page" :totalPages="controller.pagination.pages" @change-page="controller.fetchPage($event)" />
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
