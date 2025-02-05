<script setup lang="ts">
import { dataProvider } from "@modular-rest/client";
import { useForm } from "vee-validate";
import * as yup from "yup";
import { $t } from "~/composables/i18n";
import { COLLECTIONS, DATABASE } from "~/types/database.type";

const router = useRouter();
const isFormOpen = ref(false);
const isPending = ref(false);

const { errors, values, defineField, resetForm } = useForm({
  validationSchema: yup.object({
    title: yup.string().required($t("comp.bundle.add_new.title_required")),
    description: yup.string().max(130, $t("comp.bundle.add_new.desc_max")),
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
      router.push({ path: "/dashboard/bundles/" + _id });
    })
    .catch(({ error }) => {
      isPending.value = false;

      if (error.includes("duplicate key error")) {
        return toastError({
          title: $t("comp.bundle.add_new.duplicate_title"),
          message: $t("comp.bundle.add_new.duplicate_title_desc"),
        });
      } else {
        toastError({
          title: $t("comp.bundle.add_new.error"),
          message: error,
        });
      }
    });
}
</script>

<template>
  <BaseButton color="primary" class="w-full" @click="openForm">
    <Icon name="lucide:plus" class="h-4 w-4" />
    <span>{{ $t("comp.bundle.add_new.action_add_new") }}</span>
  </BaseButton>

  <TairoModal :open="isFormOpen">
    <template #header>
      <!-- Header -->
      <div class="flex w-full items-center justify-between p-4 md:p-6">
        <h3
          class="font-heading text-muted-900 text-lg font-medium leading-6 dark:text-white"
        >
          {{ $t("comp.bundle.add_new.title") }}
        </h3>
      </div>
    </template>

    <div class="p-4 flex flex-col space-y-2">
      <BaseInput
        :placeholder="$t('comp.bundle.add_new.title_placeholder')"
        v-model="title"
        :error="errors.title"
      />
      <BaseTextarea
        :placeholder="$t('comp.bundle.add_new.desc_placeholder')"
        v-model="description"
        :error="errors.description"
      />
    </div>

    <template #footer>
      <!-- Footer -->
      <div class="flex justify-end p-4 md:p-6 space-x-2">
        <BaseButton color="default" @click="closeForm">
          <span>{{ $t("comp.bundle.add_new.action_cancel") }}</span>
        </BaseButton>

        <BaseButton
          color="primary"
          @click="createBundle"
          :loading="isPending"
          :disabled="!isValidForm"
        >
          <span>{{ $t("comp.bundle.add_new.action_create") }}</span>
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
