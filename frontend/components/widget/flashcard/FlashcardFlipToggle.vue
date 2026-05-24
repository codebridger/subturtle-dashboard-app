<template>
    <!-- Single, consistent flip control shared by every flashcard mode: shows which side is active
         and lets the learner switch to the other one. -->
    <div class="flex shrink-0 items-center justify-center gap-1 pt-2">
        <button type="button" @click.stop="isFlipped && emit('flip')"
            class="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors"
            :class="!isFlipped ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-gray-600'">
            {{ frontLabel }}
        </button>
        <span class="text-gray-300">·</span>
        <button type="button" @click.stop="!isFlipped && emit('flip')"
            class="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors"
            :class="isFlipped ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-gray-600'">
            {{ backLabel }}
        </button>
    </div>
</template>

<script setup lang="ts">
withDefaults(
    defineProps<{
        isFlipped?: boolean;
        frontLabel?: string;
        backLabel?: string;
    }>(),
    {
        frontLabel: 'Question',
        backLabel: 'Answer',
    }
);

const emit = defineEmits<{ (e: 'flip'): void }>();
</script>
