<script setup lang="ts">
import { dataProvider } from "@modular-rest/client";
import { useForm } from "vee-validate";
import * as yup from "yup";
import { COLLECTIONS, DATABASE } from "~/types/database.type";

const router = useRouter();
const isFormOpen = ref(false);
const isPending = ref(false);

const { errors, values, defineField, resetForm } = useForm({
  validationSchema: yup.object({
    title: yup.string().required("Title name is required"),
    description: yup.string(),
  }),
});

const [title] = defineField("title", values.title);
const [description] = defineField("description", values.description);

const isValidForm = computed(() => {
  return title.value?.length && Object.keys(errors.value).length === 0;
});

function closeForm() {
  isFormOpen.value = false;
}

function openForm() {
  resetForm();
  isFormOpen.value = true;
}

function createBundle() {
  if (!isValidForm) return;

  isPending.value = true;

  dataProvider
    .insertOne({
      database: DATABASE.USER_CONTENT,
      collection: COLLECTIONS.PHRASE_BUNDLE,
      doc: {
        title: title.value,
        desc: description.value,
        refId: authUser.value?.id,
      },
    })
    .then(({ _id }) => {
      isPending.value = false;

      toastSuccess({
        title: `${title.value} created successfully`,
        message: "You can now add phrases to this bundle.",
      });

      router.push({ path: "/dashboard/bundles/" + _id });
    })
    .catch(({ error }) => {
      isPending.value = false;

      if (error.includes("duplicate key error")) {
        return toastError({
          title: "Bundle already exists",
          message: "Please choose a different name",
        });
      } else {
        toastError({
          title: "Failed to create new bundle",
          message: error,
        });
      }
    });
}
</script>

<template>
  <BaseButton color="primary" class="w-full" @click="openForm">
    <Icon name="lucide:plus" class="h-4 w-4" />
    <span>Add New</span>
  </BaseButton>

  <TairoModal :open="isFormOpen">
    <template #header>
      <!-- Header -->
      <div class="flex w-full items-center justify-between p-4 md:p-6">
        <h3
          class="font-heading text-muted-900 text-lg font-medium leading-6 dark:text-white"
        >
          Add new Bundle
        </h3>
      </div>
    </template>

    <div class="p-4 flex flex-col space-y-2">
      <BaseInput
        placeholder="My new Tiny set"
        v-model="title"
        :error="errors.title"
      />
      <BaseTextarea
        placeholder="Description"
        v-model="description"
        :error="errors.description"
      />
    </div>

    <template #footer>
      <!-- Footer -->
      <div class="flex justify-end p-4 md:p-6 space-x-2">
        <BaseButton color="default" @click="closeForm">
          <span>Close</span>
        </BaseButton>

        <BaseButton
          color="primary"
          @click="createBundle"
          :loading="isPending"
          :disabled="!isValidForm"
        >
          <span>Save</span>
        </BaseButton>
      </div>
    </template>
  </TairoModal>
</template>

<style>
[role="dialog"] {
  /* 
    decrease the z-index of the modal to avoid overlapping with toast
   */
  z-index: 199 !important;
}
</style>
