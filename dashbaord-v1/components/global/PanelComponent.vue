<script setup lang="ts">
// Eiter define events
const emits = defineEmits<{
  (event: "save", info: any): void;
}>();

// And use panels utils
const { close } = usePanels();
</script>

<template>
  <div class="h-screen bg-slate-200">
    <BaseButtons>
      <BaseButton>Save</BaseButton>
      <BaseButton @click="() => close()">Cancel</BaseButton>
    </BaseButtons>
  </div>
</template>
