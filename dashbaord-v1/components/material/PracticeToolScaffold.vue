<script setup lang="ts">
const props = defineProps<{
  title: string;
  activePhrase: number;
  totalPhrases: number;
  bundleId: string;
}>();
</script>

<template>
  <div class="flex flex-col h-screen bg-muted-100">
    <BaseCard
      rounded="none"
      class="py-3 px-3 w-full flex justify-between items-center"
    >
      <div></div>

      <div class="text-center">
        <p class="text-gray-600 font-bold">
          {{ activePhrase }} / {{ totalPhrases }}
        </p>
        <h1 class="text-sm text-gray-500">{{ title }}</h1>
      </div>

      <div>
        <BaseButtonIcon
          rounded="md"
          color="default"
          size="md"
          :to="`/dashboard/bundles/${bundleId}`"
        >
          <Icon name="ph:x-bold" />
        </BaseButtonIcon>
      </div>
    </BaseCard>

    <section class="flex-1">
      <slot />
    </section>
  </div>
</template>
