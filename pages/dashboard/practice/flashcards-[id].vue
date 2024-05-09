<script setup lang="ts">
import { dataProvider } from "@modular-rest/client";
import {
  COLLECTIONS,
  DATABASE,
  type PopulatedPhraseBundleType,
} from "~/types/database.type";

definePageMeta({
  // @ts-ignore
  layout: "practice",
});

const { id } = useRoute().params;

const bundle = ref<PopulatedPhraseBundleType | null>(null);

onMounted(() => {
  fetchFlashcard();
});

function fetchFlashcard() {
  dataProvider
    .findOne<PopulatedPhraseBundleType>({
      database: DATABASE.USER_CONTENT,
      collection: COLLECTIONS.PHRASE_BUNDLE,
      query: {
        _id: id,
        refId: authUser.value?.id,
      },
      populates: ["phrases"],
    })
    .then((res) => {
      if (!res) throw new Error("Bundle not found");
      bundle.value = res;
    })
    .catch((err) => {
      toastError({ title: "Failed to fetch flashcard" });
    })
    .finally(() => {
      console.log(bundle.value);
    });
}
</script>

<template>
  <div class="w-full h-full py-14 px-16 flex flex-col items-center">
    <div class="flex-1 w-full max-w-[65%] max-h-[65%]">
      <WidgetFlashCard />
    </div>

    <selection
      class="w-full my-6 flex justify-between items-center max-w-[65%] max-h-[65%]"
    >
      <div>
        <BaseButtonIcon rounded="md" color="muted" size="lg">
          <Icon name="ph:play-fill" />
        </BaseButtonIcon>
      </div>

      <div class="flex space-x-2">
        <BaseButtonIcon rounded="md" color="muted" size="lg">
          <Icon name="ph:arrow-left-bold" />
        </BaseButtonIcon>
        <BaseButtonIcon rounded="md" color="muted" size="lg">
          <Icon name="ph:arrow-right-bold" />
        </BaseButtonIcon>
      </div>

      <div>
        <BaseButtonIcon rounded="md" color="muted" size="lg">
          <Icon name="ph:shuffle-bold" />
        </BaseButtonIcon>
      </div>
    </selection>
  </div>
</template>
