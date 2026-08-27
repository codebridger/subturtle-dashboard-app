<template>
    <div
        class="st-flex st-flex-col st-items-center st-text-center st-font-sans"
        :class="compact ? 'st-gap-[10px] st-px-5 st-py-6' : 'st-gap-[14px] st-px-8 st-py-12'"
    >
        <span
            v-if="icon"
            class="st-inline-flex st-items-center st-justify-center st-rounded-circle"
            :class="[tint, compact ? 'st-w-12 st-h-12' : 'st-w-16 st-h-16']"
        >
            <StIcon :name="icon" :size="compact ? 24 : 30" />
        </span>

        <div>
            <div
                class="st-font-display st-font-black st-tracking-tight st-text-strong"
                :class="compact ? 'st-text-md' : 'st-text-lg'"
            >
                <slot name="title">{{ title }}</slot>
            </div>
            <p
                v-if="description || $slots.description"
                class="st-mt-[7px] st-max-w-[380px] st-text-sm st-font-semibold st-text-muted st-leading-normal [text-wrap:pretty]"
            >
                <slot name="description">{{ description }}</slot>
            </p>
        </div>

        <div v-if="$slots.action" class="st-flex st-gap-[10px] st-mt-1">
            <slot name="action" />
        </div>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import StIcon from '../icon/StIcon.vue';

    const props = withDefaults(
        defineProps<{
            icon?: string;
            title?: string;
            description?: string;
            color?: 'primary' | 'accent' | 'neutral';
            compact?: boolean;
        }>(),
        { color: 'primary', compact: false }
    );

    const TINTS = {
        primary: 'st-bg-primary-soft st-text-primary',
        accent: 'st-bg-accent-soft st-text-accent',
        neutral: 'st-bg-ink-100 st-text-muted',
    };

    const tint = computed(() => TINTS[props.color]);
</script>
