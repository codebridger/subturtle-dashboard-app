<template>
  <div class="p-4">
    <!-- Left section -->
    <div class="mb-4 flex items-center justify-between gap-4">
      <div>
        <Input v-model="filter" :placeholder="t('bundle.filter_bundles')" disabled :error="!!error" :error-message="error || ''" />
      </div>

      <!-- Right section -->
      <div>
        <BundleAddNew />
      </div>
    </div>

    <!-- Grid section -->
    <section class="tablet:grid-cols-2 grid w-full grid-cols-1 gap-4 lg:grid-cols-3">
      <template v-for="bundle of bundleList">
        <BundleGenerativeCard :bundle="bundle" />
      </template>
    </section>

    <!-- Pagination -->
    <!-- <div v-if="pagination" class="mt-6">
            <Pagination
                :current-page="controller.pagination.page"
                :total="controller.pagination.total"
                :per-page="controller.pagination.limit"
                :max-visible-pages="5"
                class="rounded-lg"
                @page-change="controller.fetchPage($event)"
            />
        </div> -->
  </div>
</template>

<script setup lang="ts">
  import { Input } from '@codebridger/lib-vue-components/elements.ts';
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
