<template>
    <div class="st-skeleton st-bg-ink-150 st-rounded-lg" />
</template>

<script setup lang="ts">
    // Height/width come from the caller; this is the design's `.sk` placeholder block.
</script>

<style>
    @keyframes st-skeleton-pulse {
        0%,
        100% {
            opacity: 0.55;
        }
        50% {
            opacity: 1;
        }
    }

    .st-skeleton {
        animation: st-skeleton-pulse 1.4s var(--ease-in-out) infinite;
    }

    @media (prefers-reduced-motion: reduce) {
        .st-skeleton {
            animation: none;
            opacity: 0.7;
        }
    }
</style>
