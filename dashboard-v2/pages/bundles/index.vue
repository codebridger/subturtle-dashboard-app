<template>
    <TairoContentWrapper>
        <template #left>
            <!-- <Input
                icon="lucide:search"
            /> -->
            <Input
                :class="{ wrapper: 'w-full sm:w-auto' }"
                :label="t('bundle.filter_bundles')"
                v-model="filter"
                disabled
                :error="!!error"
                :error-message="error || ''"
            />
        </template>

        <template #right>
            <BundleAddNew />
        </template>

        <section class="tablet:grid-cols-2 grid w-full gap-4 lg:grid-cols-3">
            <template v-for="bundle of bundleList">
                <BundleGenerativeCard :bundle="bundle" />
            </template>
        </section>

        <BasePagination
            class="mt-6"
            v-if="pagination"
            :item-per-page="controller.pagination.limit"
            :total-items="controller.pagination.total"
            :current-page="controller.pagination.page"
            :max-links-displayed="5"
            rounded="lg"
            :no-router="false"
            @update:currentPage="controller.fetchPage($event)"
        />
    </TairoContentWrapper>
</template>

<script setup lang="ts">
    import { Input } from '@tiny-ideas-ir/lib-vue-components/elements.ts';
    import { dataProvider } from '@modular-rest/client';
    import type { PaginationType } from '@modular-rest/client/dist/types/types';
    import { COLLECTIONS, DATABASE, type PhraseBundleType } from '~/types/database.type';

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
        await controller.updatePagination();
        controller.fetchPage(1);
    });
</script>
