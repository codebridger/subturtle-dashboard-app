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
        <BaseParagraph>{{ bundleDetail.desc }}</BaseParagraph>
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

        <BaseDropdown
          :loading="true"
          v-else
          variant="context"
          label="Options"
          placement="bottom-start"
        >
          <BaseDropdownItem
            title="Edit"
            text="The title and description"
            rounded="sm"
            @click="isEditMode = true"
          />

          <BaseDropdownItem
            title="Remove"
            text="The Bundle and phrases"
            rounded="sm"
            @click="onRemove"
          />
        </BaseDropdown>
      </div>
    </BaseCard>
  </VeeForm>
</template>

<script setup lang="ts">
import { functionProvider, dataProvider } from "@modular-rest/client";
import { Field, Form as VeeForm } from "vee-validate";
import * as yup from "yup";
import {
  COLLECTIONS,
  DATABASE,
  type PhraseBundleType,
} from "~/types/database.type";

const router = useRouter();

const props = defineProps({
  bundleDetail: {
    type: Object as PropType<PhraseBundleType>,
    required: true,
  },
});

const emit = defineEmits<{
  changed: [values: { [key: string]: any }];
  removed: [];
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

function onRemove() {
  functionProvider
    .run({
      name: "removeBundle",
      args: {
        _id: props.bundleDetail._id,
        refId: authUser.value?.id,
      },
    })
    .then(() => {
      router.push("/dashboard/bundles");
    })
    .catch((error) => {
      debugger;
      toastError({
        title: "Error",
        message: error.error,
      });
    });
}
</script>
