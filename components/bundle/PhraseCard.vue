<template>
  <BaseCard shape="curved" :color="props.newPhrase ? 'primary' : 'default'">
    <div
      class="flex justify-between items-center border-muted-200 dark:border-muted-700 border-b py-3 px-5"
    >
      <div>{{ props.number }}</div>

      <div class="flex space-x-2">
        <transition name="fade">
          <BaseButtonIcon
            v-if="getSubmitButtonStatus()"
            rounded="full"
            size="sm"
            :color="props.newPhrase ? 'default' : 'warning'"
            @click="onSubmit"
          >
            <span class="i-ph-check-bold size-5" />
          </BaseButtonIcon>
        </transition>

        <BaseButtonIcon
          rounded="full"
          size="sm"
          :disabled="isSubmitting"
          @click="removePhrase"
        >
          <Icon name="ph:trash-simple" class="size-5" />
        </BaseButtonIcon>
      </div>
    </div>
    <div class="flex flex-col p-5 sm:flex-row sm:items-center space-x-4">
      <div class="flex-1">
        <BaseTextarea
          type="text"
          label="Phrase"
          placeholder="Avengers - Season 1"
          v-model="phrase"
          :error="errors.phrase"
          :loading="!!props.newPhrase && isSubmitting"
        />
      </div>

      <div class="flex-1">
        <BaseTextarea
          type="text"
          label="Translation"
          placeholder="Avengers - Season 1"
          v-model="translation"
          :error="errors.translation"
          :loading="!!props.newPhrase && isSubmitting"
        />
      </div>
    </div>
  </BaseCard>
</template>

<script setup lang="ts">
import { useForm } from "vee-validate";
import * as yup from "yup";
import type { NewPhraseType, PhraseType } from "~/types/database.type";

const bundleStore = useBundleStore();
const isSubmitting = ref(false);

const props = defineProps({
  newPhrase: {
    type: Object as PropType<NewPhraseType | null>,
  },
  phrase: {
    type: Object as PropType<PhraseType | null>,
  },
  number: {
    type: Number as PropType<number>,
  },
});

const {
  defineField,
  errors,
  handleSubmit,
  resetForm,
  meta,
  isFieldDirty,
  validate,
} = useForm({
  validationSchema: yup.object({
    phrase: yup.string().required("Phrase is required"),
    translation: yup.string().required("Translation is required"),
  }),
  initialTouched: {
    phrase: false,
    translation: false,
  },
  initialValues: {
    phrase: props.phrase?.phrase || "",
    translation: props.phrase?.translation || "",
  },
});

const [phrase] = defineField("phrase");
const [translation] = defineField("translation");

function getSubmitButtonStatus() {
  const conditions = [
    isFieldDirty("phrase"),
    isFieldDirty("translation"),
    Object.keys(errors.value).length > 0,
  ];

  return conditions.some((condition) => condition);
}

const onSubmit = handleSubmit(async () => {
  const validated = await validate();

  if (!validated.valid || !meta.value.dirty) return;

  isSubmitting.value = true;

  // Update phrase
  if (props.phrase) {
    bundleStore
      .updatePhrase(props.phrase._id, {
        phrase: phrase.value,
        translation: translation.value,
      })
      .finally(() => {
        isSubmitting.value = false;
      });

    resetForm({
      values: {
        phrase: phrase?.value || "",
        translation: translation?.value || "",
      },
    });
  }

  // Create new phrase
  else if (props.newPhrase) {
    bundleStore
      .createPhrase({
        phrase: phrase.value,
        translation: translation.value,
        id: props.newPhrase.id,
      })
      .finally(() => {
        isSubmitting.value = false;
      });
  }
});

function removePhrase() {
  isSubmitting.value = true;

  if (props.phrase) {
    bundleStore.removePhrase(props.phrase!._id).finally(() => {
      isSubmitting.value = false;
    });
  }

  // Remove new phrase
  else if (props.newPhrase) {
    bundleStore.removeTemporarilyPhrase(props.newPhrase.id);
  }
}
</script>
