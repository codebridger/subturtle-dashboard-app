<template>
    <button
        type="button"
        :disabled="disabled"
        :aria-label="ariaLabel"
        class="st-inline-flex st-items-center st-justify-center st-border-none st-transition st-duration-fast st-ease-out st-focus-ring disabled:st-opacity-[0.45] disabled:st-cursor-not-allowed disabled:active:st-scale-100"
        :class="[
            rounded === 'full' ? 'st-rounded-pill' : 'st-rounded-md',
            size === 'sm' ? 'st-w-8 st-h-8' : '',
            size === 'md' ? 'st-w-10 st-h-10' : '',
            size === 'lg' ? 'st-w-12 st-h-12' : '',
            look,
            disabled ? '' : 'st-cursor-pointer active:st-scale-[0.92]',
        ]"
        @click="$emit('click', $event)"
    >
        <StIcon :name="icon" :size="iconSize" />
    </button>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import StIcon from '../icon/StIcon.vue';
    import type { StSize, StTone } from '../types';

    const props = withDefaults(
        defineProps<{
            /** Iconify name. */
            icon: string;
            variant?: 'solid' | 'soft' | 'ghost';
            color?: StTone;
            size?: StSize;
            rounded?: 'md' | 'full';
            disabled?: boolean;
            /** Required in practice — the button has no text. */
            ariaLabel?: string;
        }>(),
        { variant: 'soft', color: 'neutral', size: 'md', rounded: 'md' }
    );

    defineEmits<{ click: [MouseEvent] }>();

    const iconSize = computed(() => ({ sm: 16, md: 20, lg: 24 })[props.size]);

    // Ported from components/core/IconButton.jsx. The upstream `solid` has no hover step at
    // all; a hover shade is added here so the control gives feedback like every other one.
    const LOOKS: Record<string, Record<StTone, string>> = {
        solid: {
            primary: 'st-bg-primary hover:st-bg-primary-hover st-text-primary-on',
            accent: 'st-bg-accent hover:st-bg-accent-hover st-text-accent-on',
            // See StButton: the ink ramp inverts in dark, so this pairs with --surface-page.
            neutral: 'st-bg-inverse hover:st-opacity-90 st-text-page',
            danger: 'st-bg-danger hover:st-bg-red-600 st-text-on-brand',
        },
        soft: {
            primary: 'st-bg-primary-tint hover:st-bg-primary-soft st-text-rose-600',
            accent: 'st-bg-accent-tint hover:st-bg-accent-soft st-text-jade-600',
            neutral: 'st-bg-ink-50 hover:st-bg-ink-100 st-text-ink-700',
            danger: 'st-bg-danger-soft hover:st-bg-red-100 st-text-red-600',
        },
        ghost: {
            primary: 'st-bg-transparent hover:st-bg-primary-tint st-text-rose-600',
            accent: 'st-bg-transparent hover:st-bg-accent-tint st-text-jade-600',
            neutral: 'st-bg-transparent hover:st-bg-ink-100 st-text-ink-700',
            danger: 'st-bg-transparent hover:st-bg-danger-soft st-text-red-600',
        },
    };

    const look = computed(() => LOOKS[props.variant][props.color]);
</script>
