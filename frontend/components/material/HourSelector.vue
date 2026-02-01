<template>
  <div class="relative inline-block w-32" v-click-outside="close">
    <button
      type="button"
      @click="isOpen = !isOpen"
      class="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white py-1.5 px-3 text-sm focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
    >
      <span>{{ formatHour(modelValue) }}</span>
      <i class="fas fa-chevron-down text-xs text-gray-400 transition-transform" :class="{ 'rotate-180': isOpen }"></i>
    </button>

    <transition
      enter-active-class="transition ease-out duration-100"
      enter-from-class="transform opacity-0 scale-95"
      enter-to-class="transform opacity-100 scale-100"
      leave-active-class="transition ease-in duration-75"
      leave-from-class="transform opacity-100 scale-100"
      leave-to-class="transform opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-gray-800 dark:ring-gray-700 sm:text-sm"
      >
        <div
          v-for="hour in hours"
          :key="hour"
          @click="selectHour(hour)"
          class="relative cursor-pointer select-none py-2 px-4 hover:bg-primary-50 hover:text-primary-900 dark:hover:bg-primary-900/20 dark:hover:text-primary-400"
          :class="{ 'bg-primary-50 text-primary-900 dark:bg-primary-900/20 dark:text-primary-400 font-bold': modelValue === hour }"
        >
          <span class="block truncate">{{ formatHour(hour) }}</span>
        </div>
      </div>
    </transition>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  modelValue: number;
}>();

const emit = defineEmits(['update:modelValue']);

const isOpen = ref(false);
const hours = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h: number) {
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour}:00 ${period}`;
}

function selectHour(h: number) {
  emit('update:modelValue', h);
  isOpen.value = false;
}

function close() {
  isOpen.value = false;
}

// v-click-outside directive logic
const vClickOutside = {
  mounted(el: any, binding: any) {
    el.clickOutsideEvent = (event: Event) => {
      if (!(el === event.target || el.contains(event.target))) {
        binding.value();
      }
    };
    document.addEventListener('click', el.clickOutsideEvent);
  },
  unmounted(el: any) {
    document.removeEventListener('click', el.clickOutsideEvent);
  },
};
</script>
