<script setup lang="ts">
// set compile time meta information
definePageMeta({
  // static meta information can be added to vue-router, we use it
  // to generate the search index in the demo
  title: "Home",
  layout: "main",
});

// meta information can also be added to the head
useHead({
  meta: [{ name: "description", content: "Subturtle popup app" }],
});

// Here you can define your page logic
</script>

<template>
  <TairoContentWrapper>
    <div class="flex flex-wrap items-end gap-4">
      <BaseButton shape="straight">Button</BaseButton>

      <BaseButton shape="rounded">Button</BaseButton>

      <BaseButton shape="curved">Button</BaseButton>

      <BaseButton shape="full">Button</BaseButton>
    </div>
  </TairoContentWrapper>
</template>
