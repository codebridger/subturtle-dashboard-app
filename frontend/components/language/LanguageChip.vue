<template>
    <span
        class="inline-flex shrink-0 items-center justify-center font-black"
        :class="[size === 'lg' ? 'h-[52px] w-[52px] rounded-st-md text-st-base' : 'h-11 w-11 rounded-st-md text-st-sm', on ? 'bg-st-accent-tint text-st-jade-700' : 'bg-st-ink-100 text-st-ink-700']"
        aria-hidden="true"
    >
        {{ shortCode(code) || code.toUpperCase() }}
    </span>
</template>

<script setup lang="ts">
    import { shortCode } from '~/utils/languages';

    /** The two-letter square on language cards and pickers ("DE"). Decorative: the name follows it. */
    withDefaults(defineProps<{ code: string; on?: boolean; size?: 'md' | 'lg' }>(), { on: false, size: 'md' });
</script>
