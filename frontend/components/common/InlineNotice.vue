<template>
    <div class="flex gap-3 rounded-st-md p-[15px_17px]" :class="tone.surface">
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
     * Soft inline notice — the design's non-blocking counterpart to a toast, used where the
     * message belongs beside the thing it is about rather than in a corner.
     *
     * App-local rather than in subturtle-ui: the design system defines a `Toast` but no inline
     * notice, so this is our composition of its tokens, not a library primitive. If a second
     * screen wants it, that is the moment to graduate it.
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
            /** Overrides the icon each colour picks by default. */
            icon?: string;
        }>(),
        { color: 'warning' }
    );

    // Full class strings only — Tailwind scans this file as text.
    const TONES = {
        warning: { surface: 'bg-st-warning-soft', mark: 'text-st-amber-600', icon: 'solar:clock-circle-bold' },
        danger: { surface: 'bg-st-danger-soft', mark: 'text-st-red-600', icon: 'solar:danger-triangle-bold' },
        info: { surface: 'bg-st-info-soft', mark: 'text-st-sky-600', icon: 'solar:clock-circle-bold' },
    };

    const tone = computed(() => ({ ...TONES[props.color], icon: props.icon || TONES[props.color].icon }));
</script>
