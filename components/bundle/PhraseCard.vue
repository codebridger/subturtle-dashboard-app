<template>
  <BaseCard shape="curved" @mouseleave="onSubmit">
    <div
      class="flex justify-between items-center border-muted-200 dark:border-muted-700 border-b py-3 px-5"
    >
      <div>{{ props.number }}</div>

      <BaseButtonIcon
        rounded="full"
        size="sm"
        :disabled="isSubmitting"
        @click="removePhrase"
      >
        <Icon name="ph:trash-simple" class="size-5" />
      </BaseButtonIcon>
    </div>
    <div class="flex flex-col p-5 sm:flex-row sm:items-center space-x-4">
      <div class="flex-1">
        <BaseTextarea
          type="text"
          label="Phrase"
          placeholder="Avengers - Season 1"
          v-model="phrase"
          :error="errors.phrase"
          :loading="isSubmitting"
        />
      </div>

      <div class="flex-1">
        <BaseTextarea
          type="text"
          label="Translation"
          placeholder="Avengers - Season 1"
          v-model="translation"
          :error="errors.translation"
          :loading="isSubmitting"
        />
      </div>
    </div>
  </BaseCard>
</template>

<script setup lang="ts">
import { useForm } from "vee-validate";
import * as yup from "yup";
import type { PhraseType } from "~/types/database.type";

const bundleStore = useBundleStore();
const isSubmitting = ref(false);

const props = defineProps({
  phrase: {
    type: Object as PropType<PhraseType>,
    required: true,
  },
  number: {
    type: Number as PropType<number>,
    required: true,
  },
});

const { defineField, errors, handleSubmit, resetForm, meta } = useForm({
  validationSchema: yup.object({
    phrase: yup.string().required("Phrase is required"),
    translation: yup.string().required("Translation is required"),
  }),
});

const [phrase] = defineField("phrase");
const [translation] = defineField("translation");

watch(
  () => props.phrase,
  () => {
    resetForm({
      values: {
        phrase: props.phrase.phrase,
        translation: props.phrase.translation,
      },
    });
  },
  { immediate: true, deep: true }
);

const onSubmit = handleSubmit(async () => {
  if (!meta.value.dirty) return;

  isSubmitting.value = true;

  bundleStore
    .updatePhrase(props.phrase._id, {
      phrase: phrase.value,
      translation: translation.value,
    })
    .finally(() => {
      isSubmitting.value = false;
    });
});

function removePhrase() {
  isSubmitting.value = true;

  bundleStore.removePhrase(props.phrase._id).finally(() => {
    isSubmitting.value = false;
  });
}
</script>
