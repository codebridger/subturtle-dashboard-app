<script setup lang="ts">
import { dataProvider } from "@modular-rest/client";
import {
  COLLECTIONS,
  DATABASE,
  type PhraseBundleType,
  type PhraseType,
} from "~/types/database.type";

const props = defineProps<{
  bundle: PhraseBundleType;
}>();

const phraseList = ref<string[]>([]);

async function getWords() {
  // get last 10 words
  const phraseIds = props.bundle.phrases.slice(-10);

  if (phraseIds.length === 0) {
    return;
  }

  const phrases = await dataProvider.findByIds<PhraseType>({
    database: DATABASE.USER_CONTENT,
    collection: COLLECTIONS.PHRASE,
    ids: phraseIds,
    accessQuery: {
      refId: authUser.value?.id,
    },
  });

  phraseList.value = phrases.map(({ phrase, translation }) => {
    // choose between phrase and translation
    return [phrase, translation][Math.floor(Math.random() * 2)];
  });
}

onMounted(async () => {
  getWords();
});
</script>

<template>
  <NuxtLink :to="`/dashboard/bundles/${props.bundle._id}`">
    <BaseCard rounded="md" shadow="hover" class="overflow-hidden">
      <section class="relative">
        <BaseTag
          class="absolute top-2 right-2"
          rounded="md"
          variant="pastel"
          color="primary"
        >
          {{ bundle.phrases.length }}
        </BaseTag>
        <MaterialWordGenerativeCover
          :words="phraseList"
          :classes="['h-24 w-full']"
        />
      </section>

      <section class="p-6">
        <BaseHeading
          as="h4"
          size="sm"
          weight="semibold"
          lead="tight"
          class="text-muted-800 mb-2 dark:text-white"
        >
          {{ props.bundle.title }}
        </BaseHeading>

        <BaseParagraph size="sm" lead="tight" class="text-muted-400">
          {{ props.bundle.desc }}
        </BaseParagraph>
      </section>
    </BaseCard>
  </NuxtLink>
</template>
