<template>
    <div
        class="st-inline-flex st-p-1 st-gap-[2px] st-bg-ink-100 st-rounded-pill"
        :class="[block ? 'st-flex st-w-full' : '', $attrs.class]"
        role="tablist"
    >
        <button
            v-for="opt in normalized"
            :key="opt.value"
            type="button"
            role="tab"
            :aria-selected="opt.value === modelValue"
            :disabled="disabled"
            class="st-inline-flex st-items-center st-justify-center st-gap-[6px] st-px-4 st-border-none st-rounded-pill st-font-sans st-text-sm st-font-extrabold st-transition st-duration-fast st-ease-out st-focus-ring"
            :class="[
                size === 'sm' ? 'st-h-8' : 'st-h-10',
                block ? 'st-flex-1' : '',
                opt.value === modelValue ? 'st-bg-card st-text-rose-700 st-shadow-sm' : 'st-bg-transparent st-text-muted',
                disabled ? 'st-cursor-not-allowed st-opacity-60' : 'st-cursor-pointer',
            ]"
            @click="select(opt.value)"
        >
            <StIcon v-if="opt.icon" :name="opt.icon" :size="16" />
            {{ opt.label }}
        </button>
    </div>
</template>

<script setup lang="ts">
    /**
     * Segmented control — 2–4 mutually-exclusive options in a sunken track. Mode switches
     * (Voice / Text), billing cadence, list filters.
     *
     * Ported from components/core/SegmentedControl.jsx. Two deliberate additions the React
     * source can't express with inline styles: `:focus-visible` rings, and `block`, which
     * stretches the track and its segments to the container (the design uses the control
     * inline in a card header, but a form field wants full width).
     *
     * The selected pill is `bg-card`, not `white`: the design system's dark layer redeclares
     * --white as the card neutral, so a literal white pill would stay light in dark mode.
     */
    import { computed } from 'vue';
    import StIcon from '../icon/StIcon.vue';

    defineOptions({ inheritAttrs: false });

    export interface StSegment {
        value: string;
        label: string;
        /** Leading icon, an Iconify name. */
        icon?: string;
    }

    const props = withDefaults(
        defineProps<{
            modelValue?: string;
            /** A plain label list, or one carrying an explicit value and icon per segment. */
            options?: (string | StSegment)[];
            size?: 'sm' | 'md';
            /** Stretch the track and split it evenly between the segments. */
            block?: boolean;
            disabled?: boolean;
        }>(),
        { options: () => [], size: 'md', block: false, disabled: false }
    );

    const emit = defineEmits<{ 'update:modelValue': [string] }>();

    const normalized = computed<StSegment[]>(() => props.options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o)));

    function select(value: string) {
        if (!props.disabled && value !== props.modelValue) emit('update:modelValue', value);
    }
</script>
