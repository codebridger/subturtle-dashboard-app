<script setup lang="ts">
import { dataProvider } from "@modular-rest/client";
import {
  COLLECTIONS,
  DATABASE,
  type PopulatedPhraseBundleType,
} from "~/types/database.type";

definePageMeta({
  // @ts-ignore
  layout: "empty",
});

const { id } = useRoute().params;

const bundle = ref<PopulatedPhraseBundleType | null>(null);
const phraseIndex = ref(0);

const phrase = computed(() => {
  if (!bundle.value) return null;
  return bundle.value.phrases[phraseIndex.value];
});

const totalPhrases = computed<number>(() => {
  return bundle.value?.phrases.length || 0;
});

const isNextAvailable = computed(() => {
  return phraseIndex.value < totalPhrases.value - 1;
});

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

function nextCard() {
  if (!bundle.value) return;

  if (phraseIndex.value < bundle.value.phrases.length - 1) {
    phraseIndex.value++;
  }
}

function prevCard() {
  if (phraseIndex.value > 0) {
    phraseIndex.value--;
  }
}
</script>

<template>
  <MaterialPracticeToolScaffold
    :title="bundle?.title || 'Flashcards'"
    :activePhrase="phraseIndex + 1"
    :totalPhrases="totalPhrases"
    :bundleId="id"
  >
    <div class="w-full h-full py-14 px-16 flex flex-col items-center">
      <div class="flex-1 w-full max-w-[65%] max-h-[65%]">
        <WidgetFlashCard
          v-if="phrase"
          :key="phraseIndex"
          :front="phrase.phrase"
          :back="phrase.translation"
        />
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
          <BaseButtonIcon
            rounded="md"
            color="muted"
            size="lg"
            @click="prevCard"
            :disabled="phraseIndex === 0"
          >
            <Icon name="ph:arrow-left-bold" />
          </BaseButtonIcon>

          <BaseButtonIcon
            rounded="md"
            color="muted"
            size="lg"
            @click="nextCard"
            :disabled="!isNextAvailable"
          >
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
  </MaterialPracticeToolScaffold>
</template>
