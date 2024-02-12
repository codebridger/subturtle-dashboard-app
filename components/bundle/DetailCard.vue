<template>
  <VeeForm
    :validation-schema="schema"
    @submit="onSubmit"
    v-slot="{ handleSubmit }"
  >
    <BaseCard class="p-5 flex justify-between items-start">
      <div class="flex-1">
        <Field
          v-if="isEditMode"
          name="title"
          :model-value="props.bundleDetail.title"
          v-slot="{ field, errors }"
        >
          <BaseInput
            label="Title"
            placeholder="Avengers - Season 1"
            :model-value="field.value"
            :error="errors[0]"
            :disabled="isSubmitting"
            type="text"
            v-bind="field"
          />
        </Field>
        <BaseHeading v-else>{{ bundleDetail.title }}</BaseHeading>
      </div>

      <div class="flex-1 flex justify-end">
        <BaseButton
          v-if="isSubmitting || isEditMode"
          color="primary"
          :loading="isSubmitting"
          @click="handleSubmit(onSubmit)"
        >
          Submit
        </BaseButton>

        <BaseButton v-else @click="isEditMode = true">Edit</BaseButton>
      </div>
    </BaseCard>
  </VeeForm>
</template>

<script setup lang="ts">
import { dataProvider } from "@modular-rest/client";
import { Field, Form as VeeForm } from "vee-validate";
import * as yup from "yup";
import {
  COLLECTIONS,
  DATABASE,
  type PhraseBundleType,
} from "~/types/database.type";

const props = defineProps({
  bundleDetail: {
    type: Object as PropType<PhraseBundleType>,
    required: true,
  },
});

const emit = defineEmits<{
  changed: [values: { [key: string]: any }];
}>();

const isSubmitting = ref(false);
const isEditMode = ref(false);
const schema = yup.object({
  title: yup.string().required("Title name is required"),
});

function onSubmit(values: any) {
  isSubmitting.value = true;
  isEditMode.value = false;

  dataProvider
    .updateOne({
      database: DATABASE.USER_CONTENT,
      collection: COLLECTIONS.PHRASE_BUNDLE,
      query: {
        _id: props.bundleDetail._id,
        refId: authUser.value?.id,
      },
      update: {
        $set: {
          title: values.title,
        },
      },
    })
    .then(() => {
      emit("changed", values);
    })
    .finally(() => {
      isSubmitting.value = false;
    });
}
</script>
