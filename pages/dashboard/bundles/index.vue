<script setup lang="ts">
definePageMeta({
  // static meta information can be added to vue-router, we use it
  // to generate the search index in the demo
  title: "Phrase Bundles",
  layout: "collapse",
});

const filter = ref("");
const perPage = ref(10);
</script>

<template>
  <TairoContentWrapper>
    <template #left>
      <BaseInput
        v-model="filter"
        icon="lucide:search"
        placeholder="Filter bundles..."
        :classes="{
          wrapper: 'w-full sm:w-auto',
        }"
      />
    </template>
    <template #right>
      <BaseButton color="primary" class="w-full" disabled>
        <Icon name="lucide:plus" class="h-4 w-4" />
        <span>Add New</span>
      </BaseButton>
    </template>

    <div>dasdasd</div>
  </TairoContentWrapper>
</template>
