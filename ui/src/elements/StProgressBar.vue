<template>
    <div class="st-flex st-items-center st-gap-[10px]" :class="[$attrs.class]">
        <div
            class="st-flex-1 st-bg-ink-150 st-rounded-pill st-overflow-hidden"
            :class="size === 'sm' ? 'st-h-1.5' : size === 'lg' ? 'st-h-3.5' : 'st-h-2.5'"
            role="progressbar"
            :aria-valuenow="Math.round(pct)"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="ariaLabel"
        >
            <div class="st-h-full st-rounded-pill st-transition-[width] st-duration-slow st-ease-out" :class="fill" :style="{ width: `${pct}%` }" />
        </div>

        <span v-if="showLabel" class="st-min-w-9 st-text-right st-font-sans st-text-xs st-font-bold st-text-muted">{{ Math.round(pct) }}%</span>
    </div>
</template>

<script setup lang="ts">
    /**
     * Progress bar. Rose by default; jade for "grow"/learning progress; the status colours
     * carry a budget nearing its cap. Ported from components/core/ProgressBar.jsx, with the
     * warning/danger fills added — the meters this replaces switch colour at 80% and 100%.
     */
    import { computed } from 'vue';

    defineOptions({ inheritAttrs: false });

    type BarColor = 'primary' | 'accent' | 'neutral' | 'warning' | 'danger';

    const props = withDefaults(
        defineProps<{
            value?: number;
            max?: number;
            color?: BarColor;
            size?: 'sm' | 'md' | 'lg';
            /** Trailing "NN%" readout. */
            showLabel?: boolean;
            /** Accessible name — the bar is unlabelled otherwise. */
            ariaLabel?: string;
        }>(),
        { value: 0, max: 100, color: 'primary', size: 'md', showLabel: false }
    );

    // Full class strings only — Tailwind scans this file as text, so anything assembled at
    // runtime would be purged from the build.
    const FILLS: Record<BarColor, string> = {
        primary: 'st-bg-primary',
        accent: 'st-bg-accent',
        neutral: 'st-bg-ink-700',
        warning: 'st-bg-warning',
        danger: 'st-bg-danger',
    };

    const pct = computed(() => (props.max > 0 ? Math.max(0, Math.min(100, (props.value / props.max) * 100)) : 0));
    const fill = computed(() => FILLS[props.color]);
</script>
