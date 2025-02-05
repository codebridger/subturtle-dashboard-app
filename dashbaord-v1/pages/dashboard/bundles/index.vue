<script setup lang="ts">
import { dataProvider } from "@modular-rest/client";
import type { PaginationType } from "@modular-rest/client/dist/types/types";
import {
  COLLECTIONS,
  DATABASE,
  type PhraseBundleType,
} from "~/types/database.type";

definePageMeta({
  // static meta information can be added to vue-router, we use it
  // to generate the search index in the demo
  title: "Phrase Bundles",
});

const filter = ref("");
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
        $options: "i",
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

<template>
  <TairoContentWrapper>
    <template #left>
      <BaseInput
        v-model="filter"
        icon="lucide:search"
        placeholder="Filter bundles..."
        :classes="{
          wrapper: 'w-full sm:w-auto',
        }"
        disabled
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
