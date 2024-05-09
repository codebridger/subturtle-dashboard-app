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
    class="w-full h-full flex justify-center items-center"
    rounded="lg"
    shadow="flat"
    @click="flipCard"
  >
    <span v-if="!isFlipped">{{ props.front || "Front" }}</span>
    <span v-else>{{ props.back || "Back" }}</span>
  </BaseCard>
</template>
