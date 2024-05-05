<script setup lang="ts">
import { dataProvider, functionProvider } from "@modular-rest/client";
import {
  COLLECTIONS,
  DATABASE,
  type PhraseBundleType,
} from "~/types/database.type";
import { FN, type UserStatisticType } from "~/types/function.type";

// set compile time meta information
definePageMeta({
  // static meta information can be added to vue-router, we use it
  // to generate the search index in the demo
  title: "Dashboard",
});

// meta information can also be added to the head
useHead({
  meta: [{ name: "description", content: "Subturtle popup app" }],
});

const recentBundles = ref<PhraseBundleType[]>([]);
const statistics = ref<UserStatisticType>({
  totalPhrases: 0,
  totalBundles: 0,
});

function getRecentBundles() {
  dataProvider
    .find<PhraseBundleType>({
      database: DATABASE.USER_CONTENT,
      collection: COLLECTIONS.PHRASE_BUNDLE,
      query: {
        refId: authUser.value?.id,
      },
      options: {
        limit: 3,
        sort: {
          updatedAt: -1,
        },
      },
    })
    .then((data) => {
      recentBundles.value = data;
    });
}

function getUserStatistics() {
  functionProvider
    .run<UserStatisticType>({
      name: FN.getUserStatistic,
      args: {
        userId: authUser.value?.id,
      },
    })
    .then((data) => {
      statistics.value = data;
    });
}

onMounted(() => {
  getRecentBundles();
  getUserStatistics();
});
</script>

<template>
  <section
    :class="[
      'w-full flex flex-col space-y-4 items-start',
      'md:flex-row md:space-x-4 md:space-y-0',
    ]"
  >
    <WidgetActivityChartOverview class="flex-1" title="Your last 7 days" />

    <BaseCard class="w-full md:w-64 p-6 flax flex-col space-y-2">
      <BaseHeading>{{ $t("page.dashboard.quick-states.label") }}</BaseHeading>

      <div class="bg-muted-100 flex p-3 space-x-2 items-center rounded-md">
        <BaseIconBox
          size="lg"
          rounded="full"
          class="bg-muted-200 text-muted-500 dark:bg-muted-800"
          color="primary"
          variant="pastel"
        >
          <Icon name="fluent:playing-cards-20-filled" class="size-8" />
        </BaseIconBox>
        <div>
          <BaseHeading>
            {{ statistics.totalBundles }}
          </BaseHeading>

          <BaseText
            class="py-0 my-0 text-muted-500 dark:text-muted-400 text-base"
          >
            {{ $t("page.dashboard.quick-states.total-bundles") }}
          </BaseText>
        </div>
      </div>

      <div class="bg-muted-100 flex p-3 space-x-2 items-center rounded-md">
        <BaseIconBox
          size="lg"
          rounded="full"
          class="bg-muted-200 text-muted-500 dark:bg-muted-800"
          color="info"
          variant="pastel"
        >
          <Icon name="i-tabler-vocabulary" class="size-8" />
        </BaseIconBox>
        <div>
          <BaseHeading>
            {{ statistics.totalPhrases }}
          </BaseHeading>

          <BaseText
            class="py-0 my-0 text-muted-500 dark:text-muted-400 text-base"
          >
            {{ $t("page.dashboard.quick-states.total-phrases") }}
          </BaseText>
        </div>
      </div>
    </BaseCard>
  </section>

  <div class="flex justify-between mt-4 mb-2">
    <BaseHeading>{{ $t("page.dashboard.recent") }}</BaseHeading>
  </div>
  <section class="tablet:grid-cols-2 grid w-full gap-4 lg:grid-cols-3">
    <BundleGenerativeCard
      v-for="bundle in recentBundles"
      :key="bundle._id"
      :bundle="bundle"
    />
  </section>
</template>
