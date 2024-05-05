<script setup lang="ts">
definePageMeta({
  title: "Bundle Detail",
});

const bundleStore = useBundleStore();
const route = useRoute();
const id = computed(() => route.params.id?.toString() || "");
const isBundleDetailLoading = ref(false);
const isPhraseListLoading = ref(false);

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
</script>

<template>
  <TairoContentWrapper>
    <BundleDetailCard
      v-if="bundleStore.bundleDetail"
      :bundle-detail="bundleStore.bundleDetail"
      @changed="bundleStore.updateBundleDetail(id, $event)"
    />

    <!-- Practice Features -->
    <section class="flex justify-between items-center">
      <section class="my-4 flex-1 flex space-x-4">
        <BaseButton disabled :data-nui-tooltip="$t('flashcard-tool.tooltip')">
          <span class="i-ph-cards-duotone text-primary-500"></span>
          <span>{{ $t("flashcard-tool.label") }}</span>
        </BaseButton>

        <BaseButton disabled :data-nui-tooltip="$t('match-tool.tooltip')">
          <span class="i-icon-park-twotone-card-two text-primary-500"></span>
          <span>{{ $t("match-tool.label") }}</span>
        </BaseButton>

        <BaseButton disabled :data-nui-tooltip="$t('learn-tool.tooltip')">
          <span class="i-ph-open-ai-logo-duotone text-primary-500"></span>
          <span>{{ $t("learn-tool.label") }}</span>
        </BaseButton>
      </section>

      <BaseButton
        color="primary"
        @click="bundleStore.addEmptyTemporarilyPhrase()"
      >
        <span class="i-tabler-vocabulary"></span>
        <span>Add Phrase</span>
      </BaseButton>
    </section>

    <!-- Phrase List -->
    <section class="mt-8">
      <!-- Empty -->
      <div
        v-if="
          !isPhraseListLoading &&
          !bundleStore.phrases.length &&
          !bundleStore.tempPhrases.length
        "
      >
        <BasePlaceholderPage
          title="No Phrases Available"
          subtitle="Looks like we couldn't find any phrases in this bundle. Try to add some phrases first."
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
          <template
            v-for="tempPhrase in bundleStore.tempPhrases"
            :key="tempPhrase.id"
          >
            <BundlePhraseCard :newPhrase="tempPhrase" />
          </template>

          <template v-for="phrase in bundleStore.phrases" :key="phrase._id">
            <BundlePhraseCard
              v-if="phrase"
              :phrase="phrase"
              :number="bundleStore.getPhraseNumber(phrase._id)"
            />
          </template>
        </TransitionGroup>

        <div class="mt-6" v-if="(bundleStore.phrasePagination?.pages || 0) > 1">
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
