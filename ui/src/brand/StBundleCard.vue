<template>
    <!--
        The whole card is a click target but is intentionally NOT role="button": consumers
        generally wrap it in a router link (which is what gives it keyboard access), and a
        nested interactive control inside a role="button" would be invalid. The practice chip
        below is a real <button> so it is reachable either way.
    -->
    <div
        class="st-bg-card st-border st-border-subtle st-rounded-lg st-overflow-hidden st-shadow-sm st-cursor-pointer st-font-sans st-transition st-duration-base st-ease-out hover:st-shadow-lg hover:-st-translate-y-[3px]"
        @click="$emit('open')"
    >
        <div class="st-relative st-h-[92px] st-p-4 st-flex st-items-start st-justify-between" :style="coverStyle">
            <!-- A custom cover (e.g. the dashboard's generated word cloud) sits behind the pill. -->
            <div v-if="$slots.cover" class="st-absolute st-inset-0 st-overflow-hidden">
                <slot name="cover" />
            </div>

            <!--
                Hidden unless both sides are known — a half-filled pair reads as wrong data.
                On the built-in gradient covers a white wash is enough contrast, but a custom
                cover can be any brightness, so there the chip gets its own dark scrim.
            -->
            <span
                v-if="sourceLang && targetLang"
                class="st-relative st-inline-flex st-items-center st-gap-[6px] st-px-[10px] st-py-1 st-rounded-pill st-text-white st-text-2xs st-font-extrabold st-tracking-wide st-backdrop-blur-[4px]"
                :class="$slots.cover ? 'st-bg-overlay/55' : 'st-bg-white/25'"
            >
                {{ sourceLang }}
                <StIcon name="solar:arrow-right-linear" :size="12" />
                {{ targetLang }}
            </span>
            <span v-else />

            <StIcon
                v-if="!$slots.cover"
                name="solar:notebook-bold-duotone"
                :size="40"
                class="st-text-white/45"
            />
        </div>

        <div class="st-px-5 st-pt-4 st-pb-5">
            <h3 class="st-text-md st-font-extrabold st-text-strong st-m-0 st-truncate">{{ title }}</h3>
            <div class="st-flex st-items-center st-justify-between st-mt-3">
                <span class="st-inline-flex st-items-center st-gap-[6px] st-text-sm st-font-bold st-text-muted">
                    <StIcon name="solar:documents-bold-duotone" :size="16" />
                    {{ countLabel }}
                </span>
                <button
                    v-if="practicable"
                    type="button"
                    class="st-inline-flex st-items-center st-justify-center st-w-[34px] st-h-[34px] st-rounded-pill st-border-none st-bg-primary-soft st-text-rose-600 st-cursor-pointer st-transition st-duration-fast st-ease-out st-focus-ring hover:st-bg-rose-200"
                    :aria-label="practiceLabel"
                    @click.stop.prevent="$emit('practice')"
                >
                    <StIcon name="solar:play-bold" :size="16" />
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import StIcon from '../icon/StIcon.vue';

    const props = withDefaults(
        defineProps<{
            title?: string;
            count?: number;
            /** 2-letter code. The pill only renders when both sides are supplied. */
            sourceLang?: string;
            targetLang?: string;
            cover?: 'rose' | 'jade' | 'sky' | 'amber' | 'ink';
            /** Shows the practice chip. */
            practicable?: boolean;
            practiceLabel?: string;
        }>(),
        {
            count: 0,
            cover: 'rose',
            practicable: true,
            practiceLabel: 'Practice this bundle',
        }
    );

    defineEmits<{ open: []; practice: [] }>();

    // Gradients are built here rather than as Tailwind arbitrary values — the underscore
    // escaping those need makes them unreadable.
    const COVERS = {
        rose: 'linear-gradient(135deg, rgb(var(--rose-400)), rgb(var(--rose-600)))',
        jade: 'linear-gradient(135deg, rgb(var(--jade-400)), rgb(var(--jade-600)))',
        sky: 'linear-gradient(135deg, rgb(var(--sky-500)), rgb(var(--sky-600)))',
        amber: 'linear-gradient(135deg, rgb(var(--amber-500)), rgb(var(--amber-600)))',
        ink: 'linear-gradient(135deg, rgb(var(--ink-700)), rgb(var(--ink-950)))',
    };

    const coverStyle = computed(() => ({ background: COVERS[props.cover] ?? COVERS.rose }));
    const countLabel = computed(() => `${props.count} ${props.count === 1 ? 'phrase' : 'phrases'}`);
</script>
