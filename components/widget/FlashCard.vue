<script setup lang="ts">
const isFlipped = ref(false);

const props = defineProps<{
  front?: string;
  back?: string;
}>();

function flipCard() {
  isFlipped.value = !isFlipped.value;
}
</script>

<template>
  <BaseCard
    class="w-full h-full flex justify-center items-center select-none cursor-pointer p-6"
    rounded="lg"
    shadow="flat"
    :color="!isFlipped ? 'default' : 'info'"
    @click="flipCard"
  >
    <div class="text-5xl">
      <span v-if="!isFlipped">{{ props.front || "Front" }}</span>
      <span v-else>{{ props.back || "Back" }}</span>
    </div>
  </BaseCard>
</template>
