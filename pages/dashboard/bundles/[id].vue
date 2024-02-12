<script setup lang="ts">
definePageMeta({
  title: "Phrase Bundle Detail",
});

const bundleStore = useBundleStore();
const route = useRoute();
const id = computed(() => route.params.id?.toString() || "");
const isBundleDetailLoading = ref(false);
const isPhraseListLoading = ref(false);

onMounted(() => {
  if (id.value) {
    isBundleDetailLoading.value = true;
    bundleStore.fetchBundleDetail(id.value).finally(() => {
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
</script>

<template>
  <TairoContentWrapper>
    <BundleDetailSection
      v-if="bundleStore.bundleDetail"
      :bundle-detail="bundleStore.bundleDetail"
      @changed="bundleStore.updateBundleDetail(id, $event)"
    />

    <!-- Phrase List -->
    <section class="mt-6">
      <!-- Empty -->
      <div v-if="!isPhraseListLoading && !bundleStore.phrases.length">
        <BasePlaceholderPage
          title="No matching results"
          subtitle="Looks like we couldn't find any matching results for your search terms. Try other search terms."
        >
          <template #image>
            <img
              class="block dark:hidden"
              src="/img/illustrations/placeholders/flat/placeholder-search-3.svg"
              alt="Placeholder image"
            />
            <img
              class="hidden dark:block"
              src="/img/illustrations/placeholders/flat/placeholder-search-3-dark.svg"
              alt="Placeholder image"
            />
          </template>
        </BasePlaceholderPage>
      </div>

      <!-- Phrases -->
      <div v-else class="space-y-4">
        <TransitionGroup
          enter-active-class="transform-gpu"
          enter-from-class="opacity-0 -translate-x-full"
          enter-to-class="opacity-100 translate-x-0"
          leave-active-class="absolute transform-gpu"
          leave-from-class="opacity-100 translate-x-0"
          leave-to-class="opacity-0 -translate-x-full"
        >
          <BaseCard
            v-for="phrase in bundleStore.phrases"
            :key="phrase._id"
            shape="curved"
            class="flex flex-col p-5 sm:flex-row sm:items-center"
          >
            {{ phrase.phrase }}
          </BaseCard>
        </TransitionGroup>

        <div class="mt-6">
          <BasePagination
            v-if="bundleStore.phrasePagination"
            :item-per-page="bundleStore.phrasePagination.limit"
            :total-items="bundleStore.phrasePagination.total"
            :current-page="bundleStore.phrasePagination.page"
            shape="curved"
            @update:currentPage="fetchPhraseList($event)"
          />
        </div>
      </div>
    </section>
  </TairoContentWrapper>
</template>
