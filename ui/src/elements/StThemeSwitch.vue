<template>
    <div role="radiogroup" :aria-label="labels.appearance" class="st-flex st-h-7 st-shrink-0 st-items-center st-rounded-pill st-bg-sunken st-p-0.5">
        <button
            v-for="opt in THEME_OPTIONS"
            :key="opt.value"
            type="button"
            role="radio"
            :aria-checked="modelValue === opt.value"
            :aria-label="labels[opt.value]"
            :title="labels[opt.value]"
            :tabindex="modelValue === opt.value ? 0 : -1"
            class="st-inline-flex st-h-6 st-w-8 st-cursor-pointer st-items-center st-justify-center st-rounded-pill st-border-none st-p-0 st-transition-colors st-duration-fast st-ease-out"
            :class="modelValue === opt.value ? 'st-bg-card st-text-primary st-shadow-xs' : 'st-bg-transparent st-text-faint hover:st-text-muted'"
            @click="$emit('update:modelValue', opt.value)"
            @keydown="onKeydown($event, opt.value)"
        >
            <StIcon :name="opt.icon" :size="16" />
        </button>
    </div>
</template>

<script setup lang="ts">
    import { computed, nextTick } from 'vue';
    import StIcon from '../icon/StIcon.vue';
    import type { StTheme } from '../types';

    /**
     * Light / Dark / System as a three-segment icon pill.
     *
     * Lives on its own rather than inside StProfileMenu because the dashboard puts it directly in
     * the topbar; the menu's `themeSwitch` row renders this same component, so the two placements
     * cannot drift.
     *
     * `role="radiogroup"` with roving tabindex, not a SegmentedControl — that component is not
     * ported yet, and the library may not depend on pilotui.
     */
    const props = withDefaults(
        defineProps<{
            modelValue?: StTheme;
            /** Accessible names. The library carries no i18n; consumers pass translations. */
            labels?: Partial<Record<'appearance' | StTheme, string>>;
        }>(),
        { modelValue: 'system' }
    );

    const emit = defineEmits<{ 'update:modelValue': [StTheme] }>();

    const THEME_OPTIONS: { value: StTheme; icon: string }[] = [
        { value: 'light', icon: 'solar:sun-2-linear' },
        { value: 'dark', icon: 'solar:moon-linear' },
        { value: 'system', icon: 'solar:monitor-linear' },
    ];

    const DEFAULT_LABELS = { appearance: 'Appearance', light: 'Light', dark: 'Dark', system: 'System' };
    const labels = computed(() => ({ ...DEFAULT_LABELS, ...(props.labels ?? {}) }));

    function onKeydown(e: KeyboardEvent, value: StTheme) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        // Left/Right stay inside the group. Up/Down deliberately fall through, so that when this
        // is rendered inside StProfileMenu they still move between the menu's rows.
        e.preventDefault();
        e.stopPropagation();
        const at = THEME_OPTIONS.findIndex((o) => o.value === value);
        const next = THEME_OPTIONS[(at + (e.key === 'ArrowRight' ? 1 : -1) + THEME_OPTIONS.length) % THEME_OPTIONS.length];
        emit('update:modelValue', next.value);
        // Focus follows the selection, as a radiogroup's roving tabindex requires.
        nextTick(() => ((e.currentTarget as HTMLElement).parentElement?.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus());
    }
</script>
