<template>
    <span class="flex h-11 w-11 flex-none items-center justify-center rounded-st-md text-white shadow-st-xs" :class="tint" aria-hidden="true">
        <StIcon name="solar:notebook-bold-duotone" :size="22" />
    </span>
</template>

<script setup lang="ts">
    /**
     * The coloured tile a bundle is recognised by, in the picker and in the session summary.
     *
     * A bundle stores no colour, so one is derived from its id — stable for the life of the
     * bundle and identical everywhere it appears, with no migration. Literal hexes rather
     * than tokens: these are identity colours, and the glyph on top is always white, so they
     * must not move with the theme.
     */
    import { computed } from 'vue';
    import { StIcon } from 'subturtle-ui';

    const props = defineProps<{ seed?: string }>();

    // Full class strings only — Tailwind scans this file as text.
    const TINTS = [
        'bg-gradient-to-br from-[#f43f5e] to-[#e11d48]',
        'bg-gradient-to-br from-[#34d399] to-[#10b981]',
        'bg-gradient-to-br from-[#60a5fa] to-[#3b82f6]',
        'bg-gradient-to-br from-[#fbbf24] to-[#f59e0b]',
        'bg-gradient-to-br from-[#475569] to-[#1e293b]',
        'bg-gradient-to-br from-[#f472b6] to-[#ec4899]',
    ];

    // djb2 rather than a char-code sum: consecutive ObjectIds share every character but the
    // last few, and a plain sum maps them onto two or three adjacent buckets.
    const tint = computed(() => {
        const seed = props.seed || '';
        let hash = 5381;
        for (const ch of seed) hash = ((hash << 5) + hash + ch.charCodeAt(0)) >>> 0;
        return TINTS[hash % TINTS.length];
    });
</script>
