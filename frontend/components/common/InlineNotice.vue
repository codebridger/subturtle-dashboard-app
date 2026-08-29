<template>
    <div class="flex gap-3 rounded-st-md px-[17px] py-[15px]" :class="tone.surface">
        <StIcon :name="tone.icon" :size="20" class="mt-px flex-none" :class="tone.mark" />
        <div>
            <div v-if="title" class="text-st-sm font-extrabold" :class="tone.mark">{{ title }}</div>
            <p class="text-st-sm font-semibold leading-[1.5] text-st-ink-700 [text-wrap:pretty]" :class="title ? 'mt-1' : ''">
                {{ message }}
            </p>
        </div>
    </div>
</template>

<script setup lang="ts">
    /**
     * Soft inline notice — the design's non-blocking counterpart to a toast, for a message that
     * belongs beside the thing it is about rather than in a screen corner.
     *
     * App-local rather than in subturtle-ui on purpose: the design system defines a `Toast` but
     * no inline notice, callout or alert, so this is our composition of its tokens and not a
     * library primitive. The second screen that wants one is the moment to graduate it.
     */
    import { computed } from 'vue';
    import { StIcon } from 'subturtle-ui';

    const props = withDefaults(
        defineProps<{
            /** Semantic colour. `warning` = something happened to you; `danger` = something failed. */
            color?: 'warning' | 'danger' | 'info';
            message: string;
            /** Optional bold lead-in above the message. */
            title?: string;
            /** Overrides the icon the colour picks by default. */
            icon?: string;
        }>(),
        { color: 'warning' }
    );

    // Full class strings only — Tailwind scans this file as text, so anything assembled at
    // runtime would be purged from the build.
    const TONES = {
        warning: { surface: 'bg-st-warning-soft', mark: 'text-st-amber-600', icon: 'solar:clock-circle-bold' },
        danger: { surface: 'bg-st-danger-soft', mark: 'text-st-red-600', icon: 'solar:danger-triangle-bold' },
        info: { surface: 'bg-st-info-soft', mark: 'text-st-sky-600', icon: 'solar:clock-circle-bold' },
    };

    const tone = computed(() => ({ ...TONES[props.color], icon: props.icon || TONES[props.color].icon }));
</script>
