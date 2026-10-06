<template>
    <div class="flex flex-col gap-[22px]">
        <StPageHeader :title="t('bundle.list_title')" :overline="t('bundle.collection_label')" :subtitle="subtitle">
            <template #actions>
                <StInput v-model="filter" :placeholder="t('bundle.filter_bundles')" icon="solar:magnifer-linear" class="w-[240px]" />
                <BundleAddNew />
            </template>
        </StPageHeader>

        <!-- Loading: six card placeholders, so the grid keeps its shape while the first page lands. -->
        <div v-if="isLoading && !bundleList.length" class="grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-3">
            <StSkeleton v-for="n in 6" :key="n" class="h-[190px]" />
        </div>

        <template v-else-if="bundleList.length">
            <section class="grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-3">
                <BundleGenerativeCard v-for="bundle of bundleList" :key="bundle._id" :bundle="bundle" />
            </section>

            <div class="flex items-center justify-center gap-4 pt-1.5">
                <span class="text-st-sm font-semibold text-st-faint">
                    {{ t('bundle.showing_count', { shown: bundleList.length, total: totalBundles }) }}
                </span>
                <StButton v-if="hasMore" variant="outline" color="neutral" :disabled="isLoading" @click="loadMore">
                    {{ t('bundle.load_more') }}
                </StButton>
            </div>
        </template>

        <!-- No match for the active filter. Distinct from an empty library: the fix is to clear the
             filter, not to create a bundle. -->
        <StCard v-else-if="filter" padding="none">
            <StEmptyState
                icon="solar:magnifer-linear"
                color="neutral"
                :title="t('bundle.no-matches', { filter })"
                :description="t('bundle.no-matches-description')"
            >
                <template #action>
                    <StButton variant="outline" color="primary" @click="filter = ''">{{ t('bundle.clear_filter') }}</StButton>
                </template>
            </StEmptyState>
        </StCard>

        <StCard v-else padding="none">
            <StEmptyState icon="solar:notebook-bold-duotone" color="neutral" :title="t('bundle.no-bundles')" :description="t('bundle.no-bundles-description')">
                <template #action>
                    <BundleAddNew variant="outline" />
                </template>
            </StEmptyState>
        </StCard>
    </div>
</template>

<script setup lang="ts">
    import { dataProvider } from '@modular-rest/client';
    import type { PaginationType } from '@modular-rest/client/dist/types/types';
    import { COLLECTIONS, DATABASE, type PhraseBundleType } from '~/types/database.type';
    import { StButton, StCard, StEmptyState, StInput, StSkeleton } from 'subturtle-ui';
    import StPageHeader from '~/components/common/StPageHeader.vue';

    const { t } = useI18n();

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

    // Size of the whole library, refreshed only on unfiltered fetches. The subtitle describes the
    // library, so it must not follow the filter — "0 bundles. Practise any of them from here."
    // under a non-matching filter is not what the header is saying.
    const libraryTotal = ref(0);

    // Size of the CURRENT result set (filtered or not) — what "Showing X of Y" and Load more read.
    const totalBundles = computed(() => pagination.value?.total ?? bundleList.value.length);
    const hasMore = computed(() => bundleList.value.length < totalBundles.value);

    // The design's "14 bundles, 342 phrases" needs a phrase total across ALL bundles; only the
    // loaded page carries phrase arrays, so the count would be wrong on every page but the last.
    const subtitle = computed(() => t('bundle.list_subtitle', libraryTotal.value));

    /**
     * Rebuilt per fetch: the query has to read the CURRENT filter. The previous version built the
     * controller once at setup, which captured `filter.value` as '' forever — typing in the filter
     * box re-rendered nothing.
     */
    function buildController(page: number) {
        return dataProvider.list<PhraseBundleType>(
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
            { limit: perPage.value, page }
        );
    }

    async function fetchPage(page: number, append = false) {
        isLoading.value = true;
        try {
            const controller = buildController(page);
            await controller.updatePagination();
            // Assigned from the returned rows, not the `onFetched` hook: that hook does not fire
            // for an empty result, which left the previous list on screen under a filter that
            // matches nothing ("Showing 4 of 0").
            const rows = (await controller.fetchPage(page)) ?? [];
            bundleList.value = append ? [...bundleList.value, ...rows] : rows;
            pagination.value = controller.pagination;
            if (!filter.value) libraryTotal.value = controller.pagination.total;
        } catch (e) {
            console.error('Failed to fetch bundles:', e);
        } finally {
            isLoading.value = false;
        }
    }

    function loadMore() {
        fetchPage((pagination.value?.page ?? 1) + 1, true);
    }

    // Debounced so a keystroke isn't a request; always back to page 1, since the result set changes.
    let filterTimer: ReturnType<typeof setTimeout> | undefined;
    watch(filter, () => {
        clearTimeout(filterTimer);
        filterTimer = setTimeout(() => fetchPage(1), 300);
    });

    onBeforeUnmount(() => clearTimeout(filterTimer));

    onMounted(() => fetchPage(1));
</script>
