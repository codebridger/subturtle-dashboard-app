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
const perPage = ref(2);
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
  <div>
    <TairoContentWrapper>
      <template #left>
        <BaseInput
          v-model="filter"
          icon="lucide:search"
          placeholder="Filter bundles..."
          :classes="{
            wrapper: 'w-full sm:w-auto',
          }"
        />
      </template>
      <template #right>
        <BaseButton color="primary" class="w-full" disabled>
          <Icon name="lucide:plus" class="h-4 w-4" />
          <span>Add New</span>
        </BaseButton>
      </template>

      <section class="ltablet:grid-cols-2 grid w-full gap-4 lg:grid-cols-2">
        <BaseCard rounded="none" class="p-6" v-for="bundle of bundleList">
          <BaseHeading
            as="h4"
            size="sm"
            weight="semibold"
            lead="tight"
            class="text-muted-800 mb-2 dark:text-white"
          >
            {{ bundle.title }}
          </BaseHeading>

          <!-- <BaseParagraph size="sm" lead="tight" class="text-muted-400">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit.
          </BaseParagraph> -->
        </BaseCard>
      </section>

      <BasePagination
        class="mt-4"
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
  </div>
</template>
