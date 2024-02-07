<script setup lang="ts">
const { open } = usePanels();

function openMenu() {
  console.log("openMenu");

  open("menu");
}
</script>

<template>
  <!-- Header -->
  <div class="bg-blue-300">
    <BaseButtonIcon shape="straight" size="sm" @click="openMenu">
      <Icon name="ph:list-duotone" class="h-5 w-5" />
    </BaseButtonIcon>
  </div>

  <!-- Body -->
  <section class="h-[700px]">
    <slot />
  </section>

  <div class="bg-blue-300">v1.0.0</div>
  <TairoPanels />
</template>
