<template>
    <span
        class="st-inline-flex st-items-center st-gap-[5px] st-px-[10px] st-py-[3px] st-rounded-pill st-font-sans st-text-2xs st-font-extrabold st-tracking-[0.02em] st-leading-[1.4]"
        :class="tone"
    >
        <StIcon v-if="icon" :name="icon" :size="13" />
        <slot />
    </span>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import StIcon from '../icon/StIcon.vue';

    type BadgeColor = 'primary' | 'accent' | 'neutral' | 'warning' | 'danger' | 'info';

    const props = withDefaults(
        defineProps<{
            color?: BadgeColor;
            /** Filled instead of the default soft tint. */
            solid?: boolean;
            icon?: string;
        }>(),
        { color: 'neutral', solid: false }
    );

    const SOFT: Record<BadgeColor, string> = {
        primary: 'st-bg-primary-soft st-text-rose-700',
        accent: 'st-bg-accent-soft st-text-jade-700',
        neutral: 'st-bg-ink-100 st-text-ink-700',
        warning: 'st-bg-warning-soft st-text-amber-600',
        danger: 'st-bg-danger-soft st-text-red-600',
        info: 'st-bg-info-soft st-text-sky-600',
    };

    const SOLID: Record<BadgeColor, string> = {
        primary: 'st-bg-primary st-text-on-brand',
        accent: 'st-bg-accent st-text-on-brand',
        // `bg-inverse`, not `bg-ink-800`: the ink ramp inverts in dark, so an ink-800 chip
        // with white text would become a near-white chip with white text.
        neutral: 'st-bg-inverse st-text-page',
        warning: 'st-bg-warning st-text-on-brand',
        danger: 'st-bg-danger st-text-on-brand',
        info: 'st-bg-info st-text-on-brand',
    };

    const tone = computed(() => (props.solid ? SOLID : SOFT)[props.color]);
</script>
