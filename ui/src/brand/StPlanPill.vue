<template>
    <span
        class="st-inline-flex st-items-center st-gap-[5px] st-shrink-0 st-rounded-pill st-bg-sunken st-px-3 st-py-[5px] st-font-sans st-text-xs st-font-extrabold st-leading-none"
        :class="tone"
    >
        <StIcon v-if="icon" :name="icon" :size="13" />
        <slot>{{ label }}</slot>
    </span>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import StIcon from '../icon/StIcon.vue';

    /**
     * The topbar's plan chip, sitting immediately before the profile menu's avatar trigger.
     *
     * Not an StBadge: that component's `soft` tone paints its own brand tint, and this one is
     * deliberately a neutral `--surface-sunken` chip so the avatar beside it stays the only
     * coloured thing in that corner. The extension popup uses the `accent` tone instead, for the
     * jade streak pill ("9-day streak") that takes this slot there.
     */
    const props = withDefaults(
        defineProps<{
            /** Plan name — 'Learner', 'Free'. Ignored when the default slot is used. */
            label?: string;
            /** Iconify name, e.g. 'solar:fire-bold' for the extension's streak variant. */
            icon?: string;
            /** `accent` swaps the neutral chip for the jade streak treatment. */
            color?: 'neutral' | 'accent';
        }>(),
        { color: 'neutral' }
    );

    const tone = computed(() => (props.color === 'accent' ? 'st-bg-accent-soft st-text-jade-700' : 'st-text-body'));
</script>
