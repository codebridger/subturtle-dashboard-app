<template>
  <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
    <button
      v-for="v in normalized"
      :key="v.name"
      type="button"
      @click="$emit('update:modelValue', v.name)"
      :class="[
        'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all focus:outline-none',
        modelValue === v.name
          ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
          : 'border-gray-200 hover:border-primary/50 dark:border-gray-700',
      ]"
    >
      <img
        v-if="v.avatarUrl"
        :src="v.avatarUrl"
        :alt="v.label"
        class="h-12 w-12 rounded-full object-cover"
      />
      <span
        v-else
        class="flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold text-white"
        :style="{ backgroundColor: v.avatarColor }"
      >{{ v.initial }}</span>
      <span class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ v.label }}</span>
      <span v-if="v.description" class="text-xs text-gray-500 dark:text-gray-400">
        {{ v.description }}
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CoachVoice } from '~/types/live-session.type';

// Accepts either rich server voices (CoachVoice[]) or a plain name list
// (string[]) so the same picker serves the server-backed Gemini bundle flow and
// the OpenAI/Gemini `StartNew` variants that still pass their own name arrays.
const props = defineProps<{
  modelValue: string;
  voices: (string | CoachVoice)[];
}>();

defineEmits<{ 'update:modelValue': [value: string] }>();

// Deterministic palette so name-only lists still get a stable colored avatar.
const FALLBACK_COLORS = [
  '#7C3AED', '#2563EB', '#0D9488', '#EA580C',
  '#DB2777', '#D97706', '#4F46E5', '#059669',
];

const normalized = computed(() =>
  (props.voices || []).map((v) => {
    const voice: Partial<CoachVoice> & { name: string } =
      typeof v === 'string' ? { name: v, label: v } : v;
    const label = voice.label || voice.name;
    let color = voice.avatarColor;
    if (!color) {
      const sum = [...voice.name].reduce((a, c) => a + c.charCodeAt(0), 0);
      color = FALLBACK_COLORS[sum % FALLBACK_COLORS.length];
    }
    return {
      name: voice.name,
      label,
      description: voice.description,
      avatarColor: color,
      avatarUrl: voice.avatarUrl || null,
      initial: label.charAt(0).toUpperCase(),
    };
  })
);
</script>
