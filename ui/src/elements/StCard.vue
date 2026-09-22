<template>
    <div
        class="st-bg-card st-border st-border-subtle st-rounded-lg st-transition st-duration-base st-ease-out"
        :class="[
            padding === 'none' ? 'st-p-0' : '',
            padding === 'sm' ? 'st-p-4' : '',
            padding === 'md' ? 'st-p-card' : '',
            padding === 'lg' ? 'st-p-card-lg' : '',
            elevation === 'none' ? 'st-shadow-none' : '',
            elevation === 'sm' ? 'st-shadow-sm' : '',
            elevation === 'md' ? 'st-shadow-md' : '',
            elevation === 'lg' ? 'st-shadow-lg' : '',
            interactive ? 'st-cursor-pointer hover:st-shadow-lg hover:-st-translate-y-[3px]' : '',
        ]"
    >
        <slot />
    </div>
</template>

<script setup lang="ts">
    import type { StElevation, StPadding } from '../types';

    withDefaults(
        defineProps<{
            padding?: StPadding;
            elevation?: StElevation;
            /** Adds a hover lift and a pointer cursor. */
            interactive?: boolean;
        }>(),
        { padding: 'md', elevation: 'sm' }
    );
</script>
