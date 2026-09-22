<template>
    <div
        class="st-flex st-items-center st-gap-4 st-bg-card st-border st-border-subtle st-rounded-lg st-px-5 st-py-4 st-shadow-sm st-font-sans"
    >
        <span
            class="st-flex st-shrink-0 st-items-center st-justify-center st-w-[52px] st-h-[52px] st-rounded-md"
            :class="tint"
        >
            <StIcon v-if="icon" :name="icon" :size="28" />
        </span>

        <div class="st-flex-1 st-min-w-0">
            <div class="st-flex st-items-baseline st-gap-2">
                <span class="st-font-display st-text-xl st-font-black st-text-strong st-leading-none">
                    <slot>{{ value }}</slot>
                </span>
                <span
                    v-if="trend"
                    class="st-inline-flex st-items-center st-gap-[2px] st-text-xs st-font-extrabold"
                    :class="isNegative ? 'st-text-danger' : 'st-text-jade-600'"
                >
                    <StIcon :name="isNegative ? 'solar:arrow-down-bold' : 'solar:arrow-up-bold'" :size="12" />
                    {{ trendLabel }}
                </span>
            </div>
            <div class="st-mt-[2px] st-text-sm st-font-semibold st-text-muted st-truncate">{{ label }}</div>
        </div>

        <slot name="action" />
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import StIcon from '../icon/StIcon.vue';

    const props = withDefaults(
        defineProps<{
            icon?: string;
            /** The big number. Also available as the default slot. */
            value?: string | number;
            label?: string;
            accent?: 'primary' | 'accent' | 'info' | 'warning';
            /** e.g. '+18' or '-4%'. A leading '-' flips the arrow and the color. */
            trend?: string | null;
        }>(),
        { accent: 'primary' }
    );

    const TINTS = {
        primary: 'st-bg-primary-soft st-text-rose-600',
        accent: 'st-bg-accent-soft st-text-jade-600',
        info: 'st-bg-info-soft st-text-sky-600',
        warning: 'st-bg-warning-soft st-text-amber-600',
    };

    const tint = computed(() => TINTS[props.accent]);
    const isNegative = computed(() => !!props.trend?.startsWith('-'));
    // Strip only the leading sign; the design system's replace('-', '') mangled values like '-1-2'.
    const trendLabel = computed(() => (isNegative.value ? props.trend!.slice(1) : props.trend));
</script>
