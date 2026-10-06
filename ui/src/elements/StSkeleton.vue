<template>
    <div class="st-skeleton st-rounded-lg" />
</template>

<script setup lang="ts">
    // Height/width come from the caller; this is the design's `.sk` placeholder block.
</script>

<style>
    /*
     * The handoff's audit specifies base --ink-100 and highlight --ink-150, so the pulse animates
     * background-color between the two rather than fading a single fill's opacity. That also makes
     * it theme-correct for free: the ink ramp inverts in dark, keeping both roles.
     */
    @keyframes st-skeleton-pulse {
        0%,
        100% {
            background-color: rgb(var(--ink-100));
        }
        50% {
            background-color: rgb(var(--ink-150));
        }
    }

    .st-skeleton {
        background-color: rgb(var(--ink-100));
        animation: st-skeleton-pulse 1.4s var(--ease-in-out) infinite;
    }

    @media (prefers-reduced-motion: reduce) {
        .st-skeleton {
            animation: none;
            background-color: rgb(var(--ink-150));
        }
    }
</style>
