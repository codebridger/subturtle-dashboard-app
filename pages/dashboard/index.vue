<script setup lang="ts">
import { dataProvider } from "@modular-rest/client";
import {
  COLLECTIONS,
  DATABASE,
  type PhraseBundleType,
} from "~/types/database.type";

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

onMounted(() => {
  getRecentBundles();
});
</script>

<template>
  <div class="flex justify-between mt-4 mb-2">
    <BaseHeading>Your last 7 days</BaseHeading>
  </div>
  <WidgetActivityChartOverview />

  <div class="flex justify-between mt-4 mb-2">
    <BaseHeading>Recent</BaseHeading>
  </div>
  <section class="tablet:grid-cols-2 grid w-full gap-4 lg:grid-cols-3">
    <BundleGenerativeCard
      v-for="bundle in recentBundles"
      :key="bundle._id"
      :bundle="bundle"
    />
  </section>
</template>
