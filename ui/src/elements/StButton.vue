<template>
    <button
        :type="type"
        :disabled="disabled"
        class="st-font-sans st-font-extrabold st-leading-none st-tracking-[0.01em] st-items-center st-justify-center st-transition st-duration-fast st-ease-out st-focus-ring disabled:st-opacity-50 disabled:st-cursor-not-allowed disabled:active:st-scale-100"
        :class="[
            block ? 'st-flex st-w-full' : 'st-inline-flex',
            pill ? 'st-rounded-pill' : 'st-rounded-md',
            size === 'sm' ? 'st-h-control-sm st-px-[14px] st-text-sm st-gap-[6px]' : '',
            size === 'md' ? 'st-h-control-md st-px-[20px] st-text-sm st-gap-2' : '',
            size === 'lg' ? 'st-h-control-lg st-px-[26px] st-text-md st-gap-[10px]' : '',
            look,
            disabled ? '' : 'st-cursor-pointer active:st-scale-[0.97] active:st-shadow-none',
        ]"
        @click="$emit('click', $event)"
    >
        <StIcon v-if="icon" :name="icon" :size="iconSize" />
        <slot />
        <StIcon v-if="iconRight" :name="iconRight" :size="iconSize" />
    </button>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import StIcon from '../icon/StIcon.vue';
    import type { StSize, StTone } from '../types';

    const props = withDefaults(
        defineProps<{
            variant?: 'solid' | 'soft' | 'outline' | 'ghost';
            color?: StTone;
            size?: StSize;
            /** Full-width. */
            block?: boolean;
            /** Fully rounded ends instead of the default 14px radius. */
            pill?: boolean;
            disabled?: boolean;
            /** Leading icon, an Iconify name. */
            icon?: string;
            /** Trailing icon, an Iconify name. */
            iconRight?: string;
            type?: 'button' | 'submit' | 'reset';
        }>(),
        { variant: 'solid', color: 'primary', size: 'md', type: 'button' }
    );

    defineEmits<{ click: [MouseEvent] }>();

    const iconSize = computed(() => ({ sm: 16, md: 18, lg: 20 })[props.size]);

    /**
     * variant x color, ported from components/core/Button.jsx. Full class strings only —
     * Tailwind scans this file as text, so anything assembled at runtime would be purged.
     */
    const LOOKS: Record<string, Record<StTone, string>> = {
        solid: {
            primary: 'st-bg-primary hover:st-bg-primary-hover st-text-primary-on st-border-[1.5px] st-border-transparent st-shadow-primary',
            accent: 'st-bg-accent hover:st-bg-accent-hover st-text-accent-on st-border-[1.5px] st-border-transparent st-shadow-accent',
            // `bg-inverse`, not the ink ramp: ink inverts in dark, so an ink-900 fill with
            // white text would become a near-white fill with white text.
            neutral: 'st-bg-inverse hover:st-opacity-90 st-text-page st-border-[1.5px] st-border-transparent st-shadow-sm',
            danger: 'st-bg-danger hover:st-bg-red-600 st-text-white st-border-[1.5px] st-border-transparent st-shadow-sm',
        },
        soft: {
            primary: 'st-bg-primary-tint hover:st-bg-primary-soft st-text-rose-700 st-border-[1.5px] st-border-transparent',
            accent: 'st-bg-accent-tint hover:st-bg-accent-soft st-text-jade-700 st-border-[1.5px] st-border-transparent',
            neutral: 'st-bg-ink-50 hover:st-bg-ink-100 st-text-ink-900 st-border-[1.5px] st-border-transparent',
            danger: 'st-bg-danger-soft hover:st-bg-red-100 st-text-red-600 st-border-[1.5px] st-border-transparent',
        },
        outline: {
            primary: 'st-bg-transparent hover:st-bg-primary-tint st-text-rose-700 st-border-[1.5px] st-border-primary',
            accent: 'st-bg-transparent hover:st-bg-accent-tint st-text-jade-700 st-border-[1.5px] st-border-accent',
            neutral: 'st-bg-transparent hover:st-bg-ink-50 st-text-ink-900 st-border-[1.5px] st-border-ink-900',
            danger: 'st-bg-transparent hover:st-bg-danger-soft st-text-red-600 st-border-[1.5px] st-border-danger',
        },
        ghost: {
            primary: 'st-bg-transparent hover:st-bg-primary-tint st-text-rose-700 st-border-[1.5px] st-border-transparent',
            accent: 'st-bg-transparent hover:st-bg-accent-tint st-text-jade-700 st-border-[1.5px] st-border-transparent',
            neutral: 'st-bg-transparent hover:st-bg-ink-100 st-text-ink-700 st-border-[1.5px] st-border-transparent',
            danger: 'st-bg-transparent hover:st-bg-danger-soft st-text-red-600 st-border-[1.5px] st-border-transparent',
        },
    };

    const look = computed(() => LOOKS[props.variant][props.color]);
</script>
