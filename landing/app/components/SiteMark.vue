<template>
    <!-- The S mark: four rounded chevrons, the outer arms trailing off. Paths from the brand logo
         (frontend/public/assets/images/logo.svg), redrawn without its embedded raster masks. -->
    <svg :width="size" :height="size" viewBox="32 32 310 310" aria-hidden="true" focusable="false">
        <defs>
            <linearGradient :id="`${id}-r`" gradientUnits="userSpaceOnUse" x1="92" y1="0" x2="312" y2="0">
                <stop offset="0" stop-color="#f91e5a" />
                <stop offset="0.5" stop-color="#f91e5a" stop-opacity="0.92" />
                <stop offset="1" stop-color="#f91e5a" stop-opacity="0" />
            </linearGradient>
            <linearGradient :id="`${id}-l`" gradientUnits="userSpaceOnUse" x1="284" y1="0" x2="64" y2="0">
                <stop offset="0" stop-color="#f91e5a" />
                <stop offset="0.5" stop-color="#f91e5a" stop-opacity="0.92" />
                <stop offset="1" stop-color="#f91e5a" stop-opacity="0" />
            </linearGradient>
        </defs>
        <g :fill="`url(#${id}-r)`">
            <path
                d="M170.3 45L97.7 117.6c-8.6 8.6-8.6 22.4 0 31l71.7 71.7c4.8 4.8 11.3 7.5 18.1 7.5h90l-79.2-79.2c-8.6-8.6-8.6-22.4 0-31l80.1-80.1h-90c-6.8 0-13.3 2.8-18.1 7.5z"
            />
            <path
                d="M200.2 74.9l-72.6 72.6c-8.6 8.6-8.6 22.4 0 31l71.7 71.7c4.8 4.8 11.3 7.5 18.1 7.5h90l-79.2-79.2c-8.6-8.6-8.6-22.4 0-31l80.1-80.1h-90c-6.8 0-13.3 2.8-18.1 7.5z"
                opacity="0.55"
            />
        </g>
        <g :fill="`url(#${id}-l)`">
            <path
                d="M174.8 124.8l72.6 72.6c8.6 8.6 8.6 22.4 0 31l-71.7 71.7c-4.8 4.8-11.3 7.5-18.1 7.5h-90l79.2-79.2c8.6-8.6 8.6-22.4 0-31l-80.1-80.1h90c6.8 0 13.3 2.8 18.1 7.5z"
                opacity="0.55"
            />
            <path
                d="M204.7 154.7l72.6 72.6c8.6 8.6 8.6 22.4 0 31l-71.7 71.7c-4.8 4.8-11.3 7.5-18.1 7.5h-90l79.2-79.2c8.6-8.6 8.6-22.4 0-31l-80.1-80.1h90c6.8 0 13.3 2.8 18.1 7.5z"
            />
        </g>
    </svg>
</template>

<script setup lang="ts">
    withDefaults(defineProps<{ size?: number }>(), { size: 32 });
    // Gradient ids must be unique per instance: the mark appears in the header and the footer.
    const id = useId();
</script>
